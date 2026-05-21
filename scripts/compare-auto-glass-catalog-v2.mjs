#!/usr/bin/env node
/**
 * Compare auto-glass.no (with eurocodes) against existing catalog
 * Uses eurocodes.ndjson for products that actually have eurocodes
 */
import { readFileSync } from 'fs';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  AUTO-GLASS.NO vs AUTOGlass AS CATALOG — v2 (Eurocode-based)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── Load auto-glass.no eurocoded products ───
const agEuroLines = readFileSync('data/autoglass-scrape/eurocodes.ndjson', 'utf-8')
  .trim()
  .split('\n')
  .filter(Boolean);

const agByEurocode = new Map();
const agBySku = new Map();
let agValidEurocodes = 0;

for (const line of agEuroLines) {
  try {
    const d = JSON.parse(line);
    if (d.eurocode && d.eurocode.match(/^\d{4}[A-Z]/)) {
      agValidEurocodes++;
      agByEurocode.set(d.eurocode.toUpperCase(), d);
      if (d.sku) agBySku.set(d.sku.toUpperCase(), d);
    }
  } catch (e) {}
}

// ─── Load full auto-glass.no normalized data for brand coverage ───
const agFullLines = readFileSync('data/autoglass-scrape/products-normalized.ndjson', 'utf-8')
  .trim()
  .split('\n')
  .filter(Boolean);

const agBrands = new Map(); // brand -> count
const agModels = new Map(); // brand:model -> count
for (const line of agFullLines) {
  try {
    const d = JSON.parse(line);
    if (d.brand) {
      agBrands.set(d.brand, (agBrands.get(d.brand) || 0) + 1);
    }
    if (d.brand && d.model) {
      const key = `${d.brand}|${d.model}`;
      agModels.set(key, (agModels.get(key) || 0) + 1);
    }
  } catch (e) {}
}

// ─── Load our catalog ───
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records || [];

const catalogByEurocode = new Map();
const catalogBrands = new Map();
const catalogModels = new Map();
const usBrands = new Set(['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA']);
let catalogUsRecords = 0;

for (const r of records) {
  if (r.eurocode) catalogByEurocode.set(r.eurocode.toUpperCase(), r);
  if (r.brand) catalogBrands.set(r.brand, (catalogBrands.get(r.brand) || 0) + 1);
  if (r.brand && r.model) {
    const key = `${r.brand}|${r.model}`;
    catalogModels.set(key, (catalogModels.get(key) || 0) + 1);
  }
  if (usBrands.has(r.brand)) catalogUsRecords++;
}

// ─── Cross-reference: eurocodes ───
let euroInBoth = 0;
let euroOnlyAg = 0;
let euroOnlyCatalog = 0;
const euroOnlyAgList = [];

for (const [code, ag] of agByEurocode) {
  if (catalogByEurocode.has(code)) euroInBoth++;
  else {
    euroOnlyAg++;
    euroOnlyAgList.push({ eurocode: code, brand: ag.brand, model: ag.model, sku: ag.sku });
  }
}

for (const code of catalogByEurocode.keys()) {
  if (!agByEurocode.has(code)) euroOnlyCatalog++;
}

// ─── Cross-reference: brands ───
const brandsInBoth = [];
const brandsOnlyAg = [];
const brandsOnlyCatalog = [];

for (const brand of agBrands.keys()) {
  if (catalogBrands.has(brand)) brandsInBoth.push(brand);
  else brandsOnlyAg.push(brand);
}
for (const brand of catalogBrands.keys()) {
  if (!agBrands.has(brand)) brandsOnlyCatalog.push(brand);
}

// ─── Report ───
console.log('📊 AUTO-GLASS.NO (scraped)');
console.log(`   Total products scraped:         27,184`);
console.log(`   Products with eurocode found:   ${agEuroLines.length.toLocaleString()}`);
console.log(`   Valid eurocodes (4-digit+):     ${agValidEurocodes.toLocaleString()}`);
console.log(`   Unique brands:                  ${agBrands.size}`);
console.log();

console.log('📊 AUTOGlass AS CATALOG (catalog-prod.json)');
console.log(`   Total records:                  ${records.length.toLocaleString()}`);
console.log(`   Unique eurocodes:               ${catalogByEurocode.size.toLocaleString()}`);
console.log(`   Unique brands:                  ${catalogBrands.size}`);
console.log(`   US-brand records:               ${catalogUsRecords.toLocaleString()}`);
console.log();

console.log('🔗 EUROCODE OVERLAP');
console.log(`   In both catalogs:               ${euroInBoth.toLocaleString()}`);
console.log(`   Only in auto-glass.no:          ${euroOnlyAg.toLocaleString()} (${(euroOnlyAg/agValidEurocodes*100).toFixed(1)}%)`);
console.log(`   Only in our catalog:            ${euroOnlyCatalog.toLocaleString()}`);
console.log();

console.log('🏷️  BRAND OVERLAP');
console.log(`   In both catalogs:               ${brandsInBoth.length}`);
console.log(`   Only in auto-glass.no:          ${brandsOnlyAg.length}`);
console.log(`   Only in our catalog:            ${brandsOnlyCatalog.length}`);
if (brandsOnlyAg.length > 0) {
  console.log(`   Brands only in auto-glass.no:   ${brandsOnlyAg.slice(0, 20).join(', ')}${brandsOnlyAg.length > 20 ? ' ...' : ''}`);
}
console.log();

// Top eurocodes only in auto-glass.no by brand
const onlyAgByBrand = {};
for (const item of euroOnlyAgList) {
  const b = item.brand || 'UNKNOWN';
  onlyAgByBrand[b] = (onlyAgByBrand[b] || 0) + 1;
}
console.log('📈 TOP BRANDS — eurocodes ONLY in auto-glass.no (potential new products)');
const sorted = Object.entries(onlyAgByBrand).sort((a, b) => b[1] - a[1]);
for (const [brand, count] of sorted.slice(0, 15)) {
  console.log(`   ${brand.padEnd(15)} ${count.toString().padStart(4)}`);
}
console.log();

// US cars specifically
const usOnlyAg = euroOnlyAgList.filter(x => usBrands.has(x.brand?.toUpperCase()));
console.log(`🇺🇸 US CARS — eurocodes only in auto-glass.no: ${usOnlyAg.length}`);
for (const item of usOnlyAg.slice(0, 10)) {
  console.log(`   ${item.eurocode} | ${item.brand} ${item.model}`);
}
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log('💡 CONCLUSION');
console.log('═══════════════════════════════════════════════════════════════');
if (euroOnlyAg > 0) {
  console.log(`   → ${euroOnlyAg} products from auto-glass.no have eurocodes we DON'T have.`);
  console.log(`   → These are candidates for adding to our catalog.`);
}
if (euroInBoth > 0) {
  console.log(`   → ${euroInBoth} products exist in both — can be enriched with auto-glass.no data.`);
}
console.log(`   → ${(agEuroLines.length - agValidEurocodes)} auto-glass.no products have non-standard codes (internal SKUs).`);
console.log('═══════════════════════════════════════════════════════════════');
