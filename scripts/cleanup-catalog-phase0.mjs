import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const MIN_YEAR = 1960;
const MAX_YEAR = 2030;

// Known vehicle brands (uppercase) — used for extraction from descriptions
const KNOWN_VEHICLE_BRANDS = new Set([
  'ABARTH', 'ALFA ROMEO', 'ALPINA', 'ALPINE', 'ASTON MARTIN', 'AUDI', 'AUSTIN',
  'BENTLEY', 'BMW', 'BUICK', 'CADILLAC', 'CHEVROLET', 'CHRYSLER', 'CITROEN', 'CITROËN',
  'CUPRA', 'DACIA', 'DAEWOO', 'DAF', 'DAIHATSU', 'DODGE', 'DS', 'FERRARI', 'FIAT',
  'FISKER', 'FORD', 'GMC', 'HONDA', 'HUMMER', 'HYUNDAI', 'INFINITI', 'ISUZU', 'IVECO',
  'JAGUAR', 'JEEP', 'KIA', 'LADA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'LANDROVER',
  'LEXUS', 'LEYLAND', 'LINCOLN', 'LOTUS', 'MAN', 'MASERATI', 'MAZDA', 'MCLAREN',
  'MERCEDES', 'MERCEDES-BENZ', 'MERCURY', 'MG', 'MINI', 'MITSUBISHI', 'NISSAN',
  'OPEL', 'PEUGEOT', 'POLESTAR', 'PONTIAC', 'PORSCHE', 'PROTON', 'RENAULT', 'ROLLS ROYCE',
  'ROVER', 'SAAB', 'SCANIA', 'SEAT', 'SKODA', 'SMART', 'SSANGYONG', 'SUBARU', 'SUZUKI',
  'TESLA', 'TOYOTA', 'TRIUMPH', 'VAUXHALL', 'VDL', 'VOLKSWAGEN', 'VOLVO', 'VW',
  'WARTBURG', 'WESTFIELD',
  // Alternative spellings / merged forms
  'ALFA', 'ALFAROMEO', 'MERC', 'MERCEDESBENZ', 'VW', 'LANDROVER', 'ROLLSROYCE',
  'SSANYONG', 'SSANGYONG', 'CHRY', 'CHEV', 'CHEVROLET',
]);

// Brands that are NOT vehicle brands — tools, suppliers, accessories
const NON_VEHICLE_BRANDS = new Set([
  // Tools & equipment brands
  'EQUALIZER', 'SANDING', 'ADHESIVE', 'SIKA', 'FASTENER', 'BLACK', 'COLD',
  'TRIM', 'DRAWER', 'FEIN', 'METRIC', 'WINDSHIELD', 'WINDSCREEN', 'SOLAR',
  'SENSOR', 'ULTRAWIZ', 'SCRAPER', 'LONG', 'RUBBER', 'BATTERY', 'BEDFORD',
  'SIDE', 'HANDLE', 'TORX', 'DELUXE', 'FIBER', 'CLAYTONRITE', 'SERRATED',
  'HEAVY', 'HEXAGON', 'MAKITA', 'SCRATCH', 'ELITE', 'PIT', 'USB', 'STAINLESS',
  'SMOOTHING', 'WORLD', 'BETAPRIME', 'BTACLEAN', 'DOW', 'HEPTANE', 'SIKAFLEX-223',
  'SIKAFAST', 'WASTE', 'SUB', 'DOUBLE-SIDED', 'EXTENTION', 'ULTRA', 'DARK',
  'VOLTAGE', 'BALL', 'MEDIUM', 'THIN', 'MAT', 'GUN', 'POLISHING', 'CONNECTING',
  'ORBITAL', 'REINFORCING', 'MIDDLE', 'STRAIGHT', 'HSS', 'SPARE', 'SOCKET',
  'BOILS-COPPER', 'RIVETING', 'KNIPEX', 'STEP', 'PAINT', 'T-HANDLES', 'ADAPTOR',
  'INDUCTION', 'LIQUIDS', 'FLEXIBLE', 'BRUSH', 'FILTER', 'STRAP', 'CASTOR', 'LED',
  'NUT', 'CLOTH', 'POINTED', 'BALL-TIPPED', 'COMPRESSED', 'HOT', 'OUTSIDE', 'AUTO',
  'T-HANDLE', 'SCAFFOLDER', 'KIT', 'FELT', 'COMPLETE', 'SAW', 'INSULATING',
  '2CV', 'DISPOSABLE', 'SPECIFIC', 'HEADLIGHT', 'HACKSAW', 'HAMMER', 'MOLD',
  'INSTALLATION', 'DASHBOARD', 'PROFESSIONAL', 'SPRAYER', 'INSURANCE', 'VERIBOR',
  'LASER', 'BRAIDED', 'TOOL', 'POCKET', 'KNITTED', 'MANUAL', 'ZIPKNIFE',
  'MIXING', 'BEIGE', 'ELECTROSTATIC', 'DRILLBITS', 'COMBINATION', 'STAR', 'HEX',
  'TUBE', 'CORDLESS', 'BOX', 'SQUARED', 'MOBILE', 'CAVITY', 'PNEUMATIC', 'CAR',
  'PVC', 'YELLOW', 'LATEX', 'WORKBENCH', 'PALM', 'SNAP-OFF', 'SAFETY', 'RUST',
  'VELCRO', 'REPLACEMENT', 'BLOCK', 'CHARGER', 'DENT', 'POWERPUSH', 'AIR',
  'SQUEEGEE', 'STAPLE', 'INSIDE', 'VACUUM', 'SINGLE', 'ERGO', 'HAND', 'INJECTOR',
  'RAIN', 'PUMP', 'VIRAZID', 'MULTI-PURPOSE', 'PEN', 'ACTIVATOR', 'CLEANER',
  'SQUARE', 'EXTENSION', 'REVERSIBLE', 'METAL', 'TELESCOPIC', 'SPECIAL', 'BLADE',
  'LEFT', 'RIGHT', 'FLAT', 'LARGE', 'WHITE', 'GREY', 'RED', 'BLUE', 'GREEN',
  'BROWN', 'CLEAR', 'DARK', 'NYLON', 'ALUMINIUM', 'STEEL', 'PLASTIC', 'RUBBER',
  'SILICONE', 'FOAM', 'URETHANE', 'BLIND', 'ROUND', 'CURVED', 'SOFT', 'HARD',
  // Dimensions
  '3MM', '6MM', '10MM', '12MM', '24MM', '60MM', '280MM', '300MM', '330MM',
  '350MM', '400MM', '450MM', '500MM', '530MM', '550MM', '600MM', '650MM',
  '700MM', '750MM', '800MM',
  // Misc non-vehicle
  'ESPRIT', 'BOSCH', 'OETECH', 'TEROSON', 'LOCTITE', 'REPAREGLASS', 'REPARBRISE',
  'REPARVIT', 'REPAR&#039', 'REPARCHOC', 'REPARBRISE', 'REPARVIT',
  'OLFA', 'MILWAUKEE', 'STANLEY', 'FATMAX',
  // Numbers that appear as brands
  '1', '2', '3', '5', '6', '10', '11', '12', '24', '60', '200', '400', '500',
  '3', '5', '6', '10', '11', '12', '24', '60', '200', '400', '500',
]);

// Direct brand mappings (uppercase input → uppercase output)
const BRAND_MAP = {
  'VOLKSWAGEN': 'VW',
  'MERCEDES-BENZ': 'MERCEDES',
  'MERCEDES BENZ': 'MERCEDES',
  'MERC': 'MERCEDES',
  'CITROËN': 'CITROEN',
  'VAUXHALL/OPEL': 'OPEL',
  'OPEL/VAUXHALL': 'OPEL',
  'OPEL/VX': 'OPEL',
  'VAUXHALL': 'OPEL',
  'LANDROVER': 'LAND ROVER',
  'ROLLS ROYCE': 'ROLLS ROYCE',
  'ROLLSROYCE': 'ROLLS ROYCE',
  'RR/BENTLEY': 'ROLLS ROYCE',
  'ALFA': 'ALFA ROMEO',
  'ALFAROMEO': 'ALFA ROMEO',
  'MINI': 'MINI',
  'NEW': 'MINI', // Will be refined by description check
  'RANGE': 'LAND ROVER',
  'CHRY': 'CHRYSLER',
  'CHEV': 'CHEVROLET',
  'CHEVR.': 'CHEVROLET',
  'MITS.': 'MITSUBISHI',
  'MITS': 'MITSUBISHI',
  'HYUNADI': 'HYUNDAI',
  'SSANYONG': 'SSANGYONG',
  'CHRSYLER': 'CHRYSLER',
  'FORD USA': 'FORD',
  'AMERIKAANSE': 'FORD',
  'DAEW': 'DAEWOO',
  'DAEWOO/CHEVROLET': 'DAEWOO',
  'FSO-DAEWOO': 'DAEWOO',
  'FSO': 'FSO',
  'VAUX': 'OPEL',
  'VOL': 'VOLVO',
  'FER': 'FERRARI',
  'OPEL/VAUXH': 'OPEL',
  'FOR': 'FORD',
  'TOY': 'TOYOTA',
  'REN': 'RENAULT',
  'RENAU': 'RENAUT',
  'HON': 'HONDA',
  'NISS': 'NISSAN',
  'JAG': 'JAGUAR',
  'MORR': 'MORRIS',
  'LAMBORGH.': 'LAMBORGHINI',
  'GMC,': 'GMC',
  'CADILLAC,': 'CADILLAC',
  'NISSAN,': 'NISSAN',
  'FORD,': 'FORD',
  'BMW': 'BMW',
  'AUDI': 'AUDI',
  'TOYOTA': 'TOYOTA',
  'FORD': 'FORD',
  'SKODA': 'SKODA',
  'SEAT': 'SEAT',
  'PEUGEOT': 'PEUGEOT',
  'RENAULT': 'RENAULT',
  'HYUNDAI': 'HYUNDAI',
  'KIA': 'KIA',
  'MAZDA': 'MAZDA',
  'HONDA': 'HONDA',
  'NISSAN': 'NISSAN',
  'SUBARU': 'SUBARU',
  'MITSUBISHI': 'MITSUBISHI',
  'SUZUKI': 'SUZUKI',
  'CHRYSLER': 'CHRYSLER',
  'JEEP': 'JEEP',
  'CHEVROLET': 'CHEVROLET',
  'CADILLAC': 'CADILLAC',
  'DODGE': 'DODGE',
  'BUICK': 'BUICK',
  'LINCOLN': 'LINCOLN',
  'GMC': 'GMC',
  'HUMMER': 'HUMMER',
  'PONTIAC': 'PONTIAC',
  'SATURN': 'SATURN',
  'OLDSMOBILE': 'OLDSMOBILE',
  'PLYMOUTH': 'PLYMOUTH',
  'PORSCHE': 'PORSCHE',
  'LEXUS': 'LEXUS',
  'INFINITI': 'INFINITI',
  'ACURA': 'ACURA',
  'SCION': 'SCION',
  'GENESIS': 'GENESIS',
  'TESLA': 'TESLA',
  'VOLVO': 'VOLVO',
  'SAAB': 'SAAB',
  'JAGUAR': 'JAGUAR',
  'LAND ROVER': 'LAND ROVER',
  'BENTLEY': 'BENTLEY',
  'ASTON MARTIN': 'ASTON MARTIN',
  'LOTUS': 'LOTUS',
  'MASERATI': 'MASERATI',
  'FERRARI': 'FERRARI',
  'LAMBORGHINI': 'LAMBORGHINI',
  'ALFA ROMEO': 'ALFA ROMEO',
  'FIAT': 'FIAT',
  'LANCIA': 'LANCIA',
  'ABARTH': 'ABARTH',
  'CITROEN': 'CITROEN',
  'DS': 'DS',
  'PEUGEOT': 'PEUGEOT',
  'RENAULT': 'RENAULT',
  'DACIA': 'DACIA',
  'OPEL': 'OPEL',
  'VAUXHALL': 'OPEL',
  'FORD': 'FORD',
  'VW': 'VW',
  'VOLKSWAGEN': 'VW',
  'AUDI': 'AUDI',
  'SEAT': 'SEAT',
  'SKODA': 'SKODA',
  'BMW': 'BMW',
  'MINI': 'MINI',
  'MERCEDES': 'MERCEDES',
  'SMART': 'SMART',
  'PORSCHE': 'PORSCHE',
  'TOYOTA': 'TOYOTA',
  'LEXUS': 'LEXUS',
  'HONDA': 'HONDA',
  'NISSAN': 'NISSAN',
  'INFINITI': 'INFINITI',
  'MAZDA': 'MAZDA',
  'MITSUBISHI': 'MITSUBISHI',
  'SUBARU': 'SUBARU',
  'SUZUKI': 'SUZUKI',
  'ISUZU': 'ISUZU',
  'DAIHATSU': 'DAIHATSU',
  'HINO': 'HINO',
  'KIA': 'KIA',
  'HYUNDAI': 'HYUNDAI',
  'GENESIS': 'GENESIS',
  'SSANGYONG': 'SSANGYONG',
  'TATA': 'TATA',
  'MAHINDRA': 'MAHINDRA',
  'PROTON': 'PROTON',
  'PERODUA': 'PERODUA',
  'HOLDEN': 'HOLDEN',
  'GREAT WALL': 'GREAT WALL',
  'CHERY': 'CHERY',
  'GEELY': 'GEELY',
  'BYD': 'BYD',
  'MG': 'MG',
  'ROVER': 'ROVER',
  'JENS': 'JENSEN',
  'TRIUMPH': 'TRIUMPH',
  'TVR': 'TVR',
  'WESTFIELD': 'WESTFIELD',
  'CATERHAM': 'CATERHAM',
  'MORGAN': 'MORGAN',
  'Bristol': 'BRISTOL',
  'BRISTOL': 'BRISTOL',
  'FAIRWAY': 'FAIRWAY',
  'GBN': 'GBN',
  'GRAND': 'GRAND',
  'OLDSMOBILE': 'OLDSMOBILE',
  'DODGE/HORIZON/OMNI': 'DODGE',
  'GMC,': 'GMC',
  'AMERIKAANSE': 'FORD',
  'MICROCAR': 'MICROCAR',
  'VAN': 'VAN',
  'ESCORT': 'FORD',
  'OCTAVIA': 'SKODA',
  'GOLF': 'VW',
  'PASSAT': 'VW',
  'POLO': 'VW',
  'IBIZA': 'SEAT',
  'SUPERB': 'SKODA',
  'BALENO': 'SUZUKI',
  'SUNBEAM': 'SUNBEAM',
  'STEYR': 'STEYR',
  'MAGIRUS': 'MAGIRUS',
  'FODEN': 'FODEN',
  'SPECTRE': 'SPECTRE',
  'SANTANA': 'SANTANA',
  'AF63BYPRAIW': 'UNKNOWN',
  'LEVC': 'LEVC',
  'POLESTAR': 'POLESTAR',
  'NOTE': 'NISSAN',
  'CORVETTE': 'CHEVROLET',
  'DB03754': 'UNKNOWN',
  'DB09661': 'UNKNOWN',
  'F': 'UNKNOWN',
  'FIAT/FORD': 'FIAT',
  'LEYLAND/DAF': 'LEYLAND',
  'VAG': 'VW',
  'SUNBEAM': 'SUNBEAM',
  'STEYR': 'STEYR',
  'MAGIRUS': 'MAGIRUS',
  'FODEN': 'FODEN',
  'SPECTRE': 'SPECTRE',
  'FSO': 'FSO',
  'SANTANA': 'SANTANA',
  'N': 'UNKNOWN',
  'X': 'UNKNOWN',
  'SERIES': 'UNKNOWN',
  'VAR': 'UNKNOWN',
  'ERF': 'ERF',
  'MORR': 'MORRIS',
  'MULTICAR': 'MULTICAR',
  'ACTROS': 'MERCEDES',
  'CAPTUR': 'RENAULT',
  'PONT': 'PONTIAC',
  '2CV': 'CITROEN',
  'DTS': 'UNKNOWN',
  'ERFORD': 'FORD',
  'AC': 'AC',
  'WV': 'VW',
  'WS': 'UNKNOWN',
  'GTY': 'UNKNOWN',
  'GTN': 'UNKNOWN',
  'ENCAP': 'UNKNOWN',
  'SOL': 'UNKNOWN',
  'HWARE': 'UNKNOWN',
  'PRIVACY': 'UNKNOWN',
  'LFD': 'UNKNOWN',
  'RFD': 'UNKNOWN',
  'LRD': 'UNKNOWN',
  'RRD': 'UNKNOWN',
  'LRQ': 'UNKNOWN',
  'RRQ': 'UNKNOWN',
  'ANT': 'UNKNOWN',
};

// Category keywords → canonical category
const CATEGORY_KEYWORDS = [
  // Windshield
  { keywords: ['WS', 'WINDSCREEN', 'WINDSHIELD', 'FRONT'], category: 'frontrute' },
  // Door glass
  { keywords: ['LFD', 'RFD', 'LRD', 'RRD', 'DOOR', 'DØR', 'DOR'], category: 'dørglass' },
  // Side glass
  { keywords: ['LRQ', 'RRQ', 'SIDE', 'QUARTER', 'QUARTERLIGHT', 'VENT'], category: 'sideglass' },
  // Rear window
  { keywords: ['REAR', 'BACK', 'TAILGATE', 'TAIL', 'BAK'], category: 'bakrute' },
  // Roof
  { keywords: ['ROOF', 'SUNROOF', 'MOONROOF', 'TAK'], category: 'tak' },
  // Accessories
  { keywords: ['MOULDING', 'TRIM', 'MOLDING', 'CLIP', 'ADHESIVE', 'SEALANT', 'TOOL', 'KIT'], category: 'tilbehør' },
];

// ============================================================================
// YEAR EXTRACTION
// ============================================================================

function extractYears(description) {
  if (!description) return { year_from: null, year_to: null };
  const d = description;

  // Pattern 1: German "Bj. ab$$MM.YYYY##Bj. bis$$MM.YYYY##"
  const germanMatch = d.match(/Bj\.\s*ab\$*\s*(\d{1,2})\.(\d{4}).*?Bj\.\s*bis\$*\s*(\d{1,2})\.(\d{4})/i);
  if (germanMatch) {
    const yf = parseInt(germanMatch[2], 10);
    const yt = parseInt(germanMatch[4], 10);
    if (isValidYear(yf) && isValidYear(yt) && yf <= yt) {
      return { year_from: yf, year_to: yt };
    }
  }

  // Pattern 2: Year range "2010-2015" or "2010–2015" or "2010/2015"
  const rangeMatch = d.match(/\b(19\d{2}|20\d{2})\s*[-–/]\s*(19\d{2}|20\d{2})\b/);
  if (rangeMatch) {
    const yf = parseInt(rangeMatch[1], 10);
    const yt = parseInt(rangeMatch[2], 10);
    if (isValidYear(yf) && isValidYear(yt) && yf <= yt) {
      return { year_from: yf, year_to: yt };
    }
  }

  // Pattern 3: "MM/YYYY" or "MM.YYYY" format (e.g. "10/2011" or "07.2012")
  const monthYearMatch = d.match(/\b(0?[1-9]|1[0-2])[/.](19\d{2}|20\d{2})\b/);
  if (monthYearMatch) {
    const y = parseInt(monthYearMatch[2], 10);
    if (isValidYear(y)) {
      return { year_from: y, year_to: null };
    }
  }

  // Pattern 4: Standalone year — find all years and use the LAST one as year_from
  // (Descriptions typically have model first, then year: "BMW 5 SERIES F10 2012")
  const allYears = [...d.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (allYears.length > 0) {
    // Use the last year found — it's usually the model year in our format
    const y = parseInt(allYears[allYears.length - 1][1], 10);
    if (isValidYear(y)) {
      return { year_from: y, year_to: null };
    }
  }

  return { year_from: null, year_to: null };
}

function isValidYear(y) {
  return Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR;
}

// ============================================================================
// BRAND NORMALIZATION
// ============================================================================

function normalizeBrand(brand, description) {
  if (!brand) return 'UNKNOWN';
  let b = brand.toString().trim().toUpperCase();

  // Direct mapping
  if (BRAND_MAP[b]) {
    b = BRAND_MAP[b];
  }

  // Lowercase brand → uppercase (e.g., "ford" → "FORD")
  if (b !== brand.toString().trim().toUpperCase()) {
    // Already mapped above
  }

  // Special: "NEW" — check if description contains MINI
  if (b === 'NEW' && description) {
    const d = description.toUpperCase();
    if (d.includes('MINI')) return 'MINI';
    return 'UNKNOWN';
  }

  // Special: "RANGE" — check if description contains RANGE ROVER
  if (b === 'RANGE' && description) {
    const d = description.toUpperCase();
    if (d.includes('RANGE ROVER')) return 'LAND ROVER';
    return 'UNKNOWN';
  }

  // Special: "FOCUS" — it's a Ford model
  if (b === 'FOCUS') return 'FORD';

  // Special: model names that leaked into brand field
  if (b === 'POLO') return 'VW';
  if (b === 'GOLF') return 'VW';
  if (b === 'PASSAT') return 'VW';
  if (b === 'IBIZA') return 'SEAT';
  if (b === 'OCTAVIA') return 'SKODA';
  if (b === 'SUPERB') return 'SKODA';
  if (b === 'BALENO') return 'SUZUKI';
  if (b === 'NOTE') return 'NISSAN';
  if (b === 'CORVETTE') return 'CHEVROLET';
  if (b === 'ACTROS') return 'MERCEDES';
  if (b === 'CAPTUR') return 'RENAULT';
  if (b === '2CV') return 'CITROEN';
  if (b === 'ESCORT') return 'FORD';
  if (b === 'JUKE') return 'NISSAN';
  if (b === 'TRANSIT') return 'FORD';
  if (b === 'VOYAGER/CARAVAN/T&AMP') return 'CHRYSLER';
  if (b === 'JAGUARXJ6') return 'JAGUAR';
  if (b === 'FIAT/FORD') {
    if (description && description.toUpperCase().includes('FIAT')) return 'FIAT';
    return 'FORD';
  }

  // Code-like brands (DD*, DW*, DQ*, FD*, FQ*, FV*, FW*, plus 4-letter codes)
  // These are internal product codes. Try to extract brand from description.
  if (/^(DD|DW|DQ|FD|FQ|FV|FW|DL|DS|DT|DY)[0-9]/.test(b) || /^[A-Z0-9]{5,}$/.test(b)) {
    if (description) {
      const extracted = extractBrandFromDescription(description);
      if (extracted) return extracted;
    }
    return 'UNKNOWN';
  }

  // Single letters or very short codes
  if (b.length <= 2 && !['VW', 'MG', 'AC', 'FSO', 'GBN'].includes(b)) {
    if (description) {
      const extracted = extractBrandFromDescription(description);
      if (extracted) return extracted;
    }
    return 'UNKNOWN';
  }

  // Non-vehicle brands → TILBEHØR
  if (NON_VEHICLE_BRANDS.has(b)) {
    return 'TILBEHØR';
  }

  // PILKINGTON — extract brand from description
  if (b === 'PILKINGTON') {
    if (description) {
      const extracted = extractBrandFromDescription(description);
      if (extracted) return extracted;
    }
    return 'UNKNOWN';
  }

  // BOSCH — could be a car brand (rare) or supplier. Check description.
  if (b === 'BOSCH') {
    if (description) {
      const extracted = extractBrandFromDescription(description);
      if (extracted) return extracted;
    }
    return 'TILBEHØR';
  }

  return b;
}

function extractBrandFromDescription(description) {
  if (!description) return null;
  const d = description.toUpperCase();

  // For PILKINGTON descriptions: "PILKINGTON FORD FOCUS..." → brand is FORD
  // Remove "PILKINGTON" and get the next word
  const withoutPilkington = d.replace(/^PILKINGTON\s+/, '');
  const firstWord = withoutPilkington.split(/[^A-Z0-9]+/)[0];
  if (firstWord && KNOWN_VEHICLE_BRANDS.has(firstWord)) {
    return firstWord;
  }

  // Search for any known vehicle brand in the description
  for (const brand of KNOWN_VEHICLE_BRANDS) {
    // Use word boundary matching
    const regex = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (regex.test(d)) {
      return brand;
    }
  }

  // Check for common merged brands
  if (d.includes('LAND ROVER')) return 'LAND ROVER';
  if (d.includes('ALFA ROMEO')) return 'ALFA ROMEO';
  if (d.includes('ROLLS ROYCE')) return 'ROLLS ROYCE';
  if (d.includes('ASTON MARTIN')) return 'ASTON MARTIN';

  return null;
}

// ============================================================================
// CATEGORY RECLASSIFICATION
// ============================================================================

function reclassifyCategory(record) {
  const desc = (record.description || '').toUpperCase();
  const current = record.category;

  // Only reclassify 'annet' records
  if (current !== 'annet') return current;

  for (const rule of CATEGORY_KEYWORDS) {
    for (const kw of rule.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`);
      if (regex.test(desc)) {
        return rule.category;
      }
    }
  }

  return current;
}

// ============================================================================
// MAIN
// ============================================================================

console.log('🧹 Phase 0: Catalog cleanup starting...\n');

// Load catalog
const catalogPath = join(PROJECT_ROOT, 'data', 'catalog-prod.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
const records = catalog.records || catalog;

console.log(`📊 Loaded ${records.length.toLocaleString()} records`);

// Stats before
const statsBefore = {
  withYear: records.filter(r => r.year_from && r.year_from > 0).length,
  uniqueBrands: new Set(records.map(r => r.brand)).size,
  categories: {},
};
for (const r of records) {
  const c = r.category || 'unknown';
  statsBefore.categories[c] = (statsBefore.categories[c] || 0) + 1;
}

// Process records
const cleaned = [];
const brandChanges = {};
const categoryChanges = {};
let yearExtracted = 0;

for (const record of records) {
  const originalBrand = record.brand;
  const originalCategory = record.category;
  const description = record.description;

  // 1. Extract years
  const years = extractYears(description);
  let year_from = years.year_from;
  let year_to = years.year_to;

  // If record already has valid years, keep them (shouldn't happen but be safe)
  if (record.year_from && isValidYear(record.year_from)) {
    year_from = record.year_from;
  }
  if (record.year_to && isValidYear(record.year_to)) {
    year_to = record.year_to;
  }

  if (year_from && !record.year_from) {
    yearExtracted++;
  }

  // 2. Normalize brand
  const newBrand = normalizeBrand(originalBrand, description);

  // 3. Reclassify category
  const newCategory = reclassifyCategory(record);

  // Track changes
  if (originalBrand !== newBrand) {
    const key = `${originalBrand} → ${newBrand}`;
    brandChanges[key] = (brandChanges[key] || 0) + 1;
  }
  if (originalCategory !== newCategory) {
    const key = `${originalCategory} → ${newCategory}`;
    categoryChanges[key] = (categoryChanges[key] || 0) + 1;
  }

  cleaned.push({
    ...record,
    year_from,
    year_to,
    brand: newBrand,
    category: newCategory,
    brand_original: originalBrand,
    category_original: originalCategory,
  });
}

// Stats after
const statsAfter = {
  withYear: cleaned.filter(r => r.year_from && r.year_from > 0).length,
  uniqueBrands: new Set(cleaned.map(r => r.brand)).size,
  categories: {},
};
for (const r of cleaned) {
  const c = r.category || 'unknown';
  statsAfter.categories[c] = (statsAfter.categories[c] || 0) + 1;
}

// Write cleaned catalog
const outputPath = join(PROJECT_ROOT, 'data', 'catalog-prod-cleaned.json');
writeFileSync(outputPath, JSON.stringify({ records: cleaned }, null, 2));

console.log(`\n✅ Wrote ${cleaned.length.toLocaleString()} records to ${outputPath}`);

// Report
console.log('\n📈 YEAR EXTRACTION');
console.log(`   Before: ${statsBefore.withYear.toLocaleString()} records with year`);
console.log(`   After:  ${statsAfter.withYear.toLocaleString()} records with year`);
console.log(`   New:    ${yearExtracted.toLocaleString()} records (${(yearExtracted/records.length*100).toFixed(1)}%)`);

console.log('\n🏷️  BRAND NORMALIZATION');
console.log(`   Before: ${statsBefore.uniqueBrands} unique brands`);
console.log(`   After:  ${statsAfter.uniqueBrands} unique brands`);
console.log(`   Top brand changes:`);
Object.entries(brandChanges)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([change, count]) => {
    console.log(`      ${change}: ${count}`);
  });

console.log('\n📂 CATEGORY RECLASSIFICATION');
console.log('   Before:', statsBefore.categories);
console.log('   After:', statsAfter.categories);
console.log('   Top category changes:');
Object.entries(categoryChanges)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([change, count]) => {
    console.log(`      ${change}: ${count}`);
  });

// Year distribution
const yearBuckets = { '<1980': 0, '1980-1999': 0, '2000-2009': 0, '2010-2019': 0, '2020+': 0, 'unknown': 0 };
for (const r of cleaned) {
  const y = r.year_from;
  if (!y) yearBuckets.unknown++;
  else if (y < 1980) yearBuckets['<1980']++;
  else if (y < 2000) yearBuckets['1980-1999']++;
  else if (y < 2010) yearBuckets['2000-2009']++;
  else if (y < 2020) yearBuckets['2010-2019']++;
  else yearBuckets['2020+']++;
}
console.log('\n📅 Year distribution after cleanup:');
for (const [k, v] of Object.entries(yearBuckets)) {
  console.log(`   ${k}: ${v.toLocaleString()}`);
}

console.log('\n🎉 Phase 0 cleanup complete!');
