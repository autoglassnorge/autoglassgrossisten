#!/usr/bin/env node
/**
 * EUROCODE PARSER - Based on official ARGIC Matrix 2014.7.31
 * Source: https://www.scribd.com/document/754377389/MATRIX-31072014
 */

import fs from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';

// ===== OFFICIAL ARGIC MATRIX (Edition 2014.7.31) =====

// Position 5: Glass type/color (WINDSCREENS, BACKLIGHTS, BODYGLASSES)
const POS5_GLASS_TYPE = {
  'A': { desc: 'Acoustic', color: 'acoustic' },
  'B': { desc: 'Blue', color: 'blue' },
  'C': { desc: 'Clear', color: 'clear' },
  'D': { desc: 'Double glazed', feature: 'double-glazed' },
  'E': { desc: 'Electrically operated', feature: 'electric' },
  'F': { desc: 'Front part', position: 'front' },
  'G': { desc: 'GPS', feature: 'gps' },
  'H': { desc: 'Heated', feature: 'heated' },  // Inferred from common usage
  'I': { desc: 'Inner', position: 'inner' },
  'J': { desc: 'Sensor case with lens only', feature: 'sensor-case' },
  'K': { desc: 'Laminated', feature: 'laminated' },
  'L': { desc: 'Left half', side: 'left' },
  'M': { desc: 'Middle part', position: 'middle' },
  'N': { desc: 'Water repellent glass', feature: 'water-repellent' },
  'O': { desc: 'Opening (tilting) roof', feature: 'tilting-roof' },
  'P': { desc: 'Darkening of glass through electrical impulse', feature: 'electrochromic' },
  'Q': { desc: 'Quarter', position: 'quarter' },
  'R': { desc: 'Right half', side: 'right' },
  'S': { desc: 'Sliding roof', feature: 'sliding-roof' },
  'T': { desc: 'Top', position: 'top' },
  'U': { desc: 'Upper', position: 'upper' },
  'V': { desc: 'Hardware used for the fitting of glass', feature: 'hardware' },
  'W': { desc: 'WiFi/Antenna', feature: 'antenna' },  // Inferred
  'X': { desc: 'Extra', feature: 'extra' },
  'Y': { desc: 'Yellow', color: 'yellow' },
  'Z': { desc: 'Zone', feature: 'zone' },
};

// Suffix mapping (position type based on common patterns)
const SUFFIX_MAP = {
  // Frontrute
  'VZ': { category: 'frontrute', desc: 'Vindskjerm/Visor' },
  'LM': { category: 'frontrute', desc: 'Laminated' },
  'M2': { category: 'frontrute', desc: 'Laminated v2' },
  'GN': { category: 'frontrute', desc: 'Green' },
  'CL': { category: 'frontrute', desc: 'Clear' },
  'BL': { category: 'frontrute', desc: 'Blue' },
  'BZ': { category: 'frontrute', desc: 'Bronze' },
  'GR': { category: 'frontrute', desc: 'Grey' },
  // Bakrute
  'AI': { category: 'bakrute', desc: 'All Integral' },
  'AZ': { category: 'bakrute', desc: 'All Zone' },
  'IX': { category: 'bakrute', desc: 'Index' },
  'OW': { category: 'bakrute', desc: 'One Way' },
  'SR': { category: 'bakrute', desc: 'Solar' },
  'RW': { category: 'bakrute', desc: 'Rear Window' },
  'KW': { category: 'bakrute', desc: 'Kombi Window' },
  'CZ': { category: 'bakrute', desc: 'Clear Zone' },
  // Dørglass
  'FD': { category: 'dørglass-frem', desc: 'Front Door' },
  'RD': { category: 'dørglass-bak', desc: 'Rear Door' },
  'DW': { category: 'dørglass-bak', desc: 'Door Window' },
  'DD': { category: 'dørglass', desc: 'Door' },
  // Sideglass
  'QZ': { category: 'sideglass', desc: 'Quarter glass' },
  'RV': { category: 'sideglass', desc: 'Rear Vent' },
  'KZ': { category: 'sideglass', desc: 'Kombi Quarter' },
  'QG': { category: 'sideglass', desc: 'Quarter Glass' },
  'SG': { category: 'sideglass', desc: 'Side Glass' },
  'VG': { category: 'sideglass', desc: 'Vent Glass' },
  // Tak
  'RO': { category: 'takglass', desc: 'Roof Opening' },
  'SR': { category: 'takglass', desc: 'Sun Roof' },
};

// Feature codes found in middle section
const FEATURE_MAP = {
  'AC': 'acoustic',
  'CH': 'camera+heated',
  'CM': 'camera-mirror',
  'DC': 'dual-camera',
  'DV': 'dual-vent',
  'EL': 'electric',
  'ELM': 'electric-laminated',
  'H': 'heated',
  'HM': 'heated-mirror',
  'HS': 'heated-shade',
  'PR': 'privacy',
  'PS': 'privacy-shade',
  'QS': 'quarter-shade',
  'QY': 'quarter-yellow',
  'S': 'shade',
  'SC': 'shade+camera',
  'SE': 'solar-electric',
  'SH': 'shade+heated',
  'SR': 'solar',
  'SV': 'solar-vent',
  'V': 'vent',
};

function parseEurocode(code) {
  if (!code || code.length < 5) return null;
  
  const result = {
    raw: code,
    vehicleCode: code.slice(0, 4),
    pos5: code[4],
    middle: '',
    suffix: '',
    category: null,
    position: null, // left/right
    color: null,
    features: [],
    confidence: 'low',
    parsed: false
  };
  
  // Determine suffix (last 2 chars for long codes, last 1 for short)
  let suffix = '';
  if (code.length >= 10) {
    suffix = code.slice(-2);
    result.middle = code.slice(5, -2);
  } else if (code.length >= 7) {
    suffix = code.slice(-2);
    if (!SUFFIX_MAP[suffix]) {
      suffix = code.slice(-1);
      result.middle = code.slice(5, -1);
    } else {
      result.middle = code.slice(5, -2);
    }
  } else {
    suffix = code.slice(-1);
    result.middle = code.slice(5, -1);
  }
  
  result.suffix = suffix;
  
  // Parse pos5
  if (POS5_GLASS_TYPE[result.pos5]) {
    const p5 = POS5_GLASS_TYPE[result.pos5];
    if (p5.color) result.color = p5.color;
    if (p5.side) result.position = p5.side;
    if (p5.feature) result.features.push(p5.feature);
    if (p5.position && !result.position) result.position = p5.position;
  }
  
  // Parse suffix -> category
  if (SUFFIX_MAP[suffix]) {
    result.category = SUFFIX_MAP[suffix].category;
    result.confidence = 'high';
  } else if (['N', 'H', 'V', 'M', 'L'].includes(suffix)) {
    // Common frontrute suffixes
    result.category = 'frontrute';
    result.confidence = 'medium';
  }
  
  // Parse features from middle
  const middle = result.middle;
  // Check multi-char features first
  const sortedFeatures = Object.entries(FEATURE_MAP).sort((a, b) => b[0].length - a[0].length);
  let remaining = middle;
  for (const [featCode, featDesc] of sortedFeatures) {
    if (remaining.includes(featCode)) {
      result.features.push(featDesc);
      remaining = remaining.replace(featCode, '');
    }
  }
  
  // Deduplicate features
  result.features = [...new Set(result.features)];
  
  result.parsed = true;
  return result;
}

// ===== MAIN =====

console.log('🔍 EUROCODE PARSER - ARGIC Matrix 2014.7.31\n');

const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const recs = data.records;

let parsed = 0;
let categoryMatched = 0;
let highConfidence = 0;
const categoryDist = {};
const featureCounts = {};
const sideCounts = { left: 0, right: 0, null: 0 };
const colorCounts = {};
const vehicleCodes = new Set();

const examples = [];

recs.forEach(r => {
  if (!r.eurocode) return;
  
  const p = parseEurocode(r.eurocode);
  if (!p) return;
  
  parsed++;
  vehicleCodes.add(p.vehicleCode);
  
  if (p.category) {
    categoryDist[p.category] = (categoryDist[p.category] || 0) + 1;
    if (p.confidence === 'high') highConfidence++;
    
    // Check if matches existing
    if (r.category && r.category === p.category) {
      categoryMatched++;
    }
  }
  
  if (p.position) sideCounts[p.position] = (sideCounts[p.position] || 0) + 1;
  else sideCounts.null++;
  
  if (p.color) colorCounts[p.color] = (colorCounts[p.color] || 0) + 1;
  
  p.features.forEach(f => {
    featureCounts[f] = (featureCounts[f] || 0) + 1;
  });
  
  // Collect examples of inferred categories for uncategorized items
  if (!r.category && p.confidence === 'high') {
    examples.push({
      eurocode: r.eurocode,
      inferred: p.category,
      pos5: p.pos5,
      suffix: p.suffix,
      position: p.position,
      color: p.color,
      features: p.features
    });
  }
});

console.log('=== PARSER RESULTS ===');
console.log('Total records:', recs.length);
console.log('Successfully parsed:', parsed);
console.log('High confidence:', highConfidence);
console.log('Unique vehicle codes:', vehicleCodes.size);
console.log('');

console.log('=== CATEGORY DISTRIBUTION ===');
Object.entries(categoryDist).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
  const pct = ((count / parsed) * 100).toFixed(1);
  console.log(`  ${cat}: ${count} (${pct}%)`);
});

console.log('');
console.log('=== SIDE DISTRIBUTION ===');
Object.entries(sideCounts).forEach(([side, count]) => {
  if (count > 0) console.log(`  ${side}: ${count}`);
});

console.log('');
console.log('=== COLOR DISTRIBUTION ===');
Object.entries(colorCounts).sort((a,b) => b[1]-a[1]).forEach(([color, count]) => {
  console.log(`  ${color}: ${count}`);
});

console.log('');
console.log('=== TOP FEATURES ===');
Object.entries(featureCounts).sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([feat, count]) => {
  console.log(`  ${feat}: ${count}`);
});

console.log('');
console.log('=== EXAMPLES (uncategorized + high confidence) ===');
examples.slice(0, 15).forEach(e => {
  console.log(`${e.eurocode} -> ${e.inferred} (pos5=${e.pos5}, suffix=${e.suffix}, side=${e.position}, color=${e.color}, features=[${e.features.join(', ')}])`);
});

// ===== WRITE UPDATED CATALOG =====
let updated = 0;
recs.forEach(r => {
  if (!r.eurocode) return;
  
  const p = parseEurocode(r.eurocode);
  if (!p) return;
  
  // Update category if missing or 'annet'
  if ((!r.category || r.category === 'annet') && p.category && p.confidence === 'high') {
    r.category = p.category;
    updated++;
  }
  
  // Update position if missing
  if (!r.position && p.position) {
    r.position = p.position;
  }
  
  // Update features
  if (p.features.length > 0 && !r.features) {
    r.features = p.features;
  }
});

console.log('');
console.log(`=== UPDATED ${updated} records with inferred categories ===`);

// Save updated catalog
fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
console.log('Catalog saved to', CATALOG_PATH);
