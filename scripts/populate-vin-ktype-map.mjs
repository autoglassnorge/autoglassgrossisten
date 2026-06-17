#!/usr/bin/env node
/**
 * Populate vin_ktype_map from already-downloaded SVV data.
 * =============================================================================
 * Reads local SVV batch results, resolves the best kType for each unique VIN
 * via the local TecDoc ktype-vehicles index, and emits SQL to upsert into
 * vin_ktype_map. The SQL is then applied with wrangler d1 execute --file.
 *
 * Usage:
 *   node scripts/populate-vin-ktype-map.mjs
 *   node scripts/populate-vin-ktype-map.mjs --dry-run
 *   node scripts/populate-vin-ktype-map.mjs --limit=10000
 *   node scripts/populate-vin-ktype-map.mjs --batch-size=5000
 *
 * Apply generated SQL:
 *   npx wrangler d1 execute glass-catalog-db --remote --file data/finn-no-regnr/vin-ktype-map-inserts.sql
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { execSync } from "child_process";

const DATA_DIR = "data/finn-no-regnr";
const KTYPE_VEHICLES_FILE = "data/tecdoc-import/ktype-vehicles.json";
const OUTPUT_SQL = path.join(DATA_DIR, "vin-ktype-map-inserts.sql");
const REPORT_FILE = path.join(DATA_DIR, "vin-ktype-map-report.json");
const PROGRESS_FILE = path.join(DATA_DIR, "vin-ktype-map-progress.json");

const INPUT_FILES = [
  path.join(DATA_DIR, "svv-batch-results.ndjson"),
  path.join(DATA_DIR, "regnr-bruteforce-results.ndjson"),
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limit = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0", 10) || Infinity;
const batchSize = parseInt(args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "5000", 10) || 5000;

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

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const aliases = {
    VW: "VOLKSWAGEN",
    MERCEDES: "MERCEDES-BENZ",
    "MERCEDES BENZ": "MERCEDES-BENZ",
    "BMW I": "BMW",
    "TESLA MOTORS": "TESLA",
    "JAGUAR LAND ROVER LIMITED": "LAND ROVER",
    QUATTRO: "AUDI",
    FAW: "TOYOTA",
  };
  return aliases[b] || b;
}

const BRAND_WORDS = new Set([
  "AUDI", "BMW", "MERCEDES", "MERCEDES-BENZ", "VW", "VOLKSWAGEN", "VOLVO",
  "FORD", "OPEL", "PEUGEOT", "CITROEN", "RENAULT", "TOYOTA", "NISSAN",
  "HYUNDAI", "KIA", "SKODA", "SEAT", "FIAT", "ALFA", "ALFA-ROMEO", "LANCIA",
  "HONDA", "MAZDA", "MITSUBISHI", "SUBARU", "SUZUKI", "DAIHATSU", "ISUZU",
  "JEEP", "CHRYSLER", "DODGE", "CHEVROLET", "CADILLAC", "PONTIAC", "BUICK",
  "LINCOLN", "TESLA", "JAGUAR", "LAND ROVER", "RANGE ROVER", "PORSCHE",
  "BENTLEY", "ROLLS ROYCE", "ROLLS-ROYCE", "MASERATI", "FERRARI", "LAMBORGHINI",
  "LOTUS", "ASTON MARTIN", "ASTON-MARTIN", "MINI", "SMART", "SSANGYONG",
  "MAHINDRA", "TATA", "SAAB", "DAEWOO", "LADA", "DACIA", "ROVER", "MG",
  "QUATTRO",
]);

function extractBaseModel(model, brand) {
  if (!model) return "";
  const normBrand = normalizeBrand(brand);
  let m = model
    .toUpperCase()
    .replace(/\bE-TRON\b/gi, "ETRON")
    .replace(/\b4MATIC\b/gi, "")
    .replace(/\bQUATTRO\b/gi, "")
    .replace(/\bTFSI\b/gi, "")
    .replace(/\bTDI\b/gi, "")
    .replace(/\bHYBRID\b/gi, "")
    .replace(/\bPLUG-IN\b/gi, "")
    .replace(/\bAWD\b/gi, "")
    .replace(/\b4WD\b/gi, "")
    .replace(/\b4X4\b/gi, "")
    .replace(/\bXDRIVE\b/gi, "")
    .replace(/\bSDRIVE\b/gi, "")
    .replace(/\bM\s+\d/i, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading brand words (e.g. "AUDI A5" → "A5")
  const words = m.split(/\s+/);
  while (words.length > 0 && (BRAND_WORDS.has(words[0]) || words[0] === normBrand || words[0].replace(/[^A-Z0-9]/g, "") === normBrand.replace(/[^A-Z0-9]/g, ""))) {
    words.shift();
  }
  if (!words.length) return "";

  let first = words[0].replace(/[^A-Z0-9\-]/g, "");
  if (words.length > 1 && /^\d/.test(words[1])) {
    first = words[0] + words[1].replace(/[^A-Z0-9]/g, "").slice(0, 3);
  }
  return first;
}

function extractBodyHint(model) {
  const m = (model || "").toUpperCase();
  if (m.includes("SPORTBACK")) return "SPORTBACK";
  if (m.includes("AVANT")) return "AVANT";
  if (m.includes("SEDAN")) return "SEDAN";
  if (m.includes("CABRIO") || m.includes("CONVERTIBLE")) return "CABRIO";
  if (m.includes("COUPE")) return "COUPE";
  if (m.includes("ESTATE") || m.includes("WAGON")) return "AVANT";
  if (m.includes("HATCHBACK")) return "HATCHBACK";
  if (m.includes("SUV")) return "SUV";
  return "";
}

async function loadKtypeIndex() {
  log(`Loading kType vehicles index from ${KTYPE_VEHICLES_FILE}`);
  const data = JSON.parse(fs.readFileSync(KTYPE_VEHICLES_FILE, "utf-8"));
  const index = new Map();
  for (const entry of data) {
    const brand = normalizeBrand(entry.brand);
    if (!index.has(brand)) index.set(brand, []);
    index.get(brand).push({
      ktype: parseInt(entry.ktype, 10),
      brand: entry.brand?.toUpperCase() || "",
      model: entry.model?.toUpperCase() || "",
      yearFrom: entry.year_from || 0,
      yearTo: entry.year_to || 9999,
    });
  }
  log(`Indexed ${data.length} kType entries for ${index.size} brands`);
  return index;
}

function findKtype(index, make, model, year) {
  const normBrand = normalizeBrand(make);
  const baseModel = extractBaseModel(model, make);
  const bodyHint = extractBodyHint(model);

  if (!normBrand || !baseModel || !year) return null;

  const candidates = index.get(normBrand) || [];
  if (!candidates.length) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const r of candidates) {
    if (!r.model.includes(baseModel)) continue;

    const tecModel = r.model;
    let score = 0;

    score += 20;
    if (bodyHint && tecModel.includes(bodyHint)) score += 15;
    else if (bodyHint === "SPORTBACK" && tecModel.includes("SPORT")) score += 10;

    const yf = r.yearFrom || 0;
    const yt = r.yearTo || 9999;
    if (year >= yf && year <= yt) score += 15;
    else if (Math.abs(year - yf) <= 2 || Math.abs(year - yt) <= 2) score += 8;

    if (tecModel.includes("(") && tecModel.includes(")")) score += 5;
    score -= Math.max(0, tecModel.length - 40) * 0.3;

    const rangeSize = yt - yf;
    if (rangeSize <= 5) score += 5;
    else if (rangeSize <= 10) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

function computeConfidence(result, make, model, year) {
  if (!result) return 0;
  const yf = result.yearFrom || 0;
  const yt = result.yearTo || 9999;
  let conf = 0.7;
  if (year >= yf && year <= yt) conf += 0.1;
  const tecModel = result.model;
  const baseModel = extractBaseModel(model, make);
  if (tecModel.includes(baseModel)) conf += 0.05;
  if ((model || "").toUpperCase().split(/\s+/).some((w) => tecModel.includes(w) && w.length > 2)) conf += 0.05;
  return Math.min(conf, 0.95);
}

async function* streamVehicles() {
  for (const fn of INPUT_FILES) {
    if (!fs.existsSync(fn)) {
      log(`Skipping missing file: ${fn}`);
      continue;
    }
    log(`Streaming ${fn}`);
    const fileStream = fs.createReadStream(fn);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const vin = (d.vin || "").toUpperCase().trim();
        if (!vin || vin.length !== 17) continue;
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

async function main() {
  log("Starting VIN → kType mapping (fast local index mode)");
  log(`Dry run: ${dryRun}, Limit: ${limit === Infinity ? "all" : limit}, Batch size: ${batchSize}`);

  const index = await loadKtypeIndex();

  let processed = 0;
  let matched = 0;
  let noMatch = 0;
  const noMatches = [];
  const brandStats = {};
  let batchInserts = [];
  let batchNumber = 0;

  const progress = fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")) : { lastBatch: 0 };
  batchNumber = progress.lastBatch || 0;

  const seenVins = new Set();

  for await (const v of streamVehicles()) {
    if (seenVins.has(v.vin)) continue;
    seenVins.add(v.vin);

    if (processed >= limit) break;
    processed++;

    const ktypeResult = findKtype(index, v.make, v.model, v.year);
    const regnrHash = v.regnr ? hashRegnr(v.regnr) : null;
    const confidence = computeConfidence(ktypeResult, v.make, v.model, v.year);

    if (ktypeResult) {
      matched++;
      brandStats[v.make] = (brandStats[v.make] || 0) + 1;

      batchInserts.push(
        `INSERT INTO vin_ktype_map (vin, ktype, make, model, year, confidence, source, regnr_hash, created_at, updated_at) ` +
          `VALUES ('${sanitizeSql(v.vin)}', ${ktypeResult.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, ${confidence.toFixed(4)}, 'svv_tecdoc', ${regnrHash ? `'${regnrHash}'` : "NULL"}, datetime('now'), datetime('now')) ` +
          `ON CONFLICT(vin) DO UPDATE SET ` +
          `ktype = COALESCE(excluded.ktype, vin_ktype_map.ktype), ` +
          `make = COALESCE(excluded.make, vin_ktype_map.make), ` +
          `model = COALESCE(excluded.model, vin_ktype_map.model), ` +
          `year = COALESCE(excluded.year, vin_ktype_map.year), ` +
          `confidence = CASE WHEN excluded.confidence > vin_ktype_map.confidence THEN excluded.confidence ELSE vin_ktype_map.confidence END, ` +
          `source = CASE WHEN excluded.confidence > vin_ktype_map.confidence THEN excluded.source ELSE vin_ktype_map.source END, ` +
          `regnr_hash = COALESCE(excluded.regnr_hash, vin_ktype_map.regnr_hash), ` +
          `updated_at = datetime('now')`
      );

      if (processed <= 10 || processed % 5000 === 0) {
        log(`${processed}: ${v.vin} → kType ${ktypeResult.ktype} (${ktypeResult.brand} ${ktypeResult.model}) conf=${confidence.toFixed(2)}`);
      }
    } else {
      noMatch++;
      if (noMatches.length < 20) {
        noMatches.push({ vin: v.vin, regnr: v.regnr, make: v.make, model: v.model, year: v.year });
      }
      if (processed <= 10 || processed % 5000 === 0) {
        log(`${processed}: ${v.vin} → NO MATCH (${v.make} ${v.model} ${v.year})`);
      }
    }

    if (batchInserts.length >= batchSize) {
      await flushBatch(batchInserts, ++batchNumber, dryRun);
      batchInserts = [];
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastBatch: batchNumber }));
    }
  }

  if (batchInserts.length > 0) {
    await flushBatch(batchInserts, ++batchNumber, dryRun);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastBatch: batchNumber }));
  }

  const matchRate = processed > 0 ? ((matched / processed) * 100).toFixed(1) : 0;

  const report = {
    totalProcessed: processed,
    matched,
    noMatch,
    matchRate: parseFloat(matchRate),
    uniqueVins: seenVins.size,
    topMatchedBrands: Object.entries(brandStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .reduce((o, [k, v]) => {
        o[k] = v;
        return o;
      }, {}),
    sampleNoMatch: noMatches,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log("=".repeat(50));
  log(`VIN → kType mapping complete!`);
  log(`Total VINs: ${processed}`);
  log(`Matched: ${matched} (${matchRate}%)`);
  log(`No match: ${noMatch}`);
  log(`Report: ${REPORT_FILE}`);
}

async function flushBatch(inserts, batchNumber, dryRun) {
  const batchFile = `${OUTPUT_SQL}.${batchNumber}`;
  fs.writeFileSync(batchFile, inserts.join(";\n") + ";\n");
  log(`Batch ${batchNumber}: ${inserts.length} inserts written to ${batchFile}`);

  if (!dryRun) {
    try {
      execSync(`npx wrangler d1 execute glass-catalog-db --remote --file ${batchFile}`, {
        encoding: "utf-8",
        timeout: 300000,
        stdio: "inherit",
      });
      log(`Batch ${batchNumber} applied successfully`);
      fs.renameSync(batchFile, `${batchFile}.applied`);
    } catch (err) {
      log(`ERROR applying batch ${batchNumber}: ${err.message}`);
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
