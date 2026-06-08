#!/usr/bin/env node
/**
 * build-ktype-families.mjs
 * ========================
 * Grupperer TecDoc ktype_registry-kTyper i "families" basert på
 * renset modellnavn (samme karosseri = samme glass).
 *
 * Strategy:
 * 1. Les ktype_registry fra D1 i chunks
 * 2. For hver rad: normaliser brand, rense modell (fjern motor/body/drivverk)
 * 3. Grupper kTyper med samme (canonical_brand, canonical_model)
 * 4. Beregn year_from/year_to per family
 * 5. Insert families + family_members til D1 i batches
 *
 * Usage: node scripts/build-ktype-families.mjs
 */

import { execSync } from "child_process";

// ── Brand normalization (duplicated from brand.ts) ───────────
const BRAND_MAP = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER",
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
  CHEVROLET: "CHEVROLET",
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
  KEWET: "KEWET",
  AIXAM: "AIXAM",
  AIWAYS: "AIWAYS",
  "DFSK (SERES)": "DFSK (SERES)",
  DONGFENG: "DONGFENG",
  EXLANTIX: "EXLANTIX",
  "JAC (CH)": "JAC (CH)",
  "LYNK & CO": "LYNK & CO",
  MAN: "MAN",
  SCANIA: "SCANIA TRUCKS",
  DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS",
  HINO: "HINO TRUCKS",
  "ISUZU TRUCKS": "ISUZU",
};

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

// ── Model cleaning ────────────────────────────────────────────
// Tokens to remove from TecDoc model strings (body, drivetrain, transmission)
const NOISE_TOKENS = new Set([
  // Body types
  "COUPE", "SALOON", "ESTATE", "HATCHBACK", "CONVERTIBLE", "CABRIOLET",
  "ROADSTER", "SPIDER", "TARGA", "FASTBACK", "SPORTBACK", "SHOOTING",
  "BRAKE", "SW", "WAGON", "VAN", "KASSEVOGN", "VAREBIL", "MINIVAN", "MPV",
  "SUV", "CROSSOVER", "OFFROAD", "OFF-ROAD", "PICKUP", "PICK-UP",
  "CHASSIS", "FLATBED", "TIPP", "TIPPER", "DUMP", "PLATFORM", "BOX",
  "PANEL", "COMBI", "KOMBI", "STASJONSVOGN", "LASTEVOGN", "LASTEBIL",
  "BUSS", "VOGN", "SOFTTOP", "SOFT/TOP", "HARDTOP", "HARD/TOP", "ST",
  // Door counts
  "3D", "4D", "5D", "2D", "3DR", "4DR", "5DR", "2DR", "3-DOOR", "4-DOOR",
  "5-DOOR", "2-DOOR", "DOOR", "DOORS",
  // Transmission
  "AUTOMATIC", "AUTO", "MANUAL", "MAN", "TIPTRONIC", "DSG", "CVT",
  "STEPTRONIC", "X-DRIVE", "XDRIVE",
  // Drivetrain
  "QUATTRO", "4MATIC", "4-MATIC", "4X4", "4WD", "AWD", "RWD", "FWD",
  // Misc
  "AUTOMOBILES", "CARS", "VANS", "HBK", "SED", "CAB", "WAG", "AFMKT",
  "NO", "RAM", "CLASS", "SERIES",
]);

// Engine-related patterns to remove as tokens
function isEngineToken(token) {
  // Pure decimal numbers like 2.2, 3.4, 5.7 (engine displacement)
  if (/^\d+\.\d+$/.test(token)) return true;
  // Engine codes: V6, V8, V12, V10, L4, L6, I4, I6
  if (/^[VLI]\d{1,2}$/i.test(token)) return true;
  // Turbo/super: TDI, TSI, FSI, CDI, HDI, DCI, TCE, GDI, MPI, TFSI
  if (/^(TDI|TSI|FSI|CDI|HDI|DCI|TCE|GDI|MPI|TFSI|TWINAIR|MULTIJET|JTDM|JTD|HPI|SPI|VVTI|VVT-I|D-4D|D4D|D-CAT|DCAT|I-DTEC|IDTEC|CDTI|TDCI|SDI|XDI|E-TEC|ETEC|ECOTEC|ECOBOOST|SKYACTIV|MIVEC|VTEC|I-VTEC|IVTEC)$/i.test(token)) return true;
  // Single-letter engine indicators: D (diesel), TD, T
  if (/^(D|TD|T)$/i.test(token)) return true;
  return false;
}

/**
 * Clean a TecDoc model string into a family key.
 * Input:  "CHEVROLET ALERO 2.4 16V"
 * Output: "ALERO"
 * Input:  "FORD USA F-350 Standard Cab Pickup 4.9"
 * Output: "F-350"
 */
function cleanModel(tectocModel, tecdocBrand) {
  let text = (tectocModel || "").toUpperCase().trim();

  // Remove brand prefix if present at start
  // TecDoc models often include brand: "CHEVROLET ALERO ..."
  const brandPrefix = (tecdocBrand || "").toUpperCase().trim();
  if (brandPrefix && text.startsWith(brandPrefix + " ")) {
    text = text.slice(brandPrefix.length + 1).trim();
  }
  // Also try without the normalized brand
  const normBrand = normalizeBrand(tecdocBrand);
  if (normBrand && normBrand !== brandPrefix && text.startsWith(normBrand + " ")) {
    text = text.slice(normBrand.length + 1).trim();
  }
  // Special case: "FORD USA F-350 ..." → remove "FORD USA"
  if (text.startsWith("FORD USA ")) {
    text = text.slice(9).trim();
  }
  if (text.startsWith("FORD ")) {
    text = text.slice(5).trim();
  }
  // "CHEVROLET ..." → remove
  if (text.startsWith("CHEVROLET ")) {
    text = text.slice(11).trim();
  }

  // Remove parenthetical content: (FP_), (B_), etc.
  text = text.replace(/\s*\([^)]*\)\s*/g, " ");

  // Split into tokens and filter
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const kept = [];

  for (const token of tokens) {
    // Skip pure noise
    if (NOISE_TOKENS.has(token)) continue;
    // Skip engine tokens
    if (isEngineToken(token)) continue;
    // Keep everything else (including generation numbers like II, III, B8, W204)
    kept.push(token);
  }

  return kept.join(" ").trim();
}

// ── D1 fetch helpers ──────────────────────────────────────────
function d1Query(sql) {
  const cmd = `cd /Users/taj/bilglass/api/cf-worker && wrangler d1 execute glass-catalog-db --remote --command="${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  return out;
}

function d1File(file) {
  const cmd = `cd /Users/taj/bilglass/api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file="${file}"`;
  const out = execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  return out;
}

// ── Main ──────────────────────────────────────────────────────
console.log("🔧 build-ktype-families.mjs — grupperer TecDoc-kTyper i families\n");

// Step 1: Fetch all ktype_registry rows
console.log("📥 Henter ktype_registry fra D1...");
const allRows = [];
let offset = 0;
const CHUNK = 5000;

while (true) {
  const sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry ORDER BY ktype LIMIT ${CHUNK} OFFSET ${offset}`;
  const out = d1Query(sql);

  // Parse results from wrangler JSON output
  const matches = out.matchAll(/"ktype":\s*(\d+).*?"brand":\s*"([^"]*)".*?"model":\s*"([^"]*)".*?"year_from":\s*(\d+|null).*?"year_to":\s*(\d+|null)/gs);
  const chunkRows = [];
  for (const m of matches) {
    chunkRows.push({
      ktype: parseInt(m[1], 10),
      brand: m[2],
      model: m[3],
      year_from: m[4] === "null" ? null : parseInt(m[4], 10),
      year_to: m[5] === "null" ? null : parseInt(m[5], 10),
    });
  }

  if (chunkRows.length === 0) break;
  allRows.push(...chunkRows);
  offset += CHUNK;
  process.stdout.write(`  ${allRows.length} rader...\r`);
}

console.log(`\n✅ Hentet ${allRows.length} rader fra ktype_registry`);

// Step 2: Build families
console.log("\n🏗️  Bygger families...");
const families = new Map(); // key → { canonical_brand, canonical_model, ktypes: [], year_from, year_to }

for (const row of allRows) {
  const canonicalBrand = normalizeBrand(row.brand);
  const canonicalModel = cleanModel(row.model, row.brand);

  if (!canonicalModel) {
    // Model cleaned to nothing — skip (usually just an engine spec with no model name)
    continue;
  }

  const key = `${canonicalBrand}::${canonicalModel}`;
  const existing = families.get(key);

  if (existing) {
    existing.ktypes.push({
      ktype: row.ktype,
      tecdoc_brand: row.brand,
      tecdoc_model: row.model,
      tecdoc_year_from: row.year_from,
      tecdoc_year_to: row.year_to,
    });
    if (row.year_from !== null) {
      existing.year_from = Math.min(existing.year_from, row.year_from);
    }
    if (row.year_to !== null) {
      existing.year_to = Math.max(existing.year_to, row.year_to);
    }
  } else {
    families.set(key, {
      canonical_brand: canonicalBrand,
      canonical_model: canonicalModel,
      ktypes: [{
        ktype: row.ktype,
        tecdoc_brand: row.brand,
        tecdoc_model: row.model,
        tecdoc_year_from: row.year_from,
        tecdoc_year_to: row.year_to,
      }],
      year_from: row.year_from ?? 9999,
      year_to: row.year_to ?? 0,
    });
  }
}

console.log(`✅ Bygget ${families.size} families fra ${allRows.length} kTyper`);

// Stats
let singleKtype = 0;
let multiKtype = 0;
let maxKtypes = 0;
for (const f of families.values()) {
  if (f.ktypes.length === 1) singleKtype++;
  else multiKtype++;
  maxKtypes = Math.max(maxKtypes, f.ktypes.length);
}
console.log(`   ${singleKtype} families med 1 kType, ${multiKtype} families med 2+ kTyper (max ${maxKtypes})`);

// Step 3: Write families to D1
console.log("\n💾 Skriver families til D1...");

const familyList = Array.from(families.values());
const familySqlChunks = [];
let currentFamilyChunk = [];

for (const f of familyList) {
  const sql = `INSERT INTO ktype_families (canonical_brand, canonical_model, year_from, year_to, ktype_count) VALUES ('${f.canonical_brand.replace(/'/g, "''")}', '${f.canonical_model.replace(/'/g, "''")}', ${f.year_from === 9999 ? "NULL" : f.year_from}, ${f.year_to === 0 ? "NULL" : f.year_to}, ${f.ktypes.length});`;
  currentFamilyChunk.push(sql);

  if (currentFamilyChunk.length >= 50) {
    familySqlChunks.push(currentFamilyChunk.join("\n"));
    currentFamilyChunk = [];
  }
}
if (currentFamilyChunk.length > 0) {
  familySqlChunks.push(currentFamilyChunk.join("\n"));
}

// We need family_ids for members, so we can't batch families+members together.
// Instead, use SQLite's last_insert_rowid() approach or just insert families
// then query them back to get IDs.
// Simpler: write families, get max id, then write members.

// Clear existing families first (in case of re-run)
console.log("   Tømmer eksisterende families...");
d1Query("DELETE FROM ktype_family_members; DELETE FROM ktype_families;");

// Write families one by one to get IDs
// Actually, for performance let's write in chunks and use a different approach:
// Since SQLite auto-increment is sequential, we can track the next ID.
console.log("   Skriver families i batches...");
let nextFamilyId = 1;
for (let i = 0; i < familySqlChunks.length; i++) {
  const chunkFile = `/tmp/family-chunk-${String(i).padStart(3, "0")}.sql`;
  const fs = await import("fs");
  fs.writeFileSync(chunkFile, familySqlChunks[i]);
  d1File(chunkFile);
  process.stdout.write(`  Batch ${i + 1}/${familySqlChunks.length}...\r`);
}

// Get the actual family IDs by querying back
console.log("\n   Henter family IDs...");
const familyIdMap = new Map(); // key → id
const idQuery = `SELECT id, canonical_brand, canonical_model FROM ktype_families ORDER BY id`;
const idOut = d1Query(idQuery);
const idMatches = idOut.matchAll(/"id":\s*(\d+).*?"canonical_brand":\s*"([^"]*)".*?"canonical_model":\s*"([^"]*)"/gs);
for (const m of idMatches) {
  const key = `${m[2]}::${m[3]}`;
  familyIdMap.set(key, parseInt(m[1], 10));
}
console.log(`   ✅ ${familyIdMap.size} families med IDs`);

// Step 4: Write family members
console.log("\n💾 Skriver family_members...");
const memberSqlChunks = [];
let currentMemberChunk = [];

for (const [key, family] of families) {
  const familyId = familyIdMap.get(key);
  if (!familyId) {
    console.warn(`   ⚠️  Missing family_id for ${key}`);
    continue;
  }

  for (const kt of family.ktypes) {
    const sql = `INSERT INTO ktype_family_members (family_id, ktype, tecdoc_brand, tecdoc_model, tecdoc_year_from, tecdoc_year_to) VALUES (${familyId}, ${kt.ktype}, '${(kt.tecdoc_brand || "").replace(/'/g, "''")}', '${(kt.tecdoc_model || "").replace(/'/g, "''")}', ${kt.tecdoc_year_from ?? "NULL"}, ${kt.tecdoc_year_to ?? "NULL"});`;
    currentMemberChunk.push(sql);

    if (currentMemberChunk.length >= 50) {
      memberSqlChunks.push(currentMemberChunk.join("\n"));
      currentMemberChunk = [];
    }
  }
}
if (currentMemberChunk.length > 0) {
  memberSqlChunks.push(currentMemberChunk.join("\n"));
}

const fs = await import("fs");
for (let i = 0; i < memberSqlChunks.length; i++) {
  const chunkFile = `/tmp/member-chunk-${String(i).padStart(3, "0")}.sql`;
  fs.writeFileSync(chunkFile, memberSqlChunks[i]);
  d1File(chunkFile);
  process.stdout.write(`  Batch ${i + 1}/${memberSqlChunks.length}...\r`);
}

console.log(`\n\n🎉 FERDIG!`);
console.log(`   ${families.size} families opprettet`);
console.log(`   ${allRows.length} kType-medlemskap lagret`);
