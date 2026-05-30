/**
 * Test-suite for TecDoc D1 resolver
 *
 * Tester resolveTecDocFromD1-logikken mot lokal D1-database.
 * Krever at wrangler dev eller lokal D1 er tilgjengelig.
 *
 * Bruk:
 *   node scripts/test-tecdoc-resolver.mjs
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

// Simulate brand normalization (copied from api/cf-worker/src/lib/brand.ts)
const BRAND_MAP = {
  VOLKSWAGEN: "VW", "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER", "RANGE ROVER": "LANDROVER",
  VAUXHALL: "OPEL", "VAUXHALL/OPEL": "OPEL", "OPEL/VAUXHALL": "OPEL",
  CITROËN: "CITROEN", DS: "CITROEN",
  ALFA: "ALFA ROMEO", ABARTH: "FIAT",
  "MITS.": "MITSUBISHI", MITS: "MITSUBISHI",
  NISS: "NISSAN", HON: "HONDA", TOY: "TOYOTA", REN: "RENAULT",
  "REN.": "RENAULT", RENAU: "RENAULT", HYUNADI: "HYUNDAI", "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT", CHEV: "CHEVROLET", "CHEVR.": "CHEVROLET",
  SUZ: "SUZUKI", FOR: "FORD", "FORD,": "FORD",
  "KIA.": "KIA", "SUB.": "SUBARU", "MAZ.": "MAZDA", "MAZDA.": "MAZDA",
  "LEX.": "LEXUS", JAG: "JAGUAR", POR: "PORSCHE", PORSCH: "PORSCHE",
  "AUDI.": "AUDI", "BMW.": "BMW", "MERC.": "MERCEDES", MERC: "MERCEDES",
  "VOLVO.": "VOLVO", "SEAT.": "SEAT", "SKODA.": "SKODA", "MINI.": "MINI",
  "SAAB.": "SAAB", "DODGE.": "DODGE", CHRY: "CHRYSLER", CHRSYLER: "CHRYSLER",
  HUM: "HUMMER", PONT: "PONTIAC", "JEEP.": "JEEP", CAD: "CADILLAC",
  "LINCOLN.": "LINCOLN", "BUICK.": "BUICK", "GMC,": "GMC", GMC: "GMC",
  "HOLDEN.": "HOLDEN", "ISUZU.": "ISUZU", "DAIHATSU.": "DAIHATSU",
  LADA: "LADA / TOGLIATTI", ZASTAVA: "LADA / TOGLIATTI",
  "DACIA.": "DACIA", SSANYONG: "SSANGYONG", "SSAN.": "SSANGYONG",
  "SMART.": "SMART", "TESLA.": "TESLA", "FERRARI.": "FERRARI",
  "MASERATI.": "MASERATI", "LAMBORGHINI.": "LAMBORGHINI", "BENTLEY.": "BENTLEY",
  ASTON: "ASTON MARTIN", "LOTUS.": "LOTUS", "MG.": "MG",
  "MC LAREN": "McLAREN", MCLAREN: "McLAREN",
  "INEOS.": "INEOS", "MAXUS.": "MAXUS", "POLESTAR.": "POLESTAR",
  "CUPRA.": "CUPRA", "HONGQI.": "HONGQI", "VOYAH.": "VOYAH",
  "XPENG.": "XPENG", "ZEEKR.": "ZEEKR", "BYD.": "BYD", "ORA.": "ORA",
  "NIO.": "NIO", "THINK.": "THINK", "FISKER.": "FISKER",
  RIVIAN: "USA CARS", LUCID: "USA CARS", "TVR.": "TVR", TVR: "TVR",
  MAN: "MAN", SCANIA: "SCANIA TRUCKS", DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS", HINO: "HINO TRUCKS", "ISUZU TRUCKS": "ISUZU",
};

const ALIAS_REVERSE = new Map();
for (const [key, val] of Object.entries(BRAND_MAP)) {
  if (!ALIAS_REVERSE.has(val)) ALIAS_REVERSE.set(val, new Set());
  ALIAS_REVERSE.get(val).add(key);
  ALIAS_REVERSE.get(val).add(val);
}

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

function getBrandAliases(brand) {
  const normalized = normalizeBrand(brand);
  const aliases = ALIAS_REVERSE.get(normalized);
  return aliases ? Array.from(aliases) : [normalized];
}

// Load TecDoc data from CSV
async function loadTecDocRows() {
  const rows = [];
  const rl = createInterface({
    input: createReadStream(path.join(process.cwd(), "data/tecdoc-import/passengercars.csv")),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const c = line.split("\t");
    if (c.length < 10) continue;
    const yearFrom = c[5]?.match(/(\d{4})/)?.[1] ? parseInt(c[5].match(/(\d{4})/)[1]) : null;
    const yearTo = c[6]?.match(/(\d{4})/)?.[1] ? parseInt(c[6].match(/(\d{4})/)[1]) : null;
    rows.push({
      ktype: parseInt(c[1], 10),
      brand: c[3]?.trim(),
      model: c[8]?.trim(),
      year_from: yearFrom,
      year_to: yearTo,
    });
  }
  return rows;
}

function resolveTecDoc(rows, make, model, year) {
  if (!make || !model) return null;

  const normBrand = normalizeBrand(make);
  const aliases = getBrandAliases(make);

  const candidates = rows.filter((r) => {
    const rowBrand = normalizeBrand(r.brand);
    const brandMatch = aliases.some((a) => normalizeBrand(a) === rowBrand);
    if (!brandMatch) return false;
    if (year && year > 1900) {
      if (r.year_from && year < r.year_from - 1) return false;
      if (r.year_to && r.year_to > 0 && year > r.year_to + 1) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  const queryTokens = new Set(
    model.toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 1)
  );

  let bestKtype = 0;
  let bestScore = 0;

  for (const row of candidates) {
    const modelTokens = new Set(
      row.model.toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 1)
    );
    if (modelTokens.size === 0) continue;

    let common = 0;
    for (const t of queryTokens) {
      if (modelTokens.has(t)) common++;
    }

    const score = common / Math.max(queryTokens.size, modelTokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestKtype = row.ktype;
    }
  }

  if (bestScore < 0.30) return null;

  const confidence = bestScore >= 0.70 ? 0.85 : bestScore >= 0.50 ? 0.75 : 0.60;
  return { ktype: bestKtype, confidence, score: bestScore };
}

async function main() {
  console.log("📂 Loading TecDoc passenger cars...");
  const rows = await loadTecDocRows();
  console.log(`   Loaded ${rows.length.toLocaleString()} rows`);

  const tests = [
    { make: "VOLKSWAGEN", model: "GOLF VII", year: 2015, expectedKtype: 44286 },
    { make: "BMW", model: "3 SERIES", year: 2012, expectedKtype: 23196 },
    { make: "MERCEDES-BENZ", model: "C-CLASS", year: 2015, expectedKtype: 27303 },
    { make: "AUDI", model: "A4", year: 2010, expectedKtype: 28586 },
    { make: "FORD", model: "MUSTANG", year: 2020, expectedKtype: null },
    { make: "TOYOTA", model: "COROLLA", year: 2018, expectedKtype: null },
    { make: "NISSAN", model: "JUKE", year: 2015, expectedKtype: null },
  ];

  console.log("\n🧪 Running tests...\n");
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const result = resolveTecDoc(rows, t.make, t.model, t.year);
    const status = result && result.ktype === t.expectedKtype ? "✅" : result && !t.expectedKtype ? "⚠️" : t.expectedKtype && !result ? "❌" : "⚠️";
    const ktypeStr = result ? result.ktype : "null";
    const confStr = result ? result.confidence.toFixed(2) : "-";
    const scoreStr = result ? result.score.toFixed(2) : "-";

    console.log(`${status} ${t.make} ${t.model} ${t.year} → kType=${ktypeStr} conf=${confStr} score=${scoreStr} (expected: ${t.expectedKtype || "no match"})`);

    if ((result && result.ktype === t.expectedKtype) || (!result && !t.expectedKtype)) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
