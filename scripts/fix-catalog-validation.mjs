#!/usr/bin/env node
/**
 * fix-catalog-validation.mjs
 * Fix common validation issues in catalog-prod.json:
 * - Generate prefix4 from eurocode
 * - Set missing brand from source or description
 * - Copy valid articleNumber to eurocode if eurocode is missing
 */
import { readFileSync, writeFileSync } from 'fs';

const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;

const eurocodeRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;

let prefix4Fixed = 0;
let brandFixed = 0;
let eurocodeFixed = 0;

for (const r of records) {
  // Fix prefix4: use first 4 chars of eurocode, or first 4 chars of articleNumber
  if (!r.prefix4 || !/^\d{4}$/.test(r.prefix4)) {
    if (r.eurocode && r.eurocode.length >= 4) {
      r.prefix4 = r.eurocode.substring(0, 4);
      prefix4Fixed++;
    } else if (r.articleNumber && r.articleNumber.length >= 4) {
      r.prefix4 = r.articleNumber.substring(0, 4);
      prefix4Fixed++;
    }
  }
  
  // Fix missing brand
  if (!r.brand || r.brand.trim() === '') {
    if (r.source === 'pilkington-irl') {
      r.brand = 'PILKINGTON';
    } else if (r.source === 'glavista') {
      r.brand = 'GLAVISTA';
    } else if (r.source === 'autoglass.ru') {
      r.brand = 'AUTOGlass';
    } else {
      r.brand = '_ANNET_';
    }
    brandFixed++;
  }
  
  // Fix missing/invalid eurocode: use articleNumber if valid
  if (!r.eurocode || !eurocodeRegex.test(r.eurocode)) {
    if (r.articleNumber && eurocodeRegex.test(r.articleNumber)) {
      r.eurocode = r.articleNumber;
      eurocodeFixed++;
    }
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  FIX CATALOG VALIDATION ISSUES');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`   prefix4 fixed:     ${prefix4Fixed.toLocaleString()}`);
console.log(`   brand fixed:       ${brandFixed.toLocaleString()}`);
console.log(`   eurocode fixed:    ${eurocodeFixed.toLocaleString()}`);
console.log();

// Re-check
const stillBadEuro = records.filter(r => !r.eurocode || !eurocodeRegex.test(r.eurocode));
const stillBadBrand = records.filter(r => !r.brand || r.brand.trim() === '');
const stillBadPrefix4 = records.filter(r => !/^\d{4}$/.test(r.prefix4));

console.log('   Remaining issues:');
console.log(`     Bad eurocodes:  ${stillBadEuro.length}`);
console.log(`     Missing brands: ${stillBadBrand.length}`);
console.log(`     Bad prefix4:    ${stillBadPrefix4.length}`);
console.log();

writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('💾 Saved');
console.log('═══════════════════════════════════════════════════════════════');
