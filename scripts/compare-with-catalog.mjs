import { readFileSync } from 'fs';

// Load auto-glass.no SKUs
const agLines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson', 'utf-8').trim().split('\n');
const agSkus = new Set();
for (const line of agLines) {
  const d = JSON.parse(line);
  if (d.sku) agSkus.add(d.sku.trim().toUpperCase());
}

// Load Autoglass AS catalog
const catalog = JSON.parse(readFileSync('/Users/taj/bilglass/data/catalog-prod.json', 'utf-8'));
const records = catalog.records || [];

const catalogEurocodes = new Set();
for (const rec of records) {
  if (rec.eurocode) catalogEurocodes.add(rec.eurocode.trim().toUpperCase());
}

// Find overlap
let overlap = 0;
for (const sku of agSkus) {
  if (catalogEurocodes.has(sku)) overlap++;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  AUTO-GLASS.NO vs AUTOGlass AS CATALOG COMPARISON');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Auto-glass.no unique SKUs:     ${agSkus.size.toLocaleString()}`);
console.log(`Autoglass AS catalog records:  ${records.length.toLocaleString()}`);
console.log(`Autoglass AS unique eurocodes: ${catalogEurocodes.size.toLocaleString()}`);
console.log();
console.log(`Exact SKU ↔ Eurocode matches:  ${overlap} (${(overlap/agSkus.size*100).toFixed(2)}%)`);
console.log();

if (overlap === 0) {
  console.log('⚠️  ZERO overlap! Auto-glass.no uses a completely different numbering system.');
  console.log('   Auto-glass.no: internal varenummer (e.g., 12345GN)');
  console.log('   Autoglass AS:  eurocodes (e.g., AGN2031)');
  console.log();
  console.log('💡 To match them, you would need a cross-reference table from auto-glass.no');
  console.log('   or from the glass manufacturers (Pilkington, Glavista, etc.)');
} else {
  console.log('Sample matching SKUs:');
  let shown = 0;
  for (const sku of agSkus) {
    if (catalogEurocodes.has(sku)) {
      console.log(`  ${sku}`);
      if (++shown >= 10) break;
    }
  }
}
console.log('═══════════════════════════════════════════════════════════════');
