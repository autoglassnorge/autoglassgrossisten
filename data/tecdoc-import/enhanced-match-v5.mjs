import { readFileSync, writeFileSync } from "fs";

const ktypeMapping = JSON.parse(readFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", "utf-8"));
const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;

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
    if (m.startsWith(b + " ")) m = m.slice(b.length + 1).trim();
  }
  const words = m.split(" ");
  const deduped = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i] !== words[i-1]) deduped.push(words[i]);
  }
  m = deduped.join(" ");
  
  // Remove common suffixes/prefixes
  m = m.replace(/\bLASTEVOGN\b/g, "").replace(/\bLASTEBIL\b/g, "").replace(/\bVAREBIL\b/g, "");
  m = m.replace(/\bKASSEVOGN\b/g, "").replace(/\bST\b/g, "").replace(/\bVOGN\b/g, "");
  m = m.replace(/\b4D\b/g, "").replace(/\b5D\b/g, "").replace(/\b3D\b/g, "");
  m = m.replace(/\b4WD\b/g, "").replace(/\b4X4\b/g, "").replace(/\bAWD\b/g, "");
  m = m.replace(/\bSED\b/g, "SEDAN").replace(/\bC\.C\b/g, "").replace(/\bS\.C\b/g, "");
  m = m.replace(/\bCC\b/g, "").replace(/\bDD\b/g, "").replace(/\b3DD\b/g, "");
  m = m.replace(/\bHATCHBACK\b/g, "").replace(/\bSTATIONWAGON\b/g, "").replace(/\bSTASJONSVogn\b/g, "");
  m = m.replace(/\b2121\b/g, "").replace(/\bHYTTENR\b/g, "").replace(/\b381\b/g, "");
  m = m.replace(/\b1013\b/g, "").replace(/\b2632\b/g, "");
  
  m = m.replace(/\s+/g, " ").trim();
  return m;
}

const tecdocByBrand = new Map();
for (const entry of ktypeMapping) {
  const brand = normalizeBrand(entry.brand);
  const normModel = normalizeModel(entry.model);
  const words = new Set(normModel.split(" ").filter(w => w.length >= 2));
  
  if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
  tecdocByBrand.get(brand).push({
    ktype: entry.ktype,
    model: entry.model,
    normModel,
    words,
    yearFrom: entry.year_from,
    yearTo: entry.year_to,
  });
}

const aliasMap = new Map();
const aliases = {
  "GELANDEWAGEN": ["G", "G KLASSE", "G CLASS"],
  "GELAENDEWAGEN": ["G", "G KLASSE"],
  "160J": ["SUNNY", "CHERRY"],
  "GUILETTA": ["GIULIETTA"],
};
for (const [key, variants] of Object.entries(aliases)) {
  const keyNorm = normalizeModel(key);
  aliasMap.set(keyNorm, new Set(variants.map(v => normalizeModel(v))));
  for (const v of variants) {
    const vNorm = normalizeModel(v);
    if (!aliasMap.has(vNorm)) aliasMap.set(vNorm, new Set());
    aliasMap.get(vNorm).add(keyNorm);
  }
}

function modelMatch(cmNorm, cmWords, cand) {
  const tm = cand.normModel;
  
  if (cmNorm === tm) return true;
  if (tm.includes(cmNorm)) return true;
  if (cmNorm.includes(tm) && tm.length >= 3) return true;
  
  for (const [word, aliasSet] of aliasMap) {
    if (cmNorm.includes(word) && aliasSet) {
      for (const a of aliasSet) { if (tm.includes(a)) return true; }
    }
    if (tm.includes(word) && aliasSet) {
      for (const a of aliasSet) { if (cmNorm.includes(a)) return true; }
    }
  }
  
  const tw = cand.words;
  if (cmWords.size === 0 || tw.size === 0) return false;
  const intersection = new Set([...cmWords].filter(x => tw.has(x)));
  const union = new Set([...cmWords, ...tw]);
  const jaccard = intersection.size / union.size;
  if (jaccard >= 0.35) return true;
  if (intersection.size >= 2) return true;
  if (cmWords.size === 1 && tm.includes([...cmWords][0]) && [...cmWords][0].length >= 4) return true;
  
  return false;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const start = Math.max(yf1 || 0, yf2 || 0);
  const end = Math.min(yt1 || 9999, yt2 || 9999);
  return Math.max(0, end - start + 1);
}

console.log("🔍 Running matching v5...");
let matched = 0;
let unmatched = 0;
let multiMatch = 0;
const catalogUpdates = [];
const unmatchedLog = [];

for (const record of records) {
  const brand = normalizeBrand(record.brand, record.model);
  const cmNorm = normalizeModel(record.model, record.brand);
  const cmWords = new Set(cmNorm.split(" ").filter(w => w.length >= 2));
  const yf = record.year_from;
  const yt = record.year_to;
  
  const candidates = tecdocByBrand.get(brand);
  if (!candidates) {
    unmatched++;
    if (unmatchedLog.length < 15) unmatchedLog.push({ brand: record.brand, model: record.model, yf, yt });
    continue;
  }
  
  const matches = [];
  for (const cand of candidates) {
    if (modelMatch(cmNorm, cmWords, cand)) {
      const overlap = yearOverlap(yf, yt, cand.yearFrom, cand.yearTo);
      if (overlap > 0 || (!yf && !yt) || (!cand.yearFrom && !cand.yearTo)) {
        matches.push(cand);
      }
    }
  }
  
  if (matches.length === 0) {
    unmatched++;
    if (unmatchedLog.length < 15) unmatchedLog.push({ brand: record.brand, model: record.model, yf, yt });
    continue;
  }
  
  matches.sort((a, b) => yearOverlap(yf, yt, b.yearFrom, b.yearTo) - yearOverlap(yf, yt, a.yearFrom, a.yearTo));
  matched++;
  if (matches.length > 1) multiMatch++;
  
  catalogUpdates.push({ eurocode: record.eurocode, ktype: matches[0].ktype, match_count: matches.length });
}

console.log("   → Matched: " + matched + " (" + (matched/records.length*100).toFixed(1) + "%)");
console.log("   → Unmatched: " + unmatched);
console.log("   → Multi-match: " + multiMatch);
console.log("\n📈 Improvement: +" + (matched - 9342) + " records vs v2");

console.log("\n🔍 Sample still unmatched:");
for (const u of unmatchedLog.slice(0, 10)) {
  console.log("   " + u.brand + " " + u.model + " (" + u.yf + "-" + u.yt + ")");
}

// Generate SQL
console.log("\n📝 Generating SQL...");

const ktypeRegistryEntries = new Map();
const glassRules = new Map();

for (const update of catalogUpdates) {
  // Find ktype info
  const ktypeInfo = ktypeMapping.find(e => e.ktype === update.ktype);
  if (ktypeInfo && !ktypeRegistryEntries.has(update.ktype)) {
    ktypeRegistryEntries.set(update.ktype, ktypeInfo);
  }
  
  const record = records.find(r => r.eurocode === update.eurocode);
  if (record) {
    const brand = normalizeBrand(record.brand, record.model);
    const normKey = brand.toLowerCase().replace(/\s+/g, "_") + ":" + normalizeModel(record.model, record.brand).toLowerCase().replace(/\s+/g, "_") + ":" + (record.year_from || "unknown");
    if (!glassRules.has(normKey)) {
      glassRules.set(normKey, { ktype: update.ktype, evidence: 1 });
    } else {
      glassRules.get(normKey).evidence++;
    }
  }
}

function chunkSql(statements, filename, comment) {
  const CHUNK_SIZE = 500;
  let sql = "-- " + comment + "\n";
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    sql += chunk.join("\n") + "\n";
  }
  writeFileSync(filename, sql);
}

const krStatements = [];
for (const [ktype, entry] of ktypeRegistryEntries) {
  const brand = (entry.brand || "").replace(/'/g, "''");
  const model = (entry.model || "").replace(/'/g, "''");
  const yf = entry.year_from || "NULL";
  const yt = entry.year_to || "NULL";
  krStatements.push("INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, confidence, created_at) VALUES (" + ktype + ", '" + brand + "', '" + model + "', " + yf + ", " + yt + ", '', 'tecdoc_1q2019', 'exact', datetime('now'));");
}
chunkSql(krStatements, "data/tecdoc-import/ktype-registry-inserts-v5.sql", "ktype_registry inserts v5");
console.log("   → ktype_registry: " + krStatements.length);

const grStatements = [];
for (const [normKey, rule] of glassRules) {
  grStatements.push("INSERT OR IGNORE INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at) VALUES ('" + normKey.replace(/'/g, "''") + "', 'EU', 'windshield', 'default', " + rule.ktype + ", 0.85, " + rule.evidence + ", 1, 'tecdoc_1q2019', datetime('now'), datetime('now'));");
}
chunkSql(grStatements, "data/tecdoc-import/glass-rules-inserts-v5.sql", "glass_rules inserts v5");
console.log("   → glass_rules: " + grStatements.length);

const cuStatements = [];
for (const update of catalogUpdates) {
  cuStatements.push("UPDATE glass_catalog SET ktype = " + update.ktype + " WHERE eurocode = '" + update.eurocode.replace(/'/g, "''") + "';");
}
chunkSql(cuStatements, "data/tecdoc-import/glass-catalog-updates-v5.sql", "glass_catalog updates v5");
console.log("   → glass_catalog updates: " + cuStatements.length);

writeFileSync("data/tecdoc-import/matching-report-v5.json", JSON.stringify({
  total_catalog: records.length,
  matched,
  unmatched,
  multi_match: multiMatch,
  improvement: matched - 9342,
  sample_matches: catalogUpdates.slice(0, 10),
}, null, 2));

console.log("\n💾 Files generated for v5");
