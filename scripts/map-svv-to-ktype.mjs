#!/usr/bin/env node
/**
 * Map SVV batch results to kType via fuzzy matching against D1 ktype_registry
 * =============================================================================
 * 
 * Reads: data/finn-no-regnr/svv-batch-results.ndjson + svv-cache.ndjson
 * Queries: D1 ktype_registry (via wrangler d1 execute)
 * Outputs: D1 SQL INSERTs for ground_truth + ktype_registry enrichment
 *
 * Usage:
 *   node scripts/map-svv-to-ktype.mjs [--dry-run] [--limit=N]
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const DATA_DIR = "data/finn-no-regnr";
const RESULTS_FILE = path.join(DATA_DIR, "svv-batch-results.ndjson");
const CACHE_FILE = path.join(DATA_DIR, "svv-cache.ndjson");
const OUTPUT_SQL = path.join(DATA_DIR, "svv-ktype-mapping.sql");
const REPORT_FILE = path.join(DATA_DIR, "svv-ktype-report.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10) || Infinity;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function hashRegnr(regnr) {
  return crypto.createHash("sha256").update(regnr.toUpperCase().replace(/\s/g, "")).digest("hex").slice(0, 16);
}

function sanitizeSql(str) {
  if (!str) return "";
  return str.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

// D1 query helper
function d1Query(sql) {
  try {
    const cmd = `npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 15000 });
    
    // Extract JSON results
    const match = output.match(/\[\s*\{\s*"results":\s*(\[[^\]]*\])/s);
    if (match) {
      return JSON.parse(match[1]);
    }
    return [];
  } catch (err) {
    log(`D1 query error: ${err.message?.slice(0, 100)}`);
    return [];
  }
}

// Fuzzy model matching: extract base model name
function normalizeModel(model) {
  if (!model) return "";
  return model
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\bE-TRON\b/gi, "E TRON")
    .replace(/\b4MATIC\b/gi, "")
    .replace(/\bQUATTRO\b/gi, "")
    .replace(/\bTFSI\b/gi, "")
    .replace(/\bTDI\b/gi, "")
    .replace(/\bHYBRID\b/gi, "")
    .replace(/\bPLUG-IN\b/gi, "")
    .replace(/\bAWD\b/gi, "")
    .replace(/\b2WD\b/gi, "")
    .replace(/\b4WD\b/gi, "")
    .replace(/\b4X4\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract base model (first word after brand)
function extractBaseModel(model) {
  if (!model) return "";
  const normalized = normalizeModel(model);
  const words = normalized.split(/\s+/);
  if (words.length === 0) return "";
  
  // First word is usually series (A4, Golf, CX-5)
  const first = words[0].replace(/[^A-Z0-9\-]/g, "");
  return first;
}

// Find kType in D1 with fuzzy matching
async function findKtype(make, model, year) {
  const baseModel = extractBaseModel(model);
  const safeMake = sanitizeSql(make);
  const safeBase = sanitizeSql(baseModel);
  const safeFull = sanitizeSql(model);
  
  if (!safeMake || !safeBase || !year) return null;

  // Strategy 1: Exact brand + base model LIKE + year overlap
  let sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = '${safeMake}' AND model LIKE '%${safeBase}%' AND year_from <= ${year} AND year_to >= ${year} LIMIT 20`;
  let results = d1Query(sql);
  
  // Strategy 2: If no results, try broader LIKE on model
  if (results.length === 0) {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = '${safeMake}' AND (model LIKE '%${safeBase}%' OR '${safeFull}' LIKE '%' || model || '%') AND year_from <= ${year} AND (year_to >= ${year} OR year_to IS NULL) LIMIT 20`;
    results = d1Query(sql);
  }

  // Strategy 3: Try without year filter (broader)
  if (results.length === 0) {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = '${safeMake}' AND model LIKE '%${safeBase}%' LIMIT 20`;
    results = d1Query(sql);
  }

  // Strategy 4: Try with brand LIKE (for MERCEDES-BENZ vs MERCEDES)
  if (results.length === 0 && safeMake.includes("MERCEDES")) {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE (brand = 'MERCEDES-BENZ' OR brand = 'MERCEDES') AND model LIKE '%${safeBase}%' LIMIT 20`;
    results = d1Query(sql);
  }
  if (results.length === 0 && safeMake.includes("VW") || safeMake.includes("VOLKSWAGEN")) {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand LIKE '%VOLKSWAGEN%' AND model LIKE '%${safeBase}%' LIMIT 20`;
    results = d1Query(sql);
  }

  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // Multiple results: pick best match by text similarity
  const normalizedFull = normalizeModel(model);
  let best = results[0];
  let bestScore = -1;

  for (const r of results) {
    const tecModel = normalizeModel(r.model);
    let score = 0;
    
    // Exact base model match
    if (tecModel.includes(baseModel)) score += 10;
    if (normalizedFull.includes(extractBaseModel(tecModel))) score += 5;
    
    // Year proximity
    if (year >= r.year_from && year <= (r.year_to || 9999)) score += 5;
    else if (year >= r.year_from - 1 && year <= (r.year_to || 9999) + 1) score += 3;
    
    // Body type hints in model name
    if (normalizedFull.includes("SPORTBACK") && tecModel.includes("SPORTBACK")) score += 3;
    if (normalizedFull.includes("AVANT") && tecModel.includes("AVANT")) score += 3;
    if (normalizedFull.includes("SEDAN") && tecModel.includes("SEDAN")) score += 3;
    if (normalizedFull.includes("CABRIO") && tecModel.includes("CABRIO")) score += 3;
    
    // Prefer shorter model names (less specific = more general match)
    score -= tecModel.length * 0.05;
    
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

async function main() {
  log("Starting SVV → kType mapping");
  log(`Dry run: ${dryRun}`);

  // Load all SVV vehicles
  const vehicles = [];
  for (const fn of [CACHE_FILE, RESULTS_FILE]) {
    if (!fs.existsSync(fn)) continue;
    const lines = fs.readFileSync(fn, "utf-8").trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (!d.make || !d.model || !d.year) continue;
        vehicles.push({
          regnr: d.regnr,
          make: d.make.toUpperCase(),
          model: d.model,
          year: d.year,
          vin: d.vin || "",
          body: d.bodyDesc || d.bodyCode || "",
        });
      } catch {}
    }
  }

  // Deduplicate by regnr (keep latest)
  const byRegnr = new Map();
  for (const v of vehicles) {
    byRegnr.set(v.regnr, v);
  }
  const uniqueVehicles = [...byRegnr.values()].slice(0, limit);
  
  log(`Total unique vehicles to map: ${uniqueVehicles.length}`);

  const matches = [];
  const noMatches = [];
  const sqlInserts = [];

  for (let i = 0; i < uniqueVehicles.length; i++) {
    const v = uniqueVehicles[i];
    const progress = `${i + 1}/${uniqueVehicles.length}`;

    const ktypeResult = await findKtype(v.make, v.model, v.year);

    if (ktypeResult) {
      matches.push({
        regnr: v.regnr,
        ktype: ktypeResult.ktype,
        make: v.make,
        model: v.model,
        year: v.year,
        matchedModel: ktypeResult.model,
        matchedBrand: ktypeResult.brand,
        yearFrom: ktypeResult.year_from,
        yearTo: ktypeResult.year_to,
      });

      // Build ground_truth INSERT
      const regnrHash = hashRegnr(v.regnr);
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, k_type, make, model, year, submodel, source) ` +
        `VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', ${ktypeResult.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_batch')`
      );

      log(`${progress} ${v.regnr}: MATCH → kType ${ktypeResult.ktype} (${ktypeResult.brand} ${ktypeResult.model})`);
    } else {
      noMatches.push({
        regnr: v.regnr,
        make: v.make,
        model: v.model,
        year: v.year,
      });

      // Still insert to ground_truth without k_type for later manual mapping
      const regnrHash = hashRegnr(v.regnr);
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, make, model, year, submodel, source) ` +
        `VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_batch_pending')`
      );

      if (noMatches.length <= 10) {
        log(`${progress} ${v.regnr}: NO MATCH → ${v.make} ${v.model} ${v.year}`);
      }
    }

    // Write SQL every 50
    if ((i + 1) % 50 === 0 && !dryRun) {
      fs.writeFileSync(OUTPUT_SQL, sqlInserts.join(";\n") + ";\n");
    }
  }

  // Write final SQL
  if (!dryRun) {
    fs.writeFileSync(OUTPUT_SQL, sqlInserts.join(";\n") + ";\n");
  }

  // Report
  const report = {
    totalProcessed: uniqueVehicles.length,
    matched: matches.length,
    noMatch: noMatches.length,
    matchRate: uniqueVehicles.length > 0 ? (matches.length / uniqueVehicles.length * 100).toFixed(1) : 0,
    topUnmatched: noMatches.slice(0, 20),
    topMatchedBrands: {},
    generatedAt: new Date().toISOString(),
  };

  // Count matched by brand
  for (const m of matches) {
    report.topMatchedBrands[m.make] = (report.topMatchedBrands[m.make] || 0) + 1;
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  log("=".repeat(50));
  log(`Mapping complete!`);
  log(`Total: ${uniqueVehicles.length}`);
  log(`Matched: ${matches.length} (${report.matchRate}%)`);
  log(`No match: ${noMatches.length}`);
  log(`SQL file: ${OUTPUT_SQL}`);
  log(`Report: ${REPORT_FILE}`);

  if (!dryRun && matches.length > 0) {
    log(`\nTo apply to D1, run:`);
    log(`npx wrangler d1 execute glass-catalog-db --remote --file ${OUTPUT_SQL}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
