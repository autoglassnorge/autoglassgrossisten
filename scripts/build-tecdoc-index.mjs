#!/usr/bin/env node
/**
 * Build a compact pre-processed TecDoc index from CSV dumps.
 * Output: api/cf-worker/src/data/tecdoc-index.json
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSV_DIR = join(ROOT, "data", "tecdoc-import");
const OUT_DIR = join(ROOT, "api", "cf-worker", "src", "data");
const OUT_FILE = join(OUT_DIR, "tecdoc-index.json");

/* ── Helpers ──────────────────────────────────────────────── */
function parseYear(dateStr) {
  if (!dateStr || dateStr === "0000-00-00") return 0;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function cleanBrand(str) {
  if (!str) return "";
  return str.toUpperCase().trim();
}

function cleanModel(str) {
  if (!str) return "";
  return str.trim();
}

/* ── Load models → manufacturer mapping ───────────────────── */
async function loadModelToManufacturer() {
  const map = new Map();
  const rl = createInterface({
    input: createReadStream(join(CSV_DIR, "models.csv")),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const cols = line.split("\t");
    if (cols.length < 2) continue;
    const modelId = cols[0].trim();
    const manId = cols[1].trim();
    if (modelId && manId) map.set(modelId, manId);
  }
  return map;
}

/* ── Load manufacturer → brand mapping ────────────────────── */
async function loadManufacturerToBrand() {
  const map = new Map();
  const rl = createInterface({
    input: createReadStream(join(CSV_DIR, "manufacturers.csv")),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const cols = line.split("\t");
    if (cols.length < 4) continue;
    const manId = cols[0].trim();
    const brandName = cols[3].trim(); // brand_name column
    if (manId && brandName) map.set(manId, brandName);
  }
  return map;
}

/* ── Stream-parse a CSV and yield records ─────────────────── */
async function* parseCsv(filename, mapper) {
  const rl = createInterface({
    input: createReadStream(join(CSV_DIR, filename)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const rec = mapper(line);
    if (rec) yield rec;
  }
}

/* ── Main ─────────────────────────────────────────────────── */
async function main() {
  console.log("🔧 Building TecDoc index...\n");

  // Pre-load join tables
  const t0 = Date.now();
  const modelToMan = await loadModelToManufacturer();
  const manToBrand = await loadManufacturerToBrand();
  console.log(`  📂 models.csv → ${modelToMan.size.toLocaleString()} mappings (${Date.now() - t0}ms)`);
  console.log(`  📂 manufacturers.csv → ${manToBrand.size.toLocaleString()} brands`);

  const brands = new Map(); // normalized brand → id
  const models = new Map(); // model string → id
  const entries = []; // [ktype, brandId, modelId, yearFrom, yearTo]
  const seen = new Set(); // dedupe key

  function getBrandId(name) {
    const key = cleanBrand(name);
    if (!key) return -1;
    if (!brands.has(key)) brands.set(key, brands.size);
    return brands.get(key);
  }

  function getModelId(name) {
    const key = cleanModel(name);
    if (!key) return -1;
    if (!models.has(key)) models.set(key, models.size);
    return models.get(key);
  }

  function addEntry(ktype, brand, model, yearFrom, yearTo) {
    const bId = getBrandId(brand);
    const mId = getModelId(model);
    if (bId === -1 || mId === -1 || !ktype) return;
    const dedupeKey = `${ktype}|${bId}|${mId}|${yearFrom}|${yearTo}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push([ktype, bId, mId, yearFrom, yearTo]);
  }

  // 1. Passenger cars (brand column is brand_code; resolve via man_id)
  let count = 0;
  const t1 = Date.now();
  for await (const rec of parseCsv("passengercars.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 10) return null;
    const ktype = parseInt(c[1], 10) || 0;
    const manId = c[4]?.trim();
    const model = c[8]?.trim();
    const yearFrom = parseYear(c[5]);
    const yearTo = parseYear(c[6]);
    if (!ktype || !manId || !model) return null;
    const brand = manToBrand.get(manId);
    if (!brand) return null;
    return { ktype, brand, model, yearFrom, yearTo };
  })) {
    addEntry(rec.ktype, rec.brand, rec.model, rec.yearFrom, rec.yearTo);
    count++;
  }
  console.log(`  📂 passengercars.csv → ${count.toLocaleString()} records processed (${entries.length.toLocaleString()} unique entries so far, ${Date.now() - t1}ms)`);

  // 2. Commercial vehicles (join via models → manufacturers)
  let countComm = 0;
  const t2 = Date.now();
  for await (const rec of parseCsv("commercialvehicles.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 8) return null;
    const ktype = parseInt(c[1], 10) || 0;
    const modelId = c[2]?.trim();
    const model = c[6]?.trim();
    const yearFrom = parseYear(c[3]);
    const yearTo = parseYear(c[4]);
    if (!ktype || !modelId || !model) return null;
    const manId = modelToMan.get(modelId);
    const brand = manId ? manToBrand.get(manId) : null;
    if (!brand) return null;
    return { ktype, brand, model, yearFrom, yearTo };
  })) {
    addEntry(rec.ktype, rec.brand, rec.model, rec.yearFrom, rec.yearTo);
    countComm++;
  }
  console.log(`  📂 commercialvehicles.csv → ${countComm.toLocaleString()} records processed (${entries.length.toLocaleString()} unique entries so far, ${Date.now() - t2}ms)`);

  // 3. Motorbikes (brand column is brand_code; resolve via man_id)
  let countMoto = 0;
  const t3 = Date.now();
  for await (const rec of parseCsv("motorbikes.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 10) return null;
    const ktype = parseInt(c[1], 10) || 0;
    const manId = c[4]?.trim();
    const model = c[8]?.trim();
    const yearFrom = parseYear(c[5]);
    const yearTo = parseYear(c[6]);
    if (!ktype || !manId || !model) return null;
    const brand = manToBrand.get(manId);
    if (!brand) return null;
    return { ktype, brand, model, yearFrom, yearTo };
  })) {
    addEntry(rec.ktype, rec.brand, rec.model, rec.yearFrom, rec.yearTo);
    countMoto++;
  }
  console.log(`  📂 motorbikes.csv → ${countMoto.toLocaleString()} records processed (${entries.length.toLocaleString()} unique entries total, ${Date.now() - t3}ms)`);

  // Build reverse maps for JSON
  const brandsArray = new Array(brands.size);
  for (const [name, id] of brands) brandsArray[id] = name;

  const modelsArray = new Array(models.size);
  for (const [name, id] of models) modelsArray[id] = name;

  // Build compact output: object maps for fast lookup
  const brandsObj = Object.create(null);
  for (let i = 0; i < brandsArray.length; i++) brandsObj[brandsArray[i]] = i;

  const modelsObj = Object.create(null);
  for (let i = 0; i < modelsArray.length; i++) modelsObj[modelsArray[i]] = i;

  const payload = {
    brands: brandsObj,
    models: modelsObj,
    entries,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(payload);
  writeFileSync(OUT_FILE, json, "utf-8");

  const stats = {
    brands: brandsArray.length,
    models: modelsArray.length,
    entries: entries.length,
    jsonBytes: Buffer.byteLength(json, "utf-8"),
    jsonKB: (Buffer.byteLength(json, "utf-8") / 1024).toFixed(1),
  };

  console.log(`\n✅ Index built successfully!`);
  console.log(`   Brands:  ${stats.brands.toLocaleString()}`);
  console.log(`   Models:  ${stats.models.toLocaleString()}`);
  console.log(`   Entries: ${stats.entries.toLocaleString()}`);
  console.log(`   Size:    ${stats.jsonKB} KB (${stats.jsonBytes.toLocaleString()} bytes)`);
  console.log(`   Output:  ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
