#!/usr/bin/env node
/**
 * cleanup-european-nags.mjs
 * Remove NAGS codes from known European models after merge-nags-v2
 */
import { readFileSync, writeFileSync } from 'fs';

const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;

// European models that should NOT have NAGS codes (exact/partial match)
const EU_MODELS = [
  // Ford Europe
  'FIESTA','FOCUS','MONDEO','GALAXY','S-MAX','S MAX','C-MAX','C MAX',
  'GRAND C-MAX','GRAND C MAX','KUGA','B-MAX','B MAX','ECOSPORT','PUMA',
  'TRANSIT','TOURNEO','CONNECT','COURIER','FUSION','KA',
  // Chevrolet Europe
  'AVEO','MATIZ','EPICA','CRUZE','ORLANDO','SPARK','CAPTIVA','LACETTI',
  'KALOS','NUBIRA',
  // Chrysler Europe
  'VOYAGER','GRAND VOYAGER',
  // GM Europe (Opel/Vauxhall sold as Chevrolet in some markets)
  'ASTRA','CORSA','MERIVA','ZAFIRA','ANTARA','INSIGNIA',
  // Dodge Europe
  'CALIBER','JOURNEY','NITRO',
  // Cadillac Europe
  'BLS','BLS WAGON',
];

function isEuropeanModel(model) {
  if (!model) return false;
  const m = model.toUpperCase();
  for (const em of EU_MODELS) {
    if (m.includes(em)) return true;
  }
  return false;
}

let removedTotal = 0;
let recordsCleaned = 0;
const removedByBrand = {};

for (const r of records) {
  if (!r.nagsCodes || r.nagsCodes.length === 0) continue;
  if (!isEuropeanModel(r.model)) continue;
  
  const before = r.nagsCodes.length;
  removedTotal += before;
  recordsCleaned++;
  removedByBrand[r.brand] = (removedByBrand[r.brand] || 0) + before;
  r.nagsCodes = [];
}

const withNags = records.filter(r => r.nagsCodes && r.nagsCodes.length > 0);
const usBrands = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];
const usWithNags = withNags.filter(r => usBrands.includes(r.brand));
const usRecords = records.filter(r => usBrands.includes(r.brand));

console.log('═══════════════════════════════════════════════════════════════');
console.log('  CLEANUP EUROPEAN NAGS');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`   NAGS codes removed:     ${removedTotal.toLocaleString()}`);
console.log(`   Records cleaned:        ${recordsCleaned.toLocaleString()}`);
console.log(`   Records with NAGS:      ${withNags.length.toLocaleString()}`);
console.log(`   US records with NAGS:   ${usWithNags.length.toLocaleString()} (${(usWithNags.length/usRecords.length*100).toFixed(1)}% of US)`);
console.log();
console.log('   Removed by brand:');
for (const [brand, count] of Object.entries(removedByBrand).sort((a,b) => b[1]-a[1])) {
  console.log(`     ${brand.padEnd(15)} ${count.toString().padStart(5)}`);
}
console.log();
console.log('📝 True US models with NAGS:');
usWithNags.slice(0, 20).forEach(r => {
  console.log(`   ${r.eurocode.padEnd(18)} | ${r.brand} ${r.model.slice(0,28).padEnd(30)} | ${r.nagsCodes.join(', ')}`);
});

writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('\n💾 Saved');
console.log('═══════════════════════════════════════════════════════════════');
