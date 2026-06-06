#!/usr/bin/env node
/**
 * EUROCODE PARSER v2 - Based on official ARGIC Matrix from pskvortzov/deeurocoder
 * GitHub: https://github.com/pskvortzov/deeurocoder
 * ARGIC Matrix Edition: 2014.7.31
 */

import fs from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';

// ===== OFFICIAL ARGIC CATEGORY MAPPING =====
// Category is determined by position 5 (and sometimes position 6)
const CATEGORIES_SIMPLE = {
  1: ['A', 'C', 'D'],      // Windscreens
  2: ['B', 'E'],           // Backlights
  3: ['F', 'H', 'L', 'M', 'R', 'T'],  // Bodyglasses
  4: ['G'],                // Glass Roofs
};

const CATEGORIES_COMPLEX = {
  5: ['AK', 'BK', 'CK', 'FK', 'LK', 'RK', 'GK', 'SK', 
      'AS', 'BS', 'CS', 'FS', 'LS', 'RS', 'GS', 'SS'],  // Complex bodyglasses (laminated/sliding)
  6: ['AX', 'BX', 'CX', 'FX', 'LX', 'RX', 'GX', 'SX'],  // Complex accessories
};

// Category names mapping
const CATEGORY_NAMES = {
  1: 'frontrute',
  2: 'bakrute', 
  3: 'bodyglass',
  4: 'takglass',
  5: 'bodyglass-laminated',
  6: 'accessory'
};

// ===== GLASS TYPE MAPPING (Category 1 - Windscreens) =====
const GLASS_TYPE_WINDSCREEN = {
  'A': 'Windscreen',
  'C': 'Alternative windscreen',
  'D': 'Windscreen with accessories in pack',
};

// ===== GLASS TYPE MAPPING (Category 2 - Backlights) =====
const GLASS_TYPE_BACKLIGHT = {
  'B': 'Backlight',
  'E': 'Backlight with accessories in pack',
};

// ===== GLASS TYPE MAPPING (Category 3 - Bodyglasses) =====
const GLASS_TYPE_BODYGLASS = {
  'F': 'Front door',
  'H': 'Rear door',
  'L': 'Front quarterlight',
  'M': 'Middle door',
  'R': 'Rear quarterlight',
  'T': 'Vent',
};

// ===== GLASS TYPE MAPPING (Category 4 - Glass Roofs) =====
const GLASS_TYPE_ROOF = {
  'G': 'Glass roof',
};

// ===== GLASS TYPE MAPPING (Category 5 - Complex bodyglasses) =====
const GLASS_TYPE_COMPLEX = {
  'AK': 'Front door - laminated',
  'BK': 'Rear door - laminated',
  'CK': 'Front quarterlight - laminated',
  'FK': 'Front door - laminated',
  'LK': 'Front quarterlight - laminated',
  'RK': 'Rear quarterlight - laminated',
  'GK': 'Glass roof - laminated',
  'SK': 'Sliding roof - laminated',
  'AS': 'Front door - sliding',
  'BS': 'Rear door - sliding',
  'CS': 'Front quarterlight - sliding',
  'FS': 'Front door - sliding',
  'LS': 'Front quarterlight - sliding',
  'RS': 'Rear quarterlight - sliding',
  'GS': 'Glass roof - sliding',
  'SS': 'Sliding roof - sliding',
};

// ===== GLASS TYPE MAPPING (Category 6 - Accessories) =====
const GLASS_TYPE_ACCESSORY = {
  'AX': 'Accessory - front door',
  'BX': 'Accessory - rear door',
  'CX': 'Accessory - front quarterlight',
  'FX': 'Accessory - front door',
  'LX': 'Accessory - front quarterlight',
  'RX': 'Accessory - rear quarterlight',
  'GX': 'Accessory - glass roof',
  'SX': 'Accessory - sliding roof',
};

// ===== GLASS TINT MAPPING (Universal) =====
const GLASS_TINT = {
  'AB': 'Anti-bandit clear (5-ply)',
  'AC': 'Anti-bandit (2-ply with multiple PVB ply)',
  'AF': 'Anti Firearm (2-ply glass + 1-ply polycarbonate)',
  'AG': 'Anti-bandit green (5-ply)',
  'AP': 'Anti-bandit privacy (5-ply)',
  'AS': 'Security Clear (3-ply)',
  'BA': 'Blue + acoustic',
  'BB': 'Blue absorbing',
  'BL': 'Blue',
  'BS': 'Blue - solar control',
  'BZ': 'Bronze',
  'CA': 'Clear + acoustic',
  'CB': 'Clear absorbing',
  'CC': 'Clear with coating',
  'CD': 'Clear with coating + Acoustic',
  'CH': 'Coated glass with high heat reflective effect',
  'CK': 'Coated glass with high heat reflective effect and acoustic PVB',
  'CL': 'Clear',
  'GA': 'Green + acoustic',
  'GB': 'Green absorbing',
  'GC': 'Green absorbing + acoustic',
  'GN': 'Green',
  'GS': 'Green - solar control',
  'GY': 'Grey',
  'LG': 'Light green (Japanese)',
  'YA': 'Grey + acoustic',
  'YC': 'Grey coated',
};

// ===== TOP TINT MAPPING =====
const TOP_TINT = {
  'BL': 'Blue top tint',
  'BZ': 'Bronze top tint',
  'GN': 'Green top tint',
  'GY': 'Grey top tint',
  'LG': 'Light green top tint',
  'YD': 'Dark grey top tint',
};

// ===== CHARACTERISTICS MAPPING =====
const CHARACTERISTICS = {
  'A': 'Antenna',
  'B': 'RHD (right hand drive)',
  'C': 'Camera bracket / LDW / IHC / LC / TL / City emergency braking / Traffic sign recognition',
  'D': 'Double glazed',
  'E': 'Electrically operated',
  'F': 'Front part',
  'G': 'GPS',
  'H': 'Heated',
  'I': 'Hardware (not used in fitting)',
  'J': 'TV antenna',
  'K': 'Heating through coating',
  'L': 'Left half',
  'M': 'Sensor (light and/or moisture)',
  'N': 'Water repellent glass',
  'O': 'De-Vapour (defoging) detector',
  'P': 'Modification of silkscreen for Sensor / LDW / IHC / etc.',
  'Q': 'Quarter',
  'R': 'Right Half',
  'S': 'Sliding',
  'T': 'Top',
  'U': 'H.U.Display / Upper',
  'V': 'Vin Notch / Hardware used for fitting',
  'W': 'Hardware used for the fitting of glass',
  'X': 'Alarm wire / Extra',
  'Y': 'Specific for RHD (right hand drive) vehicles',
  'Z': 'Encapsulation through Injection PU robot extrusion',
};

// ===== BODY TYPE MAPPING (for backlights) =====
const BODY_TYPE = {
  'H': 'Hatchback',
  'S': 'Saloon/sedan',
  'C': 'Coupe',
  'E': 'Estate/break',
  'M': 'MPV',
  'R': 'Ranger',
  'T': 'Tourer sport/cabrio',
  'L': 'Lorry/truck',
  'V': 'Van',
  'P': 'Pick-up',
};

// ===== POSITION MAPPING (for bodyglasses) =====
const GLASS_POSITION = {
  'FD': 'Front door',
  'FQ': 'Front quarterlight',
  'FV': 'Front vent',
  'MD': 'Middle door',
  'MQ': 'Middle quarter',
  'PG': 'Partition glass',
  'RD': 'Rear door',
  'RQ': 'Rear quarterlight',
  'RV': 'Rear vent',
};

// ===== TYPE CODE MAPPING =====
const TYPE_CODE_MAP = {
  'frontrute': 'F',
  'bakrute': 'B',
  'bodyglass': 'D',  // Generic door
  'bodyglass-laminated': 'D',
  'takglass': 'RO',
  'accessory': 'ACC',
};

function parseCategory(eurocode) {
  if (!eurocode || eurocode.length < 5) return null;
  
  const pos5 = eurocode[4];
  const pos56 = eurocode.substring(4, 6);
  
  // Check complex categories first (2-char codes)
  for (const [catNum, codes] of Object.entries(CATEGORIES_COMPLEX)) {
    if (codes.includes(pos56)) {
      return parseInt(catNum);
    }
  }
  
  // Check simple categories (1-char codes)
  for (const [catNum, codes] of Object.entries(CATEGORIES_SIMPLE)) {
    if (codes.includes(pos5)) {
      return parseInt(catNum);
    }
  }
  
  return null;
}

function parseEurocode(eurocode) {
  if (!eurocode || eurocode.length < 5) return null;
  
  const category = parseCategory(eurocode);
  if (!category) return null;
  
  const result = {
    raw: eurocode,
    category: CATEGORY_NAMES[category] || 'unknown',
    categoryNum: category,
    vehicleCode: eurocode.substring(0, 4),
    glassType: null,
    glassTypeCode: null,
    tint: null,
    topTint: null,
    characteristics: [],
    position: null,
    bodyType: null,
    modifications: [],
    confidence: 'high',
  };
  
  // Parse based on category
  let glassString = eurocode.substring(4);
  
  // Extract glass type
  const pos5 = eurocode[4];
  const pos56 = eurocode.substring(4, 6);
  
  switch (category) {
    case 1: // Windscreen
      result.glassType = GLASS_TYPE_WINDSCREEN[pos5] || null;
      result.glassTypeCode = pos5;
      break;
    case 2: // Backlight
      result.glassType = GLASS_TYPE_BACKLIGHT[pos5] || null;
      result.glassTypeCode = pos5;
      break;
    case 3: // Bodyglass
      result.glassType = GLASS_TYPE_BODYGLASS[pos5] || null;
      result.glassTypeCode = pos5;
      break;
    case 4: // Glass roof
      result.glassType = GLASS_TYPE_ROOF[pos5] || null;
      result.glassTypeCode = pos5;
      break;
    case 5: // Complex bodyglass
      result.glassType = GLASS_TYPE_COMPLEX[pos56] || null;
      result.glassTypeCode = pos56;
      glassString = eurocode.substring(6); // Skip 2-char code
      break;
    case 6: // Accessory
      result.glassType = GLASS_TYPE_ACCESSORY[pos56] || null;
      result.glassTypeCode = pos56;
      glassString = eurocode.substring(6);
      break;
  }
  
  // For categories 1-4, remove the first char from glassString
  if (category <= 4) {
    glassString = glassString.substring(1);
  }
  
  // Parse tint (2-char codes)
  for (const [code, desc] of Object.entries(GLASS_TINT)) {
    if (glassString.startsWith(code)) {
      result.tint = desc;
      glassString = glassString.substring(code.length);
      break;
    }
  }
  
  // Parse top tint (2-char codes)
  for (const [code, desc] of Object.entries(TOP_TINT)) {
    if (glassString.startsWith(code)) {
      result.topTint = desc;
      glassString = glassString.substring(code.length);
      break;
    }
  }
  
  // Parse body type (for backlights, category 2)
  if (category === 2) {
    for (const [code, desc] of Object.entries(BODY_TYPE)) {
      if (glassString.startsWith(code)) {
        result.bodyType = desc;
        glassString = glassString.substring(code.length);
        break;
      }
    }
  }
  
  // Parse position (for bodyglasses, category 3)
  if (category === 3) {
    for (const [code, desc] of Object.entries(GLASS_POSITION)) {
      if (glassString.startsWith(code)) {
        result.position = desc;
        glassString = glassString.substring(code.length);
        break;
      }
    }
  }
  
  // Parse characteristics (1-char codes, up to 5 loops)
  const charCodes = Object.keys(CHARACTERISTICS).sort((a, b) => b.length - a.length);
  for (let i = 0; i < 5; i++) {
    let found = false;
    for (const code of charCodes) {
      if (glassString.startsWith(code) && CHARACTERISTICS[code]) {
        result.characteristics.push({
          code: code,
          desc: CHARACTERISTICS[code],
        });
        glassString = glassString.substring(code.length);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  
  // Extract position info from characteristics
  const leftChar = result.characteristics.find(c => c.code === 'L');
  const rightChar = result.characteristics.find(c => c.code === 'R');
  
  if (leftChar && !result.position) {
    result.position = 'Left';
  } else if (rightChar && !result.position) {
    result.position = 'Right';
  }
  
  // Map to our position format
  if (result.position) {
    if (result.position.toLowerCase().includes('left') || result.position.toLowerCase().includes('front') || result.position.toLowerCase().includes('driver')) {
      result.mappedPosition = 'driver';
    } else if (result.position.toLowerCase().includes('right') || result.position.toLowerCase().includes('rear') || result.position.toLowerCase().includes('passenger')) {
      result.mappedPosition = 'passenger';
    } else {
      result.mappedPosition = null;
    }
  }
  
  return result;
}

// ===== MAIN =====

console.log('🔍 EUROCODE PARSER v2 - Official ARGIC Matrix\n');

const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const recs = data.records;

let parsed = 0;
let categoryMatched = 0;
const categoryDist = {};
const glassTypeDist = {};
const tintDist = {};
const featureCounts = {};
const positionCounts = {};
const vehicleCodes = new Set();

const examples = [];

recs.forEach(r => {
  if (!r.eurocode) return;
  
  const p = parseEurocode(r.eurocode);
  if (!p) return;
  
  parsed++;
  vehicleCodes.add(p.vehicleCode);
  
  // Category
  categoryDist[p.category] = (categoryDist[p.category] || 0) + 1;
  
  // Check match with existing
  if (r.category && r.category === p.category) {
    categoryMatched++;
  }
  
  // Glass type
  if (p.glassType) {
    glassTypeDist[p.glassType] = (glassTypeDist[p.glassType] || 0) + 1;
  }
  
  // Tint
  if (p.tint) {
    tintDist[p.tint] = (tintDist[p.tint] || 0) + 1;
  }
  
  // Features/characteristics
  p.characteristics.forEach(c => {
    featureCounts[c.desc] = (featureCounts[c.desc] || 0) + 1;
  });
  
  // Position
  if (p.position) {
    positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
  }
  
  // Collect examples
  if (examples.length < 20) {
    examples.push({
      eurocode: r.eurocode,
      category: p.category,
      glassType: p.glassType,
      tint: p.tint,
      position: p.position,
      characteristics: p.characteristics.map(c => c.code).join(','),
    });
  }
});

console.log('=== PARSER RESULTS ===');
console.log('Total records:', recs.length);
console.log('Successfully parsed:', parsed);
console.log('Unique vehicle codes:', vehicleCodes.size);
console.log('');

console.log('=== CATEGORY DISTRIBUTION ===');
Object.entries(categoryDist).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
  const pct = ((count / parsed) * 100).toFixed(1);
  console.log(`  ${cat}: ${count} (${pct}%)`);
});

console.log('');
console.log('=== GLASS TYPE DISTRIBUTION ===');
Object.entries(glassTypeDist).sort((a,b) => b[1]-a[1]).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

console.log('');
console.log('=== TINT DISTRIBUTION ===');
Object.entries(tintDist).sort((a,b) => b[1]-a[1]).forEach(([tint, count]) => {
  console.log(`  ${tint}: ${count}`);
});

console.log('');
console.log('=== POSITION DISTRIBUTION ===');
Object.entries(positionCounts).sort((a,b) => b[1]-a[1]).forEach(([pos, count]) => {
  console.log(`  ${pos}: ${count}`);
});

console.log('');
console.log('=== TOP FEATURES ===');
Object.entries(featureCounts).sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([feat, count]) => {
  console.log(`  ${feat}: ${count}`);
});

console.log('');
console.log('=== EXAMPLES ===');
examples.forEach(e => {
  console.log(`${e.eurocode} -> ${e.category} | ${e.glassType || 'N/A'} | ${e.tint || 'N/A'} | ${e.position || 'N/A'} | ${e.characteristics}`);
});

// ===== UPDATE CATALOG =====
let updated = 0;
let typeCodeInferred = 0;

recs.forEach(r => {
  if (!r.eurocode) return;
  
  const p = parseEurocode(r.eurocode);
  if (!p) return;
  
  // Update category if missing or 'annet'
  if ((!r.category || r.category === 'annet') && p.category) {
    r.category = p.category;
    updated++;
  }
  
  // Update typeCode if missing
  if (!r.typeCode && p.glassTypeCode) {
    const inferredType = TYPE_CODE_MAP[p.category];
    if (inferredType) {
      r.typeCode = inferredType;
      r.typeCodeRel = 'inferred-v2';
      typeCodeInferred++;
    }
  }
  
  // Update position if missing
  if (!r.position && p.mappedPosition) {
    r.position = p.mappedPosition;
  }
  
  // Update features
  if (p.characteristics.length > 0 && !r.features) {
    r.features = p.characteristics.map(c => c.desc);
  }
});

console.log('');
console.log(`=== UPDATED ${updated} records with inferred categories ===`);
console.log(`=== INFERRED ${typeCodeInferred} typeCodes ===`);

// Save updated catalog
fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
console.log('Catalog saved to', CATALOG_PATH);
