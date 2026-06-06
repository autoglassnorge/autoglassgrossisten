#!/usr/bin/env node
/**
 * Apply position inference from auto-glass.no scrape data to catalog-prod.json
 * 
 * Auto-glass.no typeCodes encode position:
 * - F = Fører (driver/venstre/VS/left)
 * - P = Passasjer (passenger/høyre/HS/right)
 * 
 * TypeCode patterns:
 * - DFF, DFB, DFFV, DFBV, SFB1-3, BF → driver
 * - DPF, DPB, DPFV, DPBV, SPB1-3, BP → passenger
 * 
 * Titles with VS/HS or "begge" override to "both"
 */

import { readFileSync, writeFileSync } from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';
const AG_DATA_PATH = './data/autoglass-scrape/products-normalized.json';

// Load data
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
const agData = JSON.parse(readFileSync(AG_DATA_PATH, 'utf8'));

// Build auto-glass lookup by SKU
const agBySku = new Map();
for (const p of agData) {
  if (p.sku) agBySku.set(p.sku, p);
}

// Position inference function
function inferPosition(typeCode, title) {
  if (!typeCode) return null;
  
  const t = (title || '').toUpperCase();
  
  // Explicit both-sides indicator in title overrides everything
  if (/\bVS\s*[/+]\s*HS\b/.test(t) || /\bBEGGE\b/.test(t) || /\b2\s*STK\b/.test(t)) {
    return 'both';
  }
  
  // Driver-side typeCodes
  if (/^(DFF|DFB|DFFV|DFBV|SFB[123]|BF)$/.test(typeCode)) {
    if (/\bHS\b/.test(t)) return 'passenger'; // Title contradicts typeCode
    if (/\bVS\b/.test(t)) return 'driver';     // Title confirms
    return 'driver';
  }
  
  // Passenger-side typeCodes
  if (/^(DPF|DPB|DPFV|DPBV|SPB[123]|BP)$/.test(typeCode)) {
    if (/\bVS\b/.test(t)) return 'driver';      // Title contradicts typeCode
    if (/\bHS\b/.test(t)) return 'passenger';   // Title confirms
    return 'passenger';
  }
  
  return null;
}

// Apply fixes
let fixed = 0;
let alreadyHad = 0;
let noMatch = 0;
const byCategory = {};

for (const record of catalog.records) {
  if (record.position) {
    alreadyHad++;
    continue;
  }
  
  const ag = agBySku.get(record.eurocode);
  if (!ag) {
    noMatch++;
    continue;
  }
  
  const inferred = inferPosition(ag.typeCode, ag.title);
  if (inferred) {
    record.position = inferred;
    fixed++;
    const cat = record.category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
}

// Save updated catalog
writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

// Report
const total = catalog.records.length;
const withPos = catalog.records.filter(r => r.position).length;

console.log('=== Position Fix Applied ===');
console.log(`Total records: ${total}`);
console.log(`Already had position: ${alreadyHad}`);
console.log(`Fixed: ${fixed}`);
console.log(`No auto-glass match: ${noMatch}`);
console.log(`New total with position: ${withPos}`);
console.log(`Overall coverage: ${(withPos / total * 100).toFixed(2)}%`);

console.log('\n--- Fixed by category ---');
for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

// Category-level position summary
console.log('\n--- Position by category (after fix) ---');
const catStats = {};
for (const r of catalog.records) {
  const cat = r.category || 'unknown';
  if (!catStats[cat]) catStats[cat] = { total: 0, withPos: 0 };
  catStats[cat].total++;
  if (r.position) catStats[cat].withPos++;
}
for (const [cat, stats] of Object.entries(catStats).sort((a, b) => b[1].total - a[1].total)) {
  const pct = stats.withPos > 0 ? (stats.withPos / stats.total * 100).toFixed(1) : '0';
  console.log(`  ${cat}: ${stats.withPos}/${stats.total} (${pct}%)`);
}
