import { readFileSync, writeFileSync } from "fs";

console.log("📖 Loading TecDoc mapping...");
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
  m = m.replace(/\bLASTEVOGN\b/g, "").replace(/\bLASTEBIL\b/g, "").replace(/\bVAREBIL\b/g, "");
  m = m.replace(/\bKASSEVOGN\b/g, "").replace(/\bST\b/g, "").replace(/\bVOGN\b/g, "");
  m = m.replace(/\b4D\b/g, "").replace(/\b5D\b/g, "").replace(/\b3D\b/g, "");
  m = m.replace(/\bSED\b/g, "SEDAN").replace(/\bC\.C\b/g, "").replace(/\bS\.C\b/g, "");
  m = m.replace(/\s+/g, " ").trim();
  return m;
}

// Pre-normalize all TecDoc entries and build index
console.log("🔨 Pre-normalizing TecDoc entries...");
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

// Build word→alias map for fast lookup
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
  
  // Check aliases
  for (const [word, aliasSet] of aliasMap) {
    if (cmNorm.includes(word) && aliasSet) {
      for (const a of aliasSet) {
        if (tm.includes(a)) return true;
      }
    }
    if (tm.includes(word) && aliasSet) {
      for (const a of aliasSet) {
        if (cmNorm.includes(a)) return true;
      }
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

console.log("🔍 Running matching v4...");
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

console.log("\n📈 Improvement: +" + (matched - 9342) + " records");

console.log("\n🔍 Sample still unmatched:");
for (const u of unmatchedLog.slice(0, 10)) {
  console.log("   " + u.brand + " " + u.model + " (" + u.yf + "-" + u.yt + ")");
}
