#!/usr/bin/env node
/**
 * Local fuzzy matching of pending SVV rows against ktype_registry
 * Uses D1 data exported to local SQLite, or falls back to JSON cache
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// ─── Config ───
const DB_NAME = "glass-catalog-db";
const WORKER_DIR = "api/cf-worker";
const OUTPUT_SQL = "data/tecdoc-import/pending-svv-updates.sql";
const OUTPUT_REPORT = "data/tecdoc-import/pending-svv-match-report.json";

// ─── Normalization ───
const BRAND_MAP = {
  "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
  "VOLKSWAGEN": "VW", "LAND ROVER": "LANDROVER",
  "CITROËN": "CITROEN", "CITROEN": "CITROEN",
  "VAUXHALL": "OPEL", "ALFA ROMEO": "ALFA",
  "ROLLS-ROYCE": "ROLLSROYCE",
  "FORD USA": "FORD", "FORD AUSTRALIA": "FORD",
};

function normalizeBrand(b) {
  const brand = (b || "").toUpperCase().trim();
  return BRAND_MAP[brand] || brand;
}

function normalizeModel(m) {
  return (m || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBaseModel(model) {
  const m = normalizeModel(model);
  return m
    .replace(/\s+(SEDAN|WAGON|HATCHBACK|COUPE|CABRIOLET|CONVERTIBLE|SW|CC|GTI|GTD|TDCI|TDI|DCI|HDI|CDTI|JTD|CRDI|GDI|FSI|TSI|TFSI|VVTI|D4D|DCI)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function modelMatch(svvModel, regModel) {
  const s = normalizeModel(svvModel);
  const r = normalizeModel(regModel);
  if (s === r) return 1.0;
  if (r.includes(s) || s.includes(r)) return 0.9;
  const sb = extractBaseModel(svvModel);
  const rb = extractBaseModel(regModel);
  if (sb === rb) return 0.85;
  if (rb.includes(sb) || sb.includes(rb)) return 0.8;
  const sw = new Set(s.split(" "));
  const rw = new Set(r.split(" "));
  const inter = [...sw].filter(x => rw.has(x));
  const union = new Set([...sw, ...rw]);
  const jaccard = inter.size / union.size;
  if (jaccard >= 0.6) return 0.7;
  if (jaccard >= 0.4) return 0.5;
  return 0;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const start = Math.max(yf1 || 1900, yf2 || 1900);
  const end = Math.min(yt1 || 2100, yt2 || 2100);
  return Math.max(0, end - start + 1);
}

// ─── Export D1 to local SQLite ───
function exportD1Local() {
  console.log("📦 Exporting D1 to local SQLite...");
  try {
    execSync(
      `cd ${WORKER_DIR} && npx wrangler d1 export ${DB_NAME} --remote --output /tmp/d1-export.sql`,
      { stdio: "inherit", timeout: 120000 }
    );
    execSync(`sqlite3 /tmp/d1-local.db < /tmp/d1-export.sql`, { stdio: "ignore" });
    console.log("   → Exported to /tmp/d1-local.db");
    return true;
  } catch (e) {
    console.log("   → Export failed, will try JSON fallback:", e.message);
    return false;
  }
}

// ─── Query local SQLite ───
function queryLocal(sql) {
  const result = execSync(`sqlite3 /tmp/d1-local.db '${sql.replace(/'/g, "''")}' -json`, {
    encoding: "utf-8",
    timeout: 30000,
  });
  return JSON.parse(result || "[]");
}

// ─── Load from JSON fallback ───
function loadFromJson() {
  console.log("📖 Loading from JSON cache...");
  const pending = JSON.parse(readFileSync("data/finn-no-regnr/svv-batch-results.ndjson", "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
    .filter(r => r.ktype === null && r.make && r.model && r.year)
    .map((r, i) => ({ id: i + 10000, regnr_hash: r.regnr_hash || "", make: r.make, model: r.model, year: r.year }))
  );
  
  const registry = JSON.parse(readFileSync("data/tecdoc-import/ktype-vehicles.json", "utf-8"));
  return { pending, registry };
}

// ─── Main ───
async function main() {
  let pending, registry;
  
  if (exportD1Local()) {
    console.log("📖 Fetching pending rows...");
    pending = queryLocal(`
      SELECT id, regnr_hash, make, model, year 
      FROM ground_truth 
      WHERE k_type IS NULL 
        AND make IS NOT NULL 
        AND model IS NOT NULL 
        AND year IS NOT NULL
    `);
    console.log(`   → ${pending.length} pending rows`);
    
    console.log("📖 Fetching ktype_registry...");
    registry = queryLocal(`SELECT ktype, brand, model, year_from, year_to FROM ktype_registry`);
    console.log(`   → ${registry.length} registry entries`);
  } else {
    const data = loadFromJson();
    pending = data.pending;
    registry = data.registry.map(e => ({
      ktype: parseInt(e.ktype),
      brand: e.brand,
      model: e.model,
      year_from: e.year_from,
      year_to: e.year_to,
    }));
  }
  
  if (pending.length === 0) {
    console.log("✅ No pending rows to match!");
    return;
  }
  
  // Build index
  console.log("\n🔨 Building brand index...");
  const byBrand = new Map();
  for (const entry of registry) {
    const brand = normalizeBrand(entry.brand);
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(entry);
  }
  console.log(`   → ${byBrand.size} brands indexed`);
  
  // Match
  console.log("\n🔍 Fuzzy matching...");
  let matched = 0;
  let unmatched = 0;
  const updates = [];
  const matchDetails = [];
  
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    if (i % 500 === 0) {
      console.log(`   ${i}/${pending.length}... matched: ${matched}`);
    }
    
    const brand = normalizeBrand(row.make);
    const candidates = byBrand.get(brand);
    if (!candidates) { unmatched++; continue; }
    
    const matches = [];
    for (const cand of candidates) {
      const mScore = modelMatch(row.model, cand.model);
      if (mScore < 0.5) continue;
      
      const year = row.year;
      const yOverlap = yearOverlap(year, year, cand.year_from, cand.year_to);
      if (yOverlap > 0 || !cand.year_from || !year) {
        matches.push({ ...cand, model_score: mScore, year_overlap: yOverlap });
      }
    }
    
    if (matches.length === 0) { unmatched++; continue; }
    
    matches.sort((a, b) => {
      if (b.model_score !== a.model_score) return b.model_score - a.model_score;
      return b.year_overlap - a.year_overlap;
    });
    
    const best = matches[0];
    matched++;
    
    updates.push({
      id: row.id,
      ktype: best.ktype,
      confidence: Math.round(best.model_score * 100) / 100,
    });
    
    if (matchDetails.length < 100) {
      matchDetails.push({
        id: row.id,
        regnr_hash: row.regnr_hash,
        svv_make: row.make,
        svv_model: row.model,
        svv_year: row.year,
        ktype: best.ktype,
        reg_brand: best.brand,
        reg_model: best.model,
        model_score: best.model_score,
        year_overlap: best.year_overlap,
      });
    }
  }
  
  console.log(`\n📊 Matching Results:`);
  console.log(`   Total pending: ${pending.length}`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Unmatched: ${unmatched}`);
  console.log(`   Success rate: ${((matched / pending.length) * 100).toFixed(1)}%`);
  
  // Generate SQL
  console.log("\n📝 Generating UPDATE SQL...");
  let sql = "-- Auto-generated: Match pending SVV rows to kTypes\n";
  sql += "BEGIN TRANSACTION;\n";
  let count = 0;
  for (const u of updates) {
    sql += `UPDATE ground_truth SET k_type = ${u.ktype}, confidence = ${u.confidence}, verified_by = 'svv_fuzzy_matched', verified_at = datetime('now') WHERE id = ${u.id};\n`;
    count++;
    if (count % 500 === 0) {
      sql += "COMMIT;\nBEGIN TRANSACTION;\n";
    }
  }
  sql += "COMMIT;\n";
  
  writeFileSync(OUTPUT_SQL, sql);
  console.log(`   → ${OUTPUT_SQL} (${count} updates)`);
  
  // Save report
  const report = {
    total_pending: pending.length,
    matched,
    unmatched,
    success_rate: matched / pending.length,
    sample_matches: matchDetails.slice(0, 20),
    generated_at: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));
  console.log(`   → ${OUTPUT_REPORT}`);
  
  console.log("\n✅ Next steps:");
  console.log(`   1. Review sample matches in ${OUTPUT_REPORT}`);
  console.log(`   2. Run: cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --file=../../${OUTPUT_SQL}`);
  console.log(`   3. Or batch via: cat ${OUTPUT_SQL} | wrangler d1 execute ${DB_NAME} --remote`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
