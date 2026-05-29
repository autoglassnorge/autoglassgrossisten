import { readFileSync, writeFileSync } from "fs";

console.log("📖 Loading data...");
const ktypeMapping = JSON.parse(readFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", "utf-8"));
const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;

// Fast lookup set for existing ktypes
const existingKtypes = new Set(ktypeMapping.map(e => e.ktype));

// Parse commercial vehicles
console.log("📖 Parsing commercialvehicles.csv...");
const cvLines = readFileSync("data/tecdoc-import/commercialvehicles.csv", "utf-8")
  .split("\n").filter(l => l.trim());

const manufacturers = new Map();
const mRows = readFileSync("data/tecdoc-import/manufacturers.csv", "utf-8")
  .split("\n").filter(l => l.trim()).map(l => l.split("\t"));
for (const row of mRows) {
  const mfaId = parseInt(row[0], 10);
  const brand = row[3] || row[1];
  if (mfaId && brand) manufacturers.set(mfaId, brand.trim());
}

const models = new Map();
const moRows = readFileSync("data/tecdoc-import/models.csv", "utf-8")
  .split("\n").filter(l => l.trim()).map(l => l.split("\t"));
for (const row of moRows) {
  const modId = parseInt(row[0], 10);
  const mfaId = parseInt(row[1], 10);
  const yearFrom = row[2] === "0000-00-00" ? null : parseInt(row[2]?.slice(0, 4), 10) || null;
  const yearTo = row[3] === "0000-00-00" ? null : parseInt(row[3]?.slice(0, 4), 10) || null;
  const modelName = row[4];
  if (modId && mfaId && modelName) {
    models.set(modId, { mfaId, modelName: modelName.trim(), yearFrom, yearTo });
  }
}

let cvAdded = 0;
for (const line of cvLines) {
  const row = line.split("\t");
  const typId = parseInt(row[1], 10);
  if (existingKtypes.has(typId)) continue;
  
  const modId = parseInt(row[2], 10);
  const yearFrom = row[3] === "0000-00-00" ? null : parseInt(row[3]?.slice(0, 4), 10) || null;
  const yearTo = row[4] === "0000-00-00" ? null : parseInt(row[4]?.slice(0, 4), 10) || null;
  
  const modelInfo = models.get(modId);
  if (!modelInfo) continue;
  
  const brand = manufacturers.get(modelInfo.mfaId) || row[5]?.trim() || "UNKNOWN";
  
  ktypeMapping.push({
    ktype: typId,
    brand,
    model: modelInfo.modelName,
    year_from: yearFrom,
    year_to: yearTo,
    mod_id: modId,
    mfa_id: modelInfo.mfaId,
  });
  existingKtypes.add(typId);
  cvAdded++;
}
console.log(`   → Added ${cvAdded} commercial vehicle entries`);
console.log(`   → Total TecDoc mapping: ${ktypeMapping.length}`);

writeFileSync("data/tecdoc-import/tecdoc-ktype-mapping-enhanced.json", JSON.stringify(ktypeMapping));

// === ENHANCED MATCHING ===
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
  m = m.replace(/\bLASTEVOGN\b/g, "").replace(/\bLASTEBIL\b/g, "").replace(/\bVAREBIL\b/g, "");
  m = m.replace(/\s+/g, " ").trim();
  return m;
}

const modelAliases = {
  "GELANDEWAGEN": ["G", "G KLASSE", "G CLASS"],
  "160J": ["SUNNY", "CHERRY"],
};

function modelMatch(catalogModel, tecdocModel, brand) {
  const cm = normalizeModel(catalogModel, brand);
  const tm = normalizeModel(tecdocModel, brand);
  
  if (!cm || !tm) return false;
  if (cm === tm) return true;
  if (tm.includes(cm)) return true;
  if (cm.includes(tm) && tm.length >= 3) return true;
  
  for (const [alias, variants] of Object.entries(modelAliases)) {
    if (cm.includes(alias)) {
      for (const v of variants) {
        if (tm.includes(v)) return true;
      }
    }
  }
  
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

// Build index: brand -> [entries]
const tecdocByBrand = new Map();
for (const entry of ktypeMapping) {
  const brand = normalizeBrand(entry.brand);
  if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
  tecdocByBrand.get(brand).push(entry);
}

console.log(`\n🔨 Indexed ${tecdocByBrand.size} brands`);

console.log("\n🔍 Running enhanced matching...");
let matched = 0;
let unmatched = 0;
let multiMatch = 0;
const catalogUpdates = [];
const unmatchedLog = [];

for (const record of records) {
  const brand = normalizeBrand(record.brand, record.model);
  const model = record.model;
  const yf = record.year_from;
  const yt = record.year_to;
  
  const candidates = tecdocByBrand.get(brand);
  if (!candidates) {
    unmatched++;
    if (unmatchedLog.length < 20) unmatchedLog.push({ brand: record.brand, model, yf, yt });
    continue;
  }
  
  const matches = [];
  for (const cand of candidates) {
    if (modelMatch(model, cand.model, record.brand)) {
      const overlap = yearOverlap(yf, yt, cand.year_from, cand.year_to);
      if (overlap > 0 || (!yf && !yt) || (!cand.year_from && !cand.year_to)) {
        matches.push(cand);
      }
    }
  }
  
  if (matches.length === 0) {
    unmatched++;
    if (unmatchedLog.length < 20) unmatchedLog.push({ brand: record.brand, model, yf, yt });
    continue;
  }
  
  matches.sort((a, b) => yearOverlap(yf, yt, b.year_from, b.year_to) - yearOverlap(yf, yt, a.year_from, a.year_to));
  const best = matches[0];
  matched++;
  if (matches.length > 1) multiMatch++;
  
  catalogUpdates.push({ eurocode: record.eurocode, ktype: best.ktype, match_count: matches.length });
}

console.log(`   → Matched: ${matched} (${(matched/records.length*100).toFixed(1)}%)`);
console.log(`   → Unmatched: ${unmatched}`);
console.log(`   → Multi-match: ${multiMatch}`);

const prevMatched = 9342;
const improvement = matched - prevMatched;
console.log(`\n📈 Improvement: +${improvement} records (${(improvement/records.length*100).toFixed(2)}% more)`);

console.log("\n🔍 Sample unmatched (need aliases):");
for (const u of unmatchedLog.slice(0, 10)) {
  console.log(`   ${u.brand} ${u.model} (${u.yf}-${u.yt})`);
}
