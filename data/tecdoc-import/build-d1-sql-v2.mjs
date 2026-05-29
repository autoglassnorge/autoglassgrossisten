import { readFileSync, writeFileSync } from "fs";

console.log("📖 Loading TecDoc kType mapping...");
const ktypeMapping = JSON.parse(readFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", "utf-8"));
console.log(`   → ${ktypeMapping.length} entries`);

console.log("📖 Loading glass catalog...");
const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;
console.log(`   → ${records.length} records`);

// === Normalization helpers ===
function normalizeBrand(brand, model) {
  const b = (brand || "").toUpperCase().trim();
  
  // Special handling for USA CARS: brand is embedded in model name
  if (b === "USA CARS" && model) {
    const m = model.toUpperCase().trim();
    const usaBrands = ["CHRYSLER", "JEEP", "FORD", "CHEVROLET", "CADILLAC", "DODGE", "BUICK", "LINCOLN", "GMC", "HUMMER", "PONTIAC", "SATURN", "OLDSMOBILE", "PLYMOUTH"];
    for (const ub of usaBrands) {
      if (m.startsWith(ub + " ")) return ub;
    }
    // If no match, try first word
    const firstWord = m.split(/\s+/)[0];
    if (firstWord && firstWord.length > 1) return firstWord;
  }
  
  const map = {
    "MERCEDES-BENZ": "MERCEDES",
    "MERCEDES BENZ": "MERCEDES",
    "MERCEDES TRUCKS": "MERCEDES",
    "VW": "VW",
    "VOLKSWAGEN": "VW",
    "VW TRUCKS": "VW",
    "LAND ROVER": "LANDROVER",
    "CITROËN": "CITROEN",
    "CITROEN TRUCKS": "CITROEN",
    "FORD TRUCKS": "FORD",
    "FIAT TRUCKS": "FIAT",
    "OPEL TRUCKS": "OPEL",
    "PEUGEOT TRUCKS": "PEUGEOT",
    "RENAULT TRUCKS": "RENAULT",
    "TOYOTA TRUCKS": "TOYOTA",
    "NISSAN TRUCKS": "NISSAN",
    "HYUNDAI TRUCKS": "HYUNDAI",
    "KIA TRUCKS": "KIA",
    "MITSUBISHI TRUCKS": "MITSUBISHI",
    "ISUZU TRUCKS": "ISUZU",
    "DAEWOO TRUCKS": "DAEWOO",
    "SUZUKI TRUCKS": "SUZUKI",
    "MAZDA TRUCKS": "MAZDA",
    "HONDA TRUCKS": "HONDA",
    "SSANGYONG TRUCKS": "SSANGYONG",
    "VOLVO TRUCKS": "VOLVO",
    "SCANIA TRUCKS": "SCANIA",
    "MAN TRUCKS": "MAN",
    "DAF TRUCKS": "DAF",
    "IVECO TRUCKS": "IVECO",
    "VOLKSWAGEN TRUCKS": "VW",
  };
  return map[b] || b;
}

function normalizeModel(model, brand) {
  let m = (model || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  // Remove brand prefix if present (e.g., "FORD EXPLORER" → "EXPLORER" when brand is FORD)
  if (brand) {
    const b = brand.toUpperCase().trim();
    if (m.startsWith(b + " ")) {
      m = m.slice(b.length + 1).trim();
    }
  }
  
  // Remove duplicate words (e.g., "TRANSIT TRANSIT" → "TRANSIT")
  const words = m.split(" ");
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i-1]) {
      deduped.push(words[i]);
    }
  }
  m = deduped.join(" ");
  
  // Remove common suffixes that aren't in TecDoc
  m = m.replace(/\bLASTEVOGN\b/g, "").replace(/\bLASTEBIL\b/g, "").replace(/\bVAREBIL\b/g, "");
  m = m.replace(/\s+/g, " ").trim();
  
  return m;
}

function modelMatch(catalogModel, tecdocModel, brand) {
  const cm = normalizeModel(catalogModel, brand);
  const tm = normalizeModel(tecdocModel, brand);
  
  if (!cm || !tm) return false;
  
  // Exact match
  if (cm === tm) return true;
  
  // Catalog model is substring of TecDoc model (e.g., "PANDA" matches "PANDA (169_)")
  if (tm.includes(cm)) return true;
  
  // TecDoc model is substring of catalog model
  if (cm.includes(tm) && tm.length >= 3) return true;
  
  // Word overlap (Jaccard)
  const cw = new Set(cm.split(" ").filter(w => w.length >= 2));
  const tw = new Set(tm.split(" ").filter(w => w.length >= 2));
  if (cw.size === 0 || tw.size === 0) return false;
  
  const intersection = new Set([...cw].filter(x => tw.has(x)));
  const union = new Set([...cw, ...tw]);
  const jaccard = intersection.size / union.size;
  
  // High overlap or significant word matches
  if (jaccard >= 0.4) return true;
  if (intersection.size >= 2) return true;
  
  return false;
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

// Check what catalog brands we have
const catalogBrands = new Set();
for (const r of records) {
  catalogBrands.add(normalizeBrand(r.brand, r.model));
}
let coveredBrands = 0;
for (const b of catalogBrands) {
  if (tecdocByBrand.has(b)) coveredBrands++;
}
console.log(`   → Catalog brands: ${catalogBrands.size}, covered by TecDoc: ${coveredBrands}`);
console.log(`   → Missing brands: ${[...catalogBrands].filter(b => !tecdocByBrand.has(b)).sort().join(", ")}`);

// === Match glass_catalog against TecDoc ===
console.log("\n🔍 Matching glass catalog against TecDoc (v2)...");
let matched = 0;
let unmatched = 0;
let multiMatch = 0;
const catalogUpdates = [];
const ktypeRegistryEntries = new Map();
const glassRules = new Map();
const unmatchedLog = [];

for (const record of records) {
  const brand = normalizeBrand(record.brand, record.model);
  const model = record.model;
  const yf = record.year_from;
  const yt = record.year_to;
  
  const candidates = tecdocByBrand.get(brand);
  if (!candidates) {
    unmatched++;
    if (unmatchedLog.length < 50) {
      unmatchedLog.push({ eurocode: record.eurocode, brand: record.brand, model, yf, yt, reason: "no_brand" });
    }
    continue;
  }
  
  // Find matching candidates
  const matches = [];
  for (const cand of candidates) {
    if (modelMatch(model, cand.model, record.brand)) {
      const overlap = yearOverlap(yf, yt, cand.year_from, cand.year_to);
      if (overlap > 0 || (!yf && !yt) || (!cand.year_from && !cand.year_to)) {
        matches.push({ ...cand, overlap });
      }
    }
  }
  
  if (matches.length === 0) {
    unmatched++;
    if (unmatchedLog.length < 50) {
      unmatchedLog.push({ eurocode: record.eurocode, brand: record.brand, model, yf, yt, reason: "no_model_year" });
    }
    continue;
  }
  
  // Sort by overlap (desc), then year coverage
  matches.sort((a, b) => b.overlap - a.overlap);
  
  const best = matches[0];
  matched++;
  if (matches.length > 1) multiMatch++;
  
  const confidence = matches.length === 1 ? "exact" : (matches.length <= 3 ? "probable" : "possible");
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
  
  if (!ktypeRegistryEntries.has(best.ktype)) {
    ktypeRegistryEntries.set(best.ktype, best);
  }
  
  const normKey = `${brand.toLowerCase().replace(/\s+/g, "_")}:${normalizeModel(model, record.brand).toLowerCase().replace(/\s+/g, "_")}:${yf || "unknown"}`;
  if (!glassRules.has(normKey)) {
    glassRules.set(normKey, { ktype: best.ktype, evidence: 1 });
  } else {
    glassRules.get(normKey).evidence++;
  }
}

console.log(`   → Matched: ${matched} (${(matched/records.length*100).toFixed(1)}%)`);
console.log(`   → Unmatched: ${unmatched}`);
console.log(`   → Multi-match: ${multiMatch}`);

// === Generate SQL ===
console.log("\n📝 Generating SQL...");

function chunkSql(statements, filename, comment) {
  const CHUNK_SIZE = 500;
  let sql = `-- ${comment}\n`;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    sql += "BEGIN TRANSACTION;\n";
    sql += chunk.join("\n") + "\n";
    sql += "COMMIT;\n\n";
  }
  writeFileSync(filename, sql);
}

// ktype_registry SQL
const krStatements = [];
for (const [ktype, entry] of ktypeRegistryEntries) {
  const brand = (entry.brand || "").replace(/'/g, "''");
  const model = (entry.model || "").replace(/'/g, "''");
  const yf = entry.year_from || "NULL";
  const yt = entry.year_to || "NULL";
  krStatements.push(`INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, confidence, created_at) VALUES (${ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_1q2019', 'exact', datetime('now'));`);
}
chunkSql(krStatements, "data/tecdoc-import/ktype-registry-inserts.sql", "ktype_registry inserts from TecDoc 1Q2019");
console.log(`   → ktype_registry: ${krStatements.length} inserts`);

// glass_rules SQL
const grStatements = [];
for (const [normKey, rule] of glassRules) {
  grStatements.push(`INSERT OR IGNORE INTO glass_rules (normalized_key, ktype, confidence, evidence_count, active, source, created_at, updated_at) VALUES ('${normKey.replace(/'/g, "''")}', ${rule.ktype}, 0.85, ${rule.evidence}, 1, 'tecdoc_1q2019', datetime('now'), datetime('now'));`);
}
chunkSql(grStatements, "data/tecdoc-import/glass-rules-inserts.sql", "glass_rules inserts from TecDoc 1Q2019");
console.log(`   → glass_rules: ${grStatements.length} inserts`);

// glass_catalog UPDATE SQL
const cuStatements = [];
for (const update of catalogUpdates) {
  cuStatements.push(`UPDATE glass_catalog SET ktype = ${update.ktype} WHERE eurocode = '${update.eurocode.replace(/'/g, "''")}';`);
}
chunkSql(cuStatements, "data/tecdoc-import/glass-catalog-updates.sql", "glass_catalog ktype updates from TecDoc 1Q2019");
console.log(`   → glass_catalog updates: ${cuStatements.length}`);

// Save reports
writeFileSync("data/tecdoc-import/matching-report-v2.json", JSON.stringify({
  total_catalog: records.length,
  matched,
  unmatched,
  multi_match: multiMatch,
  ktype_registry_entries: krStatements.length,
  glass_rules_entries: grStatements.length,
  catalog_updates: cuStatements.length,
  sample_matches: catalogUpdates.slice(0, 20),
  unmatched_sample: unmatchedLog.slice(0, 20),
}, null, 2));

console.log("\n💾 Files generated:");
console.log("   data/tecdoc-import/ktype-registry-inserts.sql");
console.log("   data/tecdoc-import/glass-rules-inserts.sql");
console.log("   data/tecdoc-import/glass-catalog-updates.sql");
console.log("   data/tecdoc-import/matching-report-v2.json");
