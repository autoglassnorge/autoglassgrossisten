#!/usr/bin/env node
/**
 * build-ktype-families-sql.mjs
 * ============================
 * Grupperer TecDoc ktype_registry-kTyper i families og genererer SQL-fil.
 * SQL-filen kjøres MANUELT med wrangler d1 execute --file.
 *
 * Usage: node scripts/build-ktype-families-sql.mjs > /tmp/families.sql
 *        cd api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file=/tmp/families.sql
 */

import { execSync } from "child_process";
import * as fs from "fs";

// ── Brand normalization ──────────────────────────────────────
const BRAND_MAP = {
  VOLKSWAGEN: "VW", "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER", CITROËN: "CITROEN", DS: "CITROEN",
  ALFA: "ALFA ROMEO", ABARTH: "FIAT", "LAMBORGH.": "LAMBORGHINI",
  "MITS.": "MITSUBISHI", MITS: "MITSUBISHI", NISS: "NISSAN", NISSA: "NISSAN",
  HON: "HONDA", TOY: "TOYOTA", TOYOT: "TOYOTA", REN: "RENAULT",
  "REN.": "RENAULT", RENAU: "RENAULT", HYUNADI: "HYUNDAI", "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT", PEUGE: "PEUGEOT", CHEV: "CHEVROLET", CHEVR: "CHEVROLET",
  "CHEVR.": "CHEVROLET", CHEVROLET: "CHEVROLET", DAEWOO: "DAEWOO (CHEVROLET)",
  SUZ: "SUZUKI", FOR: "FORD", "FORD,": "FORD", FORDA: "FORD",
  "KIA.": "KIA", "SUB.": "SUBARU", "MAZ.": "MAZDA", "MAZDA.": "MAZDA",
  "LEX.": "LEXUS", JAG: "JAGUAR", POR: "PORSCHE", PORSCH: "PORSCHE",
  "AUDI.": "AUDI", "BMW.": "BMW", "MERC.": "MERCEDES", MERC: "MERCEDES",
  MERCE: "MERCEDES", "VOLVO.": "VOLVO", "SEAT.": "SEAT", "SKODA.": "SKODA",
  "MINI.": "MINI", "SAAB.": "SAAB", "DODGE.": "DODGE", CHRY: "CHRYSLER",
  CHRSYLER: "CHRYSLER", HUM: "HUMMER", PONT: "PONTIAC", "JEEP.": "JEEP",
  CAD: "CADILLAC", "LINCOLN.": "LINCOLN", "BUICK.": "BUICK", "GMC,": "GMC",
  GMC: "GMC", "HOLDEN.": "HOLDEN", HOLDE: "HOLDEN", "ISUZU.": "ISUZU",
  "DAIHATSU.": "DAIHATSU", LADA: "LADA / TOGLIATTI", ZASTAVA: "LADA / TOGLIATTI",
  "DACIA.": "DACIA", SSANYONG: "SSANGYONG", "SSAN.": "SSANGYONG",
  "SMART.": "SMART", "TESLA.": "TESLA", "FERRARI.": "FERRARI",
  "MASERATI.": "MASERATI", "LAMBORGHINI.": "LAMBORGHINI", "BENTLEY.": "BENTLEY",
  ASTON: "ASTON MARTIN", "LOTUS.": "LOTUS", "MG.": "MG", "ROVER.": "ROVER",
  "MC LAREN": "McLAREN", MCLAREN: "McLAREN", "INEOS.": "INEOS",
  "MAXUS.": "MAXUS", "POLESTAR.": "POLESTAR", "CUPRA.": "CUPRA",
  "HONGQI.": "HONGQI", "VOYAH.": "VOYAH", "XPENG.": "XPENG",
  "ZEEKR.": "ZEEKR", "BYD.": "BYD", "ORA.": "ORA", "NIO.": "NIO",
  "THINK.": "THINK", "FISKER.": "FISKER", RIVIAN: "USA CARS", LUCID: "USA CARS",
  "TVR.": "TVR", TVR: "TVR", KEWET: "KEWET", AIXAM: "AIXAM",
  AIWAYS: "AIWAYS", "DFSK (SERES)": "DFSK (SERES)", DONGFENG: "DONGFENG",
  EXLANTIX: "EXLANTIX", "JAC (CH)": "JAC (CH)", "LYNK & CO": "LYNK & CO",
  MAN: "MAN", SCANIA: "SCANIA TRUCKS", DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS", HINO: "HINO TRUCKS", "ISUZU TRUCKS": "ISUZU",
};

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

// ── Model cleaning ────────────────────────────────────────────
const NOISE_TOKENS = new Set([
  "COUPE","SALOON","ESTATE","HATCHBACK","CONVERTIBLE","CABRIOLET",
  "ROADSTER","SPIDER","TARGA","FASTBACK","SPORTBACK","SHOOTING",
  "BRAKE","SW","WAGON","VAN","KASSEVOGN","VAREBIL","MINIVAN","MPV",
  "SUV","CROSSOVER","OFFROAD","OFF-ROAD","PICKUP","PICK-UP",
  "CHASSIS","FLATBED","TIPP","TIPPER","DUMP","PLATFORM","BOX",
  "PANEL","COMBI","KOMBI","STASJONSVOGN","LASTEVOGN","LASTEBIL",
  "BUSS","VOGN","SOFTTOP","SOFT/TOP","HARDTOP","HARD/TOP","ST",
  "3D","4D","5D","2D","3DR","4DR","5DR","2DR","3-DOOR","4-DOOR",
  "5-DOOR","2-DOOR","DOOR","DOORS",
  "AUTOMATIC","AUTO","MANUAL","MAN","TIPTRONIC","DSG","CVT",
  "STEPTRONIC","X-DRIVE","XDRIVE",
  "QUATTRO","4MATIC","4-MATIC","4X4","4WD","AWD","RWD","FWD",
  "AUTOMOBILES","CARS","VANS","HBK","SED","CAB","WAG","AFMKT",
  "NO","RAM","CLASS","SERIES",
]);

function isEngineToken(token) {
  if (/^\d+\.\d+$/.test(token)) return true;
  if (/^[VLI]\d{1,2}$/i.test(token)) return true;
  if (/^(TDI|TSI|FSI|CDI|HDI|DCI|TCE|GDI|MPI|TFSI|TWINAIR|MULTIJET|JTDM|JTD|HPI|SPI|VVTI|VVT-I|D-4D|D4D|D-CAT|DCAT|I-DTEC|IDTEC|CDTI|TDCI|SDI|XDI|E-TEC|ETEC|ECOTEC|ECOBOOST|SKYACTIV|MIVEC|VTEC|I-VTEC|IVTEC)$/i.test(token)) return true;
  if (/^(D|TD|T)$/i.test(token)) return true;
  return false;
}

function cleanModel(tectocModel, tecdocBrand) {
  let text = (tectocModel || "").toUpperCase().trim();
  const brandPrefix = (tecdocBrand || "").toUpperCase().trim();
  if (brandPrefix && text.startsWith(brandPrefix + " ")) {
    text = text.slice(brandPrefix.length + 1).trim();
  }
  const normBrand = normalizeBrand(tecdocBrand);
  if (normBrand && normBrand !== brandPrefix && text.startsWith(normBrand + " ")) {
    text = text.slice(normBrand.length + 1).trim();
  }
  if (text.startsWith("FORD USA ")) text = text.slice(9).trim();
  if (text.startsWith("FORD ")) text = text.slice(5).trim();
  if (text.startsWith("CHEVROLET ")) text = text.slice(11).trim();
  text = text.replace(/\s*\([^)]*\)\s*/g, " ");
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const kept = [];
  for (const token of tokens) {
    if (NOISE_TOKENS.has(token)) continue;
    if (isEngineToken(token)) continue;
    kept.push(token);
  }
  return kept.join(" ").trim();
}

// ── D1 fetch helper ───────────────────────────────────────────
function d1Query(sql) {
  const cmd = `cd /Users/taj/bilglass/api/cf-worker && wrangler d1 execute glass-catalog-db --remote --command="${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

// ── Main ──────────────────────────────────────────────────────
console.error("🔧 build-ktype-families-sql.mjs — genererer SQL-fil\n");

// Step 1: Fetch all ktype_registry rows
console.error("📥 Henter ktype_registry fra D1...");
const allRows = [];
let offset = 0;
const CHUNK = 5000;

while (true) {
  const sql = `SELECT ktype, brand, model, year_from, year_to FROM ktype_registry ORDER BY ktype LIMIT ${CHUNK} OFFSET ${offset}`;
  const out = d1Query(sql);
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
  process.stderr.write(`  ${allRows.length} rader...\r`);
}

console.error(`\n✅ Hentet ${allRows.length} rader`);

// Step 2: Build families
console.error("🏗️  Bygger families...");
const families = new Map();

for (const row of allRows) {
  const canonicalBrand = normalizeBrand(row.brand);
  const canonicalModel = cleanModel(row.model, row.brand);
  if (!canonicalModel) continue;

  const key = `${canonicalBrand}::${canonicalModel}`;
  const existing = families.get(key);

  if (existing) {
    existing.ktypes.push({
      ktype: row.ktype, tecdoc_brand: row.brand, tecdoc_model: row.model,
      tecdoc_year_from: row.year_from, tecdoc_year_to: row.year_to,
    });
    if (row.year_from !== null) existing.year_from = Math.min(existing.year_from, row.year_from);
    if (row.year_to !== null) existing.year_to = Math.max(existing.year_to, row.year_to);
  } else {
    families.set(key, {
      canonical_brand: canonicalBrand, canonical_model: canonicalModel,
      ktypes: [{ ktype: row.ktype, tecdoc_brand: row.brand, tecdoc_model: row.model,
        tecdoc_year_from: row.year_from, tecdoc_year_to: row.year_to }],
      year_from: row.year_from ?? 9999, year_to: row.year_to ?? 0,
    });
  }
}

console.error(`✅ ${families.size} families bygget`);

// Step 3: Generate SQL
console.error("📝 Genererer SQL...");

const familyList = Array.from(families.values());

// Header
console.log("-- Auto-generated by build-ktype-families-sql.mjs");
console.log("-- Clears existing data first");
console.log("DELETE FROM ktype_family_members;");
console.log("DELETE FROM ktype_families;");
console.log("");

// Families: use multi-value INSERT for efficiency (100 per batch)
const BATCH_SIZE = 100;
for (let i = 0; i < familyList.length; i += BATCH_SIZE) {
  const batch = familyList.slice(i, i + BATCH_SIZE);
  const values = batch.map((f) => {
    const yf = f.year_from === 9999 ? "NULL" : f.year_from;
    const yt = f.year_to === 0 ? "NULL" : f.year_to;
    return `('${f.canonical_brand.replace(/'/g, "''")}','${f.canonical_model.replace(/'/g, "''")}',${yf},${yt},${f.ktypes.length})`;
  }).join(",");
  console.log(`INSERT INTO ktype_families (canonical_brand, canonical_model, year_from, year_to, ktype_count) VALUES ${values};`);
}

console.error(`\n📤 ${familyList.length} family INSERTs generert`);

// Members: need family_ids. Since we deleted and re-insert sequentially,
// family_id starts at 1 and matches familyList index + 1.
console.error("📝 Genererer family_members SQL...");

let memberCount = 0;
for (let i = 0; i < familyList.length; i += BATCH_SIZE) {
  const batch = familyList.slice(i, i + BATCH_SIZE);
  const values = [];
  for (let j = 0; j < batch.length; j++) {
    const family = batch[j];
    const familyId = i + j + 1; // Sequential IDs starting at 1
    for (const kt of family.ktypes) {
      const yf = kt.tecdoc_year_from ?? "NULL";
      const yt = kt.tecdoc_year_to ?? "NULL";
      values.push(`(${familyId},${kt.ktype},'${(kt.tecdoc_brand||"").replace(/'/g,"''")}','${(kt.tecdoc_model||"").replace(/'/g,"''")}',${yf},${yt})`);
      memberCount++;
    }
  }
  if (values.length > 0) {
    // Split very large member batches
    for (let k = 0; k < values.length; k += 100) {
      const sub = values.slice(k, k + 100);
      console.log(`INSERT INTO ktype_family_members (family_id, ktype, tecdoc_brand, tecdoc_model, tecdoc_year_from, tecdoc_year_to) VALUES ${sub.join(",")};`);
    }
  }
}

console.error(`✅ ${memberCount} family_member INSERTs generert`);
console.error(`\n🎉 SQL klar! Kjør med:`);
console.error(`   cd api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file=/tmp/families.sql`);
