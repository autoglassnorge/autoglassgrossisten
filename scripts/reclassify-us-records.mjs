#!/usr/bin/env node
/**
 * reclassify-us-records.mjs
 * Fix category for US-brand records currently classified as "annet" or "unknown"
 */
import { readFileSync, writeFileSync } from 'fs';

const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;

const usBrands = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];

function getNagsPrefix(eurocode) {
  if (!eurocode) return null;
  const m = eurocode.match(/^([A-Z]{2})/);
  return m ? m[1] : null;
}

function inferCategory(r) {
  const model = (r.model || '').toUpperCase();
  const desc = (r.description || '').toUpperCase();
  const euro = (r.eurocode || '').toUpperCase();
  const nagsPrefix = getNagsPrefix(euro);
  
  // Rule 1: NAGS-like code prefix
  if (['DW','FW','DL','FL'].includes(nagsPrefix)) return 'frontrute';
  if (['DB','FB'].includes(nagsPrefix)) return 'bakrute';
  if (['DD','FD','DQ','FQ','DV','FV','DS','FS'].includes(nagsPrefix)) return 'siderute';
  
  // Rule 2: Model name hints
  if (model.includes('BACK') || model.includes('REAR') || model.includes('BAK')) return 'bakrute';
  if (model.includes('DOOR') || model.includes('DØR') || model.includes('SIDE') || model.includes('VENTIL')) return 'siderute';
  if (model.includes('WINDSHIELD') || model.includes('FRONT') || model.includes('FRONTRUTE') || model.includes('WS ')) return 'frontrute';
  
  // Rule 3: Description hints
  if (desc.includes('BAKRUTE') || desc.includes('BACK') || desc.includes('REAR')) return 'bakrute';
  if (desc.includes('DØRRUTE') || desc.includes('DØR') || desc.includes('DOOR') || desc.includes('SIDE')) return 'siderute';
  if (desc.includes('FRONTRUTE') || desc.includes('WINDSHIELD') || desc.includes('WS ')) return 'frontrute';
  
  // Rule 4: Eurocode pattern (standard format)
  // 4-digit prefix + AG = frontrute, AC = bakrute, AS = siderute
  const standardMatch = euro.match(/^\d{4}([A-Z]{2})/);
  if (standardMatch) {
    const typeCode = standardMatch[1];
    if (typeCode === 'AG' || typeCode.startsWith('A')) return 'frontrute'; // Most start with AG
    if (typeCode === 'AC') return 'bakrute';
    if (typeCode === 'AS') return 'siderute';
  }
  
  // Rule 5: Default for US = frontrute (90% are windshields)
  return 'frontrute';
}

let changed = 0;
const beforeDist = {};
const afterDist = {};

for (const r of records) {
  if (!usBrands.includes(r.brand)) continue;
  if (r.category !== 'annet' && r.category !== 'unknown') continue;
  
  const oldCat = r.category;
  const newCat = inferCategory(r);
  
  beforeDist[oldCat] = (beforeDist[oldCat] || 0) + 1;
  afterDist[newCat] = (afterDist[newCat] || 0) + 1;
  
  if (oldCat !== newCat) {
    r.category = newCat;
    changed++;
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  RECLASSIFY US-BRAND RECORDS');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`   Records reclassified: ${changed.toLocaleString()}`);
console.log();
console.log('   Before → After:');
for (const [oldCat, count] of Object.entries(beforeDist)) {
  console.log(`   ${oldCat} (${count}) → ${Object.entries(afterDist).map(([k,v]) => k + ':' + v).join(', ')}`);
}
console.log();

// Show new category distribution for US brands
const usRecords = records.filter(r => usBrands.includes(r.brand));
const newDist = {};
for (const r of usRecords) {
  const c = r.category || 'unknown';
  newDist[c] = (newDist[c] || 0) + 1;
}
console.log('   New US-brand category distribution:');
for (const [cat, count] of Object.entries(newDist).sort((a,b) => b[1]-a[1])) {
  const pct = (count / usRecords.length * 100).toFixed(1);
  console.log(`     ${cat.padEnd(12)} ${count.toString().padStart(5)} (${pct}%)`);
}

writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('\n💾 Saved');
console.log('═══════════════════════════════════════════════════════════════');
