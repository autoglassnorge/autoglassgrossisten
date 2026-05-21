#!/usr/bin/env node
/**
 * Audit US-brand records in catalog-prod.json
 * Reports: category distribution, NAGS-like eurocodes, model names, brand mapping issues
 */
import { readFileSync, writeFileSync } from 'fs';

const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf8'));
const records = catalog.records;

const usBrands = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];

const usRecords = records.filter(r => usBrands.includes(r.brand));

// Category distribution
const catDist = {};
for (const r of usRecords) {
  const c = r.category || 'unknown';
  catDist[c] = (catDist[c] || 0) + 1;
}

// NAGS-like eurocodes (don't start with 4 digits)
const nagsLike = usRecords.filter(r => r.eurocode && !r.eurocode.match(/^\d{4}[A-Z]/));
const nagsByPrefix = {};
for (const r of nagsLike) {
  const prefix = r.eurocode.substring(0, 2);
  nagsByPrefix[prefix] = (nagsByPrefix[prefix] || 0) + 1;
}

// Model name analysis
const modelCounts = {};
for (const r of usRecords) {
  const m = r.model || 'UNKNOWN';
  modelCounts[m] = (modelCounts[m] || 0) + 1;
}

// Year availability
const withYear = usRecords.filter(r => r.yearFrom !== null && r.yearFrom !== undefined).length;
const withoutYear = usRecords.filter(r => r.yearFrom === null || r.yearFrom === undefined).length;

// Source distribution
const sourceDist = {};
for (const r of usRecords) {
  const s = r.source || 'unknown';
  sourceDist[s] = (sourceDist[s] || 0) + 1;
}

// NAGS code status
const withNags = usRecords.filter(r => r.nagsCodes && r.nagsCodes.length > 0).length;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  US-BRAND RECORDS AUDIT');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`📊 Total US-brand records: ${usRecords.length.toLocaleString()}`);
console.log(`   With yearFrom:            ${withYear.toLocaleString()}`);
console.log(`   Without yearFrom:         ${withoutYear.toLocaleString()}`);
console.log(`   With NAGS codes:          ${withNags}`);
console.log();

console.log('📂 CATEGORY DISTRIBUTION');
for (const [cat, count] of Object.entries(catDist).sort((a, b) => b[1] - a[1])) {
  const pct = (count / usRecords.length * 100).toFixed(1);
  console.log(`   ${cat.padEnd(12)} ${count.toString().padStart(5)} (${pct}%)`);
}
console.log();

console.log('🏷️  NAGS-LIKE EUROCODES (non-standard format)');
console.log(`   Total US records with NAGS-like codes: ${nagsLike.length}`);
console.log('   By prefix:');
for (const [pfx, count] of Object.entries(nagsByPrefix).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${pfx.padEnd(4)} ${count.toString().padStart(4)}`);
}
console.log();

console.log('📦 SOURCE DISTRIBUTION');
for (const [src, count] of Object.entries(sourceDist).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${src.padEnd(20)} ${count.toString().padStart(5)}`);
}
console.log();

console.log('🚗 TOP 20 US MODELS (by record count)');
const sortedModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
for (const [model, count] of sortedModels.slice(0, 20)) {
  console.log(`   ${model.padEnd(40)} ${count.toString().padStart(3)}`);
}
console.log();

// Save detailed audit data
const auditData = {
  totalUsRecords: usRecords.length,
  categoryDistribution: catDist,
  nagsLikeCodes: {
    count: nagsLike.length,
    byPrefix: nagsByPrefix,
    examples: nagsLike.slice(0, 50).map(r => ({
      eurocode: r.eurocode,
      brand: r.brand,
      model: r.model,
      category: r.category,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
      source: r.source,
      description: r.description
    }))
  },
  sourceDistribution: sourceDist,
  modelCounts: Object.fromEntries(sortedModels.slice(0, 100)),
  withYear,
  withoutYear,
  withNags
};

writeFileSync('data/audit-us-records.json', JSON.stringify(auditData, null, 2));
console.log('💾 Detailed audit saved to: data/audit-us-records.json');
console.log('═══════════════════════════════════════════════════════════════');
