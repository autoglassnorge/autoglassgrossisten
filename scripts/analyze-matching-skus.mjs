import { readFileSync } from 'fs';

const agLines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson', 'utf-8').trim().split('\n');
const catalog = JSON.parse(readFileSync('/Users/taj/bilglass/data/catalog-prod.json', 'utf-8'));
const records = catalog.records || [];

const catalogEurocodes = new Set();
for (const rec of records) {
  if (rec.eurocode) catalogEurocodes.add(rec.eurocode.trim().toUpperCase());
}

const matches = [];
for (const line of agLines) {
  const d = JSON.parse(line);
  if (d.sku && catalogEurocodes.has(d.sku.trim().toUpperCase())) {
    matches.push(d);
  }
}

// Analyze matched SKU formats
const formatCounts = {};
const brandCounts = {};
const typeCounts = {};

for (const m of matches) {
  const sku = m.sku;
  let fmt = 'other';
  if (/^\d{4}[A-Z]{2}$/.test(sku)) fmt = '4d+2l';
  else if (/^\d{5}[A-Z]{2}$/.test(sku)) fmt = '5d+2l';
  else if (/^[A-Z]{2,3}\d{3,4}[A-Z]?$/.test(sku)) fmt = 'eurocode-like';
  else if (/^\d{4}[A-Z]{3,6}$/.test(sku)) fmt = '4d+3-6l';
  else if (/^\d{4}[A-Z]{2}\d$/.test(sku)) fmt = '4d+2l+1d';
  
  formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
  brandCounts[m.brand] = (brandCounts[m.brand] || 0) + 1;
  typeCounts[m.typeCode] = (typeCounts[m.typeCode] || 0) + 1;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MATCHING SKU ANALYSIS (1,858 overlaps)');
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log('Format breakdown of matched SKUs:');
for (const [fmt, count] of Object.entries(formatCounts).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${fmt.padEnd(15)} ${count.toLocaleString().padStart(5)} (${(count/matches.length*100).toFixed(1)}%)`);
}
console.log();
console.log('Top brands with matching SKUs:');
for (const [brand, count] of Object.entries(brandCounts).sort((a,b) => b[1]-a[1]).slice(0, 10)) {
  console.log(`  ${brand.padEnd(20)} ${count.toLocaleString().padStart(4)}`);
}
console.log();
console.log('Glass positions of matched SKUs:');
for (const [type, count] of Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0, 10)) {
  console.log(`  ${(type || 'N/A').padEnd(6)} ${count.toLocaleString().padStart(4)}`);
}
console.log();
console.log('Sample matched SKUs with details:');
for (const m of matches.slice(0, 10)) {
  console.log(`  ${m.sku.padEnd(15)} | ${m.brand.padEnd(12)} | ${(m.model || 'N/A').padEnd(12)} | ${m.typeCode || 'N/A'}`);
}
console.log('═══════════════════════════════════════════════════════════════');
