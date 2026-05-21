#!/usr/bin/env node
/**
 * merge-nags-v2.mjs — Strict NAGS → Catalog matching for US vehicles ONLY
 * Fixes the over-matching bug in merge-nags.ts
 */
import { readFileSync, writeFileSync } from 'fs';

// ─── Config ───
const US_BRANDS = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];
const MAX_NAGS_PER_RECORD = 5;

// ─── Helpers ───
function normalizeMake(make) {
  if (!make) return '';
  const m = make.toUpperCase().trim();
  const aliases = { 'GM': 'CHEVROLET', 'CHEVY': 'CHEVROLET', 'CHEV': 'CHEVROLET' };
  return aliases[m] || m;
}

function normalizeModel(model) {
  if (!model) return '';
  return model.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferGlassType(nagsCode) {
  const p = nagsCode.substring(0, 2).toUpperCase();
  if (['DW','FW','DL','FL'].includes(p)) return 'frontrute';
  if (['DB','FB'].includes(p)) return 'bakrute';
  if (['DD','FD','DQ','FQ','DV','FV','DS','FS'].includes(p)) return 'siderute';
  if (['DR','FR'].includes(p)) return 'tak';
  return 'annet';
}

function tokenizeModel(model) {
  return normalizeModel(model).split(/\s+/).filter(t => t.length >= 2);
}

/**
 * STRICT model match — requires significant token overlap
 */
function strictModelMatches(nagsModel, catalogModel) {
  if (!catalogModel) return false;
  
  const nTokens = tokenizeModel(nagsModel);
  const cTokens = tokenizeModel(catalogModel);
  
  if (nTokens.length === 0 || cTokens.length === 0) return false;
  
  // Direct inclusion (one contains the other)
  const nStr = normalizeModel(nagsModel);
  const cStr = normalizeModel(catalogModel);
  if (nStr === cStr) return true;
  
  // Token overlap counting
  const common = nTokens.filter(t => cTokens.includes(t));
  
  // Require at least 2 common tokens, OR 1 token of length >= 4
  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 4) return true;
  
  // Short model whitelist — exact match only
  const shortModels = ['F150','F250','F350','F450','H1','H2','H3','LS','CTS','PT'];
  for (const sm of shortModels) {
    if (nTokens.includes(sm) && cTokens.includes(sm)) return true;
  }
  
  // Substring within tokens (3+ chars)
  for (const nt of nTokens) {
    for (const ct of cTokens) {
      if (nt.length >= 3 && ct.length >= 3) {
        if (nt === ct) return true;
      }
    }
  }
  
  return false;
}

function yearOverlap(nagsYearFrom, nagsYearTo, catalogYearFrom, catalogYearTo) {
  if (!nagsYearFrom && !nagsYearTo) return true;
  if (!catalogYearFrom && !catalogYearTo) return true;
  
  if (nagsYearFrom && catalogYearTo && nagsYearFrom > catalogYearTo + 1) return false;
  if (nagsYearTo && catalogYearFrom && nagsYearTo < catalogYearFrom - 1) return false;
  
  return true;
}

// ─── Load data ───
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;
const nagsData = JSON.parse(readFileSync('data/nags-all-combined.json', 'utf-8'));
const nagsEntries = nagsData.entries;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MERGE NAGS v2 — Strict US-Only Matching');
console.log('═══════════════════════════════════════════════════════════════\n');

// Filter to US-brand records only
const usRecords = records.filter(r => US_BRANDS.includes(r.brand));
console.log(`📦 Total catalog records: ${records.length.toLocaleString()}`);
console.log(`   US-brand records:      ${usRecords.length.toLocaleString()}`);
console.log(`   NAGS entries:          ${nagsEntries.length.toLocaleString()}\n`);

// Pre-filter NAGS to US brands only
const usNags = nagsEntries.filter(n => US_BRANDS.includes(normalizeMake(n.make)));
console.log(`🔍 US-brand NAGS entries: ${usNags.length.toLocaleString()}\n`);

// Initialize nagsCodes
for (const r of records) {
  if (!r.nagsCodes) r.nagsCodes = [];
}

let updated = 0;
const stats = {};
const debug = [];

// ─── Merge loop ───
for (const nags of usNags) {
  const nagsMake = normalizeMake(nags.make);
  const nagsModel = nags.model || '';
  const nagsType = nags.glassType || inferGlassType(nags.nagsCode);
  
  // Find candidate records (same brand, US only)
  const candidates = usRecords.filter(r => r.brand === nagsMake);
  
  // Strict matching
  const matches = candidates.filter(r => {
    // Type match
    const recordType = r.category?.toLowerCase() || 'annet';
    const nagsTypeLower = nagsType.toLowerCase();
    if (nagsTypeLower !== recordType && recordType !== 'annet') {
      // Description check as fallback
      const desc = (r.description || '').toLowerCase();
      if (nagsTypeLower === 'frontrute' && !desc.includes('windshield') && !desc.includes('frontrute')) return false;
      if (nagsTypeLower === 'bakrute' && !desc.includes('back') && !desc.includes('bakrute')) return false;
      if (nagsTypeLower === 'siderute' && !desc.includes('door') && !desc.includes('side') && !desc.includes('siderute') && !desc.includes('dør')) return false;
    }
    
    // Year overlap
    if (!yearOverlap(nags.yearFrom, nags.yearTo, r.yearFrom, r.yearTo)) return false;
    
    // STRICT model match
    if (!strictModelMatches(nagsModel, r.model)) return false;
    
    return true;
  });
  
  if (matches.length > 0) {
    const fullNags = nags.suffix ? `${nags.nagsCode} ${nags.suffix}` : nags.nagsCode;
    
    for (const match of matches) {
      if (match.nagsCodes.length >= MAX_NAGS_PER_RECORD) continue;
      if (!match.nagsCodes.includes(fullNags)) {
        match.nagsCodes.push(fullNags);
        updated++;
      }
    }
    
    stats[nagsMake] = (stats[nagsMake] || 0) + matches.length;
    
    if (matches.length > 10) {
      debug.push({ nagsCode: fullNags, make: nagsMake, model: nagsModel, matches: matches.length, matchModels: matches.slice(0, 3).map(m => m.model) });
    }
  }
}

// ─── Results ───
const withNags = records.filter(r => r.nagsCodes && r.nagsCodes.length > 0);
const usWithNags = usRecords.filter(r => r.nagsCodes && r.nagsCodes.length > 0);

console.log('📊 Results:');
console.log(`   NAGS codes added:              ${updated.toLocaleString()}`);
console.log(`   Records with NAGS (total):     ${withNags.length.toLocaleString()}`);
console.log(`   US records with NAGS:          ${usWithNags.length.toLocaleString()} (${(usWithNags.length/usRecords.length*100).toFixed(1)}% of US)`);
console.log();

console.log('🏷️  By brand:');
for (const [brand, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  const brandRecords = usRecords.filter(r => r.brand === brand).length;
  console.log(`   ${brand.padEnd(15)} ${count.toString().padStart(5)} matches  (${brandRecords.toString().padStart(4)} records)`);
}
console.log();

// Show high-match warnings
if (debug.length > 0) {
  console.log('⚠️  High-match warnings (>10 matches per NAGS code):');
  for (const d of debug.slice(0, 10)) {
    console.log(`   ${d.nagsCode.padEnd(12)} ${d.make} ${d.model.slice(0,30).padEnd(32)} → ${d.matches} matches`);
  }
  console.log();
}

// Show examples
console.log('📝 Examples:');
usWithNags.slice(0, 10).forEach(r => {
  console.log(`   ${r.eurocode.padEnd(18)} | ${r.brand} ${r.model.slice(0,25).padEnd(28)} | ${r.nagsCodes.join(', ')}`);
});
console.log();

// Save
writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('💾 Saved to data/catalog-prod.json');
console.log('═══════════════════════════════════════════════════════════════');
