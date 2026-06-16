#!/usr/bin/env node
/**
 * Ground-truth k_type corrector
 * Loads tecdoc index, verifies every ground_truth row, writes SQL corrections.
 */

const fs = require("fs");
const path = require("path");

/* ──────────────────────────────────────────────────────────────
   Brand helpers (replicated from src/lib/brand.ts)
   ────────────────────────────────────────────────────────────── */
const BRAND_MAP = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "MERCEDES-AMG": "MERCEDES",
  "MERCEDES AMG": "MERCEDES",
  "LAND ROVER": "LANDROVER",
  "ROLLS ROYCE": "ROLLS ROYCE",
  VAUXHALL: "OPEL",
  "VAUXHALL/OPEL": "OPEL",
  "OPEL/VAUXHALL": "OPEL",
  CITROËN: "CITROEN",
  DS: "CITROEN",
  ALFA: "ALFA ROMEO",
  ABARTH: "FIAT",
  "LAMBORGH.": "LAMBORGHINI",
  "MITS.": "MITSUBISHI",
  MITS: "MITSUBISHI",
  NISS: "NISSAN",
  NISSA: "NISSAN",
  HON: "HONDA",
  TOY: "TOYOTA",
  TOYOT: "TOYOTA",
  REN: "RENAULT",
  "REN.": "RENAULT",
  RENAU: "RENAULT",
  HYUNADI: "HYUNDAI",
  "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT",
  PEUGE: "PEUGEOT",
  CHEV: "CHEVROLET",
  CHEVR: "CHEVROLET",
  "CHEVR.": "CHEVROLET",
  CHEVROLET: "DAEWOO (CHEVROLET)",
  DAEWOO: "DAEWOO (CHEVROLET)",
  SUZ: "SUZUKI",
  FOR: "FORD",
  "FORD,": "FORD",
  FORDA: "FORD",
  "KIA.": "KIA",
  "SUB.": "SUBARU",
  "MAZ.": "MAZDA",
  "MAZDA.": "MAZDA",
  "LEX.": "LEXUS",
  JAG: "JAGUAR",
  POR: "PORSCHE",
  PORSCH: "PORSCHE",
  "AUDI.": "AUDI",
  "BMW.": "BMW",
  "MERC.": "MERCEDES",
  MERC: "MERCEDES",
  MERCE: "MERCEDES",
  "VOLVO.": "VOLVO",
  "SEAT.": "SEAT",
  "SKODA.": "SKODA",
  "MINI.": "MINI",
  "SAAB.": "SAAB",
  "DODGE.": "DODGE",
  CHRY: "CHRYSLER",
  CHRSYLER: "CHRYSLER",
  HUM: "HUMMER",
  PONT: "PONTIAC",
  "JEEP.": "JEEP",
  CAD: "CADILLAC",
  "LINCOLN.": "LINCOLN",
  "BUICK.": "BUICK",
  "GMC,": "GMC",
  GMC: "GMC",
  "HOLDEN.": "HOLDEN",
  HOLDE: "HOLDEN",
  "ISUZU.": "ISUZU",
  "DAIHATSU.": "DAIHATSU",
  LADA: "LADA / TOGLIATTI",
  ZASTAVA: "LADA / TOGLIATTI",
  "DACIA.": "DACIA",
  "LADA / TOGLIATTI": "LADA / TOGLIATTI",
  SSANYONG: "SSANGYONG",
  "SSAN.": "SSANGYONG",
  "SMART.": "SMART",
  "TESLA.": "TESLA",
  "FERRARI.": "FERRARI",
  "MASERATI.": "MASERATI",
  "LAMBORGHINI.": "LAMBORGHINI",
  "BENTLEY.": "BENTLEY",
  ASTON: "ASTON MARTIN",
  "LOTUS.": "LOTUS",
  "MG.": "MG",
  "ROVER.": "ROVER",
  "MC LAREN": "McLAREN",
  MCLAREN: "McLAREN",
  "INEOS.": "INEOS",
  "MAXUS.": "MAXUS",
  "POLESTAR.": "POLESTAR",
  "CUPRA.": "CUPRA",
  "HONGQI.": "HONGQI",
  "VOYAH.": "VOYAH",
  "XPENG.": "XPENG",
  "ZEEKR.": "ZEEKR",
  "BYD.": "BYD",
  "ORA.": "ORA",
  "NIO.": "NIO",
  "THINK.": "THINK",
  "FISKER.": "FISKER",
  RIVIAN: "USA CARS",
  LUCID: "USA CARS",
  "TVR.": "TVR",
  TVR: "TVR",
  "JC INDIGO": "JC INDIGO",
  KEWET: "KEWET",
  AIXAM: "AIXAM",
  AIWAYS: "AIWAYS",
  "DFSK (SERES)": "DFSK (SERES)",
  DONGFENG: "DONGFENG",
  EXLANTIX: "EXLANTIX",
  "JAC (CH)": "JAC (CH)",
  "LYNK & CO": "LYNK & CO",
  MAN: "MAN",
  "FORD TRUCKS": "FORD",
  "TOYOTA TRUCKS": "TOYOTA",
  "PEUGEOT TRUCKS": "PEUGEOT",
  "CITROEN TRUCKS": "CITROEN",
  "MERCEDES TRUCKS": "MERCEDES",
  "VOLVO TRUCKS": "VOLVO",
  "AUDI TRUCKS": "AUDI",
  "BMW TRUCKS": "BMW",
  "NISSAN TRUCKS": "NISSAN",
  "FIAT TRUCKS": "FIAT",
  "RENAULT TRUCKS": "RENAULT",
  "MITSUBISHI TRUCKS": "MITSUBISHI",
  "MAZDA TRUCKS": "MAZDA",
  SCANIA: "SCANIA TRUCKS",
  DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS",
  HINO: "HINO TRUCKS",
  "ISUZU TRUCKS": "ISUZU",
};

const ALIAS_REVERSE = new Map();
for (const [key, val] of Object.entries(BRAND_MAP)) {
  if (!ALIAS_REVERSE.has(val)) ALIAS_REVERSE.set(val, new Set());
  ALIAS_REVERSE.get(val).add(key);
  ALIAS_REVERSE.get(val).add(val);
}

function normalizeBrand(brand) {
  const b = brand.toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

function getBrandAliases(brand) {
  const normalized = normalizeBrand(brand);
  const aliases = ALIAS_REVERSE.get(normalized);
  const result = aliases ? Array.from(aliases) : [normalized];
  if (normalized === "MINI" && !result.includes("BMW")) result.push("BMW");
  if (normalized === "BMW" && !result.includes("MINI")) result.push("MINI");
  const USA_CARS_BRANDS = ["CHEVROLET", "FORD", "JEEP", "CHRYSLER", "DODGE", "CADILLAC", "GMC", "HUMMER"];
  const rawUpper = brand.toUpperCase().trim();
  if (
    (USA_CARS_BRANDS.includes(normalized) || USA_CARS_BRANDS.includes(rawUpper)) &&
    !result.includes("USA CARS")
  ) {
    result.push("USA CARS");
  }
  if (normalized === "USA CARS") {
    for (const b of USA_CARS_BRANDS) {
      if (!result.includes(b)) result.push(b);
    }
  }
  return result;
}

/* ──────────────────────────────────────────────────────────────
   Model helpers (replicated from src/lib/tecdoc-resolver.ts)
   ────────────────────────────────────────────────────────────── */
const NOISE_WORDS = new Set([
  "HATCHBACK", "STATIONWAGON", "STASJONSVOGN", "ESTATE", "BREAK", "AVANT", "TOURING",
  "SEDAN", "SALOON", "SAL", "LIMOUSINE", "LIMO", "COUPE", "CPE", "CABRIOLET",
  "CONVERTIBLE", "ROADSTER", "SPIDER", "SPYDER", "TARGA", "FASTBACK", "SPORTBACK",
  "SHOOTING", "BRAKE", "SW", "WAGON", "VAN", "KASSEVOGN", "VAREBIL", "MINIVAN",
  "MPV", "SUV", "CROSSOVER", "OFFROAD", "OFF-ROAD", "PICKUP", "PICK-UP", "CHASSIS",
  "FLATBED", "TIPP", "TIPPER", "DUMP", "PLATFORM", "BOX", "PANEL", "COMBI", "KOMBI",
  "3D", "4D", "5D", "2D", "3DR", "4DR", "5DR", "2DR", "3-DOOR", "4-DOOR", "5-DOOR",
  "2-DOOR", "DOOR", "DOORS", "AUTOMATIC", "AUTO", "MANUAL", "MAN", "TIPTRONIC", "DSG",
  "CVT", "STEPTRONIC", "X-DRIVE", "XDRIVE", "QUATTRO", "4MATIC", "4-MATIC", "4X4", "4WD",
  "AWD", "RWD", "FWD", "TDI", "TSI", "FSI", "DCI", "HDI", "CDI", "TCE", "GDI", "MPI",
  "TFSI", "TWINAIR", "MULTIJET", "JTDM", "JTD", "HPI", "SPI", "VVTI", "VVT-I", "D-4D",
  "D4D", "D-CAT", "DCAT", "I-DTEC", "IDTEC", "CDTI", "TDCI", "SDI", "PDI", "XDI",
  "E-TEC", "ETEC", "ECOTEC", "ECOBOOST", "SKYACTIV", "MIVEC", "VTEC", "I-VTEC", "IVTEC",
  "LASTEVOGN", "LASTEBIL", "AUTOMOBILES", "CARS", "VANS", "HBK", "SED", "CAB", "WAG",
  "AFMKT", "NO", "RAM", "SOFTTOP", "SOFT/TOP", "HARDTOP", "HARD/TOP", "ST", "VOGN",
  "CLASS", "SERIES",
]);

const MODEL_ALIASES = {
  "3 SERIES": "3", "5 SERIES": "5", "7 SERIES": "7",
  "1 SERIES": "1", "2 SERIES": "2", "4 SERIES": "4",
  "6 SERIES": "6", "8 SERIES": "8",
  "3 SERIE": "3", "5 SERIE": "5", "7 SERIE": "7",
  "1 SERIE": "1", "2 SERIE": "2", "4 SERIE": "4",
  "6 SERIE": "6", "8 SERIE": "8",
  "C-CLASS": "C CLASS", "E-CLASS": "E CLASS", "S-CLASS": "S CLASS",
  "A-CLASS": "A CLASS", "B-CLASS": "B CLASS", "G-CLASS": "G CLASS",
  "M-CLASS": "M CLASS", "R-CLASS": "R CLASS", "X-CLASS": "X CLASS",
  "CL-CLASS": "CL CLASS", "CLK-CLASS": "CLK CLASS", "CLS-CLASS": "CLS CLASS",
  "SL-CLASS": "SL CLASS", "SLK-CLASS": "SLK CLASS",
  "GL-CLASS": "GL CLASS", "GLA-CLASS": "GLA CLASS", "GLB-CLASS": "GLB CLASS",
  "GLC-CLASS": "GLC CLASS", "GLE-CLASS": "GLE CLASS", "GLS-CLASS": "GLS CLASS",
  "C KLASSE": "C CLASS", "E KLASSE": "E CLASS", "S KLASSE": "S CLASS",
  "A KLASSE": "A CLASS", "B KLASSE": "B CLASS", "G KLASSE": "G CLASS",
  "CR-V": "CRV", "CX-3": "CX3", "CX-5": "CX5", "CX-7": "CX7", "CX-9": "CX9",
  "MX-5": "MX5", "MX-3": "MX3", "MX-6": "MX6",
  "RX-7": "RX7", "RX-8": "RX8",
  "HI-LUX": "HILUX", "LAND-CRUISER": "LAND CRUISER",
  "LANDCRUISER": "LAND CRUISER", "X-TRAIL": "XTRAIL",
  "CMAX": "C-MAX", "BMAX": "B-MAX", "SMAX": "S-MAX",
  "GOLF 7": "GOLF VII", "GOLF 6": "GOLF VI", "GOLF 5": "GOLF V", "GOLF 4": "GOLF IV",
  "POLO 6": "POLO 6R", "POLO 5": "POLO 9N",
  "PASSAT 8": "PASSAT B8", "PASSAT 7": "PASSAT B7", "PASSAT 6": "PASSAT B6",
  "TOURAN 2": "TOURAN 5T", "TOURAN 1": "TOURAN 1T",
  "TIGUAN 2": "TIGUAN AD", "TIGUAN 1": "TIGUAN 5N",
  "TRANSPORTER T6": "TRANSPORTER T6", "TRANSPORTER T5": "TRANSPORTER T5",
  "A4 B8": "A4 B8", "A4 B9": "A4 B9", "A4 B7": "A4 B7", "A4 B6": "A4 B6",
  "A6 C7": "A6 C7", "A6 C8": "A6 C8", "A6 C6": "A6 C6",
  "A3 8P": "A3 8P", "A3 8V": "A3 8V",
  "3 E90": "3 E90", "3 F30": "3 F30", "3 G20": "3 G20",
  "5 E60": "5 E60", "5 F10": "5 F10", "5 G30": "5 G30",
  "C W204": "C CLASS W204", "C W205": "C CLASS W205",
  "E W212": "E CLASS W212", "E W213": "E CLASS W213",
  "208 1": "208", "208 2": "208 II",
  "308 1": "308", "308 2": "308 II", "308 3": "308 III",
  "3008 1": "3008", "3008 2": "3008 II",
  "V70 2": "V70 II", "V70 3": "V70 III",
  "XC60 1": "XC60", "XC60 2": "XC60 II",
  "XC90 1": "XC90", "XC90 2": "XC90 II",
  "XC 70": "XC70", "XC 60": "XC60", "XC 90": "XC90",
  "S 80": "S80", "S 60": "S60", "S 90": "S90",
  "V 60": "V60", "V 70": "V70", "V 90": "V90",
  "ASTRA J": "ASTRA J", "ASTRA K": "ASTRA K", "ASTRA H": "ASTRA H",
  "CORSA D": "CORSA D", "CORSA E": "CORSA E", "CORSA F": "CORSA F",
  "QASHQAI 1": "QASHQAI J10", "QASHQAI 2": "QASHQAI J11",
  "X-TRAIL 1": "X-TRAIL T30", "X-TRAIL 2": "X-TRAIL T31", "X-TRAIL 3": "X-TRAIL T32",
};

const CHASSIS_GENERATIONS = {
  E90: { brand: "BMW", model: "3", years: [2005, 2013] },
  E46: { brand: "BMW", model: "3", years: [1998, 2007] },
  E39: { brand: "BMW", model: "5", years: [1995, 2004] },
  E60: { brand: "BMW", model: "5", years: [2003, 2010] },
  F30: { brand: "BMW", model: "3", years: [2012, 2019] },
  F10: { brand: "BMW", model: "5", years: [2010, 2017] },
  G20: { brand: "BMW", model: "3", years: [2019, 2025] },
  G30: { brand: "BMW", model: "5", years: [2017, 2025] },
  W204: { brand: "MERCEDES", model: "C CLASS", years: [2007, 2014] },
  W205: { brand: "MERCEDES", model: "C CLASS", years: [2014, 2021] },
  W212: { brand: "MERCEDES", model: "E CLASS", years: [2009, 2016] },
  W213: { brand: "MERCEDES", model: "E CLASS", years: [2016, 2023] },
  B8: { brand: "AUDI", model: "A4", years: [2008, 2015] },
  B9: { brand: "AUDI", model: "A4", years: [2015, 2023] },
  C7: { brand: "AUDI", model: "A6", years: [2011, 2018] },
  C8: { brand: "AUDI", model: "A6", years: [2018, 2025] },
  "8P": { brand: "AUDI", model: "A3", years: [2003, 2012] },
  "8V": { brand: "AUDI", model: "A3", years: [2012, 2020] },
  "5G1": { brand: "VOLKSWAGEN", model: "GOLF", years: [2013, 2020] },
  "1K1": { brand: "VOLKSWAGEN", model: "GOLF", years: [2004, 2013] },
  "1J1": { brand: "VOLKSWAGEN", model: "GOLF", years: [1998, 2005] },
  AD: { brand: "VOLKSWAGEN", model: "TIGUAN", years: [2016, 2025] },
  "5N": { brand: "VOLKSWAGEN", model: "TIGUAN", years: [2008, 2016] },
  J10: { brand: "NISSAN", model: "QASHQAI", years: [2007, 2013] },
  J11: { brand: "NISSAN", model: "QASHQAI", years: [2014, 2021] },
};

function applyAliases(text) {
  for (const [alias, replacement] of Object.entries(MODEL_ALIASES)) {
    const re = new RegExp(`\\b${alias.replace(/[-/]/g, "[-/]?")}\\b`, "g");
    text = text.replace(re, replacement);
  }
  return text;
}

function normalizeModelText(raw) {
  let text = raw.toUpperCase().trim();
  text = applyAliases(text);
  text = text
    .replace(/[^A-Z0-9\s\(\)\-/]/g, " ")
    .replace(/[\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const noise of NOISE_WORDS) {
    const re = new RegExp(`\\b${noise.replace(/[-/]/g, "[-/]?")}\\b`, "g");
    text = text.replace(re, " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function extractTokens(text) {
  const norm = normalizeModelText(text);
  return norm.split(/\s+/).filter((t) => t.length >= 2 || /^\d$/.test(t));
}

function extractChassisCodes(text) {
  const codes = [];
  const m1 = text.match(/\b([A-Z]\d{1,3}[A-Z]?)\b/g);
  if (m1) codes.push(...m1);
  const m2 = text.match(/\b(\d[A-Z]\d{1,2})\b/g);
  if (m2) codes.push(...m2);
  const m3 = text.match(/\b(V?I{1,3}|IV|VI{1,3}|IX|X{1,3})\b/gi);
  if (m3) codes.push(...m3.map((r) => r.toUpperCase()));
  return codes;
}

function isYearCompatible(year, from, to) {
  if (from === 0 && to === 0) return true;
  if (from > 0 && year < from - 2) return false;
  if (to > 0 && year > to + 2) return false;
  return true;
}

/* ──────────────────────────────────────────────────────────────
   TecDoc index loading & resolver
   ────────────────────────────────────────────────────────────── */
const IDX = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/data/tecdoc-index.json"), "utf8"));

let brandNames = [];
let modelNames = [];
let entries = [];
let canonicalBrands = [];
let entriesByCanonicalBrand = new Map();
let modelMeta = [];
let _initialized = false;

function ensureInitialized() {
  if (_initialized) return;
  for (const [name, id] of Object.entries(IDX.brands)) {
    brandNames[id] = name;
  }
  for (const [name, id] of Object.entries(IDX.models)) {
    modelNames[id] = name;
  }
  entries = IDX.entries.map((e) => ({
    ktype: e[0],
    brandId: e[1],
    modelId: e[2],
    yearFrom: e[3],
    yearTo: e[4],
  }));
  canonicalBrands = brandNames.map((b) => normalizeBrand(b));
  for (const entry of entries) {
    const cb = canonicalBrands[entry.brandId];
    const list = entriesByCanonicalBrand.get(cb);
    if (list) {
      list.push(entry);
    } else {
      entriesByCanonicalBrand.set(cb, [entry]);
    }
  }
  modelMeta = new Array(modelNames.length);
  for (let i = 0; i < modelNames.length; i++) {
    const normText = normalizeModelText(modelNames[i]);
    const tokens = extractTokens(modelNames[i]);
    const chassis = extractChassisCodes(modelNames[i]);
    modelMeta[i] = {
      normText,
      tokens,
      tokenSet: new Set(tokens),
      chassis,
      chassisSet: new Set(chassis),
    };
  }
  _initialized = true;
}

function scoreEntry(inputBrand, inputNorm, inputTokens, inputChassis, year, entry) {
  let score = 0;
  const reasons = [];
  const candidateBrand = canonicalBrands[entry.brandId];

  if (inputBrand && candidateBrand) {
    if (inputBrand === candidateBrand) {
      score += 0.4;
      reasons.push("exact brand match");
    } else {
      const aliases = getBrandAliases(inputBrand);
      if (aliases.some((a) => a.toUpperCase() === brandNames[entry.brandId].toUpperCase())) {
        score += 0.3;
        reasons.push("partial brand match (alias)");
      }
    }
  }

  const meta = modelMeta[entry.modelId];

  if (inputChassis.size > 0 && meta.chassisSet.size > 0) {
    let common = 0;
    for (const c of inputChassis) {
      if (meta.chassisSet.has(c)) common++;
    }
    if (common > 0) {
      score += 0.35;
      reasons.push("exact chassis match");
    }
  }

  if (inputChassis.size > 0 && year !== undefined) {
    for (const chassis of inputChassis) {
      const gen = CHASSIS_GENERATIONS[chassis];
      if (!gen) continue;
      if (candidateBrand === gen.brand) {
        if (meta.normText.includes(gen.model)) {
          if (year >= gen.years[0] - 1 && year <= gen.years[1] + 1) {
            score += 0.15;
            reasons.push("chassis generation confirmed");
          }
        }
      }
    }
  }

  if (inputTokens.size > 0 && meta.tokenSet.size > 0) {
    let common = 0;
    for (const t of inputTokens) {
      if (meta.tokenSet.has(t)) common++;
    }
    const overlap =
      inputTokens.size <= 2
        ? common / inputTokens.size
        : common / Math.max(inputTokens.size, meta.tokenSet.size);
    if (overlap >= 0.7) {
      score += 0.3;
      reasons.push("strong model match");
    } else if (overlap >= 0.4) {
      score += 0.15;
      reasons.push("moderate model match");
    }
    if (inputNorm.length >= 1 && meta.normText.includes(inputNorm)) {
      score += 0.1;
      reasons.push("model containment");
    } else if (meta.normText.length >= 2 && inputNorm.includes(meta.normText)) {
      score += 0.05;
      reasons.push("model containment");
    }
  }

  if (year !== undefined && year !== null) {
    if (isYearCompatible(year, entry.yearFrom, entry.yearTo)) {
      score += 0.2;
      reasons.push("year compatible");
    } else {
      score -= 0.2;
      reasons.push("year mismatch");
    }
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function resolveTecDocKType(make, model, year) {
  ensureInitialized();
  const normBrand = normalizeBrand(make);
  const inputNorm = normalizeModelText(model);
  const inputTokens = new Set(extractTokens(model));
  const inputChassis = new Set(extractChassisCodes(model));

  const pools = [];
  const exactPool = entriesByCanonicalBrand.get(normBrand);
  if (exactPool) pools.push(exactPool);

  const aliasSet = new Set();
  for (const alias of getBrandAliases(make)) {
    const canon = normalizeBrand(alias);
    if (canon !== normBrand) aliasSet.add(canon);
  }
  for (const canon of aliasSet) {
    const pool = entriesByCanonicalBrand.get(canon);
    if (pool) pools.push(pool);
  }

  if (pools.length === 0) {
    pools.push(entries);
  }

  const bestByKtype = new Map();
  for (const pool of pools) {
    for (const entry of pool) {
      const { score, reasons } = scoreEntry(normBrand, inputNorm, inputTokens, inputChassis, year, entry);
      if (score < 0.15) continue;
      const existing = bestByKtype.get(entry.ktype);
      if (!existing || existing.score < score) {
        bestByKtype.set(entry.ktype, { entry, score, reasons });
      }
    }
  }

  const candidates = Array.from(bestByKtype.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (year !== undefined && year !== null) {
        const aFrom = a.entry.yearFrom || 0;
        const bFrom = b.entry.yearFrom || 0;
        const aProx = aFrom > 0 ? Math.abs(year - aFrom) : Infinity;
        const bProx = bFrom > 0 ? Math.abs(year - bFrom) : Infinity;
        if (aProx !== bProx) return aProx - bProx;
      }
      return 0;
    })
    .slice(0, 5)
    .map((c) => ({
      ktype: c.entry.ktype,
      brand: brandNames[c.entry.brandId],
      model: modelNames[c.entry.modelId],
      yearFrom: c.entry.yearFrom,
      yearTo: c.entry.yearTo,
      score: c.score,
      reasons: c.reasons,
    }));

  if (candidates.length === 0) {
    return { status: "no_match", candidates: [] };
  }

  const bestScore = candidates[0].score;
  const status = bestScore >= 0.85 ? "resolved" : bestScore >= 0.4 ? "ambiguous" : "no_match";
  return { status, candidates };
}

/* ──────────────────────────────────────────────────────────────
   Verify correctness of an existing ktype
   ────────────────────────────────────────────────────────────── */
let entriesByKtype = null;
function buildEntriesByKtype() {
  if (entriesByKtype) return;
  ensureInitialized();
  entriesByKtype = new Map();
  for (const entry of entries) {
    const list = entriesByKtype.get(entry.ktype);
    if (list) list.push(entry);
    else entriesByKtype.set(entry.ktype, [entry]);
  }
}

function isKtypeCorrect(row) {
  buildEntriesByKtype();
  const ktype = row.k_type;
  if (!ktype || ktype === 0 || ktype === null) return false;
  const candidates = entriesByKtype.get(Number(ktype));
  if (!candidates || candidates.length === 0) return false;

  const normBrand = normalizeBrand(row.make);
  const inputNorm = normalizeModelText(row.model);
  const inputTokens = new Set(extractTokens(row.model));
  const year = row.year;

  for (const entry of candidates) {
    const entryBrand = canonicalBrands[entry.brandId];
    const meta = modelMeta[entry.modelId];

    // Brand match (exact or alias)
    let brandMatch = false;
    if (entryBrand === normBrand) {
      brandMatch = true;
    } else {
      const aliases = getBrandAliases(row.make);
      if (aliases.some((a) => a.toUpperCase() === brandNames[entry.brandId].toUpperCase())) {
        brandMatch = true;
      }
    }
    if (!brandMatch) continue;

    // Model match: at least moderate token overlap or containment
    let modelMatch = false;
    if (inputTokens.size > 0 && meta.tokenSet.size > 0) {
      let common = 0;
      for (const t of inputTokens) {
        if (meta.tokenSet.has(t)) common++;
      }
      const overlap =
        inputTokens.size <= 2
          ? common / inputTokens.size
          : common / Math.max(inputTokens.size, meta.tokenSet.size);
      if (overlap >= 0.4) modelMatch = true;
      if (inputNorm.length >= 1 && meta.normText.includes(inputNorm)) modelMatch = true;
      if (meta.normText.length >= 2 && inputNorm.includes(meta.normText)) modelMatch = true;
    } else if (inputTokens.size === 0 && meta.tokenSet.size === 0) {
      // Both empty — accept if normalized strings are similar
      if (inputNorm === meta.normText) modelMatch = true;
    }
    if (!modelMatch) continue;

    // Year compatibility (generous: ±2 years)
    if (year !== undefined && year !== null) {
      if (!isYearCompatible(year, entry.yearFrom, entry.yearTo)) continue;
    }

    // All checks passed — this ktype is correct for this row
    return true;
  }

  return false;
}

/* ──────────────────────────────────────────────────────────────
   Main processing — unified verification + resolution
   ────────────────────────────────────────────────────────────── */
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, "ground_truth_rows.json"), "utf8"));
const BATCH_SIZE = 1000;

const corrections = [];
const uncertainRows = [];
const noMatchRows = [];
let totalProcessed = 0;
let totalCorrect = 0;
let totalWrong = 0;
let totalCorrected = 0;
let totalUncertain = 0;
let totalNoMatch = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  let batchCorrect = 0;
  let batchWrong = 0;
  let batchCorrected = 0;
  let batchUncertain = 0;
  let batchNoMatch = 0;

  for (const row of batch) {
    totalProcessed++;
    const result = resolveTecDocKType(row.make, row.model, row.year);
    const currentKtype = Number(row.k_type);

    if (result.candidates.length === 0) {
      // No candidates at all
      if (currentKtype && currentKtype !== 0) {
        totalWrong++;
        batchWrong++;
        noMatchRows.push({ id: row.id, oldKtype: row.k_type, make: row.make, model: row.model, year: row.year });
        totalNoMatch++;
        batchNoMatch++;
      } else {
        totalCorrect++;
        batchCorrect++;
      }
      continue;
    }

    const currentCandidate = result.candidates.find((c) => c.ktype === currentKtype);

    if (currentCandidate && currentCandidate.score >= 0.75) {
      // Resolver agrees this ktype is a good match → keep it
      totalCorrect++;
      batchCorrect++;
      continue;
    }

    if (currentCandidate && currentCandidate.score >= 0.4) {
      // Current ktype is in candidates but not confident enough → uncertain
      totalUncertain++;
      batchUncertain++;
      uncertainRows.push({
        id: row.id,
        oldKtype: row.k_type,
        make: row.make,
        model: row.model,
        year: row.year,
        topCandidate: result.candidates[0],
      });
      continue;
    }

    // Current ktype is either absent or scored < 0.4 → consider wrong
    const best = result.candidates[0];
    if (best.score >= 0.75) {
      totalWrong++;
      batchWrong++;
      totalCorrected++;
      batchCorrected++;
      corrections.push({
        id: row.id,
        oldKtype: row.k_type,
        newKtype: best.ktype,
        make: row.make,
        model: row.model,
        year: row.year,
        score: best.score,
        reasons: best.reasons,
      });
    } else if (best.score >= 0.4) {
      // Ambiguous — don't change
      totalUncertain++;
      batchUncertain++;
      uncertainRows.push({
        id: row.id,
        oldKtype: row.k_type,
        make: row.make,
        model: row.model,
        year: row.year,
        topCandidate: best,
      });
    } else {
      totalWrong++;
      batchWrong++;
      noMatchRows.push({ id: row.id, oldKtype: row.k_type, make: row.make, model: row.model, year: row.year });
      totalNoMatch++;
      batchNoMatch++;
    }
  }

  console.log(
    `Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length} rows, ${batchCorrect} correct, ${batchWrong} wrong, ${batchCorrected} corrected, ${batchUncertain} uncertain, ${batchNoMatch} no_match`
  );
}

/* ──────────────────────────────────────────────────────────────
   Write SQL file (only meaningful corrections + no_match zeros)
   ────────────────────────────────────────────────────────────── */
const sqlLines = [
  "-- Auto-generated ground_truth k_type corrections",
  `-- Generated: ${new Date().toISOString()}`,
  `-- Total rows: ${totalProcessed}, Correct: ${totalCorrect}, Wrong: ${totalWrong}, Corrected: ${totalCorrected}, Uncertain: ${totalUncertain}, NoMatch: ${totalNoMatch}`,
  "",
  "BEGIN TRANSACTION;",
];

for (const c of corrections) {
  // Skip no-op updates where old === new
  if (c.oldKtype === c.newKtype) continue;
  sqlLines.push(`UPDATE ground_truth SET k_type = ${c.newKtype} WHERE id = ${c.id};`);
}

for (const n of noMatchRows) {
  if (n.oldKtype === 0 || n.oldKtype === null || n.oldKtype === undefined) continue;
  sqlLines.push(`UPDATE ground_truth SET k_type = 0 WHERE id = ${n.id};`);
}

sqlLines.push("COMMIT;");

const sqlPath = path.join(__dirname, "fix-ground-truth-ktype.sql");
fs.writeFileSync(sqlPath, sqlLines.join("\n") + "\n");

/* ──────────────────────────────────────────────────────────────
   Summary
   ────────────────────────────────────────────────────────────── */
console.log("\n========== SUMMARY ==========");
console.log(`Total rows processed: ${totalProcessed}`);
console.log(`Correct ktypes:       ${totalCorrect}`);
console.log(`Wrong ktypes:         ${totalWrong}`);
console.log(`Corrected:            ${totalCorrected}`);
console.log(`Uncertain:            ${totalUncertain}`);
console.log(`No match:             ${totalNoMatch}`);
console.log(`SQL file:             ${sqlPath}`);
console.log("\n--- Sample corrections ---");
for (let i = 0; i < Math.min(10, corrections.length); i++) {
  const c = corrections[i];
  console.log(
    `id=${c.id}  ${c.make} ${c.model} (${c.year})  old=${c.oldKtype} -> new=${c.newKtype}  score=${c.score.toFixed(3)}  [${c.reasons.join(", ")}]`
  );
}
console.log("\n--- Sample no_match ---");
for (let i = 0; i < Math.min(5, noMatchRows.length); i++) {
  const n = noMatchRows[i];
  console.log(`id=${n.id}  ${n.make} ${n.model} (${n.year})  old=${n.oldKtype} -> 0`);
}
console.log("\n--- Sample uncertain ---");
for (let i = 0; i < Math.min(5, uncertainRows.length); i++) {
  const u = uncertainRows[i];
  console.log(
    `id=${u.id}  ${u.make} ${u.model} (${u.year})  old=${u.oldKtype}  top=${u.topCandidate.ktype} score=${u.topCandidate.score.toFixed(3)}`
  );
}
