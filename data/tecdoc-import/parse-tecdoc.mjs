import { readFileSync, writeFileSync } from "fs";

// Parse tab-separated CSV
function parseTsv(path) {
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n").filter(l => l.trim());
  return lines.map(line => line.split("\t"));
}

console.log("📖 Parsing manufacturers.csv...");
const manufacturers = new Map();
const mRows = parseTsv("data/tecdoc-import/manufacturers.csv");
for (const row of mRows) {
  const mfaId = parseInt(row[0], 10);
  const brand = row[3] || row[1]; // col3 = full name, col1 = short
  if (mfaId && brand) {
    manufacturers.set(mfaId, brand.trim());
  }
}
console.log(`   → ${manufacturers.size} manufacturers`);

console.log("📖 Parsing models.csv...");
const models = new Map();
const moRows = parseTsv("data/tecdoc-import/models.csv");
for (const row of moRows) {
  const modId = parseInt(row[0], 10);
  const mfaId = parseInt(row[1], 10);
  const yearFrom = row[2] === "0000-00-00" ? null : parseInt(row[2]?.slice(0, 4), 10) || null;
  const yearTo = row[3] === "0000-00-00" ? null : parseInt(row[3]?.slice(0, 4), 10) || null;
  const modelName = row[4];
  if (modId && mfaId && modelName) {
    models.set(modId, { mfaId, modelName: modelName.trim(), yearFrom, yearTo });
  }
}
console.log(`   → ${models.size} models`);

console.log("📖 Parsing passengercars.csv...");
const ktypeMap = new Map();
const pcRows = parseTsv("data/tecdoc-import/passengercars.csv");
let skipped = 0;
for (const row of pcRows) {
  // Columns: [0]=internal_id, [1]=typ_id, [2]=mod_id, [3]=brand_name, [4]=mfa_id, [5]=start, [6]=end, ...
  const typId = parseInt(row[1], 10);
  const modId = parseInt(row[2], 10);
  const yearFrom = row[5] === "0000-00-00" ? null : parseInt(row[5]?.slice(0, 4), 10) || null;
  const yearTo = row[6] === "0000-00-00" ? null : parseInt(row[6]?.slice(0, 4), 10) || null;
  
  const modelInfo = models.get(modId);
  if (!modelInfo) {
    skipped++;
    continue;
  }
  
  const brand = manufacturers.get(modelInfo.mfaId) || row[3]?.trim() || "UNKNOWN";
  
  ktypeMap.set(typId, {
    ktype: typId,
    brand,
    model: modelInfo.modelName,
    year_from: yearFrom,
    year_to: yearTo,
    mod_id: modId,
    mfa_id: modelInfo.mfaId,
  });
}
console.log(`   → ${ktypeMap.size} kType mappings (${skipped} skipped)`);

// Save as JSON array
const entries = Array.from(ktypeMap.values());
writeFileSync("data/tecdoc-import/tecdoc-ktype-mapping.json", JSON.stringify(entries, null, 0));
console.log(`\n💾 Saved data/tecdoc-import/tecdoc-ktype-mapping.json (${entries.length} entries)`);

// Summary by brand
const byBrand = {};
for (const e of entries) {
  byBrand[e.brand] = (byBrand[e.brand] || 0) + 1;
}
const sortedBrands = Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log("\n📊 Top 20 brands by kType count:");
for (const [brand, count] of sortedBrands) {
  console.log(`   ${brand}: ${count}`);
}
