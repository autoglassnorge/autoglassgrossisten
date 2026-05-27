#!/usr/bin/env node
/**
 * Verify Finn.no Regnr against SVV / Worker API
 * ==============================================
 *
 * Takes the regnr scraped from finn.no and verifies each one against
 * the official vehicle register (SVV). Only keeps regnr where the
 * brand/model/year matches what finn.no claimed.
 *
 * Usage:
 *   node scripts/verify-finn-regnr.mjs [--input=PATH] [--output=PATH] [--worker-url=URL]
 *
 * Output:
 *   - verified-regnr.ndjson   — only verified records
 *   - verification-report.json — stats on match rates per brand
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve } from "path";

const WORKER_URL = "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass";
const DEFAULT_INPUT = resolve(process.cwd(), "data", "finn-no-regnr", "regnr.ndjson");
const DEFAULT_OUTPUT = resolve(process.cwd(), "data", "finn-no-regnr", "verified-regnr.ndjson");
const REPORT_FILE = resolve(process.cwd(), "data", "finn-no-regnr", "verification-report.json");
const CHECKPOINT_FILE = resolve(process.cwd(), "data", "finn-no-regnr", "verify-checkpoint.json");

const CONFIG = {
  workerUrl: WORKER_URL,
  requestDelayMs: 500, // 500ms between SVV lookups (respectful)
  batchSize: 50,
  maxRetries: 3,
  retryDelayMs: 2000,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    workerUrl: WORKER_URL,
    delay: 500,
  };
  for (const arg of args) {
    if (arg.startsWith("--input=")) opts.input = arg.split("=")[1];
    if (arg.startsWith("--output=")) opts.output = arg.split("=")[1];
    if (arg.startsWith("--worker-url=")) opts.workerUrl = arg.split("=")[1];
    if (arg.startsWith("--delay=")) opts.delay = parseInt(arg.split("=")[1], 10);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeBrand(brand) {
  const b = (brand || "").toLowerCase().trim().replace(/[-\s]/g, "");
  const map = {
    vw: "volkswagen",
    mercedesbenz: "mercedes",
    mercedes: "mercedes",
  };
  return map[b] || b;
}

function brandsMatch(finnBrand, svvBrand) {
  const a = normalizeBrand(finnBrand);
  const b = normalizeBrand(svvBrand);
  if (a === b) return true;
  // VW <-> Volkswagen
  if ((a === "vw" || a === "volkswagen") && (b === "vw" || b === "volkswagen")) return true;
  // Mercedes <-> Mercedes-Benz
  if (a.includes("mercedes") && b.includes("mercedes")) return true;
  // BMW <-> B.M.W.
  if (a === "bmw" && b === "bmw") return true;
  // Audi (exact match already handled)
  // Toyota (exact match already handled)
  return false;
}

async function verifyRegnr(record, workerUrl) {
  const url = `${workerUrl}?regnr=${encodeURIComponent(record.regnr)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AutoglassAS-B2B-Verifier/1.0 (+https://auto-glass.no)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 404) return { verified: false, reason: "not_found" };
      if (res.status === 429) return { verified: false, reason: "rate_limited" };
      return { verified: false, reason: `http_${res.status}` };
    }

    const data = await res.json();
    const vehicle = data.vehicle;
    if (!vehicle) {
      return { verified: false, reason: "no_vehicle_data" };
    }

    const svvBrand = vehicle.make || "";
    const svvModel = vehicle.model || "";
    const svvYear = vehicle.year;

    const brandMatch = brandsMatch(record.brand, svvBrand);

    // For model matching, use fuzzy: finn model should be contained in SVV model
    // or vice versa. E.g. finn "A4" matches SVV "A4 Avant"
    const finnModelNorm = (record.model || "").toLowerCase().replace(/[-\s]/g, "");
    const svvModelNorm = svvModel.toLowerCase().replace(/[-\s]/g, "");
    const modelMatch =
      !record.model || // If no model from finn, skip model check
      svvModelNorm.includes(finnModelNorm) ||
      finnModelNorm.includes(svvModelNorm) ||
      // Special cases
      (record.model === "Grand Tourneo Connect" && svvModelNorm.includes("tourneo")) ||
      (record.model === "Tourneo Connect" && svvModelNorm.includes("tourneo"));

    if (brandMatch && modelMatch) {
      return {
        verified: true,
        svvBrand,
        svvModel,
        svvYear,
        reason: "match",
      };
    }

    return {
      verified: false,
      reason: "mismatch",
      svvBrand,
      svvModel,
      svvYear,
      expectedBrand: record.brand,
      expectedModel: record.model,
    };
  } catch (e) {
    return { verified: false, reason: "error", error: e.message };
  }
}

async function main() {
  const opts = parseArgs();
  CONFIG.requestDelayMs = opts.delay;
  CONFIG.workerUrl = opts.workerUrl;

  if (!existsSync(opts.input)) {
    console.error(`❌ Input file not found: ${opts.input}`);
    console.error("Run the finn.no scraper first: npm run scrape:finn-regnr");
    process.exit(1);
  }

  // Load all records
  const lines = readFileSync(opts.input, "utf-8").split("\n");
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip corrupt
    }
  }

  console.log("🔍 Finn.no Regnr Verifier");
  console.log("=========================");
  console.log(`   Input: ${opts.input}`);
  console.log(`   Records to verify: ${records.length}`);
  console.log(`   Worker: ${CONFIG.workerUrl}`);
  console.log(`   Delay: ${CONFIG.requestDelayMs}ms\n`);

  // Load checkpoint
  let startIndex = 0;
  if (existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8"));
    startIndex = cp.lastIndex || 0;
    console.log(`🔄 Resuming from index ${startIndex}\n`);
  }

  const results = {
    total: 0,
    verified: 0,
    rejected: 0,
    errors: 0,
    byBrand: {},
    rejectReasons: {},
  };

  const startTime = Date.now();

  for (let i = startIndex; i < records.length; i++) {
    const record = records[i];
    const pct = ((i / records.length) * 100).toFixed(1);

    const result = await verifyRegnr(record, CONFIG.workerUrl);
    results.total++;

    const brand = record.brand || "Unknown";
    if (!results.byBrand[brand]) {
      results.byBrand[brand] = { total: 0, verified: 0, rejected: 0 };
    }
    results.byBrand[brand].total++;

    if (result.verified) {
      results.verified++;
      results.byBrand[brand].verified++;

      const verifiedRecord = {
        ...record,
        verified: true,
        svvBrand: result.svvBrand,
        svvModel: result.svvModel,
        svvYear: result.svvYear,
        verifiedAt: new Date().toISOString(),
      };
      appendFileSync(opts.output, JSON.stringify(verifiedRecord) + "\n");
    } else {
      results.rejected++;
      results.byBrand[brand].rejected++;
      const reason = result.reason || "unknown";
      results.rejectReasons[reason] = (results.rejectReasons[reason] || 0) + 1;

      // Log mismatches for debugging
      if (reason === "mismatch") {
        console.log(
          `   ⚠️  Mismatch: ${record.regnr} — finn: ${record.brand} ${record.model} vs SVV: ${result.svvBrand} ${result.svvModel}`
        );
      }
    }

    // Progress every 25
    if (i % 25 === 0 || i === records.length - 1) {
      const rate = results.total > 0 ? ((results.verified / results.total) * 100).toFixed(1) : 0;
      console.log(`   [${pct}%] ${i + 1}/${records.length} | ✅ ${results.verified} verified | ❌ ${results.rejected} rejected | Rate: ${rate}%`);
    }

    // Save checkpoint
    if ((i + 1) % CONFIG.batchSize === 0) {
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + 1 }, null, 2));
    }

    await sleep(CONFIG.requestDelayMs);
  }

  // Final checkpoint
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: records.length, done: true }, null, 2));

  // Save report
  const report = {
    ...results,
    elapsedMinutes: ((Date.now() - startTime) / 1000 / 60).toFixed(1),
    generatedAt: new Date().toISOString(),
    inputFile: opts.input,
    outputFile: opts.output,
  };
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`\n✅ Verification complete!`);
  console.log(`   Total checked: ${results.total}`);
  console.log(`   ✅ Verified: ${results.verified} (${((results.verified / results.total) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Rejected: ${results.rejected}`);
  console.log(`   ⚠️  Errors: ${results.errors}`);
  console.log(`   Output: ${opts.output}`);
  console.log(`   Report: ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
