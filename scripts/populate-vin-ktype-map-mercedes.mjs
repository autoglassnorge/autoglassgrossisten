#!/usr/bin/env node
/**
 * Populate vin_ktype_map for Mercedes-Benz passenger cars only,
 * using the improved TecDoc resolver with Mercedes class normalization.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { execSync } from "child_process";
import { resolveTecDocKType } from "../api/cf-worker/src/lib/tecdoc-resolver.ts";

const DATA_DIR = "data/finn-no-regnr";
const OUTPUT_SQL = path.join(DATA_DIR, "vin-ktype-map-mercedes-inserts.sql");
const REPORT_FILE = path.join(DATA_DIR, "vin-ktype-map-mercedes-report.json");

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

async function* streamVehicles() {
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
        if ((d.make || "").toUpperCase() !== "MERCEDES-BENZ") continue;
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
  log("Starting Mercedes VIN → kType population with improved resolver");

  let matched = 0;
  let noMatch = 0;
  let processed = 0;
  const noMatches = [];
  let batchValues = [];
  let batchNumber = 0;
  fs.writeFileSync(OUTPUT_SQL, "-- Mercedes VIN → kType mappings (improved resolver)\n");

  for await (const v of streamVehicles()) {
    processed++;
    const result = resolveTecDocKType(v.make, v.model, v.year);
    const best = result.candidates[0];

    if (best && (result.status === "resolved" || best.score >= 0.6)) {
      matched++;
      const values = `('${sanitizeSql(v.vin)}', ${best.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, ${best.score.toFixed(3)}, 'svv_tecdoc', '${hashRegnr(v.regnr)}', NULL)`;
      batchValues.push(values);

      if (batchValues.length >= BATCH_SIZE) {
        const sql = buildInsert(batchValues);
        fs.appendFileSync(OUTPUT_SQL, `\n-- Batch ${batchNumber}\n${sql}\n`);
        batchValues = [];
        batchNumber++;
      }
    } else {
      noMatch++;
      if (noMatches.length < 20) {
        noMatches.push({ vin: v.vin, regnr: v.regnr, make: v.make, model: v.model, year: v.year });
      }
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

  const matchRate = processed > 0 ? ((matched / processed) * 100).toFixed(1) : 0;
  const report = {
    totalProcessed: processed,
    matched,
    noMatch,
    matchRate,
    sampleNoMatch: noMatches,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log(`Mercedes mapping complete: ${matched}/${processed} (${matchRate}%)`);
  log(`Report: ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
