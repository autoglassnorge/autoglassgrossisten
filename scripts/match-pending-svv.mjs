#!/usr/bin/env node
/**
 * Match pending SVV ground_truth rows (k_type IS NULL) against ktype_registry
 * Uses fuzzy matching on brand+model+year
 */
import { createHash } from "crypto";

const API_BASE = "https://api.tomar.ai";

function sha256(str) {
  return createHash("sha256").update(str).digest("hex");
}

// ─── Fetch pending rows from D1 ───
async function fetchPendingRows() {
  console.log("📖 Fetching pending SVV rows from D1...");
  const res = await fetch(`${API_BASE}/admin/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: `
        SELECT id, regnr_hash, make, model, year, verified_by
        FROM ground_truth
        WHERE k_type IS NULL
          AND make IS NOT NULL
          AND model IS NOT NULL
          AND year IS NOT NULL
        ORDER BY id
      `
    })
  });
  const data = await res.json();
  if (!data.results) {
    console.log("   → No results or error:", data);
    return [];
  }
  console.log(`   → ${data.results.length} pending rows found`);
  return data.results;
}

// ─── Fetch ktype_registry ───
async function fetchKtypeRegistry() {
  console.log("📖 Fetching ktype_registry from D1...");
  const res = await fetch(`${API_BASE}/admin/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry`
    })
  });
  const data = await res.json();
  console.log(`   → ${data.results.length} registry entries`);
  return data.results;
}

// ─── Normalization ───
const BRAND_MAP = {
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "VOLKSWAGEN": "VW",
  "LAND ROVER": "LANDROVER",
  "CITROËN": "CITROEN",
  "CITROEN": "CITROEN",
  "VAUXHALL": "OPEL",
  "ALFA ROMEO": "ALFA",
  "ROLLS-ROYCE": "ROLLSROYCE",
  "FORD USA": "FORD",
  "FORD AUSTRALIA": "FORD",
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
  // Remove common suffixes
  return m
    .replace(/\s+(SEDAN|WAGON|HATCHBACK|COUPE|CABRIOLET|CONVERTIBLE|SW|CC|GTI|GTD|TDCI|TDI|DCI|HDI|CDTI|JTD|CRDI|GDI|FSI|TSI|TFSI|VVTI|D4D|DCI)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function modelMatch(svvModel, regModel) {
  const s = normalizeModel(svvModel);
  const r = normalizeModel(regModel);
  
  // Exact
  if (s === r) return 1.0;
  
  // Substring
  if (r.includes(s) || s.includes(r)) return 0.9;
  
  // Base model
  const sb = extractBaseModel(svvModel);
  const rb = extractBaseModel(regModel);
  if (sb === rb) return 0.85;
  if (rb.includes(sb) || sb.includes(rb)) return 0.8;
  
  // Word overlap
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

// ─── Build index ───
function buildRegistryIndex(registry) {
  console.log("🔨 Building brand index...");
  const byBrand = new Map();
  for (const entry of registry) {
    const brand = normalizeBrand(entry.brand);
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(entry);
  }
  console.log(`   → ${byBrand.size} brands indexed`);
  return byBrand;
}

// ─── Match single row ───
function matchRow(row, registryByBrand) {
  const brand = normalizeBrand(row.make);
  const candidates = registryByBrand.get(brand);
  if (!candidates) return null;
  
  const matches = [];
  for (const cand of candidates) {
    const mScore = modelMatch(row.model, cand.model);
    if (mScore < 0.5) continue;
    
    const year = row.year;
    const yOverlap = yearOverlap(year, year, cand.year_from, cand.year_to);
    if (yOverlap > 0 || !cand.year_from || !year) {
      matches.push({
        ktype: cand.ktype,
        brand: cand.brand,
        model: cand.model,
        year_from: cand.year_from,
        year_to: cand.year_to,
        model_score: mScore,
        year_overlap: yOverlap,
      });
    }
  }
  
  if (matches.length === 0) return null;
  
  // Sort by model_score desc, then year_overlap desc
  matches.sort((a, b) => {
    if (b.model_score !== a.model_score) return b.model_score - a.model_score;
    return b.year_overlap - a.year_overlap;
  });
  
  return matches[0];
}

// ─── Update D1 ───
async function updateGroundTruth(id, ktype, confidence) {
  const res = await fetch(`${API_BASE}/admin/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: `
        UPDATE ground_truth
        SET k_type = ${ktype},
            confidence = ${confidence},
            verified_by = 'svv_fuzzy_matched',
            verified_at = datetime('now')
        WHERE id = ${id}
      `
    })
  });
  return res.ok;
}

// ─── Main ───
async function main() {
  const pending = await fetchPendingRows();
  if (pending.length === 0) {
    console.log("✅ No pending rows to match!");
    return;
  }
  
  const registry = await fetchKtypeRegistry();
  const registryByBrand = buildRegistryIndex(registry);
  
  console.log("\n🔍 Matching...");
  let matched = 0;
  let unmatched = 0;
  let errors = 0;
  const matches = [];
  
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    if (i % 500 === 0) {
      console.log(`   Progress: ${i}/${pending.length} (matched: ${matched})`);
    }
    
    const best = matchRow(row, registryByBrand);
    if (best) {
      matched++;
      matches.push({
        id: row.id,
        regnr_hash: row.regnr_hash,
        svv_make: row.make,
        svv_model: row.model,
        svv_year: row.year,
        ktype: best.ktype,
        reg_brand: best.brand,
        reg_model: best.model,
        model_score: best.model_score,
        confidence: Math.round(best.model_score * 100) / 100,
      });
      
      // Update D1
      try {
        await updateGroundTruth(row.id, best.ktype, best.model_score);
      } catch (e) {
        errors++;
      }
    } else {
      unmatched++;
    }
    
    // Small delay to not overwhelm API
    if (i % 100 === 0) await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n📊 Results:`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Unmatched: ${unmatched}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Success rate: ${((matched / pending.length) * 100).toFixed(1)}%`);
  
  // Save report
  const report = {
    total_pending: pending.length,
    matched,
    unmatched,
    errors,
    success_rate: matched / pending.length,
    sample_matches: matches.slice(0, 20),
    timestamp: new Date().toISOString(),
  };
  
  const fs = await import("fs");
  fs.writeFileSync("data/finn-no-regnr/svv-pending-matches.json", JSON.stringify(report, null, 2));
  console.log(`\n💾 Report saved to data/finn-no-regnr/svv-pending-matches.json`);
}

main().catch(console.error);
