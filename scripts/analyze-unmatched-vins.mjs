#!/usr/bin/env node
/**
 * Analyze unmatched VINs from SVV data vs vin_ktype_map.
 * Produces a prioritized report of which models could be fixed next.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = "data/finn-no-regnr";
const KTYPE_VEHICLES_FILE = "data/tecdoc-import/ktype-vehicles.json";
const MATCHED_VINS_FILE = process.argv.find((a) => a.startsWith("--matched="))?.split("=")[1] || null;
const REPORT_FILE = path.join(DATA_DIR, "unmatched-vins-analysis.json");

const INPUT_FILES = [
  path.join(DATA_DIR, "svv-batch-results.ndjson"),
  path.join(DATA_DIR, "regnr-bruteforce-results.ndjson"),
];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const aliases = {
    VW: "VOLKSWAGEN",
    MERCEDES: "MERCEDES-BENZ",
    "MERCEDES BENZ": "MERCEDES-BENZ",
    QUATTRO: "AUDI",
  };
  return aliases[b] || b;
}

const BRAND_WORDS = new Set([
  "AUDI", "BMW", "MERCEDES", "MERCEDES-BENZ", "VW", "VOLKSWAGEN", "VOLVO",
  "FORD", "OPEL", "PEUGEOT", "CITROEN", "RENAULT", "TOYOTA", "NISSAN",
  "HYUNDAI", "KIA", "SKODA", "SEAT", "FIAT", "ALFA", "ALFA-ROMEO", "LANCIA",
  "HONDA", "MAZDA", "MITSUBISHI", "SUBARU", "SUZUKI", "JEEP", "CHRYSLER",
  "DODGE", "CHEVROLET", "CADILLAC", "TESLA", "JAGUAR", "LAND ROVER",
  "RANGE ROVER", "PORSCHE", "MINI", "SMART", "SSANGYONG", "SAAB", "DACIA",
]);

function extractBaseModel(model, brand) {
  if (!model) return "";
  const normBrand = normalizeBrand(brand);
  let m = model
    .toUpperCase()
    .replace(/\b4MATIC\b/gi, "")
    .replace(/\bQUATTRO\b/gi, "")
    .replace(/\bTFSI\b/gi, "")
    .replace(/\bTDI\b/gi, "")
    .replace(/\bHYBRID\b/gi, "")
    .replace(/\bPLUG-IN\b/gi, "")
    .replace(/\bAWD\b/gi, "")
    .replace(/\b4WD\b/gi, "")
    .replace(/\b4X4\b/gi, "")
    .replace(/\bXDRIVE\b/gi, "")
    .replace(/\bSDRIVE\b/gi, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = m.split(/\s+/);
  while (words.length > 0 && (BRAND_WORDS.has(words[0]) || words[0] === normBrand)) {
    words.shift();
  }
  if (!words.length) return "";

  let first = words[0].replace(/[^A-Z0-9\-]/g, "");
  if (words.length > 1 && /^\d/.test(words[1])) {
    first = words[0] + words[1].replace(/[^A-Z0-9]/g, "").slice(0, 3);
  }
  return first;
}

function normalizeModelForKey(model) {
  return (model || "").toLowerCase().trim().replace(/\s+/g, "_");
}

function inferSeriesModel(model, brand) {
  const m = (model || "").toUpperCase().trim();
  const b = normalizeBrand(brand);

  // BMW: 520d → 5, 116d → 1, X1 xDrive → X1, etc.
  if (b === "BMW") {
    const match = m.match(/\b([X]?\d)\s*\d*[A-Z]*\b/);
    if (match) return match[1];
  }

  // Mercedes: E 220 CDI → E CLASS, C 220 CDI → C CLASS
  if (b === "MERCEDES-BENZ") {
    const match = m.match(/\b([A-Z]\s*\d{0,3})\s+(CDI|CDI\s*4MATIC|BLUETEC|D|E|AMG)/) || m.match(/\b([A-Z]\s*\d{0,3})\b/);
    if (match) {
      const cls = match[1].replace(/\s/g, "").charAt(0);
      if (/^[A-Z]$/.test(cls)) return `${cls} CLASS`;
    }
  }

  return null;
}

function loadMatchedVins() {
  if (!MATCHED_VINS_FILE || !fs.existsSync(MATCHED_VINS_FILE)) {
    // Fallback: parse from SQL batch files
    const matched = new Set();
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("vin-ktype-map-inserts.sql") && f.endsWith(".applied"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
      const regex = /'([A-HJ-NPR-Z0-9]{17})'/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        matched.add(m[1]);
      }
    }
    log(`Loaded ${matched.size} matched VINs from SQL batch files`);
    return matched;
  }

  const raw = fs.readFileSync(MATCHED_VINS_FILE, "utf8");
  // Wrangler output has JSON embedded; find the results array.
  const jsonStart = raw.indexOf("[");
  const data = JSON.parse(raw.slice(jsonStart));
  const matched = new Set();
  for (const batch of data) {
    for (const row of batch.results || []) {
      if (row.vin) matched.add(row.vin);
    }
  }
  log(`Loaded ${matched.size} matched VINs from ${MATCHED_VINS_FILE}`);
  return matched;
}

function loadTecdocIndex() {
  log("Loading TecDoc index...");
  const data = JSON.parse(fs.readFileSync(KTYPE_VEHICLES_FILE, "utf8"));
  const byBrand = new Map();
  for (const v of data) {
    const brand = (v.brand || "").toUpperCase();
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(v);
  }
  return byBrand;
}

function readNdjson(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l));
}

function main() {
  log("Starting unmatched VIN analysis...");

  const matchedVins = loadMatchedVins();
  const tecdocByBrand = loadTecdocIndex();

  const unmatched = [];
  const seenVins = new Set();

  for (const file of INPUT_FILES) {
    if (!fs.existsSync(file)) {
      log(`Skipping missing file: ${file}`);
      continue;
    }
    log(`Reading ${file}...`);
    const vehicles = readNdjson(file);
    for (const v of vehicles) {
      if (!v.vin || v.vin.length !== 17) continue;
      if (seenVins.has(v.vin)) continue;
      seenVins.add(v.vin);
      if (matchedVins.has(v.vin)) continue;

      const brand = normalizeBrand(v.make);
      const baseModel = extractBaseModel(v.model, brand);
      const normModel = normalizeModelForKey(v.model);
      const tecdocModels = tecdocByBrand.get(brand) || [];
      const brandInTecdoc = tecdocModels.length > 0;

      // Check if normalized model directly matches any TecDoc model
      const directMatch = tecdocModels.some((t) => {
        const tm = (t.model || "").toLowerCase().replace(/\s+/g, "_");
        return tm === normModel || tm.includes(normModel) || normModel.includes(tm);
      });

      // Check if base model matches
      const baseMatch = tecdocModels.some((t) => {
        const tm = (t.model || "").toUpperCase().replace(/\s+/g, "");
        return tm.includes(baseModel) || baseModel.includes(tm);
      });

      // Check if a series/class-stripped model would match
      const seriesModel = inferSeriesModel(v.model, brand);
      const seriesMatch = seriesModel
        ? tecdocModels.some((t) => {
            const tm = (t.model || "").toUpperCase().replace(/\s+/g, " ");
            return tm.includes(seriesModel);
          })
        : false;

      // Simple EV/new model heuristics
      const isEv = /\b(E-TRON|EQ[A-Z]?|I(X|3|4|5|7)|IONIQ|EV6|EV9|MODEL [YSX3]|LEAF|E-NIRO|ENYAQ|ID\d)\b/i.test(v.model || "");

      unmatched.push({
        vin: v.vin,
        regnr: v.regnr,
        brand,
        model: v.model,
        year: v.year,
        baseModel,
        seriesModel,
        bodyCode: v.bodyCode,
        typeCode: v.typeCode,
        directTecdocMatch: directMatch,
        baseTecdocMatch: baseMatch,
        seriesMatch,
        brandInTecdoc,
        isEv,
      });
    }
  }

  log(`Total unmatched: ${unmatched.length}`);

  // Aggregate by brand/model/year
  const byBrandModel = new Map();
  for (const u of unmatched) {
    const key = `${u.brand}|${u.model}|${u.year}`;
    if (!byBrandModel.has(key)) {
      byBrandModel.set(key, {
        brand: u.brand,
        model: u.model,
        year: u.year,
        count: 0,
        examples: [],
        isEv: u.isEv,
        directTecdocMatch: u.directTecdocMatch,
        baseTecdocMatch: u.baseTecdocMatch,
        seriesMatch: u.seriesMatch,
        seriesModel: u.seriesModel,
        brandInTecdoc: u.brandInTecdoc,
      });
    }
    const g = byBrandModel.get(key);
    g.count++;
    if (g.examples.length < 3) g.examples.push({ vin: u.vin, regnr: u.regnr, typeCode: u.typeCode });
  }

  const groups = Array.from(byBrandModel.values()).sort((a, b) => b.count - a.count);

  // Aggregate by brand
  const byBrand = new Map();
  for (const u of unmatched) {
    if (!byBrand.has(u.brand)) {
      byBrand.set(u.brand, { brand: u.brand, count: 0, evCount: 0, examples: [] });
    }
    const g = byBrand.get(u.brand);
    g.count++;
    if (u.isEv) g.evCount++;
    if (g.examples.length < 3) g.examples.push({ model: u.model, year: u.year, vin: u.vin });
  }

  // Fixability estimate (per-vehicle counts)
  const fixableByNormalization = unmatched.filter((u) => u.baseTecdocMatch && !u.directTecdocMatch).length;
  const bmwSeriesCandidates = unmatched.filter((u) => u.brand === "BMW" && /^X?\d/.test(u.model || "")).length;
  const mercedesClassCandidates = unmatched.filter((u) => u.brand === "MERCEDES-BENZ" && /^[A-Z]\s*\d/i.test(u.model || "")).length;
  const likelyEv = unmatched.filter((u) => u.isEv).length;
  const brandNotInTecdoc = unmatched.filter((u) => !u.brandInTecdoc).length;
  const other = unmatched.length - fixableByNormalization - likelyEv - brandNotInTecdoc;

  const report = {
    totalUnmatched: unmatched.length,
    summary: {
      fixableByNormalization,
      bmwSeriesCandidates,
      mercedesClassCandidates,
      likelyEv,
      brandNotInTecdoc,
      other,
    },
    topGroups: groups.slice(0, 50),
    byBrand: Array.from(byBrand.values()).sort((a, b) => b.count - a.count).slice(0, 20),
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  log(`Report written to ${REPORT_FILE}`);

  // Print concise summary
  console.log("\n=== Unmatched VIN Analysis Summary ===");
  console.log(`Total unmatched: ${unmatched.length}`);
  console.log(`Fixable by better model normalization: ${fixableByNormalization}`);
  console.log(`BMW candidates for series normalization (520d→5, 116d→1, X1→X1): ${bmwSeriesCandidates}`);
  console.log(`Mercedes candidates for class normalization (E 220 CDI→E): ${mercedesClassCandidates}`);
  console.log(`Likely EV/new models (needs VIN decoding): ${likelyEv}`);
  console.log(`Brand not in TecDoc index: ${brandNotInTecdoc}`);
  console.log(`Other/uncategorized: ${other}`);
  console.log("\nTop 10 unmatched groups:");
  groups.slice(0, 10).forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.brand} ${g.model} (${g.year}) — ${g.count}stk — EV:${g.isEv} series:${g.seriesModel}`);
  });
  console.log("\nTop 10 brands:");
  Array.from(byBrand.values()).sort((a, b) => b.count - a.count).slice(0, 10).forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.brand} — ${g.count}stk (EV: ${g.evCount})`);
  });
}

main();
