/**
 * TecDoc Resolver Prototype
 *
 * Mål: Gitt et produkt (med brand/model/description/year),
 * finn beste kType-kandidater fra TecDoc-dumpen.
 *
 * Input:  Produkt-objekt eller kommandolinje-argument
 * Output: Rangerte kandidater med confidence score + forklaring
 *
 * Bruk:
 *   node scripts/autodoc-probe/tecdoc-resolver.mjs "VOLKSWAGEN" "GOLF VII" 2015
 *   node scripts/autodoc-probe/tecdoc-resolver.mjs --product '{"brand":"BMW","model":"3 SERIES","year":2012}'
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const TECDOC_DIR = path.join(ROOT, "data", "tecdoc-import");
const OUT = path.join(ROOT, "data", "autodoc-probe");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

/* ── Data-loading (lazy) ─────────────────────────────────── */
let _passengerCars = null;
let _commercialVehicles = null;
let _motorbikes = null;
let _manufacturers = null;
let _models = null;

function loadFile(filename, parser) {
  const fp = path.join(TECDOC_DIR, filename);
  if (!fs.existsSync(fp)) {
    console.warn(`  ⚠️ Missing TecDoc file: ${filename}`);
    return [];
  }
  const lines = fs.readFileSync(fp, "utf-8").trim().split("\n");
  console.log(`  📂 ${filename}: ${lines.length.toLocaleString()} lines`);
  return lines.map(parser).filter(Boolean);
}

const BRAND_ALIASES = {
  "VW": "VOLKSWAGEN",
  "VAG": "VOLKSWAGEN",
  "MERCE": "MERCEDESBENZ",
  "MERCEDES BENZ": "MERCEDESBENZ",
  "MERCEDES-BENZ": "MERCEDESBENZ",
  "OPEL": "OPEL",
  "VAUXHALL": "OPEL",
  "CHEVY": "CHEVROLET",
  "CHEV": "CHEVROLET",
  "GMC": "GENERALMOTORS",
  "GM": "GENERALMOTORS",
  "MB": "MERCEDESBENZ",
  "BMW": "BMW",
  "AUDI": "AUDI",
  "FORD": "FORD",
  "TOYOTA": "TOYOTA",
  "NISSAN": "NISSAN",
  "HONDA": "HONDA",
  "HYUNDAI": "HYUNDAI",
  "KIA": "KIA",
  "MAZDA": "MAZDA",
  "SUBARU": "SUBARU",
  "SUZUKI": "SUZUKI",
  "MITSUBISHI": "MITSUBISHI",
  "PEUGEOT": "PEUGEOT",
  "CITROEN": "CITROEN",
  "RENAULT": "RENAULT",
  "FIAT": "FIAT",
  "ALFA ROMEO": "ALFAROMEO",
  "ALFA": "ALFAROMEO",
  "LANCIA": "LANCIA",
  "VOLVO": "VOLVO",
  "SAAB": "SAAB",
  "JAGUAR": "JAGUAR",
  "LAND ROVER": "LANDROVER",
  "PORSCHE": "PORSCHE",
  "MINI": "MINI",
  "SMART": "SMART",
  "SEAT": "SEAT",
  "SKODA": "SKODA",
};

function normalizeBrand(brand) {
  if (!brand) return "";
  const raw = brand
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\-/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return BRAND_ALIASES[raw] || raw;
}

function normalizeModel(model) {
  if (!model) return "";
  return model
    .toUpperCase()
    .replace(/[^A-Z0-9\s\/\-]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChassisCodes(text) {
  if (!text) return [];
  const codes = [];
  // E90, W204, B8, 5G1, 8K2, etc.
  const m = text.match(/\b([A-Z]\d{2,4}[A-Z]?)\b/g);
  if (m) codes.push(...m);
  // Also match roman numerals like VII, VIII, VI
  const roman = text.match(/\b(V?I{1,3}|IV|VI{1,3}|IX|X{1,3})\b/gi);
  if (roman) codes.push(...roman.map((r) => r.toUpperCase()));
  return codes;
}

function modelTokens(model) {
  const norm = normalizeModel(model);
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 1);
  const chassis = extractChassisCodes(model);
  return { tokens: new Set(tokens), chassis: new Set(chassis) };
}

function tokenOverlap(a, b) {
  const sa = new Set(a.split(/\s+/).filter((t) => t.length >= 2));
  const sb = new Set(b.split(/\s+/).filter((t) => t.length >= 2));
  let common = 0;
  for (const t of sa) if (sb.has(t)) common++;
  const total = Math.max(sa.size, sb.size);
  return total > 0 ? common / total : 0;
}

function loadPassengerCars() {
  if (_passengerCars) return _passengerCars;
  _passengerCars = loadFile("passengercars.csv", (line) => {
    const cols = line.split("\t");
    if (cols.length < 10) return null;
    return {
      id: cols[0],
      ktype: parseInt(cols[1], 10) || 0,
      model_id: cols[2],
      brand: normalizeBrand(cols[3]),
      man_id: cols[4],
      date_from: cols[5],
      date_to: cols[6] || "0000-00-00",
      engine: cols[7] || "",
      model_name: cols[8] || "",
      full_model_name: cols[9] || "",
      flag: cols[10] || "",
      source: "passenger",
    };
  });
  return _passengerCars;
}

function loadCommercialVehicles() {
  if (_commercialVehicles) return _commercialVehicles;
  // commercialvehicles.csv: id, ktype, model_id, ?, man_id, date_from, date_to, ?, model_name, flag
  // Ingen brand-kolonne; brand via models.csv → manufacturers.csv
  const models = loadFile("models.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 3) return null;
    return { model_id: c[0], man_id: c[1], model_name: c[4] || "" };
  });
  const modelMap = new Map(models.map((m) => [m.model_id, m]));

  const manufacturers = loadFile("manufacturers.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 4) return null;
    return { man_id: c[0], brand_code: c[1], brand_name: c[3] || "" };
  });
  const manMap = new Map(manufacturers.map((m) => [m.man_id, m]));

  _commercialVehicles = loadFile("commercialvehicles.csv", (line) => {
    const cols = line.split("\t");
    if (cols.length < 9) return null;
    const model_id = cols[2];
    const man_id = cols[4];
    const modelInfo = modelMap.get(model_id);
    const manInfo = manMap.get(man_id);
    const brand = manInfo ? normalizeBrand(manInfo.brand_name) : "";
    const model_name = cols[8] || (modelInfo ? modelInfo.model_name : "");
    return {
      id: cols[0],
      ktype: parseInt(cols[1], 10) || 0,
      model_id,
      brand,
      man_id,
      date_from: cols[5],
      date_to: cols[6] || "0000-00-00",
      engine: "",
      model_name,
      full_model_name: model_name,
      flag: cols[9] || "",
      source: "commercial",
    };
  });
  return _commercialVehicles;
}

function loadMotorbikes() {
  if (_motorbikes) return _motorbikes;
  _motorbikes = loadFile("motorbikes.csv", (line) => {
    const cols = line.split("\t");
    if (cols.length < 10) return null;
    return {
      id: cols[0],
      ktype: parseInt(cols[1], 10) || 0,
      model_id: cols[2],
      brand: normalizeBrand(cols[3]),
      man_id: cols[4],
      date_from: cols[5],
      date_to: cols[6] || "0000-00-00",
      engine: cols[7] || "",
      model_name: cols[8] || "",
      full_model_name: cols[9] || "",
      flag: cols[10] || "",
      source: "motorbike",
    };
  });
  return _motorbikes;
}

/* ── Resolver core ───────────────────────────────────────── */
function extractYear(dateStr) {
  if (!dateStr || dateStr === "0000-00-00") return null;
  const m = dateStr.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function yearInRange(year, fromStr, toStr) {
  const from = extractYear(fromStr);
  const to = extractYear(toStr);
  if (!from) return true; // unknown start = inclusive
  if (year < from - 1) return false;
  if (!to || to === 0) return true; // still in production
  return year <= to + 1;
}

function scoreCandidate(product, candidate) {
  let score = 0;
  const reasons = [];

  // Brand match (viktigst)
  if (product.brand && candidate.brand) {
    const pb = normalizeBrand(product.brand);
    const cb = normalizeBrand(candidate.brand);
    if (pb === cb) {
      score += 0.4;
      reasons.push("exact brand match");
    } else if (cb.includes(pb) || pb.includes(cb)) {
      score += 0.2;
      reasons.push("partial brand match");
    }
  }

  // Model match
  if (product.model && candidate.model_name) {
    const pm = modelTokens(product.model);
    const cm = modelTokens(candidate.model_name);

    // Token overlap
    let commonTokens = 0;
    for (const t of pm.tokens) if (cm.tokens.has(t)) commonTokens++;
    const tokenOverlap = Math.max(pm.tokens.size, cm.tokens.size) > 0
      ? commonTokens / Math.max(pm.tokens.size, cm.tokens.size)
      : 0;

    // Chassis code overlap
    let commonChassis = 0;
    for (const c of pm.chassis) if (cm.chassis.has(c)) commonChassis++;
    const chassisOverlap = pm.chassis.size > 0
      ? commonChassis / pm.chassis.size
      : 0;

    if (chassisOverlap >= 1 && pm.chassis.size > 0) {
      score += 0.35;
      reasons.push("exact chassis match");
    } else if (tokenOverlap >= 0.7) {
      score += 0.3;
      reasons.push("strong model match");
    } else if (tokenOverlap >= 0.4 || chassisOverlap > 0) {
      score += 0.15;
      reasons.push("moderate model match");
    } else if (tokenOverlap > 0) {
      score += 0.05;
      reasons.push("weak model match");
    }
  }

  // Year match
  if (product.year && candidate.date_from) {
    if (yearInRange(product.year, candidate.date_from, candidate.date_to)) {
      score += 0.2;
      reasons.push("year compatible");
    } else {
      score -= 0.1;
      reasons.push("year mismatch");
    }
  }

  // Source bonus (passenger cars = most common)
  if (candidate.source === "passenger") {
    score += 0.05;
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function resolve(product, opts = {}) {
  const { topN = 5, minScore = 0.15 } = opts;

  console.log(`\n🔍 Resolving: ${product.brand || "?"} ${product.model || "?"} ${product.year || ""}`);
  console.log(`   Description: ${product.description || "(none)"}`);

  const t0 = Date.now();
  const all = [
    ...loadPassengerCars(),
    ...loadCommercialVehicles(),
    ...loadMotorbikes(),
  ];
  console.log(`   Searching ${all.length.toLocaleString()} TecDoc records...`);

  const scored = all
    .map((c) => ({ ...c, ...scoreCandidate(product, c) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN * 3); // ta flere for dedup

  // Dedup på kType — behold beste score per kType
  const seenKtype = new Map();
  for (const c of scored) {
    if (!seenKtype.has(c.ktype) || seenKtype.get(c.ktype).score < c.score) {
      seenKtype.set(c.ktype, c);
    }
  }

  const results = Array.from(seenKtype.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const elapsed = Date.now() - t0;
  console.log(`   ⏱️  ${elapsed}ms | ${results.length} candidates`);

  if (results.length === 0) {
    console.log("   ❌ No candidates found");
    return {
      status: "no_match",
      product,
      candidates: [],
      explanation: "No TecDoc records matched the given brand/model/year.",
    };
  }

  for (const r of results) {
    const yearStr = `${extractYear(r.date_from) || "?"}-${extractYear(r.date_to) || "?"}`;
    console.log(
      `   ✅ kType=${r.ktype} | score=${r.score.toFixed(2)} | ${r.brand} ${r.model_name} (${yearStr}) | ${r.reasons.join(", ")}`
    );
  }

  const best = results[0];
  const confidence = best.score;

  return {
    status: confidence >= 0.7 ? "resolved" : confidence >= 0.4 ? "ambiguous" : "weak",
    product,
    best_ktype: best.ktype,
    confidence,
    candidates: results.map((r) => ({
      ktype: r.ktype,
      brand: r.brand,
      model: r.model_name,
      year_from: extractYear(r.date_from),
      year_to: extractYear(r.date_to),
      score: r.score,
      reasons: r.reasons,
      source: r.source,
    })),
    explanation:
      confidence >= 0.7
        ? "Strong match found"
        : confidence >= 0.4
          ? "Multiple candidates; review required"
          : "Weak signal; insufficient data for reliable kType",
  };
}

/* ── CLI ─────────────────────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);

  // Test-caser fra vår katalog
  const testProducts = [
    { brand: "VOLKSWAGEN", model: "GOLF VII", year: 2015, description: "VW GOLF VII FRONTRUTE" },
    { brand: "BMW", model: "3 SERIES", year: 2012, description: "BMW 3 SERIES E90 DØRGLASS" },
    { brand: "FORD", model: "MUSTANG", year: 2020, description: "FORD MUSTANG FRONTRUTE" },
    { brand: "MERCEDES-BENZ", model: "C CLASS", year: 2015, description: "MERCEDES C-CLASS W204 SIDEGLASS" },
    { brand: "AUDI", model: "A4", year: 2010, description: "AUDI A4 B8 FRONTRUTE ADAS" },
  ];

  console.log("========================================");
  console.log("  TecDoc Resolver Prototype");
  console.log("========================================");

  const allResults = [];
  for (const p of testProducts) {
    const r = resolve(p, { topN: 5, minScore: 0.1 });
    allResults.push(r);
    console.log("");
  }

  // Lagre resultater
  fs.writeFileSync(
    path.join(OUT, "tecdoc-resolver-results.json"),
    JSON.stringify(allResults, null, 2),
    "utf-8"
  );
  console.log(`💾 Results saved to: data/autodoc-probe/tecdoc-resolver-results.json`);

  // CLI override
  if (args.length >= 2) {
    const brand = args[0];
    const model = args[1];
    const year = args[2] ? parseInt(args[2], 10) : null;
    const r = resolve({ brand, model, year });
    console.log(JSON.stringify(r, null, 2));
  }
}

main().catch(console.error);
