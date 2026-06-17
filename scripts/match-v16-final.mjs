#!/usr/bin/env node
/**
 * V16: Enhanced Matcher
 * Based on V15 + new improvements:
 * - MODEL_ALIASES: CRV→CR-V, MX5→MX-5, LANDCRUISER→LAND CRUISER, HI-LUX→HILUX, R19→19, etc.
 * - MODEL_NUMBER_STRIP: RX300→RX, LS460→LS, CT200H→CT for broader matching
 * - TYPO_FIX: GALA→GALAXY, etc.
 * - All V15 features preserved
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

  const embeddedMatch = d.match(/\b(CHV|CHEVY|CHEVR|CHEVROLET|FOR|FRD|FORD|DODGE|DGE|JEEP|GMC|BUICK|BCK|BU|CADILLAC|CAD|LINCOLN|LNCN|LCOLN|LIN|PONTIAC|PONT|PON|OLDSMOBILE|OLDS|OLD|SATURN|SAT|HUMMER|HUM|CHRYSLER|CHRY|CHY|CHR|MOPAR|MOP|TOY|TOYOTA|HON|HONDA|NIS|NISSAN|MAZ|MAZDA|MIT|MITS|MITS\.|SUB|SUBARU|SUZ|SUZUKI|HYU|HYUNDAI|LEX|LEXUS|AUD|AUDI|MERC|MB|MERCEDES|VOLKSWAG|VW|PEU|PEUG|PEUGEOT|CIT|CITROEN|REN|RENAULT|JAG|JAGUAR|VOL|VOLVO|SKO|SKODA|POR|PORSCHE|MINI|NEW|MCC|SMART|DAW|DAEWOO|SSANG|SSANGYONG|ISU|ISUZU|DAIH|DAIHATSU|DAC|DACIA|ROV|ROVER|TRIUM|TRIUMPH|AB|ABARTH|AST|ASTON\s+MARTIN|BEN|BENTLEY|RR|ROLLS\s+ROYCE|FER|FERRARI|LAM|LAMBORGHINI|MAS|MASERATI|LOT|LOTUS|TES|TESLA|MAN|SCA|SCANIA|IVC|IVECO|DAF|WSTFD|WESTFIELD)\b/);
  if (embeddedMatch) {
    const brand = normalizeBrand(embeddedMatch[1], null, null);
    if (brand && brand !== "GM") return brand;
  }

  const brandPatterns = [
    /\b(FORD|FOR|FRD)\b/, /\b(CHEVROLET|CHEVY|CHV|CHEVR)\b/, /\b(CHRYSLER|CHRY|CHY|CHR)\b/, /\b(DODGE|DGE)\b/, /\b(JEEP)\b/,
    /\b(BUICK|BCK|BU)\b/, /\b(CADILLAC|CAD)\b/, /\b(LINCOLN|LNCN|LCOLN|LIN)\b/, /\b(GMC)\b/, /\b(PONTIAC|PONT|PON)\b/,
    /\b(OLDSMOBILE|OLDS|OLD)\b/, /\b(SATURN|SAT)\b/, /\b(HUMMER|HUM)\b/, /\b(TOYOTA|TOY)\b/, /\b(HONDA|HON)\b/,
    /\b(NISSAN|NIS)\b/, /\b(MAZDA|MAZ)\b/, /\b(MITSUBISHI|MIT|MITS\.?)\b/, /\b(SUBARU|SUB)\b/, /\b(SUZUKI|SUZ)\b/,
    /\b(KIA)\b/, /\b(HYUNDAI|HYU)\b/, /\b(LEXUS|LEX)\b/, /\b(INFINITI|INF)\b/, /\b(AUDI|AUD)\b/,
    /\b(BMW)\b/, /\b(MERCEDES[- ]?BENZ|MERCEDES|MERC|MB)\b/, /\b(VOLKSWAGEN|VW|VOLKSWAG)\b/, /\b(OPEL)\b/,
    /\b(VAUXHALL|VAUX)\b/, /\b(PEUGEOT|PEU|PEUG)\b/, /\b(CITROEN|CITROËN|CIT)\b/, /\b(RENAULT|REN)\b/, /\b(FIAT)\b/,
    /\b(LANCIA)\b/, /\b(ALFA\s+ROMEO|ALFA)\b/, /\b(JAGUAR|JAG)\b/, /\b(LAND\s+ROVER|RANGE\s+ROVER|RANGE)\b/,
    /\b(VOLVO|VOL)\b/, /\b(SAAB)\b/, /\b(SEAT)\b/, /\b(SKODA|SKO)\b/, /\b(PORSCHE|POR)\b/,
    /\b(MINI|NEW)\b/, /\b(SMART|MCC)\b/, /\b(DAEWOO|DAW)\b/, /\b(SSANGYONG|SSANG)\b/, /\b(TATA)\b/,
    /\b(ISUZU|ISU)\b/, /\b(DAIHATSU|DAIH)\b/, /\b(DACIA|DAC)\b/, /\b(ROVER|ROV)\b/, /\b(TRIUMPH|TRIUM)\b/,
    /\b(ABARTH|AB)\b/, /\b(ASTON\s+MARTIN|AST)\b/, /\b(BENTLEY|BEN)\b/, /\b(ROLLS\s+ROYCE|RR)\b/,
    /\b(FERRARI|FER)\b/, /\b(LAMBORGHINI|LAM)\b/, /\b(MASERATI|MAS)\b/, /\b(LOTUS|LOT)\b/,
    /\b(TESLA|TES)\b/, /\b(MAN)\b/, /\b(SCANIA|SCA)\b/, /\b(IVECO|IVC)\b/, /\b(DAF)\b/,
    /\b(WESTFIELD|WSTFD)\b/, /\b(MOPAR|MOP)\b/, /\b(AMC)\b/, /\b(PACKARD|PACK)\b/, /\b(STUDEBAKER|STUD)\b/,
  ];

  for (const re of brandPatterns) {
    const m = d.match(re);
    if (m) {
      let found = m[1];
      if (found === "CHEVY" || found === "CHV" || found === "CHEVR") found = "CHEVROLET";
      if (found === "FOR" || found === "FRD") found = "FORD";
      if (found === "CHRY" || found === "CHY" || found === "CHR") found = "CHRYSLER";
      if (found === "DGE") found = "DODGE";
      if (found === "BCK" || found === "BU") found = "BUICK";
      if (found === "CAD") found = "CADILLAC";
      if (found === "LNCN" || found === "LCOLN" || found === "LIN") found = "LINCOLN";
      if (found === "PONT" || found === "PON") found = "PONTIAC";
      if (found === "OLDS" || found === "OLD") found = "OLDSMOBILE";
      if (found === "SAT") found = "SATURN";
      if (found === "HUM") found = "HUMMER";
      if (found === "TOY") found = "TOYOTA";
      if (found === "HON") found = "HONDA";
      if (found === "NIS") found = "NISSAN";
      if (found === "MAZ") found = "MAZDA";
      if (found === "MITS." || found === "MITS" || found === "MIT") found = "MITSUBISHI";
      if (found === "SUB") found = "SUBARU";
      if (found === "SUZ") found = "SUZUKI";
      if (found === "HYU") found = "HYUNDAI";
      if (found === "LEX") found = "LEXUS";
      if (found === "INF") found = "INFINITI";
      if (found === "AUD") found = "AUDI";
      if (found === "MERC" || found === "MB") found = "MERCEDES";
      if (found === "MERCEDES-BENZ" || found === "MERCEDES") found = "MERCEDES";
      if (found === "VOLKSWAG" || found === "VW") found = "VW";
      if (found === "VAUX") found = "VAUXHALL";
      if (found === "PEU" || found === "PEUG") found = "PEUGEOT";
      if (found === "CIT") found = "CITROEN";
      if (found === "REN") found = "RENAULT";
      if (found === "JAG") found = "JAGUAR";
      if (found === "VOL") found = "VOLVO";
      if (found === "SKO") found = "SKODA";
      if (found === "POR") found = "PORSCHE";
      if (found === "NEW") found = "MINI";
      if (found === "MCC") found = "SMART";
      if (found === "DAW") found = "DAEWOO";
      if (found === "SSANG") found = "SSANGYONG";
      if (found === "ISU") found = "ISUZU";
      if (found === "DAIH") found = "DAIHATSU";
      if (found === "DAC") found = "DACIA";
      if (found === "ROV") found = "ROVER";
      if (found === "TRIUM") found = "TRIUMPH";
      if (found === "AB") found = "ABARTH";
      if (found === "AST") found = "ASTON MARTIN";
      if (found === "BEN") found = "BENTLEY";
      if (found === "RR") found = "ROLLS ROYCE";
      if (found === "FER") found = "FERRARI";
      if (found === "LAM") found = "LAMBORGHINI";
      if (found === "MAS") found = "MASERATI";
      if (found === "LOT") found = "LOTUS";
      if (found === "TES") found = "TESLA";
      if (found === "SCA") found = "SCANIA";
      if (found === "IVC") found = "IVECO";
      if (found === "WSTFD") found = "WESTFIELD";
      if (found === "MOP") found = "MOPAR";
      if (found === "ALFA") found = "ALFA ROMEO";
      if (found === "VW") found = "VW";
      if (found === "RANGE ROVER" || found === "LAND ROVER" || found === "RANGE") found = "LANDROVER";
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

  // Pattern 1: GTY/GTN + abbreviation + model (skip numeric prefixes like years)
  const patterns = [
    /\b(?:GTY|GTN|GBN|GBY|YPY|YPN)\s+[A-Z]{2,8}\s+([A-Z][A-Z0-9\-\s\/]*)\b/,
    /\b(?:GTY|GTN|GBN|GBY|YPY|YPN)(?:[A-Z]{2,8})\s+([A-Z][A-Z0-9\-\s\/]*)\b/,
  ];
  for (const re of patterns) {
    const m = d.match(re);
    if (m) {
      let captured = m[1].trim();
      // Skip year prefixes like "2015-" or "2011- "
      captured = captured.replace(/^\d{2,4}[-\/]\s*/, '');
      const model = captured.split(/\s+/)[0].replace(/[-\/;]$/, '');
      if (model && model.length >= 2 && !/^\d+$/.test(model)) return model;
    }
  }

  // If a known brand appears in description, get model after it
  const brandPatterns = [
    /\b(FORD|FOR|FRD|CHEVROLET|CHEVY|CHV|CHRYSLER|CHRY|DODGE|DGE|JEEP|GMC|BUICK|BCK|CADILLAC|CAD|LINCOLN|LNCN|LCOLN|PONTIAC|PONT|PON|OLDSMOBILE|OLDS|OLD|SATURN|SAT|HUMMER|HUM|TOYOTA|HONDA|NISSAN|MAZDA|MITSUBISHI|MIT|SUBARU|SUZUKI|KIA|HYUNDAI|LEXUS|INFINITI|AUDI|BMW|MERCEDES|MERC|VOLKSWAGEN|VW|OPEL|VAUXHALL|PEUGEOT|PEU|CITROEN|CIT|RENAULT|REN|FIAT|LANCIA|ALFA|JAGUAR|LAND\s+ROVER|RANGE\s+ROVER|VOLVO|SAAB|SEAT|SKODA|PORSCHE|MINI|SMART|MCC|DAEWOO|SSANGYONG|TATA|ISUZU|DAIHATSU|DACIA|ROVER|TRIUMPH|ABARTH|ASTON\s+MARTIN|BENTLEY|ROLLS\s+ROYCE|FERRARI|LAMBORGHINI|MASERATI|LOTUS|TESLA|MAN|SCANIA|IVECO|DAF|WESTFIELD|MOPAR)\b/,
  ];
  for (const re of brandPatterns) {
    const bm = d.match(re);
    if (bm) {
      const foundBrand = bm[1];
      const afterBrand = d.slice(bm.index + foundBrand.length).trim();
      // Get first meaningful token after brand (skip years, dash, etc.)
      const tokens = afterBrand.split(/\s+/).filter(t => t.length >= 2 && !/^\d{2,4}[-]?$/.test(t));
      if (tokens.length > 0) {
        let model = tokens[0].replace(/^[-\/]+/, '').replace(/[-\/;]$/, '');
        if (model.length >= 2 && !/^\d+$/.test(model)) return model;
      }
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
  "HI-LUX": "HILUX",           // Fix: product says HI-LUX → normalize to HILUX (TecDoc spelling)
  "CX3": "CX-3",
  "CX5": "CX-5",
  "CX7": "CX-7",
  "CX9": "CX-9",
  "CX30": "CX-30",
  "CX60": "CX-60",
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
  // Renault numeric models
  "R19": "19",
  "R21": "21",
  "R25": "25",
  "R11": "11",
  "R5": "5",
  "R4": "4",
  "R9": "9",
  "R6": "6",
  // Toyota
  "RAV4": "RAV 4",
  "RAV-4": "RAV 4",
  "CH-R": "C-HR",
  "CHR": "C-HR",
  "YARISII": "YARIS II",
  "YARISIII": "YARIS III",
  "AURISII": "AURIS II",
  "COROLLAII": "COROLLA II",
  "AVENSISIII": "AVENSIS III",
  "CAMRYXV": "CAMRY XV",
  "PRIUSIII": "PRIUS III",
  "PRIUSIV": "PRIUS IV",
  "VERSOS": "VERSO S",
  "AYGOII": "AYGO II",
  "SUPRAMKIV": "SUPRA MK IV",
  // VW
  "GOLFVII": "GOLF VII",
  "GOLFVIII": "GOLF VIII",
  "PASSATB6": "PASSAT B6",
  "PASSATB7": "PASSAT B7",
  "PASSATB8": "PASSAT B8",
  "POLOIV": "POLO IV",
  "POLOV": "POLO V",
  "POLOVI": "POLO VI",
  "TIGUANI": "TIGUAN I",
  "TIGUANII": "TIGUAN II",
  "TOURANII": "TOURAN II",
  "SHARANI": "SHARAN I",
  "SHARANII": "SHARAN II",
  "TRANSPORTERT4": "TRANSPORTER T4",
  "TRANSPORTERT5": "TRANSPORTER T5",
  "TRANSPORTERT6": "TRANSPORTER T6",
  "TRANSPORTERT6.1": "TRANSPORTER T6.1",
  "CADDYIV": "CADDY IV",
  "CADDYV": "CADDY V",
  // Ford
  "FOCUSIII": "FOCUS III",
  "FOCUSIV": "FOCUS IV",
  "FIESTAVI": "FIESTA VI",
  "FIESTAVII": "FIESTA VII",
  "MONDEOIV": "MONDEO IV",
  "MONDEOV": "MONDEO V",
  "KUGAI": "KUGA I",
  "KUGAII": "KUGA II",
  "KUGAIII": "KUGA III",
  "S-MAXI": "S-MAX I",
  "S-MAXII": "S-MAX II",
  "GALAXYIII": "GALAXY III",
  "ECOSPORTII": "ECOSPORT II",
  "PUMAII": "PUMA II",
  "TRANSITVI": "TRANSIT VI",
  "TRANSITVII": "TRANSIT VII",
  "TRANSITCONNECTII": "TRANSIT CONNECT II",
  "TRANSITCOURIERB": "TRANSIT COURIER B",
  "TRANSITCUSTOMI": "TRANSIT CUSTOM I",
  "TRANSITCUSTOMII": "TRANSIT CUSTOM II",
  "RANGERIII": "RANGER III",
  "RANGERIV": "RANGER IV",
  "MUSTANGVI": "MUSTANG VI",
  // Peugeot
  "206II": "206 II",
  "207II": "207 II",
  "208II": "208 II",
  "2008II": "2008 II",
  "3008II": "3008 II",
  "5008II": "5008 II",
  "308II": "308 II",
  "308III": "308 III",
  "408II": "408 II",
  "508I": "508 I",
  "508II": "508 II",
  "EXPERTIII": "EXPERT III",
  "TRAVELLERI": "TRAVELLER I",
  "RIFTERI": "RIFTER I",
  "PARTNERII": "PARTNER II",
  "PARTNERIII": "PARTNER III",
  // Citroen
  "C3II": "C3 II",
  "C3III": "C3 III",
  "C3AIRCROSSII": "C3 AIRCROSS II",
  "C4II": "C4 II",
  "C4IIICACTUS": "C4 CACTUS",
  "C5II": "C5 II",
  "C5III": "C5 III",
  "C5AIRCROSSI": "C5 AIRCROSS I",
  "BERLINGOII": "BERLINGO II",
  "BERLINGOIII": "BERLINGO III",
  "JUMPYII": "JUMPY II",
  "JUMPYIII": "JUMPY III",
  "SPACETOURERI": "SPACETOURER I",
  // Nissan
  "QASHQAII": "QASHQAI II",
  "QASHQAIII": "QASHQAI III",
  "QASHQAI+2": "QASHQAI +2",
  "JUKEI": "JUKE I",
  "JUKEII": "JUKE II",
  "MICRAII": "MICRA II",
  "MICRAIII": "MICRA III",
  "MICRAIV": "MICRA IV",
  "MICRAV": "MICRA V",
  "NOTEII": "NOTE II",
  "X-TRAILII": "X-TRAIL II",
  "X-TRAILIII": "X-TRAIL III",
  "X-TRAILIV": "X-TRAIL IV",
  "NAVARAIII": "NAVARA III",
  "NAVARAIV": "NAVARA IV",
  "LEAFII": "LEAF II",
  // Hyundai
  "I10II": "I10 II",
  "I10III": "I10 III",
  "I20II": "I20 II",
  "I20III": "I20 III",
  "I30II": "I30 II",
  "I30III": "I30 III",
  "I40I": "I40 I",
  "TUCSONII": "TUCSON II",
  "TUCSONIII": "TUCSON III",
  "TUCSONIV": "TUCSON IV",
  "SANTAFEIII": "SANTA FE III",
  "SANTAFEIV": "SANTA FE IV",
  "KONAI": "KONA I",
  "KONAII": "KONA II",
  "IONIQI": "IONIQ I",
  "IONIQ5": "IONIQ 5",
  "IONIQ6": "IONIQ 6",
  // Kia
  "PICANTOII": "PICANTO II",
  "PICANTOIII": "PICANTO III",
  "RIOII": "RIO II",
  "RIOIII": "RIO III",
  "RIOIV": "RIO IV",
  "CEEDII": "CEED II",
  "CEEDIII": "CEED III",
  "CEEDSWII": "CEED SW II",
  "CEEDSWIII": "CEED SW III",
  "SPORTAGEII": "SPORTAGE II",
  "SPORTAGEIII": "SPORTAGE III",
  "SPORTAGEIV": "SPORTAGE IV",
  "SPORTAGEV": "SPORTAGE V",
  "SORENTOII": "SORENTO II",
  "SORENTOIII": "SORENTO III",
  "SORENTOIV": "SORENTO IV",
  "OPTIMAIII": "OPTIMA III",
  "OPTIMAIV": "OPTIMA IV",
  "STINGERI": "STINGER I",
  "STONICI": "STONIC I",
  "NIROII": "NIRO II",
  "EV6I": "EV6 I",
  // Skoda
  "FABIAII": "FABIA II",
  "FABIAIII": "FABIA III",
  "FABIAIV": "FABIA IV",
  "OCTAVIAII": "OCTAVIA II",
  "OCTAVIAIII": "OCTAVIA III",
  "OCTAVIAIV": "OCTAVIA IV",
  "SUPERBII": "SUPERB II",
  "SUPERBIII": "SUPERB III",
  "SUPERBIV": "SUPERB IV",
  "KAROQI": "KAROQ I",
  "KODIAQI": "KODIAQ I",
  "KODIAQII": "KODIAQ II",
  "SCALAI": "SCALA I",
  "KAMIQI": "KAMIQ I",
  "ENYAQI": "ENYAQ I",
  // Seat
  "IBIZAIV": "IBIZA IV",
  "IBIZAV": "IBIZA V",
  "LEONIII": "LEON III",
  "LEONIV": "LEON IV",
  "ATECAI": "ATECA I",
  "ARONAI": "ARONA I",
  "TARRACOI": "TARRACO I",
  "ALTEAII": "ALTEA II",
  "TOLEDOIV": "TOLEDO IV",
  // Volvo
  "V40II": "V40 II",
  "V60II": "V60 II",
  "V90II": "V90 II",
  "S60II": "S60 II",
  "S60III": "S60 III",
  "S90II": "S90 II",
  "XC60II": "XC60 II",
  "XC90II": "XC90 II",
  "XC40I": "XC40 I",
  "V90CROSSCOUNTRYII": "V90 CROSS COUNTRY II",
  "V60CROSSCOUNTRYII": "V60 CROSS COUNTRY II",
  // Mazda
  "2II": "2 II",
  "2III": "2 III",
  "3II": "3 II",
  "3III": "3 III",
  "6II": "6 II",
  "6III": "6 III",
  // Subaru
  "FORESTERIII": "FORESTER III",
  "FORESTERIV": "FORESTER IV",
  "FORESTERV": "FORESTER V",
  "OUTBACKIV": "OUTBACK IV",
  "OUTBACKV": "OUTBACK V",
  "OUTBACKVI": "OUTBACK VI",
  "LEGACYIV": "LEGACY IV",
  "LEGACYV": "LEGACY V",
  "LEGACYVI": "LEGACY VI",
  "IMPREZAII": "IMPREZA II",
  "IMPREZAIII": "IMPREZA III",
  "IMPREZAIV": "IMPREZA IV",
  "XVI": "XV I",
  "XVII": "XV II",
  // Mitsubishi
  "LANCERVIII": "LANCER VIII",
  "LANCERIX": "LANCER IX",
  "LANCERX": "LANCER X",
  "OUTLANDERII": "OUTLANDER II",
  "OUTLANDERIII": "OUTLANDER III",
  "ASXI": "ASX I",
  "ECLIPSECROSSI": "ECLIPSE CROSS I",
  // Suzuki
  "SWIFTIII": "SWIFT III",
  "SWIFTIV": "SWIFT IV",
  "SWIFTV": "SWIFT V",
  "VITARAII": "VITARA II",
  "VITARAIII": "VITARA III",
  "S-CROSSI": "S-CROSS I",
  "BALENOII": "BALENO II",
  "IGNISIII": "IGNIS III",
  // Honda
  "CIVICVII": "CIVIC VII",
  "CIVICVIII": "CIVIC VIII",
  "CIVICIX": "CIVIC IX",
  "CIVICX": "CIVIC X",
  "ACCORDVII": "ACCORD VII",
  "ACCORDVIII": "ACCORD VIII",
  "ACCORDIX": "ACCORD IX",
  "ACCORDX": "ACCORD X",
  "JAZZII": "JAZZ II",
  "JAZZIII": "JAZZ III",
  "JAZZIV": "JAZZ IV",
  "HRVI": "HR-V I",
  "HRVII": "HR-V II",
  // BMW
  "SERIES1": "1 SERIES",
  "SERIES2": "2 SERIES",
  "SERIES3": "3 SERIES",
  "SERIES4": "4 SERIES",
  "SERIES5": "5 SERIES",
  "SERIES6": "6 SERIES",
  "SERIES7": "7 SERIES",
  "SERIES8": "8 SERIES",
  "1SERIES": "1 SERIES",
  "2SERIES": "2 SERIES",
  "3SERIES": "3 SERIES",
  "4SERIES": "4 SERIES",
  "5SERIES": "5 SERIES",
  "6SERIES": "6 SERIES",
  "7SERIES": "7 SERIES",
  "8SERIES": "8 SERIES",
  // Mercedes
  "C-CLASS": "C CLASS",
  "E-CLASS": "E CLASS",
  "S-CLASS": "S CLASS",
  "A-CLASS": "A CLASS",
  "B-CLASS": "B CLASS",
  "CL-CLASS": "CL CLASS",
  "CLK-CLASS": "CLK CLASS",
  "CLS-CLASS": "CLS CLASS",
  "GL-CLASS": "GL CLASS",
  "GLA-CLASS": "GLA CLASS",
  "GLB-CLASS": "GLB CLASS",
  "GLC-CLASS": "GLC CLASS",
  "GLE-CLASS": "GLE CLASS",
  "GLK-CLASS": "GLK CLASS",
  "GLS-CLASS": "GLS CLASS",
  "ML-CLASS": "M CLASS",
  "R-CLASS": "R CLASS",
  "SL-CLASS": "SL CLASS",
  "SLC-CLASS": "SLC CLASS",
  "SLK-CLASS": "SLK CLASS",
  "SPRINTER3.5-T": "SPRINTER 3.5 T",
  "SPRINTER3-T": "SPRINTER 3 T",
  "SPRINTER4.6-T": "SPRINTER 4.6 T",
  "SPRINTER5-T": "SPRINTER 5 T",
  "V-CLASS": "V CLASS",
  "VIANOII": "VIANO II",
  "VITOI": "VITO I",
  "VITOII": "VITO II",
  "VITOIII": "VITO III",
  // Audi
  "A4IV": "A4 IV",
  "A4V": "A4 V",
  "A4VI": "A4 VI",
  "A5II": "A5 II",
  "A6IV": "A6 IV",
  "A6V": "A6 V",
  "A7II": "A7 II",
  "A8IV": "A8 IV",
  "A8V": "A8 V",
  "Q3II": "Q3 II",
  "Q5II": "Q5 II",
  "Q7II": "Q7 II",
  "Q8I": "Q8 I",
  "TTIII": "TT III",
  // Vauxhall
  "ASTRAH": "ASTRA H",
  "ASTRAJ": "ASTRA J",
  "ASTRAK": "ASTRA K",
  "CORSAE": "CORSA E",
  "CORSAF": "CORSA F",
  "INSIGNIAA": "INSIGNIA A",
  "ZAFIRAA": "ZAFIRA A",
  "ZAFIRAB": "ZAFIRA B",
  "MERIVAA": "MERIVA A",
  "MERIVAB": "MERIVA B",
  "CROSSLANDX": "CROSSLAND X",
  "GRANDLANDX": "GRANDLAND X",
  "MOKKAX": "MOKKA X",
  // Renault
  "MEGANEII": "MEGANE II",
  "MEGANEIII": "MEGANE III",
  "SCENICII": "SCENIC II",
  "SCENICIII": "SCENIC III",
  "LAGUNAII": "LAGUNA II",
  "LAGUNAIII": "LAGUNA III",
  "CLIOII": "CLIO II",
  "CLIOIII": "CLIO III",
  "KANGOOII": "KANGOO II",
  "MASTERII": "MASTER II",
  "TRAFFICII": "TRAFFIC II",
  "VIVAROII": "VIVARO II",
  "MOVANOB": "MOVANO B",
  // Dacia
  "DUSTERII": "DUSTER II",
  "LOGANII": "LOGAN II",
  "SANDEROII": "SANDERO II",
  "LODGYI": "LODGY I",
  "DOKKERI": "DOKKER I",
};

/* ── Typo fixes ────────────────────────────────────────────── */
const TYPO_FIX = {
  "GALA": "GALAXY",
};

/* ── Strip trailing numbers from model names ─────────────────
 * e.g., RX300 → RX, LS460 → LS, CT200H → CT
 * But preserve pure-number models like "911", "124", "500"
 */
function stripModelNumbers(model) {
  if (!model) return model;
  // Don't strip pure numbers
  if (/^\d+$/.test(model)) return model;
  // Strip trailing digits+optional letter: RX300 → RX, CT200H → CT
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

  // Also check alias on first token (e.g., "CRV 02-" → "CR-V 02-")
  const firstWord = m.split(/\s+/)[0];
  if (MODEL_ALIASES[firstWord]) {
    m = MODEL_ALIASES[firstWord] + m.slice(firstWord.length);
  }

  // Apply typo fixes
  for (const [typo, fix] of Object.entries(TYPO_FIX)) {
    if (m === typo) m = fix;
  }

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

    // Also try with stripped model numbers (RX300 → RX, LS460 → LS, CT200H → CT)
    const strippedModel = stripModelNumbers(cmNorm);
    if (strippedModel && strippedModel !== cmNorm) {
      for (const t of getTokens(strippedModel)) {
        cmTokens.add(t);
      }
    }

    // Also strip numbers from individual tokens
    for (const token of [...cmTokens]) {
      const strippedToken = stripModelNumbers(token);
      if (strippedToken && strippedToken !== token) {
        cmTokens.add(strippedToken);
      }
    }

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
    krStatements.push(`INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, created_at) VALUES (${ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_v16', datetime('now'));`);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, "ktype-registry-inserts-v16.sql"), "-- ktype_registry inserts v16\n" + krStatements.join("\n"));
  console.log(`  ✓ ktype_registry: ${krStatements.length}`);

  const matchedWithEurocode = matched.filter(m => m.eurocode);
  const cuStatements = matchedWithEurocode.map(m => `UPDATE glass_catalog SET ktype = ${m.ktype} WHERE eurocode = '${m.eurocode.replace(/'/g, "''")}';`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "glass-catalog-updates-v16.sql"), "-- glass_catalog updates v16\n" + cuStatements.join("\n"));
  console.log(`  ✓ glass_catalog updates: ${cuStatements.length} (skipped ${matched.length - matchedWithEurocode.length} without eurocode)`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "matching-report-v16.json"), JSON.stringify({
    total_catalog: records.length,
    matched: matched.length,
    unmatched: unmatched.length,
    coverage: matched.length / records.length,
    glass_coverage: glassMatched / glassTotal,
    score_distribution: { high: highScore, medium: medScore, low: lowScore },
    mappings: matchedWithEurocode.map(m => ({ eurocode: m.eurocode, ktype: m.ktype, score: m.score })),
    sample_unmatched: unmatched.slice(0, 30).map(r => ({ eurocode: r.eurocode, brand: r.brand, model: r.model, yearFrom: r.yearFrom, yearTo: r.yearTo, desc: r.description?.substring(0, 60), reason: r.reason })),
  }, null, 2));

  console.log(`\n✅ V16 complete!`);
  console.log(`   Total coverage: ${((matched.length / records.length) * 100).toFixed(1)}%`);
  console.log(`   Glass coverage: ${((glassMatched / glassTotal) * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
