#!/usr/bin/env node
/**
 * Scraper-orkestrering
 * ====================
 * Kjører alle scrapere i riktig rekkefølge med retry og logging.
 *
 * Rekkefølge:
 *   1. Pilkington (stabil, høy kvalitet)
 *   2. Glavista (stabil, høy kvalitet)
 *   3. Euroglass.ru (valideres nøye)
 *   4. Autoglass.ru (valideres nøye)
 *
 * Kjøring:
 *   node scripts/run-scrapers.mjs
 *   node scripts/run-scrapers.mjs --sources=pilkington,glavista
 *   node scripts/run-scrapers.mjs --skip-merge
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const RESET = "\x1b[0m";

// Parse args
const args = process.argv.slice(2);
const sourceArg = args.find((a) => a.startsWith("--sources="));
const skipMerge = args.includes("--skip-merge");
const selectedSources = sourceArg
  ? sourceArg.split("=")[1].split(",")
  : null;

// Definer scrapere
const SCRAPERS = [
  {
    name: "Pilkington",
    script: "api/scrapers/pilkington-scraper.ts",
    priority: 1,
    stable: true,
  },
  {
    name: "Glavista",
    script: "api/scrapers/glavista-scraper.ts",
    priority: 2,
    stable: true,
  },
  {
    name: "Euroglass.ru",
    script: "api/scrapers/euroglass-ru-scraper.ts",
    priority: 3,
    stable: false,
  },
  {
    name: "Autoglass.ru",
    script: "api/scrapers/autoglass-ru-scraper.ts",
    priority: 4,
    stable: false,
  },
];

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`${G}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`${R}✗${RESET} ${msg}`); }
function info(msg) { console.log(`${C}ℹ${RESET} ${msg}`); }
function warn(msg) { console.log(`${Y}⚠${RESET} ${msg}`); }

function runScraper(scraper) {
  const scriptPath = path.join(process.cwd(), scraper.script);
  if (!fs.existsSync(scriptPath)) {
    warn(`${scraper.name}: Script ikke funnet (${scraper.script}) — skipper`);
    return { success: false, skipped: true, name: scraper.name };
  }

  info(`Kjører ${scraper.name} (${scraper.script})...`);
  const start = Date.now();

  try {
    execSync(
      `npx ts-node --transpile-only --compiler-options '{"module":"CommonJS"}' ${scraper.script}`,
      {
        cwd: process.cwd(),
        stdio: "inherit",
        timeout: 300_000, // 5 minutter
      }
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    ok(`${scraper.name} fullført på ${elapsed}s`);
    return { success: true, name: scraper.name, elapsed: parseFloat(elapsed) };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    fail(`${scraper.name} feilet etter ${elapsed}s: ${e.message}`);
    return { success: false, name: scraper.name, error: e.message };
  }
}

async function main() {
  log(`\n🕷️  Scraper-orkestrering`);
  log(`   Tid: ${new Date().toISOString()}\n`);

  // Filtrer kilder hvis spesifisert
  let scrapersToRun = SCRAPERS;
  if (selectedSources) {
    scrapersToRun = SCRAPERS.filter((s) =>
      selectedSources.some((sel) => s.name.toLowerCase().includes(sel.toLowerCase()))
    );
    info(`Kjører kun: ${scrapersToRun.map((s) => s.name).join(", ")}`);
  }

  if (scrapersToRun.length === 0) {
    fail("Ingen scrapere å kjøre");
    process.exit(1);
  }

  // Kjør scrapere sequentielt
  const results = [];
  for (const scraper of scrapersToRun) {
    const result = runScraper(scraper);
    results.push(result);

    // Vent mellom scrapere (unntatt siste)
    if (scraper !== scrapersToRun[scrapersToRun.length - 1]) {
      info("Venter 5s før neste scraper...");
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  // Oppsummering
  log("\n" + "═".repeat(50));
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success && !r.skipped).length;
  const skipCount = results.filter((r) => r.skipped).length;

  log(`Resultat: ${G}${successCount} OK${RESET}, ${R}${failCount} feil${RESET}, ${Y}${skipCount} skipped${RESET}`);

  // Merge hvis alle OK og ikke --skip-merge
  if (failCount === 0 && !skipMerge) {
    log("\n🔀 Kjører merge...");
    try {
      execSync(
        `npx ts-node --transpile-only --compiler-options '{"module":"CommonJS"}' api/scrapers/merge-catalogs.ts`,
        { cwd: process.cwd(), stdio: "inherit" }
      );
      ok("Merge fullført");

      // Build prefix4
      log("\n🔢 Bygger prefix4-cache...");
      execSync(
        `npx ts-node --transpile-only --compiler-options '{"module":"CommonJS"}' api/scrapers/build-prefix4-cache.ts`,
        { cwd: process.cwd(), stdio: "inherit" }
      );
      ok("Prefix4-cache bygget");

      // Kvalitets-gate
      log("\n🔍 Kjører kvalitets-gate...");
      try {
        execSync("node scripts/validate-catalog.mjs", {
          cwd: process.cwd(),
          stdio: "inherit",
        });
        ok("Kvalitets-gate PASS — klar for KV-upload");
        log("\n💡 Neste steg: npm run worker:upload");
      } catch {
        fail("Kvalitets-gate BLOCK — katalog skal IKKE lastes opp");
        process.exit(1);
      }
    } catch (e) {
      fail(`Merge/pipeline feilet: ${e.message}`);
      process.exit(1);
    }
  } else if (skipMerge) {
    info("Merge hoppet over (--skip-merge)");
  } else {
    fail("En eller flere scrapere feilet — merge hoppet over");
    process.exit(1);
  }

  log("");
}

main();
