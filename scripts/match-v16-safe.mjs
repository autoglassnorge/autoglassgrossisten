#!/usr/bin/env node
/**
 * V15: Final Polish Matcher
 * Fixes remaining parsing issues:
 * - MITS. → MITSUBISHI
 * - MCC → SMART
 * - JUKE → NISSAN (brand is model name)
 * - Known model names used as brands
 * - Better LANDCRUISER/CRV aliases
 * - Westfield and other niche brands
 */
import * as fs from "fs";
import * as path from "path";
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const DATA_DIR = path.join(process.cwd(), "data", "tecdoc-import");
const OUTPUT_DIR = path.join(process.cwd(), "data", "tecdoc-import");

console.log("\n🎯 V15 Final Polish Matcher");

const ktypeMapping = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tecdoc-ktype-mapping.json"), "utf-8"));
const catalog = JSON.parse(fs.readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;

/* ── HTML decoder ──────────────────────────────────────────── */
function decodeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeHtmlAggressive(str) {
  if (!str) return "";
  let s = str;
  s = s.replace(/&#039([^0-9a-zA-Z;])/g, "'$1");
  s = s.replace(/&#039$/g, "'");
  s = s.replace(/&#039([A-Z])/g, "'$1");
  s = s.replace(/&#39([^0-9a-zA-Z;])/g, "'$1");
  s = s.replace(/&#39$/g, "'");
  s = s.replace(/&#39([A-Z])/g, "'$1");
  return decodeHtml(s);
}

/* ── Known models that are sometimes used as brands ────────── */
const MODEL_AS_BRAND = {
  "JUKE": "NISSAN",
  "PAJERO": "MITSUBISHI",
  "SHOGUN": "MITSUBISHI",
  "GALANT": "MITSUBISHI",
  "L200": "MITSUBISHI",
  "SMART": "SMART",
  "FORFOUR": "SMART",
  "FOR FOUR": "SMART",
  "SEIW": "WESTFIELD",
  "SEW": "WESTFIELD",
  "MUSTANG": "FORD",
  "EXPLORER": "FORD",
  "ESCAPE": "FORD",
  "RANGER": "FORD",
  "BRONCO": "FORD",
  "F150": "FORD",
  "F-150": "FORD",
  "F250": "FORD",
  "F-250": "FORD",
  "F350": "FORD",
  "F-350": "FORD",
  "FOCUS": "FORD",
  "FUSION": "FORD",
  "TAURUS": "FORD",
  "EDGE": "FORD",
  "EXPEDITION": "FORD",
  "ECOSPORT": "FORD",
  "TRANSIT": "FORD",
  "CONNECT": "FORD",
  "KA": "FORD",
  "FIESTA": "FORD",
  "MONDEO": "FORD",
  "S-MAX": "FORD",
  "GALAXY": "FORD",
  "C-MAX": "FORD",
  "B-MAX": "FORD",
  "PUMA": "FORD",
  "KUGA": "FORD",
};

/* ── Brand normalization ───────────────────────────────────── */
function normalizeBrand(brand, model, description) {
  const b = (brand || "").toUpperCase().trim();
  const m = (model || "").toUpperCase().trim();
  const d = (description || "").toUpperCase().trim();

  // Check if brand is actually a known model name
  if (MODEL_AS_BRAND[b]) {
    return MODEL_AS_BRAND[b];
  }

  const map = {
    "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES", "MERCEDES TRUCKS": "MERCEDES",
    "MERC": "MERCEDES", "MB": "MERCEDES",
    "VW": "VW", "VOLKSWAGEN": "VW", "VOLKSWAG": "VW", "VW TRUCKS": "VW", "VOLKSWAGEN TRUCKS": "VW",
    "LAND ROVER": "LANDROVER", "RANGE": "LANDROVER", "RANGE ROVER": "LANDROVER", "ROVER": "LANDROVER",
    "CITROËN": "CITROEN", "CITROEN TRUCKS": "CITROEN",
    "FORD TRUCKS": "FORD", "FIAT TRUCKS": "FIAT", "OPEL TRUCKS": "OPEL",
    "PEUGEOT TRUCKS": "PEUGEOT", "RENAULT TRUCKS": "RENAULT", "TOYOTA TRUCKS": "TOYOTA",
    "NISSAN TRUCKS": "NISSAN", "HYUNDAI TRUCKS": "HYUNDAI", "KIA TRUCKS": "KIA",
    "MITSUBISHI TRUCKS": "MITSUBISHI", "ISUZU TRUCKS": "ISUZU", "DAEWOO TRUCKS": "DAEWOO",
    "SUZUKI TRUCKS": "SUZUKI", "MAZDA TRUCKS": "MAZDA", "HONDA TRUCKS": "HONDA",
    "SSANGYONG TRUCKS": "SSANGYONG", "VOLVO TRUCKS": "VOLVO", "SCANIA TRUCKS": "SCANIA",
    "MAN TRUCKS": "MAN", "DAF TRUCKS": "DAF", "IVECO TRUCKS": "IVECO",
    "VAUXHALL/OPEL": "OPEL", "OPEL/VAUXHALL": "OPEL", "VAUXHALL": "OPEL", "OPEL/VX": "OPEL",
    "CHRY": "CHRYSLER", "CHR": "CHRYSLER", "CHY": "CHRYSLER",
    "CHEV": "CHEVROLET", "CHEVY": "CHEVROLET", "CHV": "CHEVROLET",
    "FRD": "FORD", "FOR": "FORD",
    "DGE": "DODGE",
    "BCK": "BUICK", "BU": "BUICK",
    "LNCN": "LINCOLN", "LIN": "LINCOLN", "LCOLN": "LINCOLN",
    "CAD": "CADILLAC",
    "PONT": "PONTIAC", "PON": "PONTIAC",
    "PLY": "PLYMOUTH",
    "OLD": "OLDSMOBILE", "OLDS": "OLDSMOBILE",
    "SAT": "SATURN",
    "GMC": "GMC", "HUM": "HUMMER",
    "TOY": "TOYOTA", "HON": "HONDA", "NIS": "NISSAN", "MIT": "MITSUBISHI",
    "MITS.": "MITSUBISHI",
    "MAZ": "MAZDA", "SUB": "SUBARU", "SUZ": "SUZUKI", "HYU": "HYUNDAI",
    "KIA": "KIA", "AUD": "AUDI", "LEX": "LEXUS", "INF": "INFINITI",
    "PEU": "PEUGEOT", "PEUG": "PEUGEOT", "CIT": "CITROEN", "REN": "RENAULT",
    "SKO": "SKODA", "JAG": "JAGUAR", "POR": "PORSCHE", "TES": "TESLA",
    "AST": "ASTON MARTIN", "BEN": "BENTLEY", "RR": "ROLLS ROYCE",
    "LAM": "LAMBORGHINI", "MAS": "MASERATI", "FER": "FERRARI",
    "AB": "ABARTH", "ALFA": "ALFA ROMEO",
    "NEW": "MINI",
    "TOYOTA LEXUS": "LEXUS",
    "MCC": "SMART",
    "GM": "GM",
  };

  if (b === "NEW" && m.startsWith("MINI ")) return "MINI";
  if (b === "RANGE" && (m.startsWith("ROVER ") || d.includes("RANGE ROVER"))) return "LANDROVER";
  if (b === "TOYOTA" && (m.startsWith("LEXUS ") || d.includes("LEXUS"))) return "LEXUS";

  if (/^(?:DW|DD|DQ|DV|DL|DM|DN|DP|DR|DS|DT|DU)[0-9]/.test(b) || /^[0-9]/.test(b)) {
    const extracted = extractBrandFromDescription(description);
    if (extracted) return extracted;
    return null;
  }

  if (["PILKINGTON", "BOSCH", "OETECH", "EUROGLASS", "AUTOGlass", "AGC",
       "SAINT-GOBAIN", "FEIN", "METRIC", "BLACK", "COLD", "SANDING",
       "DRAWER", "ESPRIT", "LEYLAND", "SIKA", "FASTENER",
       "WINDSHIELD"].some(s => b.startsWith(s))) return null;

  return map[b] ?? b;
}

function extractBrandFromDescription(desc) {
  if (!desc) return null;
  const d = desc.toUpperCase();

  const abbrMatch = d.match(/\b(?:GTY|GTN|GBN|GBY|YPY|YPN)\s+([A-Z]{2,8})\b/);
  if (abbrMatch) {
    const abbr = abbrMatch[1];
    const brand = normalizeBrand(abbr, null, null);
    if (brand && brand !== "GM") return brand;
    if (abbr === "GM") return "GM";
  }

  const noSpaceMatch = d.match(/\b(GTY|GTN|GBN|GBY|YPY|YPN)([A-Z]{2,8})\b/);
  if (noSpaceMatch) {
    const abbr = noSpaceMatch[2];
    const brand = normalizeBrand(abbr, null, null);
    if (brand && brand !== "GM") return brand;
    if (abbr === "GM") return "GM";
  }

  const embeddedMatch = d.match(/\b(CHV|CHEVY|CHEVROLET|FORD|DODGE|DGE|JEEP|GMC|BUICK|BCK|CADILLAC|CAD|LINCOLN|LNCN|LCOLN|LIN|PONTIAC|PONT|PON|PONT|OLDSMOBILE|OLDS|OLD|SATURN|SAT|HUMMER|HUM|CHRYSLER|CHRY|CHY|CHR|MOPAR|MOP)\b/);
  if (embeddedMatch) {
    const brand = normalizeBrand(embeddedMatch[1], null, null);
    if (brand && brand !== "GM") return brand;
  }

  const brandPatterns = [
    /\b(FORD)\b/, /\b(CHEVROLET|CHEVY)\b/, /\b(CHRYSLER)\b/, /\b(DODGE)\b/, /\b(JEEP)\b/,
    /\b(BUICK)\b/, /\b(CADILLAC)\b/, /\b(LINCOLN)\b/, /\b(GMC)\b/, /\b(PONTIAC)\b/,
    /\b(OLDSMOBILE)\b/, /\b(SATURN)\b/, /\b(HUMMER)\b/, /\b(TOYOTA)\b/, /\b(HONDA)\b/,
    /\b(NISSAN)\b/, /\b(MAZDA)\b/, /\b(MITSUBISHI)\b/, /\b(SUBARU)\b/, /\b(SUZUKI)\b/,
    /\b(KIA)\b/, /\b(HYUNDAI)\b/, /\b(LEXUS)\b/, /\b(INFINITI)\b/, /\b(AUDI)\b/,
    /\b(BMW)\b/, /\b(MERCEDES[- ]?BENZ|MERCEDES)\b/, /\b(VOLKSWAGEN|VW)\b/, /\b(OPEL)\b/,
    /\b(VAUXHALL)\b/, /\b(PEUGEOT)\b/, /\b(CITROEN)\b/, /\b(RENAULT)\b/, /\b(FIAT)\b/,
    /\b(LANCIA)\b/, /\b(ALFA\s+ROMEO|ALFA)\b/, /\b(JAGUAR)\b/, /\b(LAND\s+ROVER|RANGE\s+ROVER)\b/,
    /\b(VOLVO)\b/, /\b(SAAB)\b/, /\b(SEAT)\b/, /\b(SKODA)\b/, /\b(PORSCHE)\b/,
    /\b(MINI)\b/, /\b(SMART)\b/, /\b(DAEWOO)\b/, /\b(SSANGYONG)\b/, /\b(TATA)\b/,
    /\b(ISUZU)\b/, /\b(DAIHATSU)\b/, /\b(DACIA)\b/, /\b(ROVER)\b/, /\b(TRIUMPH)\b/,
    /\b(ABARTH)\b/, /\b(ASTON\s+MARTIN)\b/, /\b(BENTLEY)\b/, /\b(ROLLS\s+ROYCE)\b/,
    /\b(FERRARI)\b/, /\b(LAMBORGHINI)\b/, /\b(MASERATI)\b/, /\b(LOTUS)\b/,
    /\b(TESLA)\b/, /\b(MAN)\b/, /\b(SCANIA)\b/, /\b(IVECO)\b/, /\b(DAF)\b/,
    /\b(WESTFIELD)\b/, /\b(MITS\.?)\b/,
  ];

  for (const re of brandPatterns) {
    const m = d.match(re);
    if (m) {
      let found = m[1];
      if (found === "CHEVY") found = "CHEVROLET";
      if (found === "ALFA") found = "ALFA ROMEO";
      if (found === "MERCEDES-BENZ" || found === "MERCEDES") found = "MERCEDES";
      if (found === "VW") found = "VW";
      if (found === "RANGE ROVER" || found === "LAND ROVER") found = "LANDROVER";
      if (found === "MITS." || found === "MITS") found = "MITSUBISHI";
      return found;
    }
  }

  return null;
}

/* ── Model extraction ──────────────────────────────────────── */
const KNOWN_MODELS = new Set([
  'SILVERADO', 'CAMARO', 'TAHOE', 'SUBURBAN', 'YUKON', 'SIERRA', 'COLORADO', 'AVALANCHE',
  'RAM', 'DURANGO', 'CHARGER', 'CHALLENGER', 'JOURNEY', 'CARAVAN', 'GRAND CARAVAN', 'NITRO',
  'F150', 'F-150', 'F250', 'F-250', 'F350', 'F-350', 'F-SERIES', 'F SERIES', 'MUSTANG',
  'EXPLORER', 'ESCAPE', 'RANGER', 'BRONCO', 'EDGE', 'FOCUS', 'FUSION', 'TAURUS', 'EXPEDITION',
  'ECOSPORT', 'TRANSIT', 'CONNECT', 'KA', 'FIESTA', 'MONDEO', 'S-MAX', 'GALAXY', 'C-MAX',
  'B-MAX', 'PUMA', 'KUGA', 'KA+', 'K+',
  'TOWN CAR', 'NAVIGATOR', 'CONTINENTAL', 'MKZ', 'MKS', 'MKT', 'AVIATOR',
  'ESCALADE', 'CTS', 'ATS', 'CT6', 'XTS', 'SRX', 'XT5', 'XT4', 'XT6',
  'LESABRE', 'LACROSSE', 'REGAL', 'ENCORE', 'ENCLAVE', 'TERRAIN', 'ACADIA', 'YUKON',
  'GRAND PRIX', 'G6', 'G8', 'BONNEVILLE', 'TRANS SPORT', 'MONTANA', 'TORRENT',
  'FIREBIRD', 'TRANS AM', 'GTO', 'SUNFIRE', 'AZTEK', 'VIBE',
  'AVALANCHE', 'TRAILBLAZER', 'BLAZER', 'S10', 'S-10', 'COBALT', 'IMPALA', 'MALIBU',
  'COMET', 'COUGAR', 'MOUNTAINEER', 'MARINER', 'MILAN', 'SABLE', 'GRAND MARQUIS',
  'COMMANDER', 'COMPASS', 'PATRIOT', 'LIBERTY', 'WRANGLER', 'CHEROKEE', 'GRAND CHEROKEE',
  'CJ', 'CJ5', 'CJ7', 'CJ8', 'RENEGADE', 'COMPASS', 'GLADIATOR',
  'JUKE', 'QASHQAI', 'X-TRAIL', 'XTRAIL', 'PATHFINDER', 'NAVARA', 'NOTE', 'MICRA',
  'PAJERO', 'SHOGUN', 'L200', 'L300', 'GALANT', 'LANCER', 'OUTLANDER', 'ASX', 'ECLIPSE',
  'COLT', 'SPACE STAR', 'SPACE WAGON', 'SPACE RUNNER',
  'SMART', 'FORFOUR', 'FOR TWO', 'FORTWO', 'ROADSTER',
  'SEIW', 'SEW', 'MEGA',
]);

function extractModelFromDescription(desc, brand) {
  if (!desc) return null;
  const d = desc.toUpperCase();

  const patterns = [
    /\b(?:GTY|GTN|GBN|GBY|YPY|YPN)\s+[A-Z]{2,8}\s+([A-Z][A-Z0-9\-\s\/]*)\b/,
    /\b(?:GTY|GTN|GBN|GBY|YPY|YPN)(?:[A-Z]{2,8})\s+([A-Z][A-Z0-9\-\s\/]*)\b/,
  ];
  for (const re of patterns) {
    const m = d.match(re);
    if (m) {
      const model = m[1].split(/\s+/)[0].replace(/[-\/;]$/, '');
      if (model && model.length >= 2) return model;
    }
  }

  if (brand) {
    const b = brand.toUpperCase();
    const re = new RegExp(`\\b${b}\\s+([A-Z][A-Z0-9\\s]*)`);
    const m = d.match(re);
    if (m) {
      const parts = m[1].trim().split(/\s+/);
      return parts[0];
    }
  }

  for (const knownModel of KNOWN_MODELS) {
    const re = new RegExp(`\\b${knownModel.replace(/[-\/]/g, '[-/]?')}\\b`);
    if (re.test(d)) return knownModel;
  }

  const slashMatch = d.match(/\b([A-Z]{2,})[-\/]([A-Z]{2,})\b/);
  if (slashMatch) {
    return slashMatch[1];
  }

  return null;
}

/* ── Model aliases ─────────────────────────────────────────── */
const MODEL_ALIASES = {
  "LANDCRUISER": "LAND CRUISER",
  "LAND-CRUISER": "LAND CRUISER",
  "CRV": "CR-V",
  "MX5": "MX-5",
  "MX3": "MX-3",
  "MX6": "MX-6",
  "HILUX": "HI-LUX",
  "HI-LUX": "HILUX",
  "CX3": "CX-3",
  "CX5": "CX-5",
  "CX7": "CX-7",
  "CX9": "CX-9",
  "RX7": "RX-7",
  "RX8": "RX-8",
  "X5": "X5", "X3": "X3", "X6": "X6", "X7": "X7",
  "Z3": "Z3", "Z4": "Z4", "Z8": "Z8",
  "A3": "A3", "A4": "A4", "A5": "A5", "A6": "A6", "A7": "A7", "A8": "A8",
  "Q3": "Q3", "Q5": "Q5", "Q7": "Q7", "Q8": "Q8", "R8": "R8",
  "1SERIES": "1", "3SERIES": "3", "5SERIES": "5", "7SERIES": "7",
  "1 SERIES": "1", "3 SERIES": "3", "5 SERIES": "5", "7 SERIES": "7",
  "CPE": "C-CLASS",
  "COUPE": "C-CLASS",
  "SAL": "S-CLASS",
  "SALOON": "S-CLASS",
  "323F": "323",
  "K+": "KA",
  "KPLUS": "KA",
  "F150": "F-SERIES",
  "F-150": "F-SERIES",
  "F250": "F-SERIES",
  "F-250": "F-SERIES",
  "F350": "F-SERIES",
  "F-350": "F-SERIES",
  "PU": "RAM",
  "L200": "L 200",
  "PAJERO": "PAJERO",
  "SHOGUN": "PAJERO",
  "GALANT": "GALANT",
  "FORFOUR": "FORFOUR",
  "FOR FOUR": "FORFOUR",
  "SEIW": "SEiW",
  "SEW": "SEW",
  "JUKE": "JUKE",
};

/* ── Strip trailing numbers from model names ─────────────────
 * e.g., RX300 → RX, LS460 → LS, CT200H → CT
 */
function stripModelNumbers(model) {
  if (!model) return model;
  if (/^\d+$/.test(model)) return model;
  const stripped = model.replace(/^(\D+)\d{2,}[A-Z]?$/i, "$1");
  if (stripped && stripped !== model && stripped.length >= 1) {
    return stripped;
  }
  return model;
}

function normalizeModel(model, brand, description) {
  let m = decodeHtmlAggressive(model || "").toUpperCase()
    .replace(/[^A-Z0-9\/\(\)\-'\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(?:GTY|GTN|GBN|GBY|YPY|YPN|WS|GN|GB|GY|GL)\b/.test(m)) {
    const extracted = extractModelFromDescription(description, brand);
    if (extracted) m = extracted;
  }

  if (brand) {
    const b = brand.toUpperCase().trim();
    if (m.startsWith(b + " ")) m = m.slice(b.length + 1).trim();
    if (m.startsWith(b + "-")) m = m.slice(b.length + 1).trim();
  }

  const mNoSpaces = m.replace(/\s+/g, "");
  if (MODEL_ALIASES[mNoSpaces]) m = MODEL_ALIASES[mNoSpaces];
  else if (MODEL_ALIASES[m]) m = MODEL_ALIASES[m];

  const noise = ["LASTEVOGN","LASTEBIL","VAREBIL","KASSEVOGN","ST","VOGN",
    "HATCHBACK","STATIONWAGON","STASJONSVOGN","PICKUP","AUTOMOBILES","CARS","VANS",
    "4D","5D","3D","2D","HBK","SED","CPE","CAB","WAG","SW","SUV","AFMKT","NO","RAM",
    "SOFTTOP","SOFT/TOP","HARDTOP","HARD/TOP"];
  for (const n of noise) {
    m = m.replace(new RegExp("\\b" + n + "\\b", "g"), " ");
  }

  return m.replace(/\s+/g, " ").trim();
}

/* ── Tokenizer ─────────────────────────────────────────────── */
function getTokens(str) {
  const parts = str.split(/[\s\/\(\)\-]+/);
  return parts.filter(t => t.length >= 2 || /^\d$/.test(t));
}

/* ── Year extraction ───────────────────────────────────────── */
function extractYearFromDescription(desc) {
  if (!desc) return null;
  const d = desc.toUpperCase();
  const patterns = [
    /\b(20\d{2})\s*[-;/]/, /\b(19\d{2})\s*[-;/]/, /\b0?(\d{2})\s*[-;/]/,
    /(\d{2})\/(20\d{2})/, /BJ\.\s*AB\$*\$*(\d{2})\.(20\d{2})/, /\b(20\d{2})\b/,
  ];
  for (const p of patterns) {
    const m = d.match(p);
    if (m) {
      if (m[2] && m[2].length === 4) return parseInt(m[2]);
      if (m[1] && m[1].length === 4) return parseInt(m[1]);
      if (m[1] && m[1].length === 2) {
        const y = parseInt(m[1]);
        return y < 50 ? 2000 + y : 1900 + y;
      }
    }
  }
  return null;
}

/* ── Load CSV data ─────────────────────────────────────────── */
async function loadCsvData() {
  const modelToMan = new Map();
  const rl1 = createInterface({ input: createReadStream('data/tecdoc-import/models.csv'), crlfDelay: Infinity });
  for await (const line of rl1) {
    const parts = line.split('\t');
    if (parts.length >= 5) {
      modelToMan.set(parseInt(parts[0]), parseInt(parts[1]));
    }
  }

  const manToBrand = new Map();
  const rl2 = createInterface({ input: createReadStream('data/tecdoc-import/manufacturers.csv'), crlfDelay: Infinity });
  for await (const line of rl2) {
    const parts = line.split('\t');
    if (parts.length >= 4) {
      manToBrand.set(parseInt(parts[0]), parts[1]?.trim());
    }
  }

  const commercialVehicles = [];
  const rl3 = createInterface({ input: createReadStream('data/tecdoc-import/commercialvehicles.csv'), crlfDelay: Infinity });
  for await (const line of rl3) {
    const parts = line.split('\t');
    if (parts.length >= 8) {
      const ktype = parseInt(parts[1], 10);
      const modelId = parseInt(parts[2], 10);
      const model = parts[6]?.trim();
      const yearFrom = parts[3] ? new Date(parts[3]).getFullYear() : null;
      const yearTo = parts[4] ? new Date(parts[4]).getFullYear() : null;
      if (!isNaN(ktype) && !isNaN(modelId) && model) {
        const manId = modelToMan.get(modelId);
        const brand = manId ? manToBrand.get(manId) : null;
        if (brand) commercialVehicles.push({ ktype, brand, model, yearFrom, yearTo });
      }
    }
  }

  const motorbikes = [];
  const rl4 = createInterface({ input: createReadStream('data/tecdoc-import/motorbikes.csv'), crlfDelay: Infinity });
  for await (const line of rl4) {
    const parts = line.split('\t');
    if (parts.length >= 10) {
      const ktype = parseInt(parts[1], 10);
      const brand = parts[3]?.trim();
      const model = parts[8]?.trim();
      const yearFrom = parts[5] ? new Date(parts[5]).getFullYear() : null;
      const yearTo = parts[6] ? new Date(parts[6]).getFullYear() : null;
      if (!isNaN(ktype) && brand && model) motorbikes.push({ ktype, brand, model, yearFrom, yearTo });
    }
  }

  return { commercialVehicles, motorbikes };
}

/* ── Build prefix4 map ─────────────────────────────────────── */
function buildPrefix4Map(records) {
  const prefix4BrandMap = new Map();
  for (const r of records) {
    if (!r.prefix4 || !r.brand) continue;
    const nb = normalizeBrand(r.brand, r.model, r.description);
    if (!nb) continue;
    if (!prefix4BrandMap.has(r.prefix4)) prefix4BrandMap.set(r.prefix4, new Map());
    prefix4BrandMap.get(r.prefix4).set(nb, (prefix4BrandMap.get(r.prefix4).get(nb) || 0) + 1);
  }
  const prefix4ToBrand = new Map();
  for (const [prefix4, counts] of prefix4BrandMap) {
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [,c]) => s + c, 0);
    const top = sorted[0];
    if (top[1] / total >= 0.5) prefix4ToBrand.set(prefix4, top[0]);
  }
  return prefix4ToBrand;
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  const { commercialVehicles, motorbikes } = await loadCsvData();
  const prefix4ToBrand = buildPrefix4Map(records);

  const tecdocByBrand = new Map();
  for (const entry of ktypeMapping) {
    const brand = normalizeBrand(entry.brand, null, null);
    if (!brand) continue;
    if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
    tecdocByBrand.get(brand).push({
      ktype: entry.ktype,
      model: entry.model,
      normModel: decodeHtmlAggressive(entry.model).toUpperCase()
        .replace(/[^A-Z0-9\/\(\)\-'\.]/g, " ").replace(/\s+/g, " ").trim(),
      yearFrom: entry.year_from,
      yearTo: entry.year_to,
    });
  }
  for (const entry of commercialVehicles) {
    const brand = normalizeBrand(entry.brand, null, null);
    if (!brand) continue;
    if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
    tecdocByBrand.get(brand).push({
      ktype: entry.ktype,
      model: entry.model,
      normModel: decodeHtmlAggressive(entry.model).toUpperCase()
        .replace(/[^A-Z0-9\/\(\)\-'\.]/g, " ").replace(/\s+/g, " ").trim(),
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
    });
  }
  for (const entry of motorbikes) {
    const brand = normalizeBrand(entry.brand, null, null);
    if (!brand) continue;
    if (!tecdocByBrand.has(brand)) tecdocByBrand.set(brand, []);
    tecdocByBrand.get(brand).push({
      ktype: entry.ktype,
      model: entry.model,
      normModel: decodeHtmlAggressive(entry.model).toUpperCase()
        .replace(/[^A-Z0-9\/\(\)\-'\.]/g, " ").replace(/\s+/g, " ").trim(),
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
    });
  }

  console.log(`\n📊 ${tecdocByBrand.size} brands indexed`);

  const modelToBrands = new Map();
  for (const [brand, entries] of tecdocByBrand) {
    for (const entry of entries) {
      const tokens = getTokens(entry.normModel);
      for (const token of tokens) {
        if (!modelToBrands.has(token)) modelToBrands.set(token, new Set());
        modelToBrands.get(token).add(brand);
      }
    }
  }

  console.log("\n🚀 Running V15 matching...");
  const matched = [];
  const unmatched = [];

  for (const record of records) {
    let brand = normalizeBrand(record.brand, record.model, record.description);
    let model = record.model;
    let yearFrom = record.yearFrom;
    let yearTo = record.yearTo;

    if (!yearFrom) {
      const extracted = extractYearFromDescription(record.description);
      if (extracted) yearFrom = extracted;
    }

    if (!brand && record.prefix4 && prefix4ToBrand.has(record.prefix4)) {
      brand = prefix4ToBrand.get(record.prefix4);
    }

    if (!brand && record.description) {
      brand = extractBrandFromDescription(record.description);
    }

    let brandsToTry = brand ? [brand] : [];
    if (brand === "GM") {
      brandsToTry = ["CHEVROLET", "GMC"];
    }

    if (!brand && record.description) {
      const extractedModel = extractModelFromDescription(record.description, null);
      if (extractedModel) {
        const modelTokens = getTokens(extractedModel);
        for (const token of modelTokens) {
          if (modelToBrands.has(token)) {
            const possibleBrands = [...modelToBrands.get(token)];
            if (possibleBrands.length === 1) {
              brandsToTry = possibleBrands;
              break;
            }
          }
        }
      }
    }

    if (!brand && record.description) {
      const desc = decodeHtmlAggressive(record.description).toUpperCase();
      for (const tb of tecdocByBrand.keys()) {
        if (desc.includes(tb + " ") || desc.startsWith(tb)) {
          if (!brandsToTry.includes(tb)) brandsToTry.push(tb);
        }
      }
    }

    if (brandsToTry.length === 0) {
      unmatched.push({ ...record, reason: "no_brand" });
      continue;
    }

    const cmNorm = normalizeModel(model, record.brand, record.description);
    const cmTokens = new Set(getTokens(cmNorm));

    let bestScore = 0;
    let bestKtype = null;

    for (const tryBrand of brandsToTry) {
      if (!tecdocByBrand.has(tryBrand)) continue;
      const candidates = tecdocByBrand.get(tryBrand);

      for (const cand of candidates) {
        const candTokens = new Set(getTokens(cand.normModel));
        if (candTokens.size === 0) continue;

        const inter = new Set([...cmTokens].filter(x => candTokens.has(x)));
        let score = inter.size / Math.max(cmTokens.size, candTokens.size);

        if (cmNorm === cand.normModel) score = Math.max(score, 1.0);
        else if (cand.normModel.includes(cmNorm) && cmNorm.length >= 2) score = Math.max(score, 0.85);
        else if (cmNorm.includes(cand.normModel) && cand.normModel.length >= 2) score = Math.max(score, 0.75);

        const chassisCodes = [...cmTokens].filter(t => /^[A-Z]\d{2,3}$/.test(t));
        const candChassis = [...candTokens].filter(t => /^[A-Z]\d{2,3}$/.test(t));
        for (const cc of chassisCodes) {
          if (candChassis.includes(cc)) {
            score = Math.max(score, 0.95);
            break;
          }
        }

        if (yearFrom || yearTo) {
          const start = Math.max(yearFrom || 0, cand.yearFrom || 0);
          const end = Math.min(yearTo || 9999, cand.yearTo || 9999);
          const overlap = Math.max(0, end - start + 1);
          if (overlap <= 0 && cand.yearFrom && cand.yearTo) {
            score *= 0.5;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestKtype = cand.ktype;
        }
      }
    }

    if (bestScore > 0.08) {
      matched.push({
        eurocode: record.eurocode,
        ktype: bestKtype,
        score: bestScore,
      });
    } else {
      unmatched.push({ ...record, reason: "no_match", brand: brand || brandsToTry[0], model: cmNorm });
    }
  }

  console.log(`  ✓ ${matched.length} matched (${((matched.length / records.length) * 100).toFixed(1)}%)`);
  console.log(`  ✓ ${unmatched.length} unmatched (${((unmatched.length / records.length) * 100).toFixed(1)}%)`);

  const highScore = matched.filter(m => m.score >= 0.7).length;
  const medScore = matched.filter(m => m.score >= 0.4 && m.score < 0.7).length;
  const lowScore = matched.filter(m => m.score < 0.4).length;
  console.log(`  ℹ Scores: high=${highScore}, med=${medScore}, low=${lowScore}`);

  const matchedEurocodes = new Set(matched.map(m => m.eurocode));
  const glassCats = {};
  for (const r of records) {
    const cat = r.category || "unknown";
    if (!glassCats[cat]) glassCats[cat] = { total: 0, matched: 0 };
    glassCats[cat].total++;
    if (matchedEurocodes.has(r.eurocode)) glassCats[cat].matched++;
  }

  console.log("\n📊 Coverage by category:");
  for (const [cat, data] of Object.entries(glassCats).sort((a,b) => b[1].total - a[1].total)) {
    const pct = data.total > 0 ? (data.matched / data.total * 100).toFixed(1) : 0;
    console.log(`   ${cat}: ${data.matched}/${data.total} (${pct}%)`);
  }

  const glassTotal = records.filter(r => r.category !== "annet").length;
  const glassMatched = records.filter(r => r.category !== "annet" && matchedEurocodes.has(r.eurocode)).length;
  console.log(`   Glass total: ${glassMatched}/${glassTotal} (${(glassMatched/glassTotal*100).toFixed(1)}%)`);

  console.log("\n📝 Generating SQL...");

  const ktypeRegistryEntries = new Map();
  for (const m of matched) {
    const ktypeInfo = ktypeMapping.find(e => e.ktype === m.ktype);
    if (ktypeInfo && !ktypeRegistryEntries.has(m.ktype)) {
      ktypeRegistryEntries.set(m.ktype, ktypeInfo);
    }
  }

  const krStatements = [];
  for (const [ktype, entry] of ktypeRegistryEntries) {
    const brand = (entry.brand || "").replace(/'/g, "''");
    const model = (entry.model || "").replace(/'/g, "''");
    const yf = entry.year_from || "NULL";
    const yt = entry.year_to || "NULL";
    krStatements.push(`INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, created_at) VALUES (${ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_v15', datetime('now'));`);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "ktype-registry-inserts-v15.sql"), "-- ktype_registry inserts v15\n" + krStatements.join("\n"));
  console.log(`  ✓ ktype_registry: ${krStatements.length}`);

  const cuStatements = matched.map(m => `UPDATE glass_catalog SET ktype = ${m.ktype} WHERE eurocode = '${m.eurocode.replace(/'/g, "''")}';`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "glass-catalog-updates-v15.sql"), "-- glass_catalog updates v15\n" + cuStatements.join("\n"));
  console.log(`  ✓ glass_catalog updates: ${cuStatements.length}`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "matching-report-v15.json"), JSON.stringify({
    total_catalog: records.length,
    matched: matched.length,
    unmatched: unmatched.length,
    coverage: matched.length / records.length,
    glass_coverage: glassMatched / glassTotal,
    score_distribution: { high: highScore, medium: medScore, low: lowScore },
    sample_unmatched: unmatched.slice(0, 30).map(r => ({ eurocode: r.eurocode, brand: r.brand, model: r.model, yearFrom: r.yearFrom, yearTo: r.yearTo, desc: r.description?.substring(0, 60), reason: r.reason })),
  }, null, 2));

  console.log(`\n✅ V15 complete!`);
  console.log(`   Total coverage: ${((matched.length / records.length) * 100).toFixed(1)}%`);
  console.log(`   Glass coverage: ${((glassMatched / glassTotal) * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
