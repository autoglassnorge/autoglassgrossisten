#!/usr/bin/env node
/**
 * Bootstrap Learning Engine
 * =========================
 * Runs popular Norwegian regnr through the API to pre-fill search_history.
 * This gives instant equipment data for common cars when customers search.
 *
 * Usage:
 *   node scripts/bootstrap-learning-engine.mjs
 *   node scripts/bootstrap-learning-engine.mjs --prod  # use production API
 *   node scripts/bootstrap-learning-engine.mjs --dry-run  # don't call API
 */

import * as fs from "fs";
import * as path from "path";

const BASE = process.argv.includes("--prod")
  ? "https://autoglass-glass-sok.autoglassnorge.workers.dev"
  : "http://localhost:8787";

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_MS = 1500; // Respect rate limit (max ~40/min)

const REGNR_FILE = path.join(process.cwd(), "data", "populaere-regnr.txt");

const R = "\x1b[31m", G = "\x1b[32m", Y = "\x1b[33m", C = "\x1b[36m", RESET = "\x1b[0m";

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`  ${G}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${RESET} ${msg}`); }
function info(msg) { console.log(`  ${C}ℹ${RESET} ${msg}`); }

async function searchRegnr(regnr) {
  try {
    const res = await fetch(`${BASE}/api/glass?regnr=${encodeURIComponent(regnr)}`);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

function parseRegnrFile() {
  const content = fs.readFileSync(REGNR_FILE, "utf-8");
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function main() {
  console.log("\n🔥 Bootstrap Learning Engine — v2.2");
  console.log(`   API: ${BASE}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no API calls)" : "LIVE"}\n`);

  const regnrList = parseRegnrFile();
  console.log(`Found ${regnrList.length} regnr to bootstrap\n`);

  let success = 0;
  let notFound = 0;
  let error = 0;
  let learned = 0;
  let guessed = 0;
  let none = 0;

  for (let i = 0; i < regnrList.length; i++) {
    const regnr = regnrList[i];
    const progress = `[${i + 1}/${regnrList.length}]`;

    if (DRY_RUN) {
      info(`${progress} ${regnr} — dry run`);
      continue;
    }

    const { status, data, error: err } = await searchRegnr(regnr);

    if (status === 200 && data) {
      const v = data.vehicle;
      const eq = data.effectiveEquipment;
      const layer = data.layer;
      const confidence = data.confidence;

      if (eq?.source === "learned") {
        learned++;
        ok(`${progress} ${regnr} → ${v.make} ${v.model} ${v.year} | equipment=LEARNED (${eq.guessConfidence})`);
      } else if (eq?.source === "catalog_guess") {
        guessed++;
        info(`${progress} ${regnr} → ${v.make} ${v.model} ${v.year} | equipment=GUESSED (${eq.guessConfidence})`);
      } else if (eq?.source === "biluppgifter") {
        ok(`${progress} ${regnr} → ${v.make} ${v.model} ${v.year} | equipment=BILUPPGITTER`);
      } else {
        none++;
        info(`${progress} ${regnr} → ${v.make} ${v.model} ${v.year} | equipment=NONE`);
      }

      if (data.candidates?.length > 0) {
        const top = data.candidates[0];
        console.log(`       → Top: ${top.eurocode} (layer=${layer}, conf=${confidence}, cat=${top.category || "?"})`);
      }

      success++;
    } else if (status === 404) {
      notFound++;
      info(`${progress} ${regnr} → not found in SVV`);
    } else if (status === 503) {
      error++;
      fail(`${progress} ${regnr} → SVV temporarily unavailable`);
    } else {
      error++;
      fail(`${progress} ${regnr} → status=${status}, error=${err || data?.error || "unknown"}`);
    }

    if (i < regnrList.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log(`📊 Bootstrap Results:`);
  console.log(`   Total processed: ${regnrList.length}`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   🔍 Not found: ${notFound}`);
  console.log(`   ❌ Error: ${error}`);
  console.log();
  console.log(`   Equipment sources:`);
  console.log(`   → Learned: ${learned}`);
  console.log(`   → Guessed: ${guessed}`);
  console.log(`   → None: ${none}`);
  console.log();
  console.log(`${G}✅ Bootstrap complete!${RESET}`);
  console.log(`   Learning Engine now has data for ${success} vehicles.`);
  console.log(`   Run this script again in a few days to accumulate more learning data.`);
  console.log();
}

main().catch(console.error);
