#!/usr/bin/env node
/**
 * POSITION PARSER v2 - Extract side/position with 100% target
 * Rules:
 * - NEVER overwrite existing positions
 * - Frontrute/bakrute/takglass = null position (not side-specific)
 * - VS = driver (left in Norway), HS = passenger (right in Norway)
 * - VS/HS = both
 * - Long ARGIC codes: L=left=driver, R=right=passenger
 */

import fs from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';

// ===== SIDE DETECTION FROM DESCRIPTION =====
const SIDE_PATTERNS = {
  both: [
    /\bVS\s*[/+]\s*HS\b/,
    /\bHS\s*[/+]\s*VS\b/,
    /\bvenstre\s*[/+]\s*høyre\b/i,
    /\bhøyre\s*[/+]\s*venstre\b/i,
    /\bbegge\b/i,
    /\bsider\b/i,
    /\b2\s*STK\b/i,
    /\bsett\b/i,
  ],
  driver: [
    /\bVS\b/,
    /\bvenstre\b/i,
    /\bførerside\b/i,
    /\bfører\b/i,
    /\bvenst\b/i,
    /\bLHD\b/,
    /\bLH\b/,
  ],
  passenger: [
    /\bHS\b/,
    /\bhøyre\b/i,
    /\bpassasjer\b/i,
    /\bhøy\b/i,
    /\bRHD\b/,
    /\bRH\b/,
  ],
};

// ===== POSITION DETECTION FROM DESCRIPTION =====
const POSITION_PATTERNS = {
  front: [/\bfremme\b/i, /\bfront\b/i, /\bfram\b/i],
  rear: [/\bbak\b/i, /\brear\b/i, /\baker\b/i],
};

// ===== ARGIC SIDE DETECTION (long codes) =====
function detectSideFromEurocode(eurocode, category) {
  if (!eurocode || eurocode.length < 10) return null;
  
  // Pattern 1: 4 digits + L/R + rest (e.g., 2047LGNC2FD)
  if (/^\d{4}[LR][A-Z]/.test(eurocode)) {
    const side = eurocode[4];
    if (side === 'L') return 'driver';
    if (side === 'R') return 'passenger';
  }
  
  // Pattern 2: For bodyglasses, check for standalone L/R in positions 5-8
  if (category === 'dørglass' || category === 'dørglass-frem' || 
      category === 'dørglass-bak' || category === 'sideglass' || category === 'bodyglass') {
    const mid = eurocode.substring(4, Math.min(eurocode.length - 2, 10));
    const hasL = mid.includes('L');
    const hasR = mid.includes('R');
    if (hasL && !hasR) return 'driver';
    if (hasR && !hasL) return 'passenger';
  }
  
  return null;
}

// ===== SIDE DETECTION FROM DESCRIPTION =====
function detectSideFromDescription(description) {
  if (!description) return null;
  
  // Check BOTH first (must be before individual checks)
  for (const pattern of SIDE_PATTERNS.both) {
    if (pattern.test(description)) return 'both';
  }
  
  const hasDriver = SIDE_PATTERNS.driver.some(p => p.test(description));
  const hasPassenger = SIDE_PATTERNS.passenger.some(p => p.test(description));
  
  if (hasDriver && hasPassenger) return 'both';
  if (hasDriver) return 'driver';
  if (hasPassenger) return 'passenger';
  
  return null;
}

// ===== MAIN =====
console.log('🔍 POSITION PARSER v2 - Preserving existing data\n');

const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const recs = data.records;

let added = 0;
let skippedFrontrute = 0;
let skippedBakrute = 0;
let skippedTakglass = 0;
let skippedTilbehør = 0;

const stats = {
  before: recs.filter(r => r.position).length,
  driver: 0,
  passenger: 0,
  both: 0,
};

recs.forEach(r => {
  // Skip if already has position
  if (r.position) return;
  
  // Skip categories that don't have sides
  if (r.category === 'frontrute') { skippedFrontrute++; return; }
  if (r.category === 'bakrute') { skippedBakrute++; return; }
  if (r.category === 'takglass') { skippedTakglass++; return; }
  if (r.category === 'tilbehør') { skippedTilbehør++; return; }
  
  let side = null;
  let source = 'none';
  
  // Try eurocode first (most reliable for long codes)
  if (r.eurocode && r.eurocode.length >= 10) {
    side = detectSideFromEurocode(r.eurocode, r.category);
    if (side) source = 'eurocode';
  }
  
  // Fallback to description
  if (!side && r.description) {
    side = detectSideFromDescription(r.description);
    if (side) source = 'description';
  }
  
  // Apply
  if (side) {
    r.position = side;
    added++;
    
    if (side === 'driver') stats.driver++;
    else if (side === 'passenger') stats.passenger++;
    else if (side === 'both') stats.both++;
  }
});

const after = recs.filter(r => r.position).length;

console.log('=== RESULTS ===');
console.log('Total records:', recs.length);
console.log('Before:', stats.before);
console.log('Added:', added);
console.log('After:', after);
console.log('Coverage:', ((after / recs.length) * 100).toFixed(1) + '%');
console.log('');
console.log('Skipped (no side for these categories):');
console.log('  Frontrute:', skippedFrontrute);
console.log('  Bakrute:', skippedBakrute);
console.log('  Takglass:', skippedTakglass);
console.log('  Tilbehør:', skippedTilbehør);
console.log('');
console.log('Side distribution (new):');
console.log('  Driver:', stats.driver);
console.log('  Passenger:', stats.passenger);
console.log('  Both:', stats.both);

// Show examples of newly parsed positions
console.log('\n=== NEW EXAMPLES ===');
const examples = recs.filter(r => r.position && r._new).slice(0, 15);
// Actually, we can't track _new easily, just show recent additions
const allWithPos = recs.filter(r => r.position);
const newOnes = allWithPos.slice(-20);
newOnes.forEach(r => {
  console.log(r.eurocode + ' -> ' + r.category + ' | pos=' + r.position + ' | ' + (r.description || '').slice(0, 50));
});

// Save
fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
console.log('\nCatalog saved!');
