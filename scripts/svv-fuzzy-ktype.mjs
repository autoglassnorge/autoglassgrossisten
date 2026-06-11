#!/usr/bin/env node
/**
 * SVV → kType Fuzzy Mapping
 * ==========================
 * Mapper SVV batch-resultater til kType via fuzzy matching mot D1 ktype_registry.
 * 
 * Features:
 * - D1 query caching (unike komboer spørres én gang)
 * - Fuzzy modellnavn-matching
 * - Year-range validering
 * - Batch SQL-generering for ground_truth
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const DATA_DIR = "data/finn-no-regnr";
const CACHE_FILE = path.join(DATA_DIR, "svv-cache.ndjson");
const RESULTS_FILE = path.join(DATA_DIR, "svv-batch-results.ndjson");
const D1_CACHE_FILE = path.join(DATA_DIR, "d1-ktype-cache.json");
const OUTPUT_SQL = path.join(DATA_DIR, "svv-ground-truth-inserts.sql");
const REPORT_FILE = path.join(DATA_DIR, "svv-fuzzy-report.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10) || Infinity;

// D1 query cache
let d1Cache = {};
if (fs.existsSync(D1_CACHE_FILE)) {
  d1Cache = JSON.parse(fs.readFileSync(D1_CACHE_FILE, "utf-8"));
}

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

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const aliases = {
    "VW": "VOLKSWAGEN",
    "MERCEDES": "MERCEDES-BENZ",
    "MERCEDES BENZ": "MERCEDES-BENZ",
    "BMW I": "BMW",
    "TESLA MOTORS": "TESLA",
    "JAGUAR LAND ROVER LIMITED": "LAND ROVER",
    "QUATTRO": "AUDI",
    "FAW": "TOYOTA",
    "BYD": "BYD", // No alias yet
  };
  return aliases[b] || b;
}

function extractBaseModel(model) {
  if (!model) return "";
  const m = model.toUpperCase()
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
    .replace(/\bM\s+\d/i, "") // Remove "M 3" from BMW
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  const words = m.split(/\s+/);
  if (!words.length) return "";
  
  // First "real" word (series name)
  let first = words[0].replace(/[^A-Z0-9\-]/g, "");
  
  // For BMW/VW/Mercedes: keep series+number
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

function d1Query(sql) {
  try {
    const cmd = `npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;
    const output = execSync(cmd, { encoding: "utf-8", timeout: 20000 });
    
    // Parse JSON from wrangler output
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.includes('"results"')) {
        const data = JSON.parse(trimmed);
        if (data[0]?.results) return data[0].results;
      }
    }
    return [];
  } catch (err) {
    return [];
  }
}

function findKtype(make, model, year) {
  const normBrand = normalizeBrand(make);
  const baseModel = extractBaseModel(model);
  const bodyHint = extractBodyHint(model);
  const cacheKey = `${normBrand}|${baseModel}|${bodyHint}|${year}`;
  
  if (d1Cache[cacheKey]) {
    return d1Cache[cacheKey];
  }
  
  if (!normBrand || !baseModel || !year) {
    d1Cache[cacheKey] = null;
    return null;
  }
  
  const safeBrand = sanitizeSql(normBrand);
  const safeBase = sanitizeSql(baseModel);
  
  // Strategy 1: Exact brand + model LIKE + year in range
  let sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = '${safeBrand}' AND model LIKE '%${safeBase}%' AND year_from <= ${year} AND (year_to >= ${year} OR year_to IS NULL) LIMIT 50`;
  let results = d1Query(sql);
  
  // Strategy 2: Broader model match
  if (results.length === 0) {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = '${safeBrand}' AND model LIKE '%${safeBase}%' LIMIT 50`;
    results = d1Query(sql);
  }
  
  // Strategy 3: Brand aliases
  if (results.length === 0 && normBrand === "MERCEDES-BENZ") {
    sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE (brand = 'MERCEDES-BENZ' OR brand = 'MERCEDES') AND model LIKE '%${safeBase}%' LIMIT 50`;
    results = d1Query(sql);
  }
  
  if (results.length === 0) {
    d1Cache[cacheKey] = null;
    return null;
  }
  
  if (results.length === 1) {
    d1Cache[cacheKey] = results[0];
    return results[0];
  }
  
  // Multiple results — pick best
  let best = null;
  let bestScore = -Infinity;
  
  for (const r of results) {
    const tecModel = (r.model || "").toUpperCase();
    let score = 0;
    
    // Base model match
    if (tecModel.includes(baseModel)) score += 20;
    
    // Body type preference
    if (bodyHint && tecModel.includes(bodyHint)) score += 15;
    else if (bodyHint === "SPORTBACK" && tecModel.includes("SPORT")) score += 10;
    
    // Year match
    const yf = r.year_from || 0;
    const yt = r.year_to || 9999;
    if (year >= yf && year <= yt) score += 15;
    else if (Math.abs(year - yf) <= 2 || Math.abs(year - yt) <= 2) score += 8;
    
    // Prefer models WITH body type (more specific = better)
    if (tecModel.includes("(") && tecModel.includes(")")) score += 5;
    
    // Penalize very long model names (too specific = wrong series)
    score -= Math.max(0, tecModel.length - 40) * 0.3;
    
    // Prefer exact year range match
    const rangeSize = yt - yf;
    if (rangeSize <= 5) score += 5;
    else if (rangeSize <= 10) score += 2;
    
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  
  d1Cache[cacheKey] = best;
  return best;
}

async function main() {
  log("Starting SVV → kType fuzzy mapping");
  log(`Dry run: ${dryRun}, Limit: ${limit === Infinity ? "all" : limit}`);
  
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
          make: d.make,
          model: d.model,
          year: d.year,
          vin: d.vin || "",
          body: d.bodyDesc || d.bodyCode || "",
        });
      } catch {}
    }
  }
  
  // Deduplicate by regnr
  const byRegnr = new Map();
  for (const v of vehicles) {
    byRegnr.set(v.regnr.toUpperCase().replace(/\s/g, ""), v);
  }
  const uniqueVehicles = [...byRegnr.values()].slice(0, limit);
  
  log(`Total unique vehicles: ${uniqueVehicles.length}`);
  
  const matches = [];
  const noMatches = [];
  const sqlInserts = [];
  let d1QueriesMade = 0;
  
  for (let i = 0; i < uniqueVehicles.length; i++) {
    const v = uniqueVehicles[i];
    const progress = `${i + 1}/${uniqueVehicles.length}`;
    
    const ktypeResult = findKtype(v.make, v.model, v.year);
    
    // Count D1 queries
    const cacheKey = `${normalizeBrand(v.make)}|${extractBaseModel(v.model)}|${extractBodyHint(v.model)}|${v.year}`;
    if (!d1Cache[cacheKey + "_seen"]) {
      d1Cache[cacheKey + "_seen"] = true;
      d1QueriesMade++;
    }
    
    const regnrHash = hashRegnr(v.regnr);
    
    if (ktypeResult) {
      matches.push({
        regnr: v.regnr,
        ktype: ktypeResult.ktype,
        make: v.make,
        model: v.model,
        year: v.year,
        matchedModel: ktypeResult.model,
        yearFrom: ktypeResult.year_from,
        yearTo: ktypeResult.year_to,
      });
      
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, k_type, make, model, year, submodel, source) ` +
        `VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', ${ktypeResult.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_fuzzy')`
      );
      
      if (i < 20 || i % 100 === 0) {
        log(`${progress} ${v.regnr}: MATCH → kType ${ktypeResult.ktype} (${ktypeResult.brand} ${ktypeResult.model})`);
      }
    } else {
      noMatches.push({ regnr: v.regnr, make: v.make, model: v.model, year: v.year });
      
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, make, model, year, submodel, source) ` +
        `VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_pending')`
      );
      
      if (noMatches.length <= 15) {
        log(`${progress} ${v.regnr}: NO MATCH → ${v.make} ${v.model} ${v.year}`);
      }
    }
    
    // Save cache every 50
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(D1_CACHE_FILE, JSON.stringify(d1Cache, null, 0));
      if (!dryRun && sqlInserts.length > 0) {
        fs.writeFileSync(OUTPUT_SQL, sqlInserts.join(";\n") + ";\n");
      }
    }
  }
  
  // Final save
  fs.writeFileSync(D1_CACHE_FILE, JSON.stringify(d1Cache, null, 0));
  if (!dryRun) {
    fs.writeFileSync(OUTPUT_SQL, sqlInserts.join(";\n") + ";\n");
  }
  
  // Report
  const matchRate = uniqueVehicles.length > 0 ? (matches.length / uniqueVehicles.length * 100).toFixed(1) : 0;
  const brandStats = {};
  for (const m of matches) {
    brandStats[m.make] = (brandStats[m.make] || 0) + 1;
  }
  
  const report = {
    totalProcessed: uniqueVehicles.length,
    matched: matches.length,
    noMatch: noMatches.length,
    matchRate: parseFloat(matchRate),
    d1QueriesMade,
    topMatchedBrands: Object.entries(brandStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .reduce((o, [k, v]) => { o[k] = v; return o; }, {}),
    sampleNoMatch: noMatches.slice(0, 20),
    generatedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  
  log("=".repeat(50));
  log(`Fuzzy mapping complete!`);
  log(`Total: ${uniqueVehicles.length}`);
  log(`Matched: ${matches.length} (${matchRate}%)`);
  log(`No match: ${noMatches.length}`);
  log(`D1 queries: ${d1QueriesMade}`);
  log(`SQL: ${OUTPUT_SQL}`);
  log(`Report: ${REPORT_FILE}`);
  
  if (!dryRun && matches.length > 0) {
    log(`\nApply to D1:`);
    log(`npx wrangler d1 execute glass-catalog-db --remote --file ${OUTPUT_SQL}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
