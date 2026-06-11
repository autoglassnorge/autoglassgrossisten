/**
 * Parse model names from descriptions for ALL brands with empty models.
 * Strategy:
 * 1. Skip cross-references (BRUK/USE/=WxxxGB, VED TOM)
 * 2. For each brand, extract model from description
 * 3. Handle special cases per brand
 */

// Known multi-word models per brand
const knownModels = {
  'FORD': ['F250HD+350+450+550', 'F250HD', 'AEROSTAR', 'MUSTANG MACH-E', 'MUSTANG', 'FIESTA', 'FOCUS', 'MONDEO', 'GALAXY', 'S-MAX', 'TRANSIT', 'TOURNEO', 'ECOSPORT', 'PUMA', 'KUGA', 'EDGE', 'EXPLORER', 'EXPEDITION', 'RANGER', 'F-150', 'F150', 'BRONCO', 'MAVERICK'],
  'CHEVROLET': ['SILVERADO+TAHOE+AVALANCHE', 'SILVERADO+TAHOE', 'SUBURBAN+SILVERADO', 'SUBURBAN', 'SILVERADO', 'TAHOE', 'AVALANCHE', 'COLORADO', 'BLAZER', 'EQUINOX', 'TRAVERSE', 'TRAX', 'TRACKER', 'SPARK', 'AVEO', 'KALOS', 'CRUZE', 'MALIBU', 'IMPALA', 'CAMARO', 'CORVETTE', 'CAPTIVA', 'ORLANDO', 'VOLT', 'BOLT', 'EPICA', 'LACETTI', 'NUBIRA', 'REZZO', 'EVANDA', 'EXTENDED CAB', '2D EXTENDED CAB'],
  'GMC': ['SIERRA+YUKON', 'SIERRA', 'YUKON', 'ACADIA', 'TERRAIN', 'CANYON', 'SAVANA', 'ENVY', 'JIMMY', 'SONOMA', 'TYPHOON', 'VANDURA'],
  'CADILLAC': ['ESCALADE', 'CTS', 'SRX', 'XT5', 'XT4', 'XT6', 'CT4', 'CT5', 'CT6', 'ATS', 'XTS', 'ELR', 'SEVILLE', 'DEVILLE', 'FLEETWOOD', 'BROUGHAM'],
  'BUICK': ['ENCLAVE', 'ENCORE', 'ENVISION', 'LACROSSE', 'REGAL', 'LUCERNE', 'TERRAZA', 'RENDEZVOUS', 'RAINER', 'PARK AVENUE', 'CENTURY', 'LESABRE'],
  'CHRYSLER': ['TOWN & COUNTRY', 'GRAND VOYAGER', 'PACIFICA', 'VOYAGER', 'PT CRUISER', 'CROSSFIRE', '300C', '300', '200', 'SEBRING', 'ASPEN', 'PACIFICA HYBRID'],
  'DODGE': ['GRAND CARAVAN', 'CARAVAN', 'CHARGER', 'CHALLENGER', 'DURANGO', 'RAM', 'JOURNEY', 'AVENGER', 'CALIBER', 'NITRO', 'DART', 'VIPER', 'STRATUS', ' NEON'],
  'JEEP': ['GRAND CHEROKEE', 'CHEROKEE', 'WRANGLER', 'COMPASS', 'PATRIOT', 'RENEGADE', 'LIBERTY', 'COMMANDER', 'GLADIATOR', 'WAGONEER', 'WILLYS'],
  'LINCOLN': ['NAVIGATOR', 'CONTINENTAL', 'MKZ', 'MKS', 'MKT', 'MKX', 'NAUTILUS', 'AVIATOR', 'CORSAIR', 'TOWN CAR', 'LS', 'ZEPHYR'],
  'HUMMER': ['H1', 'H2', 'H3', 'EV'],
  'PONTIAC': ['FIREBIRD', 'TRANS AM', 'GTO', 'GRAND PRIX', 'G6', 'G8', 'SOLSTICE', 'TORRENT', 'VIBE', 'MONTANA', 'AZTEK', 'BONNEVILLE'],
  'AMC': ['EAGLE', 'RAMBLER', 'AMERICAN', 'REBEL', 'MATADOR', 'AMBASSADOR', 'JAVELIN', 'GREMLIN', 'HORNET', 'PACER', 'SPIRIT', 'CONCORD'],
  'AIXAM': ['325/400/500', 'A721/741/CITY/CROSSLINE/ROADLINE', 'CROSSLINE/CITY/GTO', 'CITY', 'CROSSLINE', 'ROADLINE', 'GTO', 'MINAUTO', 'E-CITY'],
  'AC COBRA': ['COBRA'],
  'KEWET': ['EL-JET', 'ELJET', 'CITY'],
  'TVR': ['GRIFFITH', 'CERBERA', 'TUSCAN', 'SAGARIS', 'CHIMAERA'],
};

function extractModel(brand, description) {
  const upperDesc = description.toUpperCase();
  const upperBrand = brand.toUpperCase();
  
  // Skip cross-references
  if (/^(BRUK|USE|VED TOM|=)\s*W\d+/i.test(description)) return null;
  if (/^=W\d+/i.test(description)) return null;
  if (/^\+\+\+BRUK/i.test(description)) return null;
  if (/^=BRUK/i.test(description)) return null;
  
  // Remove brand from start of description
  let descWithoutBrand = upperDesc;
  if (descWithoutBrand.startsWith(upperBrand + ' ')) {
    descWithoutBrand = descWithoutBrand.slice(upperBrand.length + 1).trim();
  }
  
  // Known models for this brand
  const models = knownModels[brand] || [];
  
  // Try multi-word models first
  for (const model of models) {
    const modelUpper = model.toUpperCase();
    if (descWithoutBrand.includes(modelUpper) || upperDesc.includes(modelUpper)) {
      return model.replace(/\+/g, '/');
    }
  }
  
  // Special cases by brand
  if (brand === 'FORD') {
    // F250HD+350+450+550 pattern
    if (/F250HD/i.test(description)) return 'F250HD/350/450/550 SUPER CAB';
    if (/AEROSTAR/i.test(description)) return 'AEROSTAR';
    if (/FORD\s*\+\s*MERCURY/i.test(description)) return 'FORD/MERCURY';
    if (/FORD\s+\d{2}-\d{2}\s+F/i.test(description)) return 'F-SERIES';
    if (/CHEVROLET\s+ASTRO/i.test(description)) return 'ASTRO'; // Wrong brand, but parse anyway
  }
  
  if (brand === 'CHEVROLET') {
    if (/EXTENDED\s+CAB/i.test(description)) return 'EXTENDED CAB';
    if (/^CHEVROLET\s+\d{2}-\d{2}\b/i.test(description)) return null; // Vintage without model
    if (/^CHEVROLET\s+BAKRUTE/i.test(description)) return null; // Generic
  }
  
  if (brand === 'GMC') {
    // Try single word after brand
    const match = descWithoutBrand.match(/^(\S+)/);
    if (match) {
      const word = match[1];
      if (word && word.length > 1 && !/^\d/.test(word)) {
        // Check if it's a known model
        if (models.some(m => m.toUpperCase() === word)) return word;
        // Accept if it looks like a model name (not a year, not a body type)
        const bodyTypes = ['2D','3D','4D','5D','SEDAN','HATCHBACK','COUPE','CABRIOLET','SUV','MPV','CC','HBK','STV','ESTATE','WAGON','PICKUP','TRUCK'];
        if (!bodyTypes.includes(word)) return word;
      }
    }
  }
  
  if (brand === 'AIXAM') {
    if (/325\/400\/500/i.test(description)) return '325/400/500';
    if (/A721/i.test(description)) return 'A721/741/City/Crossline/Roadline';
    if (/CROSSLINE\/CITY\/GTO/i.test(description)) return 'Crossline/City/GTO';
  }
  
  if (brand === 'AC COBRA') {
    if (/ROADSTER/i.test(description)) return 'COBRA ROADSTER';
    if (/SPORTSBIL/i.test(description)) return 'COBRA SPORTSBIL';
    return 'COBRA';
  }
  
  if (brand === 'AMC') {
    if (/EAGLE/i.test(description)) return 'EAGLE';
    if (/RAMBLER/i.test(description)) return 'RAMBLER/AMERICAN';
    if (/REBEL/i.test(description)) return 'REBEL/MATADOR/AMBASSADOR';
  }
  
  if (brand === 'PONTIAC') {
    const match = descWithoutBrand.match(/^(\S+)/);
    if (match && match[1].length > 2) return match[1];
  }
  
  if (brand === 'KEWET') {
    if (/EL[-\s]?JET/i.test(description)) return 'EL-JET';
    if (/CITY/i.test(description)) return 'CITY';
  }
  
  if (brand === 'TVR') {
    const match = descWithoutBrand.match(/^(\S+)/);
    if (match && match[1].length > 2) return match[1];
  }
  
  // Generic: first word after brand that looks like a model
  const genericMatch = descWithoutBrand.match(/^(\S+)/);
  if (genericMatch) {
    const word = genericMatch[1];
    if (word && word.length > 1 && !/^\d{2}-\d{2}$/.test(word) && !/^(FRONTR|BAKR|DØRR|SIDER|VENTIL|VENTR|FRO|FR|DR|SR|GRN|GN|GB|YP|HS|VS|CL|NB|EL|ANT|ALA|INNK|SOTET|CROM|SORT|HUD|LDW|SENS|DUGG|SENSOR|LAM|INN|UTG|MÅL|HØYDE|TODELT|MAX|NB\+|NB\s|GLASS|SVERIGE)$/i.test(word)) {
      return word;
    }
  }
  
  return null;
}

// Read descriptions from stdin and generate SQL
const input = await new Response(process.stdin).text();
const lines = input.split('\n').filter(l => l.trim());

const updates = [];
const skipped = [];

for (const line of lines) {
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  const brand = parts[0].trim();
  const description = parts[1].trim();
  
  const model = extractModel(brand, description);
  if (model) {
    // Escape single quotes
    const safeModel = model.replace(/'/g, "''");
    const safeBrand = brand.replace(/'/g, "''");
    const safeDesc = description.replace(/'/g, "''");
    updates.push(`UPDATE glass_catalog SET model = '${safeModel}' WHERE brand = '${safeBrand}' AND description = '${safeDesc}' AND (model = '' OR model IS NULL);`);
  } else {
    skipped.push({ brand, description });
  }
}

console.log(`-- Generated ${updates.length} UPDATE statements`);
console.log(`-- Skipped ${skipped.length} descriptions (cross-references, vintage, unparsable)`);
console.log('');

// Group by brand for readability
const byBrand = {};
for (const sql of updates) {
  const brandMatch = sql.match(/brand = '([^']+)'/);
  const brand = brandMatch ? brandMatch[1] : 'UNKNOWN';
  if (!byBrand[brand]) byBrand[brand] = [];
  byBrand[brand].push(sql);
}

for (const [brand, sqls] of Object.entries(byBrand).sort()) {
  console.log(`\n-- ${brand}: ${sqls.length} updates`);
  for (const sql of sqls) {
    console.log(sql);
  }
}

console.log('\n\n-- SKIPPED (cross-references, vintage, unparsable):');
for (const { brand, description } of skipped) {
  console.log(`-- [${brand}] ${description}`);
}
