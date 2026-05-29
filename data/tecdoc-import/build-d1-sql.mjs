import { readFileSync, writeFileSync } from "fs";

console.log("📖 Loading TecDoc kType mapping...");
const ktypeMapping = JSON.parse(readFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", "utf-8"));
console.log(`   → ${ktypeMapping.length} entries`);

console.log("📖 Loading glass catalog...");
const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;
console.log(`   → ${records.length} records`);

// === Normalization helpers ===
function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const map = {
    "MERCEDES-BENZ": "MERCEDES",
    "MERCEDES BENZ": "MERCEDES",
    "VW": "VW",
    "VOLKSWAGEN": "VW",
    "LAND ROVER": "LANDROVER",
    "CITROËN": "CITROEN",
    "VAUXHALL": "OPEL", // Same cars, different market
  };
  return map[b] || b;
}

function normalizeModel(model) {
  return (model || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelMatch(catalogModel, tecdocModel) {
  const cm = normalizeModel(catalogModel);
  const tm = normalizeModel(tecdocModel);
  
  // Exact match
  if (cm === tm) return true;
  
  // Catalog model is substring of TecDoc model (e.g., "PANDA" matches "PANDA (169_)")
  if (tm.includes(cm)) return true;
  
  // Word overlap (Jaccard)
  const cw = new Set(cm.split(" "));
  const tw = new Set(tm.split(" "));
  const intersection = new Set([...cw].filter(x => tw.has(x)));
  const union = new Set([...cw, ...tw]);
  const jaccard = intersection.size / union.size;
  
  return jaccard >= 0.5;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const start = Math.max(yf1 || 0, yf2 || 0);
  const end = Math.min(yt1 || 9999, yt2 || 9999);
  return Math.max(0, end - start + 1);
}

// === Build brand+model index from TecDoc ===
console.log("\n🔨 Building brand+model index from TecDoc...");
const tecdocByBrand = new Map();
for (const entry of ktypeMapping) {
  const brand = normalizeBrand(entry.brand);
  if (!tecdocByBrand.has(brand)) {
    tecdocByBrand.set(brand, []);
  }
  tecdocByBrand.get(brand).push(entry);
}
console.log(`   → ${tecdocByBrand.size} brands indexed`);

// === Match glass_catalog against TecDoc ===
console.log("\n🔍 Matching glass catalog against TecDoc...");
let matched = 0;
let unmatched = 0;
let multiMatch = 0;
const catalogUpdates = []; // {eurocode, ktype, confidence}
const ktypeRegistryEntries = new Map(); // ktype -> entry
const glassRules = new Map(); // normalized_key -> {ktype, evidence}

for (const record of records) {
  const brand = normalizeBrand(record.brand);
  const model = record.model;
  const yf = record.year_from;
  const yt = record.year_to;
  
  const candidates = tecdocByBrand.get(brand);
  if (!candidates) {
    unmatched++;
    continue;
  }
  
  // Find matching candidates
  const matches = [];
  for (const cand of candidates) {
    if (modelMatch(model, cand.model)) {
      const overlap = yearOverlap(yf, yt, cand.year_from, cand.year_to);
      if (overlap > 0 || (!yf && !yt) || (!cand.year_from && !cand.year_to)) {
        matches.push({ ...cand, overlap });
      }
    }
  }
  
  if (matches.length === 0) {
    unmatched++;
    continue;
  }
  
  // Sort by overlap (desc), then year coverage
  matches.sort((a, b) => b.overlap - a.overlap);
  
  const best = matches[0];
  matched++;
  if (matches.length > 1) multiMatch++;
  
  // Add to catalog updates
  const confidence = matches.length === 1 ? "exact" : "probable";
  catalogUpdates.push({
    eurocode: record.eurocode,
    ktype: best.ktype,
    brand: record.brand,
    model: record.model,
    year_from: yf,
    year_to: yt,
    confidence,
    match_count: matches.length,
    tecdoc_model: best.model,
  });
  
  // Add to ktype_registry
  if (!ktypeRegistryEntries.has(best.ktype)) {
    ktypeRegistryEntries.set(best.ktype, best);
  }
  
  // Add to glass_rules
  const normKey = `${brand.toLowerCase().replace(/\s+/g, "_")}:${normalizeModel(model).toLowerCase().replace(/\s+/g, "_")}:${yf || "unknown"}`;
  if (!glassRules.has(normKey)) {
    glassRules.set(normKey, { ktype: best.ktype, evidence: 1 });
  } else {
    const existing = glassRules.get(normKey);
    if (existing.ktype !== best.ktype) {
      // Conflict — skip or log
    }
    existing.evidence++;
  }
}

console.log(`   → Matched: ${matched}`);
console.log(`   → Unmatched: ${unmatched}`);
console.log(`   → Multi-match: ${multiMatch}`);

// === Generate SQL ===
console.log("\n📝 Generating SQL...");

// ktype_registry SQL
let ktypeRegistrySql = "-- ktype_registry inserts from TecDoc 1Q2019\n";
ktypeRegistrySql += "BEGIN TRANSACTION;\n";
let krCount = 0;
for (const [ktype, entry] of ktypeRegistryEntries) {
  const brand = (entry.brand || "").replace(/'/g, "''");
  const model = (entry.model || "").replace(/'/g, "''");
  const yf = entry.year_from || "NULL";
  const yt = entry.year_to || "NULL";
  ktypeRegistrySql += `INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, confidence, created_at) VALUES (${ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_1q2019', 'exact', datetime('now'));\n`;
  krCount++;
  if (krCount % 500 === 0) {
    ktypeRegistrySql += "COMMIT;\nBEGIN TRANSACTION;\n";
  }
}
ktypeRegistrySql += "COMMIT;\n";
writeFileSync("data/tecdoc-import/ktype-registry-inserts.sql", ktypeRegistrySql);
console.log(`   → ktype_registry: ${krCount} inserts`);

// glass_rules SQL
let glassRulesSql = "-- glass_rules inserts from TecDoc 1Q2019\n";
glassRulesSql += "BEGIN TRANSACTION;\n";
let grCount = 0;
for (const [normKey, rule] of glassRules) {
  glassRulesSql += `INSERT OR IGNORE INTO glass_rules (normalized_key, ktype, confidence, evidence_count, active, source, created_at, updated_at) VALUES ('${normKey.replace(/'/g, "''")}', ${rule.ktype}, 0.85, ${rule.evidence}, 1, 'tecdoc_1q2019', datetime('now'), datetime('now'));\n`;
  grCount++;
  if (grCount % 500 === 0) {
    glassRulesSql += "COMMIT;\nBEGIN TRANSACTION;\n";
  }
}
glassRulesSql += "COMMIT;\n";
writeFileSync("data/tecdoc-import/glass-rules-inserts.sql", glassRulesSql);
console.log(`   → glass_rules: ${grCount} inserts`);

// glass_catalog UPDATE SQL
let catalogSql = "-- glass_catalog ktype updates from TecDoc 1Q2019\n";
catalogSql += "BEGIN TRANSACTION;\n";
let cuCount = 0;
for (const update of catalogUpdates) {
  catalogSql += `UPDATE glass_catalog SET ktype = ${update.ktype} WHERE eurocode = '${update.eurocode.replace(/'/g, "''")}';\n`;
  cuCount++;
  if (cuCount % 500 === 0) {
    catalogSql += "COMMIT;\nBEGIN TRANSACTION;\n";
  }
}
catalogSql += "COMMIT;\n";
writeFileSync("data/tecdoc-import/glass-catalog-updates.sql", catalogSql);
console.log(`   → glass_catalog updates: ${cuCount}`);

// Save matching report
writeFileSync("data/tecdoc-import/matching-report.json", JSON.stringify({
  total_catalog: records.length,
  matched,
  unmatched,
  multi_match: multiMatch,
  ktype_registry_entries: krCount,
  glass_rules_entries: grCount,
  catalog_updates: cuCount,
  sample_matches: catalogUpdates.slice(0, 20),
}, null, 2));

console.log("\n💾 Files generated:");
console.log("   data/tecdoc-import/ktype-registry-inserts.sql");
console.log("   data/tecdoc-import/glass-rules-inserts.sql");
console.log("   data/tecdoc-import/glass-catalog-updates.sql");
console.log("   data/tecdoc-import/matching-report.json");
