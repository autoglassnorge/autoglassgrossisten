#!/usr/bin/env node
/**
 * Enterprise TecDoc import: 101,455 vehicles into ktype_registry.
 * Validates data quality, reports errors, generates batched SQL.
 */
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data', 'tecdoc-import');

// ── Validation ───────────────────────────────────────────────
function validateRecord(r) {
  const errors = [];
  if (!r.ktype || r.ktype <= 0) errors.push('invalid ktype');
  if (!r.brand || r.brand.length < 2) errors.push('missing brand');
  if (!r.model || r.model.length < 2) errors.push('missing model');
  if (r.yearFrom !== null && (r.yearFrom < 1900 || r.yearFrom > 2030)) errors.push('invalid yearFrom');
  if (r.yearTo !== null && (r.yearTo < 1900 || r.yearTo > 2030)) errors.push('invalid yearTo');
  if (r.yearFrom && r.yearTo && r.yearFrom > r.yearTo) errors.push('yearFrom > yearTo');
  return errors;
}

function parseYear(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return null;
  const year = parseInt(dateStr.split('-')[0], 10);
  return isNaN(year) || year === 0 ? null : year;
}

async function readCsv(filename) {
  const path = join(DATA_DIR, filename);
  const lines = [];
  const rl = createInterface({ input: createReadStream(path, 'utf-8') });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    lines.push(line.split('\t'));
  }
  return lines;
}

// ── Load lookups ─────────────────────────────────────────────
async function loadModels() {
  const rows = await readCsv('models.csv');
  const map = new Map();
  for (const r of rows) {
    map.set(parseInt(r[0], 10), { manId: parseInt(r[1], 10), name: r[4]?.trim() });
  }
  return map;
}

async function loadManufacturers() {
  const rows = await readCsv('manufacturers.csv');
  const map = new Map();
  for (const r of rows) {
    map.set(parseInt(r[0], 10), r[3]?.trim());
  }
  return map;
}

// ── Process vehicle types ────────────────────────────────────
async function processPassengerOrBikes(filename, label) {
  const rows = await readCsv(filename);
  const results = [];
  for (const r of rows) {
    const ktype = parseInt(r[1], 10);
    const brand = r[3]?.trim();
    const modelName = r[8]?.trim();
    const yearFrom = parseYear(r[5]);
    const yearTo = parseYear(r[6]);
    if (!ktype || !brand || !modelName) continue;
    results.push({ ktype, brand, model: modelName, yearFrom, yearTo, source: `tecdoc-${label}` });
  }
  return results;
}

async function processCommercial(modelsMap, manufacturersMap) {
  const rows = await readCsv('commercialvehicles.csv');
  const results = [];
  for (const r of rows) {
    const ktype = parseInt(r[1], 10);
    const modelId = parseInt(r[2], 10);
    const modelInfo = modelsMap.get(modelId);
    if (!modelInfo) continue;
    const brand = manufacturersMap.get(modelInfo.manId);
    if (!brand) continue;
    const modelName = r[6]?.trim();
    const yearFrom = parseYear(r[3]);
    const yearTo = parseYear(r[4]);
    if (!ktype || !modelName) continue;
    results.push({ ktype, brand, model: modelName, yearFrom, yearTo, source: 'tecdoc-commercial' });
  }
  return results;
}

// ── Generate SQL ─────────────────────────────────────────────
function escapeSql(s) {
  return String(s).replace(/'/g, "''");
}

function generateSql(records) {
  const BATCH = 100;
  const chunks = [];
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = batch.map(r =>
      `(${r.ktype}, '${escapeSql(r.brand)}', '${escapeSql(r.model)}', ` +
      `${r.yearFrom ?? 'NULL'}, ${r.yearTo ?? 'NULL'}, '${r.source}', 'tecdoc_import')`
    ).join(',\n');
    chunks.push(
      `INSERT OR REPLACE INTO ktype_registry (ktype, brand, model, year_from, year_to, source, confidence)\nVALUES ${values};`
    );
  }
  return chunks.join('\n\n');
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== Enterprise TecDoc Import ===\n');

  console.log('Loading lookup tables...');
  const modelsMap = await loadModels();
  const manufacturersMap = await loadManufacturers();
  console.log(`  models: ${modelsMap.size}, manufacturers: ${manufacturersMap.size}`);

  console.log('Processing passenger cars...');
  const passenger = await processPassengerOrBikes('passengercars.csv', 'passenger');
  console.log(`  ${passenger.length} records`);

  console.log('Processing commercial vehicles...');
  const commercial = await processCommercial(modelsMap, manufacturersMap);
  console.log(`  ${commercial.length} records`);

  console.log('Processing motorbikes...');
  const bikes = await processPassengerOrBikes('motorbikes.csv', 'motorbike');
  console.log(`  ${bikes.length} records`);

  let all = [...passenger, ...commercial, ...bikes];
  console.log(`\nRaw total: ${all.length}`);

  // Validate
  const valid = [];
  const invalid = [];
  for (const r of all) {
    const errors = validateRecord(r);
    if (errors.length === 0) valid.push(r);
    else invalid.push({ ...r, errors });
  }

  console.log(`Valid: ${valid.length}`);
  console.log(`Invalid: ${invalid.length}`);
  if (invalid.length > 0) {
    console.log('  Sample errors:', invalid.slice(0, 3).map(i => `${i.ktype}: ${i.errors.join(', ')}`));
  }

  // Deduplicate by ktype (keep first occurrence)
  const seen = new Set();
  const deduped = [];
  for (const r of valid) {
    if (!seen.has(r.ktype)) {
      seen.add(r.ktype);
      deduped.push(r);
    }
  }
  console.log(`After dedupe: ${deduped.length} (removed ${valid.length - deduped.length} duplicates)`);

  // Write SQL
  const sql = generateSql(deduped);
  const outPath = join(process.cwd(), 'data', 'tecdoc-registry-enterprise.sql');
  await writeFile(outPath, `-- TecDoc ktype_registry enterprise import (${deduped.length} records)\n-- Generated: ${new Date().toISOString()}\n\n${sql}`);
  console.log(`\nSQL written to: ${outPath}`);
  console.log(`Apply with: npx wrangler d1 execute GLASS_CATALOG_D1 --local --file=data/tecdoc-registry-enterprise.sql`);
}

main().catch(e => { console.error(e); process.exit(1); });
