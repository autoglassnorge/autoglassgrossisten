#!/usr/bin/env node
/**
 * Populate vin_ktype_map for all currently unmatched VINs using the improved
 * TecDoc resolver. This should lift match-rate from ~67% to ~96%.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { execSync } from "child_process";
import { resolveTecDocKType } from "../api/cf-worker/src/lib/tecdoc-resolver.ts";

const DATA_DIR = "data/finn-no-regnr";
const OUTPUT_SQL = path.join(DATA_DIR, "vin-ktype-map-all-inserts.sql");
const REPORT_FILE = path.join(DATA_DIR, "vin-ktype-map-all-report.json");
const MATCHED_VINS_FILE = process.argv.find((a) => a.startsWith("--matched="))?.split("=")[1] || null;

const INPUT_FILES = [
  path.join(DATA_DIR, "svv-batch-results.ndjson"),
  path.join(DATA_DIR, "regnr-bruteforce-results.ndjson"),
];

const BATCH_SIZE = 500;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function hashRegnr(regnr) {
  return crypto.createHash("sha256").update(regnr.toUpperCase().replace(/\s/g, "")).digest("hex");
}

function sanitizeSql(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/'/g, "''").replace(/\\/g, "\\\\");
}

function loadMatchedVins() {
  if (!MATCHED_VINS_FILE || !fs.existsSync(MATCHED_VINS_FILE)) {
    throw new Error("--matched=<path> required with JSON output from wrangler d1 execute SELECT vin FROM vin_ktype_map");
  }
  const raw = fs.readFileSync(MATCHED_VINS_FILE, "utf8");
  const jsonStart = raw.indexOf("[");
  const data = JSON.parse(raw.slice(jsonStart));
  const matched = new Set();
  for (const batch of data) {
    for (const row of batch.results || []) {
      if (row.vin) matched.add(row.vin);
    }
  }
  log(`Loaded ${matched.size} matched VINs from ${MATCHED_VINS_FILE}`);
  return matched;
}

async function* streamVehicles() {
  const seenVins = new Set();
  for (const fn of INPUT_FILES) {
    if (!fs.existsSync(fn)) continue;
    const fileStream = fs.createReadStream(fn);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const vin = (d.vin || "").toUpperCase().trim();
        if (!vin || vin.length !== 17) continue;
        if (seenVins.has(vin)) continue;
        seenVins.add(vin);
        yield {
          regnr: d.regnr || "",
          make: d.make || "",
          model: d.model || "",
          year: d.year || 0,
          vin,
        };
      } catch {}
    }
  }
}

function buildInsert(values) {
  if (values.length === 0) return "";
  return `INSERT OR REPLACE INTO vin_ktype_map
    (vin, ktype, make, model, year, confidence, source, regnr_hash, expires_at)
  VALUES\n${values.join(",\n")};`;
}

async function main() {
  log("Starting full VIN → kType population with improved resolver");

  const matchedVins = loadMatchedVins();

  let resolved = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let skippedAlreadyMatched = 0;
  let processed = 0;
  const noMatches = [];
  const ambiguousSamples = [];
  let batchValues = [];
  let batchNumber = 0;
  fs.writeFileSync(OUTPUT_SQL, "-- All VIN → kType mappings from improved resolver\n");

  for await (const v of streamVehicles()) {
    processed++;
    if (matchedVins.has(v.vin)) {
      skippedAlreadyMatched++;
      continue;
    }

    const result = resolveTecDocKType(v.make, v.model, v.year);
    const best = result.candidates[0];

    if (result.status === "resolved" && best) {
      resolved++;
      const values = `('${sanitizeSql(v.vin)}', ${best.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, ${best.score.toFixed(3)}, 'svv_tecdoc', '${hashRegnr(v.regnr)}', NULL)`;
      batchValues.push(values);
    } else if (best && best.score >= 0.6) {
      ambiguous++;
      if (ambiguousSamples.length < 20) {
        ambiguousSamples.push({ vin: v.vin, regnr: v.regnr, make: v.make, model: v.model, year: v.year, ktype: best.ktype, score: best.score, candidate: best.model });
      }
      const values = `('${sanitizeSql(v.vin)}', ${best.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, ${best.score.toFixed(3)}, 'svv_tecdoc', '${hashRegnr(v.regnr)}', NULL)`;
      batchValues.push(values);
    } else {
      noMatch++;
      if (noMatches.length < 20) {
        noMatches.push({ vin: v.vin, regnr: v.regnr, make: v.make, model: v.model, year: v.year });
      }
    }

    if (batchValues.length >= BATCH_SIZE) {
      const sql = buildInsert(batchValues);
      fs.appendFileSync(OUTPUT_SQL, `\n-- Batch ${batchNumber}\n${sql}\n`);
      batchValues = [];
      batchNumber++;
    }
  }

  if (batchValues.length > 0) {
    const sql = buildInsert(batchValues);
    fs.appendFileSync(OUTPUT_SQL, `\n-- Batch ${batchNumber}\n${sql}\n`);
  }

  const absoluteSqlPath = path.resolve(OUTPUT_SQL);
  log(`Applying ${absoluteSqlPath} to D1...`);
  execSync(`npx wrangler d1 execute glass-catalog-db --remote --file ${absoluteSqlPath}`, {
    cwd: "api/cf-worker",
    stdio: "inherit",
  });

  const totalUnmatched = processed - skippedAlreadyMatched;
  const report = {
    totalProcessed: processed,
    skippedAlreadyMatched,
    totalUnmatched,
    resolved,
    ambiguous,
    noMatch,
    matchRate: totalUnmatched > 0 ? ((resolved + ambiguous) / totalUnmatched * 100).toFixed(1) : 0,
    sampleNoMatch: noMatches,
    sampleAmbiguous: ambiguousSamples,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log(`Population complete:`);
  log(`  Processed: ${processed}`);
  log(`  Already matched (skipped): ${skippedAlreadyMatched}`);
  log(`  Previously unmatched: ${totalUnmatched}`);
  log(`  Resolved: ${resolved}`);
  log(`  Ambiguous (score>=0.6): ${ambiguous}`);
  log(`  No match: ${noMatch}`);
  log(`  Match rate of unmatched: ${report.matchRate}%`);
  log(`Report: ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
