#!/usr/bin/env node
/**
 * SVV → kType Fast Fuzzy Mapping (local SQLite)
 * ==============================================
 * Uses local SQLite dump of D1 for fast matching.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const DATA_DIR = "data/finn-no-regnr";
const SQLITE_DB = "/tmp/d1-local.db";
const OUTPUT_SQL = path.join(DATA_DIR, "svv-ground-truth-inserts.sql");
const REPORT_FILE = path.join(DATA_DIR, "svv-fuzzy-report.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

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
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  const words = m.split(/\s+/);
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
  if (m.includes("CABRIO")) return "CABRIO";
  if (m.includes("COUPE")) return "COUPE";
  if (m.includes("ESTATE")) return "AVANT";
  if (m.includes("HATCHBACK")) return "HATCHBACK";
  if (m.includes("SUV")) return "SUV";
  return "";
}

function sqliteQuery(sql) {
  try {
    const output = execSync(`sqlite3 ${SQLITE_DB} "${sql.replace(/"/g, '\\"')}" -json`, { encoding: "utf-8", timeout: 60000, maxBuffer: 100 * 1024 * 1024 });
    return JSON.parse(output.trim() || "[]");
  } catch {
    return [];
  }
}

function fetchAllKtypes() {
  log("Loading ktype_registry from local SQLite...");
  const results = sqliteQuery("SELECT ktype, brand, model, year_from, year_to FROM ktype_registry");
  log(`Loaded ${results.length} rows`);
  return results;
}

function findKtypeLocal(allData, make, model, year) {
  const normBrand = normalizeBrand(make);
  const baseModel = extractBaseModel(model);
  const bodyHint = extractBodyHint(model);
  
  if (!normBrand || !baseModel || !year) return null;
  
  const candidates = allData.filter(r => {
    if (normalizeBrand(r.brand) !== normBrand) return false;
    const tecModel = (r.model || "").toUpperCase();
    return tecModel.includes(baseModel);
  });
  
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  
  let best = null;
  let bestScore = -Infinity;
  
  for (const r of candidates) {
    const tecModel = (r.model || "").toUpperCase();
    let score = 0;
    
    if (tecModel.includes(baseModel)) score += 20;
    if (bodyHint && tecModel.includes(bodyHint)) score += 15;
    if (bodyHint === "SPORTBACK" && tecModel.includes("SPORT")) score += 10;
    
    const yf = r.year_from || 0;
    const yt = r.year_to || 9999;
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

async function main() {
  log("SVV Fast Fuzzy Mapping (local SQLite)");
  
  // Check SQLite exists
  if (!fs.existsSync(SQLITE_DB)) {
    log(`ERROR: ${SQLITE_DB} not found. Run: sqlite3 /tmp/d1-local.db < /tmp/d1-export.sql`);
    process.exit(1);
  }
  
  // Load all ktype data
  const allData = fetchAllKtypes();
  
  // Load SVV vehicles
  const vehicles = [];
  for (const fn of [path.join(DATA_DIR, "svv-cache.ndjson"), path.join(DATA_DIR, "svv-batch-results.ndjson")]) {
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
  
  const byRegnr = new Map();
  for (const v of vehicles) {
    byRegnr.set(v.regnr.toUpperCase().replace(/\s/g, ""), v);
  }
  const uniqueVehicles = [...byRegnr.values()];
  log(`SVV vehicles: ${uniqueVehicles.length}`);
  
  // Match all
  const matches = [];
  const noMatches = [];
  const sqlInserts = [];
  
  for (let i = 0; i < uniqueVehicles.length; i++) {
    const v = uniqueVehicles[i];
    const ktypeResult = findKtypeLocal(allData, v.make, v.model, v.year);
    const regnrHash = hashRegnr(v.regnr);
    
    if (ktypeResult) {
      matches.push({ regnr: v.regnr, ktype: ktypeResult.ktype, make: v.make, model: v.model, year: v.year, matchedModel: ktypeResult.model });
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, k_type, make, model, year, submodel, source) VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', ${ktypeResult.ktype}, '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_fuzzy')`
      );
      if (i < 20 || i % 500 === 0) {
        log(`${i + 1}/${uniqueVehicles.length} ${v.regnr}: MATCH → kType ${ktypeResult.ktype}`);
      }
    } else {
      noMatches.push({ regnr: v.regnr, make: v.make, model: v.model, year: v.year });
      sqlInserts.push(
        `INSERT OR IGNORE INTO ground_truth (regnr_hash, vin, make, model, year, submodel, source) VALUES ('${regnrHash}', '${sanitizeSql(v.vin)}', '${sanitizeSql(v.make)}', '${sanitizeSql(v.model)}', ${v.year}, '${sanitizeSql(v.body)}', 'svv_pending')`
      );
      if (noMatches.length <= 20) {
        log(`${i + 1}/${uniqueVehicles.length} ${v.regnr}: NO MATCH → ${v.make} ${v.model} ${v.year}`);
      }
    }
  }
  
  // Output
  if (!dryRun) {
    fs.writeFileSync(OUTPUT_SQL, sqlInserts.join(";\n") + ";\n");
  }
  
  const matchRate = uniqueVehicles.length > 0 ? (matches.length / uniqueVehicles.length * 100).toFixed(1) : 0;
  const brandStats = {};
  for (const m of matches) brandStats[m.make] = (brandStats[m.make] || 0) + 1;
  
  const report = {
    totalProcessed: uniqueVehicles.length,
    matched: matches.length,
    noMatch: noMatches.length,
    matchRate: parseFloat(matchRate),
    topMatchedBrands: Object.entries(brandStats).sort((a, b) => b[1] - a[1]).slice(0, 15).reduce((o, [k, v]) => { o[k] = v; return o; }, {}),
    sampleNoMatch: noMatches.slice(0, 30),
    generatedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  
  log("=".repeat(50));
  log(`COMPLETE! Matched: ${matches.length}/${uniqueVehicles.length} (${matchRate}%)`);
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
