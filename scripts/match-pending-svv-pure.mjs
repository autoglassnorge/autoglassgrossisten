#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const OUTPUT_SQL = "data/tecdoc-import/pending-svv-updates.sql";
const OUTPUT_REPORT = "data/tecdoc-import/pending-svv-match-report.json";

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

// Extract BMW series from model (316i → 3, 530d → 5, X3 → X3, iX1 → iX1)
function bmwSeries(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b([1-7]|X[1-7]|IX[1-3]|M[1-5])\b/);
  return match ? match[1] : null;
}

// Extract Mercedes class from model (C200 → C, E350 → E, S500 → S)
function mercedesClass(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b([ABCEGSMLV])\d{2,3}\b/);
  return match ? match[1] : null;
}

// Extract Audi series from model (A4 → A4, Q5 → Q5, RS3 → RS3)
function audiSeries(model) {
  const m = normalizeModel(model);
  const match = m.match(/\b(A[1-8]|Q[2-8]|RS[3-7]|TT|R8)\b/);
  return match ? match[1] : null;
}

function modelMatch(svvModel, regModel, brand) {
  const s = normalizeModel(svvModel);
  const r = normalizeModel(regModel);
  
  // Exact match
  if (s === r) return 1.0;
  
  // Brand-specific logic
  const normBrand = normalizeBrand(brand);
  
  if (normBrand === "BMW") {
    const svvSeries = bmwSeries(svvModel);
    const regSeries = bmwSeries(regModel);
    if (svvSeries && regSeries) {
      if (svvSeries === regSeries) return 0.95;
      return 0; // Different series = no match
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
  
  // Substring match - but require meaningful length
  if (r.includes(s) && s.length >= 3) return 0.9;
  if (s.includes(r) && r.length >= 3) return 0.9;
  
  // Base model match
  const sb = extractBaseModel(svvModel);
  const rb = extractBaseModel(regModel);
  if (sb === rb && sb.length >= 3) return 0.85;
  if (rb.includes(sb) && sb.length >= 3) return 0.8;
  if (sb.includes(rb) && rb.length >= 3) return 0.8;
  
  // Word overlap
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

function fetchPendingRows() {
  console.log("📖 Fetching pending rows from D1...");
  const sql = `SELECT id, regnr_hash, make, model, year FROM ground_truth WHERE k_type IS NULL AND make IS NOT NULL AND model IS NOT NULL AND year IS NOT NULL`;
  const cmd = `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --command "${sql}" --json > /tmp/d1-pending.json 2>&1`;
  execSync(cmd, { timeout: 60000 });
  
  const raw = readFileSync("/tmp/d1-pending.json", "utf-8");
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const data = JSON.parse(match[0]);
  if (Array.isArray(data) && data[0]?.results) return data[0].results;
  return [];
}

function loadRegistry() {
  console.log("📖 Loading ktype registry...");
  const data = JSON.parse(readFileSync("data/tecdoc-import/ktype-vehicles.json", "utf-8"));
  console.log(`   → ${data.length} entries`);
  return data.map(e => ({
    ktype: parseInt(e.ktype, 10),
    brand: e.brand,
    model: e.model,
    year_from: e.year_from,
    year_to: e.year_to,
  }));
}

function main() {
  const pending = fetchPendingRows();
  console.log(`   → ${pending.length} pending rows`);
  
  if (pending.length === 0) {
    console.log("✅ No pending rows!");
    return;
  }
  
  const registry = loadRegistry();
  
  console.log("\n🔨 Building brand index...");
  const byBrand = new Map();
  for (const entry of registry) {
    const brand = normalizeBrand(entry.brand);
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(entry);
  }
  console.log(`   → ${byBrand.size} brands indexed`);
  
  console.log("\n🔍 Matching with improved logic...");
  let matched = 0, unmatched = 0, lowConfidence = 0;
  const updates = [];
  const details = [];
  
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    if (i % 500 === 0) console.log(`   ${i}/${pending.length} (matched: ${matched}, low-conf: ${lowConfidence})`);
    
    const brand = normalizeBrand(row.make);
    const candidates = byBrand.get(brand);
    if (!candidates) { unmatched++; continue; }
    
    const matches = [];
    for (const cand of candidates) {
      const mScore = modelMatch(row.model, cand.model, row.make);
      if (mScore < 0.5) continue;
      const yOverlap = yearOverlap(row.year, row.year, cand.year_from, cand.year_to);
      if (yOverlap > 0 || !cand.year_from || !row.year) {
        matches.push({ ...cand, model_score: mScore, year_overlap: yOverlap });
      }
    }
    
    if (matches.length === 0) { unmatched++; continue; }
    
    matches.sort((a, b) => b.model_score - a.model_score || b.year_overlap - a.year_overlap);
    const best = matches[0];
    
    // Only accept high-confidence matches
    if (best.model_score < 0.85) {
      lowConfidence++;
      unmatched++;
      continue;
    }
    
    matched++;
    updates.push({ id: row.id, ktype: best.ktype, confidence: Math.round(best.model_score * 100) / 100 });
    
    if (details.length < 50) {
      details.push({
        id: row.id, regnr_hash: row.regnr_hash,
        svv: `${row.make} ${row.model} ${row.year}`,
        matched: `${best.brand} ${best.model} ${best.year_from}-${best.year_to}`,
        ktype: best.ktype, score: best.model_score
      });
    }
  }
  
  console.log(`\n📊 Results:`);
  console.log(`   Total pending: ${pending.length}`);
  console.log(`   Matched (score≥0.85): ${matched}`);
  console.log(`   Low confidence rejected: ${lowConfidence}`);
  console.log(`   Unmatched: ${unmatched}`);
  console.log(`   Success rate: ${(matched / pending.length * 100).toFixed(1)}%`);
  
  if (updates.length === 0) {
    console.log("⚠️ No high-confidence matches found. Not generating SQL.");
    return;
  }
  
  console.log("\n📝 Writing SQL...");
  let sql = "-- Auto-generated: Fuzzy-match pending SVV rows (high confidence only)\nBEGIN TRANSACTION;\n";
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    sql += `UPDATE ground_truth SET k_type=${u.ktype}, confidence=${u.confidence}, verified_by='svv_fuzzy_matched', verified_at=datetime('now') WHERE id=${u.id};\n`;
    if ((i + 1) % 500 === 0) sql += "COMMIT;\nBEGIN TRANSACTION;\n";
  }
  sql += "COMMIT;\n";
  writeFileSync(OUTPUT_SQL, sql);
  console.log(`   → ${OUTPUT_SQL} (${updates.length} updates)`);
  
  const report = {
    total_pending: pending.length, matched, unmatched, low_confidence_rejected: lowConfidence,
    success_rate: matched / pending.length,
    sample_matches: details.slice(0, 20),
    generated_at: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));
  console.log(`   → ${OUTPUT_REPORT}`);
  
  console.log("\n✅ Next: cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=../../data/tecdoc-import/pending-svv-updates.sql");
}

main();
