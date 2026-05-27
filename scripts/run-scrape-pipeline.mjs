#!/usr/bin/env node
/**
 * run-scrape-pipeline.mjs
 * =======================
 * Orkestrerer multi-kilde scrape-pipeline for Autoglass AS.
 *
 * Kjeder:
 *   1. PDF-parser (lokal data, ingen API-kall)
 *   2. eBay-scraper (krever EBAY_APP_ID)
 *   3. Pivot-cross-references (lokal data)
 *   4. Score-confidence (batcher scoring)
 *   5. Writeback-scrape-results (idempotent D1 writeback)
 *
 * Usage:
 *   node scripts/run-scrape-pipeline.mjs [--dry-run] [--skip-pdf] [--skip-ebay] [--skip-pivot]
 *
 * Cron (daglig kl 03:00):
 *   0 3 * * * cd ~/bilglass && node scripts/run-scrape-pipeline.mjs >> logs/scrape-pipeline.log 2>&1
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CLI flags ─────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_PDF = process.argv.includes("--skip-pdf");
const SKIP_EBAY = process.argv.includes("--skip-ebay");
const SKIP_APIFY = process.argv.includes("--skip-apify");
const SKIP_PIVOT = process.argv.includes("--skip-pivot");
const SKIP_SCORE = process.argv.includes("--skip-score");
const SKIP_WRITEBACK = process.argv.includes("--skip-writeback");

// ── Config ────────────────────────────────────────────────────────────────
const STEPS = [
  {
    name: "PDF NAGS + ADAS Parser",
    script: "scripts/scrape-pdf-nags-fitment.mjs",
    skip: SKIP_PDF,
    needsEnv: [],
    description: "Parser Mygrant PDF-er for NAGS + vehicle fitment + ADAS",
  },
  {
    name: "eBay Scraper",
    script: "scripts/ebay-scraper-v2.mjs",
    skip: SKIP_EBAY,
    needsEnv: ["EBAY_APP_ID"],
    description: "Scraper eBay for OE-numre og kType",
  },
  {
    name: "Apify TecDoc Scraper",
    script: "scripts/apify-tecdoc-scraper.mjs",
    skip: SKIP_APIFY,
    needsEnv: ["APIFY_TOKEN"],
    description: "Henter kType + OE fra Apify TecDoc actor",
  },
  {
    name: "Pivot Cross-References",
    script: "scripts/pivot-cross-references.mjs",
    skip: SKIP_PIVOT,
    needsEnv: [],
    description: "Bygger inferred OE↔eurocode mappings fra eksisterende katalog",
  },
  {
    name: "Score Confidence",
    script: "scripts/score-confidence.mjs",
    skip: SKIP_SCORE,
    needsEnv: [],
    description: "Scorer rå scrape_results med source-baseline + multi-source",
  },
  {
    name: "Writeback to D1",
    script: "scripts/writeback-scrape-results.mjs",
    skip: SKIP_WRITEBACK,
    needsEnv: [],
    description: "Idempotent writeback fra scrape_results til produksjonstabeller",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function runStep(step) {
  if (step.skip) {
    console.log(`\n⏭️  SKIP: ${step.name}`);
    return { status: "skipped", duration: 0 };
  }

  // Check required env vars
  for (const envVar of step.needsEnv) {
    if (!process.env[envVar]) {
      console.log(`\n⚠️  SKIP: ${step.name} (mangler ${envVar})`);
      return { status: "skipped", duration: 0, reason: `Missing ${envVar}` };
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Step: ${step.name}`);
  console.log(`  ${step.description}`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  const start = Date.now();
  const scriptPath = path.join(ROOT, step.script);

  if (!existsSync(scriptPath)) {
    console.error(`❌ Script ikke funnet: ${scriptPath}`);
    return { status: "error", duration: 0, reason: "Script not found" };
  }

  try {
    const args = DRY_RUN ? "--dry-run" : "";
    const cmd = `cd "${ROOT}" && node "${scriptPath}" ${args}`;
    const output = execSync(cmd, {
      encoding: "utf-8",
      stdio: "inherit",
      timeout: 600_000, // 10 minutter
    });
    const duration = Date.now() - start;
    console.log(`✅ ${step.name} fullført (${(duration / 1000).toFixed(1)}s)`);
    return { status: "success", duration };
  } catch (e) {
    const duration = Date.now() - start;
    console.error(`❌ ${step.name} feilet etter ${(duration / 1000).toFixed(1)}s`);
    console.error(`   ${e.message}`);
    return { status: "error", duration, reason: e.message };
  }
}

function generateReport(results) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Pipeline Report`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  let totalDuration = 0;
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const result = results[i];
    totalDuration += result.duration;

    const icon = result.status === "success" ? "✅" : result.status === "skipped" ? "⏭️" : "❌";
    const durationStr = result.duration > 0 ? ` (${(result.duration / 1000).toFixed(1)}s)` : "";

    console.log(`   ${icon} ${step.name}${durationStr}`);

    if (result.status === "success") successCount++;
    else if (result.status === "skipped") skipCount++;
    else errorCount++;
  }

  console.log(`\n   Total tid: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Suksess: ${successCount}/${STEPS.length}`);
  console.log(`   Skipped: ${skipCount}/${STEPS.length}`);
  console.log(`   Feil: ${errorCount}/${STEPS.length}`);

  if (errorCount > 0) {
    console.log(`\n⚠️  Pipeline fullført med feil. Sjekk logg over for detaljer.`);
    return 1;
  }

  console.log(`\n✅ Pipeline fullført uten feil!`);
  return 0;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Autoglass AS — Scrape Pipeline");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Ensure logs dir exists
  const logsDir = path.join(ROOT, "logs");
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

  const results = [];
  for (const step of STEPS) {
    results.push(runStep(step));
  }

  const exitCode = generateReport(results);
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("❌ Pipeline error:", e);
  process.exit(1);
});
