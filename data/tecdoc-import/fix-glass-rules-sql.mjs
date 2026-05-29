import { readFileSync, writeFileSync } from "fs";

console.log("📖 Loading matching report...");
const report = JSON.parse(readFileSync("data/tecdoc-import/matching-report-v2.json", "utf-8"));

console.log("📖 Loading glass rules data...");
// We need to rebuild glass_rules from the catalogUpdates
const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;

const tecdocMapping = JSON.parse(readFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", "utf-8"));
const tecdocByKtype = new Map();
for (const e of tecdocMapping) {
  tecdocByKtype.set(e.ktype, e);
}

function normalizeBrand(brand, model) {
  const b = (brand || "").toUpperCase().trim();
  if (b === "USA CARS" && model) {
    const m = model.toUpperCase().trim();
    const usaBrands = ["CHRYSLER", "JEEP", "FORD", "CHEVROLET", "CADILLAC", "DODGE", "BUICK", "LINCOLN", "GMC", "HUMMER", "PONTIAC", "SATURN", "OLDSMOBILE", "PLYMOUTH"];
    for (const ub of usaBrands) {
      if (m.startsWith(ub + " ")) return ub;
    }
    const firstWord = m.split(/\s+/)[0];
    if (firstWord && firstWord.length > 1) return firstWord;
  }
  const map = {
    "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES", "MERCEDES TRUCKS": "MERCEDES",
    "VW": "VW", "VOLKSWAGEN": "VW", "VW TRUCKS": "VW",
    "LAND ROVER": "LANDROVER",
    "CITROËN": "CITROEN", "CITROEN TRUCKS": "CITROEN",
    "FORD TRUCKS": "FORD", "FIAT TRUCKS": "FIAT", "OPEL TRUCKS": "OPEL",
    "PEUGEOT TRUCKS": "PEUGEOT", "RENAULT TRUCKS": "RENAULT", "TOYOTA TRUCKS": "TOYOTA",
    "NISSAN TRUCKS": "NISSAN", "HYUNDAI TRUCKS": "HYUNDAI", "KIA TRUCKS": "KIA",
    "MITSUBISHI TRUCKS": "MITSUBISHI", "ISUZU TRUCKS": "ISUZU", "DAEWOO TRUCKS": "DAEWOO",
    "SUZUKI TRUCKS": "SUZUKI", "MAZDA TRUCKS": "MAZDA", "HONDA TRUCKS": "HONDA",
    "SSANGYONG TRUCKS": "SSANGYONG", "VOLVO TRUCKS": "VOLVO", "SCANIA TRUCKS": "SCANIA",
    "MAN TRUCKS": "MAN", "DAF TRUCKS": "DAF", "IVECO TRUCKS": "IVECO",
    "VOLKSWAGEN TRUCKS": "VW",
  };
  return map[b] || b;
}

function normalizeModel(model, brand) {
  let m = (model || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (brand) {
    const b = brand.toUpperCase().trim();
    if (m.startsWith(b + " ")) {
      m = m.slice(b.length + 1).trim();
    }
  }
  const words = m.split(" ");
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i-1]) {
      deduped.push(words[i]);
    }
  }
  m = deduped.join(" ");
  m = m.replace(/\bLASTEVOGN\b/g, "").replace(/\bLASTEBIL\b/g, "").replace(/\bVAREBIL\b/g, "");
  m = m.replace(/\s+/g, " ").trim();
  return m;
}

// Rebuild glass_rules from matched catalog records
const glassRules = new Map();

for (const record of records) {
  const brand = normalizeBrand(record.brand, record.model);
  const model = record.model;
  const yf = record.year_from;
  const yt = record.year_to;
  
  // Find matching kType from our previous matching
  // We use the eurocode to look up what we matched
  const matched = report.sample_matches.find(m => m.eurocode === record.eurocode);
  if (!matched) continue;
  
  const ktype = matched.ktype;
  const normKey = [
    brand.toLowerCase().replace(/\s+/g, "_"),
    normalizeModel(model, record.brand).toLowerCase().replace(/\s+/g, "_"),
    yf || "unknown"
  ].join(":");
  
  if (!glassRules.has(normKey)) {
    glassRules.set(normKey, { ktype, evidence: 1, eurocode: record.eurocode });
  } else {
    glassRules.get(normKey).evidence++;
  }
}

// Actually, let's just use the existing glassRules from the matching report
// But we need to regenerate with correct schema
// Let me just rebuild from scratch using the same logic as build-d1-sql-v2

const tecdocByBrand = new Map();
for (const entry of tecdocMapping) {
  const brand = normalizeBrand(entry.brand);
  if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
  tecdocByBrand.get(brand).push(entry);
}

function modelMatch(catalogModel, tecdocModel, brand) {
  const cm = normalizeModel(catalogModel, brand);
  const tm = normalizeModel(tecdocModel, brand);
  if (!cm || !tm) return false;
  if (cm === tm) return true;
  if (tm.includes(cm)) return true;
  if (cm.includes(tm) && tm.length >= 3) return true;
  const cw = new Set(cm.split(" ").filter(w => w.length >= 2));
  const tw = new Set(tm.split(" ").filter(w => w.length >= 2));
  if (cw.size === 0 || tw.size === 0) return false;
  const intersection = new Set([...cw].filter(x => tw.has(x)));
  const union = new Set([...cw, ...tw]);
  const jaccard = intersection.size / union.size;
  if (jaccard >= 0.4) return true;
  if (intersection.size >= 2) return true;
  return false;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const start = Math.max(yf1 || 0, yf2 || 0);
  const end = Math.min(yt1 || 9999, yt2 || 9999);
  return Math.max(0, end - start + 1);
}

const glassRulesNew = new Map();

for (const record of records) {
  const brand = normalizeBrand(record.brand, record.model);
  const model = record.model;
  const yf = record.year_from;
  const yt = record.year_to;
  
  const candidates = tecdocByBrand.get(brand);
  if (!candidates) continue;
  
  const matches = [];
  for (const cand of candidates) {
    if (modelMatch(model, cand.model, record.brand)) {
      const overlap = yearOverlap(yf, yt, cand.year_from, cand.year_to);
      if (overlap > 0 || (!yf && !yt) || (!cand.year_from && !cand.year_to)) {
        matches.push(cand);
      }
    }
  }
  
  if (matches.length === 0) continue;
  matches.sort((a, b) => yearOverlap(yf, yt, b.year_from, b.year_to) - yearOverlap(yf, yt, a.year_from, a.year_to));
  const best = matches[0];
  
  const normKey = [
    brand.toLowerCase().replace(/\s+/g, "_"),
    normalizeModel(model, record.brand).toLowerCase().replace(/\s+/g, "_"),
    yf || "unknown"
  ].join(":");
  
  if (!glassRulesNew.has(normKey)) {
    glassRulesNew.set(normKey, { ktype: best.ktype, evidence: 1 });
  } else {
    glassRulesNew.get(normKey).evidence++;
  }
}

console.log(`   → Rebuilt ${glassRulesNew.size} glass rules`);

// Generate SQL with correct schema (no source column, includes market/opening/feature_signature)
const statements = [];
for (const [normKey, rule] of glassRulesNew) {
  statements.push(
    `INSERT OR IGNORE INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at) ` +
    `VALUES ('${normKey.replace(/'/g, "''")}', 'EU', 'windshield', 'default', ${rule.ktype}, 0.85, ${rule.evidence}, 1, 'tecdoc_1q2019', datetime('now'), datetime('now'));`
  );
}

// Chunk and write
const CHUNK_SIZE = 200;
let sql = `-- glass_rules inserts from TecDoc 1Q2019 (fixed schema)\n`;
for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
  const chunk = statements.slice(i, i + CHUNK_SIZE);
  sql += chunk.join("\n") + "\n";
}
writeFileSync("data/tecdoc-import/glass-rules-inserts-fixed.sql", sql);
console.log(`   → Written ${statements.length} statements to glass-rules-inserts-fixed.sql`);
