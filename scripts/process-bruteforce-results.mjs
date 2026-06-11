#!/usr/bin/env node
/**
 * Process bruteforce SVV results:
 * 1. Read NDJSON results
 * 2. Fuzzy match with ktype_registry
 * 3. Generate ground_truth INSERT SQL
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";

const RESULTS_FILE = "data/finn-no-regnr/regnr-bruteforce-results.ndjson";
const REGISTRY_FILE = "data/tecdoc-import/ktype-vehicles.json";
const OUTPUT_SQL = "data/tecdoc-import/bruteforce-ground-truth-inserts.sql";
const OUTPUT_REPORT = "data/tecdoc-import/bruteforce-process-report.json";
const CHECKPOINT_FILE = "data/finn-no-regnr/regnr-bruteforce-processing.json";

// ─── Normalization (same as matcher) ───
const BRAND_MAP = {
  "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
  "VOLKSWAGEN": "VW", "LAND ROVER": "LANDROVER",
  "CITROËN": "CITROEN", "CITROEN": "CITROEN",
  "VAUXHALL": "OPEL", "ALFA ROMEO": "ALFA",
  "ROLLS-ROYCE": "ROLLSROYCE",
  "FORD USA": "FORD", "FORD AUSTRALIA": "FORD",
};

function normalizeBrand(b) {
  return BRAND_MAP[(b || "").toUpperCase().trim()] || (b || "").toUpperCase().trim();
}

function normalizeModel(m) {
  return (m || "").toUpperCase().replace(/[^A-Z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function extractBaseModel(model) {
  return normalizeModel(model)
    .replace(/\s+(SEDAN|WAGON|HATCHBACK|COUPE|CABRIOLET|CONVERTIBLE|SW|CC|GTI|GTD|TDCI|TDI|DCI|HDI|CDTI|JTD|CRDI|GDI|FSI|TSI|TFSI|VVTI|D4D)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

function bmwSeries(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b([1-7]|X[1-7]|IX[1-3]|M[1-5])\b/);
  return match ? match[1] : null;
}

function mercedesClass(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b([ABCEGSMLV])\d{2,3}\b/);
  return match ? match[1] : null;
}

function audiSeries(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b(A[1-8]|Q[2-8]|RS[3-7]|TT|R8)\b/);
  return match ? match[1] : null;
}

function modelMatch(svvModel, regModel, brand) {
  const s = normalizeModel(svvModel);
  const r = normalizeModel(regModel);
  
  if (s === r) return 1.0;
  
  const normBrand = normalizeBrand(brand);
  
  if (normBrand === "BMW") {
    const svvSeries = bmwSeries(svvModel);
    const regSeries = bmwSeries(regModel);
    if (svvSeries && regSeries) {
      if (svvSeries === regSeries) return 0.95;
      return 0;
    }
  }
  
  if (normBrand === "MERCEDES") {
    const svvClass = mercedesClass(svvModel);
    const regClass = mercedesClass(regModel);
    if (svvClass && regClass) {
      if (svvClass === regClass) return 0.95;
      return 0;
    }
  }
  
  if (normBrand === "AUDI") {
    const svvSeries = audiSeries(svvModel);
    const regSeries = audiSeries(regModel);
    if (svvSeries && regSeries) {
      if (svvSeries === regSeries) return 0.95;
      return 0;
    }
  }
  
  if (r.includes(s) && s.length >= 3) return 0.9;
  if (s.includes(r) && r.length >= 3) return 0.9;
  
  const sb = extractBaseModel(svvModel);
  const rb = extractBaseModel(regModel);
  if (sb === rb && sb.length >= 3) return 0.85;
  if (rb.includes(sb) && sb.length >= 3) return 0.8;
  if (sb.includes(rb) && rb.length >= 3) return 0.8;
  
  const sw = new Set(s.split(" ")), rw = new Set(r.split(" "));
  const inter = [...sw].filter(x => rw.has(x));
  const union = new Set([...sw, ...rw]);
  const jaccard = inter.size / union.size;
  if (jaccard >= 0.6) return 0.7;
  if (jaccard >= 0.4) return 0.5;
  
  return 0;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  return Math.max(0, Math.min(yt1 || 2100, yt2 || 2100) - Math.max(yf1 || 1900, yf2 || 1900) + 1);
}

function hashRegnr(regnr) {
  return createHash("sha256").update(regnr.replace(/\s/g, "").toUpperCase()).digest("hex");
}

// ─── Load results ───
function loadResults() {
  if (!existsSync(RESULTS_FILE)) return [];
  const lines = readFileSync(RESULTS_FILE, "utf-8").split("\n").filter(l => l.trim());
  return lines.map(l => JSON.parse(l));
}

// ─── Load registry ───
function loadRegistry() {
  const data = JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  return data.map(e => ({
    ktype: parseInt(e.ktype, 10),
    brand: e.brand,
    model: e.model,
    year_from: e.year_from,
    year_to: e.year_to,
  }));
}

// ─── Match single result ───
function matchResult(result, registryByBrand) {
  const brand = normalizeBrand(result.make);
  const model = result.model;
  const year = result.year;
  
  if (!brand || !model || !year) return null;
  
  const candidates = registryByBrand.get(brand);
  if (!candidates) return null;
  
  const matches = [];
  for (const cand of candidates) {
    const mScore = modelMatch(model, cand.model, result.make);
    if (mScore < 0.5) continue;
    
    const yOverlap = yearOverlap(year, year, cand.year_from, cand.year_to);
    if (yOverlap > 0 || !cand.year_from) {
      matches.push({ ...cand, model_score: mScore, year_overlap: yOverlap });
    }
  }
  
  if (matches.length === 0) return null;
  
  matches.sort((a, b) => b.model_score - a.model_score || b.year_overlap - a.year_overlap);
  const best = matches[0];
  
  // Only accept high confidence
  if (best.model_score < 0.85) return null;
  
  return best;
}

// ─── Main ───
function main() {
  console.log("📖 Loading bruteforce results...");
  const results = loadResults();
  console.log(`   → ${results.length} results`);
  
  if (results.length === 0) {
    console.log("⚠️ No results to process");
    return;
  }
  
  console.log("📖 Loading ktype registry...");
  const registry = loadRegistry();
  console.log(`   → ${registry.length} entries`);
  
  console.log("\n🔨 Building brand index...");
  const byBrand = new Map();
  for (const entry of registry) {
    const brand = normalizeBrand(entry.brand);
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(entry);
  }
  console.log(`   → ${byBrand.size} brands indexed`);
  
  console.log("\n🔍 Matching...");
  let matched = 0;
  let unmatched = 0;
  const inserts = [];
  const details = [];
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (i % 100 === 0) console.log(`   ${i}/${results.length} (matched: ${matched})`);
    
    const best = matchResult(result, byBrand);
    if (best) {
      matched++;
      inserts.push({
        regnr_hash: hashRegnr(result.regnr),
        k_type: best.ktype,
        make: result.make,
        model: result.model,
        year: result.year,
        vin: result.vin || null,
        confidence: Math.round(best.model_score * 100) / 100,
      });
      
      if (details.length < 30) {
        details.push({
          regnr: result.regnr,
          svv: `${result.make} ${result.model} ${result.year}`,
          matched: `${best.brand} ${best.model} ${best.year_from}-${best.year_to}`,
          ktype: best.ktype,
          score: best.model_score,
        });
      }
    } else {
      unmatched++;
    }
  }
  
  console.log(`\n📊 Results: ${matched} matched, ${unmatched} unmatched (${(matched/results.length*100).toFixed(1)}%)`);
  
  // Generate SQL
  if (inserts.length > 0) {
    console.log("\n📝 Generating ground_truth INSERT SQL...");
    let sql = "-- Auto-generated: Bruteforce SVV → ground_truth\n";
    sql += "-- Only high-confidence matches (score >= 0.85)\n";
    
    for (let i = 0; i < inserts.length; i++) {
      const ins = inserts[i];
      const make = (ins.make || "").replace(/'/g, "''");
      const model = (ins.model || "").replace(/'/g, "''");
      const vin = ins.vin ? `'${ins.vin.replace(/'/g, "''")}'` : "NULL";
      sql += `INSERT OR IGNORE INTO ground_truth (regnr_hash, k_type, make, model, year, vin, verified_by, confidence, verified_at) VALUES ('${ins.regnr_hash}', ${ins.k_type}, '${make}', '${model}', ${ins.year}, ${vin}, 'svv_bruteforce', ${ins.confidence}, datetime('now'));\n`;
    }
    
    writeFileSync(OUTPUT_SQL, sql);
    console.log(`   → ${OUTPUT_SQL} (${inserts.length} inserts)`);
  }
  
  // Report
  const report = {
    total_results: results.length,
    matched,
    unmatched,
    success_rate: matched / results.length,
    unique_ktypes: [...new Set(inserts.map(i => i.k_type))].length,
    sample_matches: details.slice(0, 20),
    generated_at: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));
  console.log(`   → ${OUTPUT_REPORT}`);
  
  console.log("\n✅ Done! Run SQL with:");
  console.log(`   cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=../../${OUTPUT_SQL}`);
}

main();
