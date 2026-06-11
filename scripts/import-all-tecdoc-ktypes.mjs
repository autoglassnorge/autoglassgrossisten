#!/usr/bin/env node
/**
 * SUPERHACKER SCRIPT: Import ALL TecDoc kTypes (passengercars + commercialvehicles + motorbikes)
 * Compares with D1, generates SQL for missing kTypes
 */
import { readFileSync, writeFileSync } from "fs";

const IMPORT_DIR = "data/tecdoc-import";
const OUT_DIR = "data/tecdoc-import";

// ─── Parse helpers ───
function parseTsv(path) {
  const text = readFileSync(path, "utf-8");
  return text.split("\n").filter(l => l.trim()).map(line => line.split("\t"));
}

function parseDate(str) {
  if (!str || str === "0000-00-00") return null;
  const y = parseInt(str.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}

// ─── Load manufacturers ───
console.log("📖 Loading manufacturers.csv...");
const manufacturers = new Map();
for (const row of parseTsv(`${IMPORT_DIR}/manufacturers.csv`)) {
  const mfaId = parseInt(row[0], 10);
  const brand = (row[3] || row[1])?.trim();
  if (mfaId && brand) manufacturers.set(mfaId, brand);
}
console.log(`   → ${manufacturers.size} manufacturers`);

// ─── Load models ───
console.log("📖 Loading models.csv...");
const models = new Map();
for (const row of parseTsv(`${IMPORT_DIR}/models.csv`)) {
  const modId = parseInt(row[0], 10);
  const mfaId = parseInt(row[1], 10);
  const yearFrom = parseDate(row[2]);
  const yearTo = parseDate(row[3]);
  const modelName = row[4]?.trim();
  if (modId && mfaId && modelName) {
    models.set(modId, { mfaId, modelName, yearFrom, yearTo });
  }
}
console.log(`   → ${models.size} models`);

// ─── Parse vehicle files ───
const ktypeMap = new Map();

function parseVehicleFile(filename, source) {
  console.log(`📖 Parsing ${filename}...`);
  const rows = parseTsv(`${IMPORT_DIR}/${filename}`);
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    // Columns: typ_id, mod_id, mfa_id, brand_name, mfa_id_dup, start, end, ..., description
    // Actually: [0]=internal_id, [1]=typ_id, [2]=mod_id, [3]=brand_name, [4]=mfa_id, [5]=start, [6]=end, ...
    const typId = parseInt(row[1], 10);
    const modId = parseInt(row[2], 10);
    if (!typId || !modId) {
      skipped++;
      continue;
    }

    const modelInfo = models.get(modId);
    if (!modelInfo) {
      skipped++;
      continue;
    }

    const yearFrom = parseDate(row[5]);
    const yearTo = parseDate(row[6]);
    const brand = manufacturers.get(modelInfo.mfaId) || row[3]?.trim() || "UNKNOWN";

    // Only add if not already present (passengercars first = preferred)
    if (!ktypeMap.has(typId)) {
      ktypeMap.set(typId, {
        ktype: typId,
        brand,
        model: modelInfo.modelName,
        year_from: yearFrom,
        year_to: yearTo,
        source,
      });
      added++;
    }
  }
  console.log(`   → ${added} added, ${skipped} skipped`);
}

parseVehicleFile("passengercars.csv", "tecdoc_passengercars");
parseVehicleFile("commercialvehicles.csv", "tecdoc_commercialvehicles");
parseVehicleFile("motorbikes.csv", "tecdoc_motorbikes");

console.log(`\n📊 Total unique kTypes from TecDoc: ${ktypeMap.size}`);

// ─── Load existing D1 ktypes ───
console.log("\n📖 Loading existing ktype_registry data...");
// We need to query D1 or use cached data. For now, let's try to use a cached export.
// If no cache exists, we'll use the ktype-vehicles.json as proxy.
let existingKtypes = new Set();
try {
  const existing = JSON.parse(readFileSync(`${IMPORT_DIR}/ktype-vehicles.json`, "utf-8"));
  for (const e of existing) existingKtypes.add(parseInt(e.ktype, 10));
  console.log(`   → ${existingKtypes.size} kTypes already in ktype-vehicles.json`);
} catch {
  console.log("   → No cached data found");
}

// ─── Find missing kTypes ───
const missing = [];
for (const [ktype, entry] of ktypeMap) {
  if (!existingKtypes.has(ktype)) {
    missing.push(entry);
  }
}

console.log(`\n🎯 Missing kTypes (not in existing data): ${missing.length}`);

// ─── Summary by brand for missing ───
const byBrand = {};
for (const e of missing) {
  byBrand[e.brand] = (byBrand[e.brand] || 0) + 1;
}
const sorted = Object.entries(byBrand).sort((a, b) => b[1] - a[1]);
console.log("\n📊 Top 20 brands with missing kTypes:");
for (const [brand, count] of sorted.slice(0, 20)) {
  console.log(`   ${brand}: ${count}`);
}

// ─── Generate SQL for missing kTypes ───
console.log("\n📝 Generating SQL...");

let sql = "-- Auto-generated: Missing TecDoc kTypes import\n";
sql += "-- Sources: passengercars + commercialvehicles + motorbikes from tecdocSQL/tecdocdatabase1Q2019\n";
sql += "BEGIN TRANSACTION;\n";
let count = 0;
for (const entry of missing) {
  const brand = (entry.brand || "").replace(/'/g, "''");
  const model = (entry.model || "").replace(/'/g, "''");
  const yf = entry.year_from || "NULL";
  const yt = entry.year_to || "NULL";
  sql += `INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, confidence, created_at) VALUES (${entry.ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', '${entry.source}', 'exact', datetime('now'));\n`;
  count++;
  if (count % 500 === 0) {
    sql += "COMMIT;\nBEGIN TRANSACTION;\n";
  }
}
sql += "COMMIT;\n";

const sqlPath = `${OUT_DIR}/ktype-registry-missing-inserts.sql`;
writeFileSync(sqlPath, sql);
console.log(`   → Generated ${sqlPath} (${count} inserts)`);

// ─── Save JSON for reference ───
const jsonPath = `${OUT_DIR}/ktype-missing.json`;
writeFileSync(jsonPath, JSON.stringify(missing, null, 0));
console.log(`   → Saved ${jsonPath} (${missing.length} entries)`);

// ─── Summary report ───
const report = {
  total_tecdoc_ktypes: ktypeMap.size,
  existing_ktypes: existingKtypes.size,
  missing_ktypes: missing.length,
  top_brands: sorted.slice(0, 30),
  sources: {
    passengercars: Array.from(ktypeMap.values()).filter(e => e.source === "tecdoc_passengercars").length,
    commercialvehicles: Array.from(ktypeMap.values()).filter(e => e.source === "tecdoc_commercialvehicles").length,
    motorbikes: Array.from(ktypeMap.values()).filter(e => e.source === "tecdoc_motorbikes").length,
  },
  generated_at: new Date().toISOString(),
};
writeFileSync(`${OUT_DIR}/import-report.json`, JSON.stringify(report, null, 2));
console.log(`\n💾 Report saved to ${OUT_DIR}/import-report.json`);

console.log("\n✅ Done! Next steps:");
console.log(`   1. Review ${sqlPath}`);
console.log(`   2. Run: npx wrangler d1 execute glass-catalog-db --remote --file=${sqlPath}`);
console.log(`   3. Or batch it via scripts/batch-d1-import.mjs`);
