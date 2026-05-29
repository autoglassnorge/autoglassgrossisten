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

// Expanded aliases
const modelAliases = {
  "GELANDEWAGEN": ["G", "G KLASSE", "G CLASS", "GELANDEWAGEN"],
  "GELAENDEWAGEN": ["G", "G KLASSE", "G CLASS"],
  "160J": ["SUNNY", "CHERRY"],
  "GUILETTA": ["GIULIETTA"],
  "CELICA": ["CELICA"],
  "NIVA": ["NIVA"],
  "ACCORD": ["ACCORD"],
  "DAILY": ["DAILY"],
  "RAV": ["RAV"],
  "CRV": ["CRV", "CR V"],
  "CR V": ["CRV", "CR V"],
  "A8": ["A8"],
  "A6": ["A6"],
  "A4": ["A4"],
  "A3": ["A3"],
  "A5": ["A5"],
  "A7": ["A7"],
  "Q3": ["Q3"],
  "Q5": ["Q5"],
  "Q7": ["Q7"],
  "X1": ["X1"],
  "X3": ["X3"],
  "X5": ["X5"],
  "X6": ["X6"],
  "X7": ["X7"],
  "1 SERIE": ["1ER"],
  "3 SERIE": ["3ER"],
  "5 SERIE": ["5ER"],
  "7 SERIE": ["7ER"],
  "GOLF": ["GOLF"],
  "PASSAT": ["PASSAT"],
  "POLO": ["POLO"],
  "CADDY": ["CADDY"],
  "TRANSPORTER": ["TRANSPORTER"],
  "TRANSIT": ["TRANSIT"],
  "MONDEO": ["MONDEO"],
  "GALAXY": ["GALAXY"],
  "S MAX": ["S MAX"],
  "CONNECT": ["CONNECT"],
  "CUSTOM": ["CUSTOM"],
  "COURIER": ["COURIER"],
  "CORSA": ["CORSA"],
  "ASTRA": ["ASTRA"],
  "VECTRA": ["VECTRA"],
  "ZAFIRA": ["ZAFIRA"],
  "MERIVA": ["MERIVA"],
  "OCTAVIA": ["OCTAVIA"],
  "FABIA": ["FABIA"],
  "SUPERB": ["SUPERB"],
  "YETI": ["YETI"],
  "KODIAQ": ["KODIAQ"],
  "KAROQ": ["KAROQ"],
  "FORESTER": ["FORESTER"],
  "LEGACY": ["LEGACY"],
  "OUTBACK": ["OUTBACK"],
  "IMPREZA": ["IMPREZA"],
  "XV": ["XV"],
  "BRZ": ["BRZ"],
  "WRX": ["WRX"],
};

function modelMatch(catalogModel, tecdocModel, brand) {
  const cm = normalizeModel(catalogModel, brand);
  const tm = normalizeModel(tecdocModel, brand);
  
  if (!cm || !tm) return false;
  if (cm === tm) return true;
  if (tm.includes(cm)) return true;
  if (cm.includes(tm) && tm.length >= 3) return true;
  
  // Check aliases
  for (const [alias, variants] of Object.entries(modelAliases)) {
    if (cm.includes(alias)) {
      for (const v of variants) {
        if (tm.includes(v)) return true;
      }
    }
  }
  
  // Also check reverse: if TecDoc model has alias, does catalog match?
  for (const [alias, variants] of Object.entries(modelAliases)) {
    if (tm.includes(alias)) {
      for (const v of variants) {
        if (cm.includes(v)) return true;
      }
    }
  }
  
  const cw = new Set(cm.split(" ").filter(w => w.length >= 2));
  const tw = new Set(tm.split(" ").filter(w => w.length >= 2));
  if (cw.size === 0 || tw.size === 0) return false;
  const intersection = new Set([...cw].filter(x => tw.has(x)));
  const union = new Set([...cw, ...tw]);
  const jaccard = intersection.size / union.size;
  if (jaccard >= 0.35) return true;
  if (intersection.size >= 2) return true;
  
  // Single strong word match for short models
  if (cw.size === 1 && tw.size >= 1) {
    const word = [...cw][0];
    if (word.length >= 4 && tm.includes(word)) return true;
  }
  
  return false;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const start = Math.max(yf1 || 0, yf2 || 0);
  const end = Math.min(yt1 || 9999, yt2 || 9999);
  return Math.max(0, end - start + 1);
}

const tecdocByBrand = new Map();
for (const entry of ktypeMapping) {
  const brand = normalizeBrand(entry.brand);
  if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
  tecdocByBrand.get(brand).push(entry);
}

console.log("🔨 Indexed " + tecdocByBrand.size + " brands");

console.log("\n🔍 Running enhanced matching v3...");
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

console.log("   → Matched: " + matched + " (" + (matched/records.length*100).toFixed(1) + "%)");
console.log("   → Unmatched: " + unmatched);
console.log("   → Multi-match: " + multiMatch);

const prevMatched = 9342;
const improvement = matched - prevMatched;
console.log("\n📈 Improvement: +" + improvement + " records (" + (improvement/records.length*100).toFixed(2) + "% more)");

console.log("\n🔍 Sample still unmatched:");
for (const u of unmatchedLog.slice(0, 15)) {
  console.log("   " + u.brand + " " + u.model + " (" + u.yf + "-" + u.yt + ")");
}
