#!/usr/bin/env node
/**
 * EUROCODE PARSER - Final version
 * - Long codes (10+ chars): Official ARGIC Matrix parsing
 * - Short codes (< 10 chars): Category preservation + typeCode inference
 * - Position extraction from description for all
 */

import fs from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';

// ===== ARGIC CATEGORY MAPPING (for long codes) =====
const CATEGORIES_SIMPLE = {
  1: ['A', 'C', 'D'],      // Windscreens
  2: ['B', 'E'],           // Backlights
  3: ['F', 'H', 'L', 'M', 'R', 'T'],  // Bodyglasses
  4: ['G'],                // Glass Roofs
};

const CATEGORIES_COMPLEX = {
  5: ['AK', 'BK', 'CK', 'FK', 'LK', 'RK', 'GK', 'SK', 
      'AS', 'BS', 'CS', 'FS', 'LS', 'RS', 'GS', 'SS'],
  6: ['AX', 'BX', 'CX', 'FX', 'LX', 'RX', 'GX', 'SX'],
};

const CATEGORY_NAMES = {
  1: 'frontrute',
  2: 'bakrute', 
  3: 'bodyglass',
  4: 'takglass',
  5: 'bodyglass-laminated',
  6: 'accessory'
};

// ===== TYPE CODE MAPPING =====
const TYPE_CODE_MAP = {
  'frontrute': 'F',
  'bakrute': 'B',
  'bodyglass': 'D',
  'bodyglass-laminated': 'D',
  'dørglass': 'D',
  'dørglass-frem': 'DFF',
  'dørglass-bak': 'DFB',
  'sideglass': 'SFB1',
  'takglass': 'RO',
  'accessory': 'ACC',
};

// ===== POSITION EXTRACTION FROM DESCRIPTION =====
const POSITION_PATTERNS = {
  'driver': [/\bVS\b/, /\bvenstre\b/i, /\bLH\b/, /\bLHD\b/, /\bleft\b/i, /\bførerside\b/i, /\bfører\b/i],
  'passenger': [/\bHS\b/, /\bhøyre\b/i, /\bRH\b/, /\bRHD\b/, /\bright\b/i, /\bpassasjer\b/i],
};

function parseCategory(eurocode) {
  if (!eurocode || eurocode.length < 10) return null; // Only for long codes
  
  const pos5 = eurocode[4];
  const pos56 = eurocode.substring(4, 6);
  
  // Check complex categories first (2-char codes)
  for (const [catNum, codes] of Object.entries(CATEGORIES_COMPLEX)) {
    if (codes.includes(pos56)) return parseInt(catNum);
  }
  
  // Check simple categories (1-char codes)
  for (const [catNum, codes] of Object.entries(CATEGORIES_SIMPLE)) {
    if (codes.includes(pos5)) return parseInt(catNum);
  }
  
  return null;
}

function parsePositionFromDesc(description) {
  if (!description) return null;
  
  const hasDriver = POSITION_PATTERNS.driver.some(p => p.test(description));
  const hasPassenger = POSITION_PATTERNS.passenger.some(p => p.test(description));
  
  if (hasDriver && !hasPassenger) return 'driver';
  if (hasPassenger && !hasDriver) return 'passenger';
  if (hasDriver && hasPassenger) return 'both';
  
  return null;
}

function inferTypeCode(category) {
  return TYPE_CODE_MAP[category] || null;
}

// ===== MAIN =====
console.log('🔍 EUROCODE PARSER - Final Version\n');

const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const recs = data.records;

let longCodesParsed = 0;
let shortCodesProcessed = 0;
let categoriesInferred = 0;
let typeCodesInferred = 0;
let positionsInferred = 0;

const stats = {
  longCodes: { total: 0, byCategory: {} },
  shortCodes: { total: 0, byCategory: {} },
  positions: { driver: 0, passenger: 0, both: 0 },
};

recs.forEach(r => {
  if (!r.eurocode) return;
  
  const isLongCode = r.eurocode.length >= 10;
  
  if (isLongCode) {
    // Parse with ARGIC standard
    const category = parseCategory(r.eurocode);
    if (category) {
      longCodesParsed++;
      const catName = CATEGORY_NAMES[category];
      stats.longCodes.byCategory[catName] = (stats.longCodes.byCategory[catName] || 0) + 1;
      
      // Update category if different
      if (r.category !== catName) {
        r.category = catName;
        categoriesInferred++;
      }
    }
    stats.longCodes.total++;
  } else {
    // Short code: keep existing category, infer typeCode
    stats.shortCodes.total++;
    stats.shortCodes.byCategory[r.category || 'unknown'] = (stats.shortCodes.byCategory[r.category || 'unknown'] || 0) + 1;
    shortCodesProcessed++;
  }
  
  // Infer typeCode for ALL records that lack it
  if (!r.typeCode && r.category) {
    const typeCode = inferTypeCode(r.category);
    if (typeCode) {
      r.typeCode = typeCode;
      r.typeCodeRel = 'inferred';
      typeCodesInferred++;
    }
  }
  
  // Infer position from description
  if (!r.position && r.description) {
    const pos = parsePositionFromDesc(r.description);
    if (pos) {
      r.position = pos === 'both' ? null : pos; // Don't set 'both' as it's ambiguous
      positionsInferred++;
      if (pos === 'driver') stats.positions.driver++;
      if (pos === 'passenger') stats.positions.passenger++;
      if (pos === 'both') stats.positions.both++;
    }
  }
});

console.log('=== RESULTS ===');
console.log('Total records:', recs.length);
console.log('');
console.log('Long codes (>= 10 chars):');
console.log('  Total:', stats.longCodes.total);
console.log('  Parsed with ARGIC:', longCodesParsed);
console.log('  Categories updated:', categoriesInferred);
console.log('  By category:', stats.longCodes.byCategory);
console.log('');
console.log('Short codes (< 10 chars):');
console.log('  Total:', stats.shortCodes.total);
console.log('  Processed:', shortCodesProcessed);
console.log('  By category:', stats.shortCodes.byCategory);
console.log('');
console.log('Inferred values:');
console.log('  typeCodes:', typeCodesInferred);
console.log('  positions:', positionsInferred);
console.log('    driver:', stats.positions.driver);
console.log('    passenger:', stats.positions.passenger);
console.log('    both (ambiguous):', stats.positions.both);

// Final stats
const finalStats = {
  withTypeCode: recs.filter(r => r.typeCode).length,
  withPosition: recs.filter(r => r.position).length,
  withCategory: recs.filter(r => r.category && r.category !== 'annet').length,
  categories: {}
};

recs.forEach(r => {
  const cat = r.category || 'unknown';
  finalStats.categories[cat] = (finalStats.categories[cat] || 0) + 1;
});

console.log('');
console.log('=== FINAL CATALOG STATE ===');
console.log('With typeCode:', finalStats.withTypeCode);
console.log('With position:', finalStats.withPosition);
console.log('With category:', finalStats.withCategory);
console.log('Categories:', finalStats.categories);

// Save
fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
console.log('\nCatalog saved!');
