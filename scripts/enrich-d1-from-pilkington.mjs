#!/usr/bin/env node
/**
 * Enrich D1 glass_catalog with Pilkington data from catalog-autoglass-enriched.json
 * Generates UPDATE SQL statements for matched products.
 */
import { readFileSync, writeFileSync } from 'fs';

const ENRICHED_JSON = 'data/catalog-autoglass-enriched.json';
const OUTPUT_SQL = 'scripts/position-audit/migrations/004-enrich-d1-from-pilkington.sql';

// Fields to update (camelCase JSON key -> snake_case SQL column)
const FIELD_MAP = {
  imageUrl: 'image_url',
  adas: 'adas',
  rainSensor: 'rain_sensor',
  heated: 'heated',
  acoustic: 'acoustic',
  antenna: 'antenna',
  hud: 'hud',
  shade: 'shade',
  camera: 'camera',
  laneAssist: 'lane_assist',
  dimensions: 'dimensions',
  oemNumbers: 'oem_numbers',
  nagsCodes: 'nags_codes',
  stockStatus: 'stock_status',
  pdfUrl: 'pdf_url',
  weight: 'weight',
  crossReferences: 'cross_references',
  prefix4: 'prefix4',
  warehouseLocation: 'warehouse_location',
};

console.log(`Loading ${ENRICHED_JSON}...`);
const catalog = JSON.parse(readFileSync(ENRICHED_JSON, 'utf-8'));
const records = catalog.records || [];

// Filter to only records that have at least one enrichment field
const enriched = [];
for (const r of records) {
  const hasEnrichment = Object.keys(FIELD_MAP).some(k => {
    const v = r[k];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  if (hasEnrichment) {
    enriched.push(r);
  }
}

console.log(`Total records: ${records.length}`);
console.log(`Records with Pilkington enrichment: ${enriched.length}`);

// Check how many have images
const withImages = enriched.filter(r => r.imageUrl && r.imageUrl !== '').length;
console.log(`Records with imageUrl: ${withImages}`);

// Build SQL
const lines = [
  '-- Enrich D1 glass_catalog with Pilkington data',
  `-- Products to update: ${enriched.length}`,
  `-- Records with images: ${withImages}`,
  '',
];

let updatedCount = 0;
let skippedCount = 0;

for (const r of enriched) {
  const eurocode = r.eurocode?.toUpperCase().replace(/'/g, "''");
  if (!eurocode) {
    skippedCount++;
    continue;
  }

  const sets = [];
  for (const [jsonKey, sqlCol] of Object.entries(FIELD_MAP)) {
    const val = r[jsonKey];
    if (val === undefined || val === null) continue;
    if (val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;

    if (typeof val === 'boolean') {
      sets.push(`${sqlCol} = ${val ? 1 : 0}`);
    } else if (typeof val === 'number') {
      sets.push(`${sqlCol} = ${val}`);
    } else if (typeof val === 'object') {
      // Object or array -> JSON stringify
      const jsonStr = JSON.stringify(val).replace(/'/g, "''");
      // Limit length to avoid SQL issues
      if (jsonStr.length > 2000) continue;
      sets.push(`${sqlCol} = '${jsonStr}'`);
    } else {
      const str = String(val).replace(/'/g, "''");
      if (str.length > 2000) continue;
      sets.push(`${sqlCol} = '${str}'`);
    }
  }

  // Only update supplier if it's Pilkington (don't overwrite auto-glass.no supplier)
  const pilkSupplier = r.supplier;
  if (pilkSupplier === 'Pilkington') {
    sets.push(`supplier = 'Pilkington'`);
  }

  if (sets.length === 0) {
    skippedCount++;
    continue;
  }

  lines.push(`UPDATE glass_catalog SET ${sets.join(', ')} WHERE eurocode = '${eurocode}';`);
  updatedCount++;
}

writeFileSync(OUTPUT_SQL, lines.join('\n') + '\n');
console.log(`\nSQL generated: ${OUTPUT_SQL}`);
console.log(`  UPDATE statements: ${updatedCount}`);
console.log(`  Skipped (no enrichable fields): ${skippedCount}`);
