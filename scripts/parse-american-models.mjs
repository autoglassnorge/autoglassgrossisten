import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('/tmp/american-descriptions.json', 'utf-8');

const descriptions = [];
const resultMatches = raw.match(/"results"\s*:\s*\[([\s\S]*?)\]/g);
for (const resultBlock of resultMatches) {
  const objMatches = resultBlock.match(/\{[^{}]*"brand"[^{}]*"description"[^{}]*\}/g);
  if (objMatches) {
    for (const obj of objMatches) {
      const brandMatch = obj.match(/"brand"\s*:\s*"([^"]+)"/);
      const descMatch = obj.match(/"description"\s*:\s*"([^"]*)"/);
      if (brandMatch && descMatch) {
        descriptions.push({ brand: brandMatch[1], description: descMatch[1] });
      }
    }
  }
}

const knownModels = {
  'CHEVROLET': ['SILVERADO+TAHOE+AVALANCHE', 'SILVERADO+TAHOE', 'SUBURBAN+SILVERADO', 'SUBURBAN+TAHOE', 'BLAZER+SUBURBAN', 'BLAZER/SURB.', 'VENTURE/TRANS', 'VENTURE/PONTIAC', 'ASTROVAN', 'AVALANCHE', 'COLORADO', 'CORVAIR', 'CRUZE', 'EQUINOX', 'EVANDA', 'EXPRESS', 'HHR', 'K3500', 'LUMINA', 'NOVA', 'ORLANDO', 'PICKUP', 'S10', 'SILVERADO', 'SPARK', 'SUBURBAN', 'SURBURBAN', 'TAHOE', 'TRAILBLAZER', 'TRAX', 'TRUCK', 'UPLANDER', 'VAN', 'VENTURE', 'VSNTURE', 'ALERO', 'AVEO', 'BEL AIR', 'BEL', 'BEL-', 'CAPTIVA', 'MATIZ', 'NUBIRA', 'REZZO', 'TACUMA'],
  'JEEP': ['GRAND CHEROKEE', 'LIBERTY/CHEROKEE', 'CHEROKEE', 'COMMANDER', 'COMPASS', 'GLADIATOR', 'PATRIOT', 'RENEGADE', 'TJ', 'WRANGLER', 'WAGONEER', 'LIBERTY', 'AVENGER'],
  'CHRYSLER': ['TOWN & COUNTRY', 'GRAND VOYAGER', 'SEBRING/STRATUS', 'VISION+++', '300C', '300', 'ASPEN', 'CROSSFIRE', 'IMPERIAL', 'LEBARON', 'MINI', 'NEON', 'NEWPORT', 'PACIFICA', 'PT CRUISER', 'PT', 'SEBRING', 'STRATUS', 'VOYAGER'],
  'DODGE': ['GRAND CARAVAN', 'CARAVAN', 'CHARGER', 'CHALLENGER', 'DURANGO', 'JOURNEY', 'AVENGER', 'CALIBER', 'DAKOTA', 'DAYTONA', 'MAGNUM', 'NITRO', 'PICKUP', 'SHADOW', 'VAN', 'VIPER', 'RAM', 'DART', 'NEON', 'INTREPID', 'STRATUS'],
  'CADILLAC': ['ESCALADE/CHEVR', 'ESCALADE', 'CT6', 'CTS', 'DEVILLE', 'DTS', 'SEVILLE', 'SRX', 'STS', 'XT4', 'XT5', 'XT6', 'XTS', 'ATS', 'BLS', 'ELDORADO'],
  'GMC': ['ACADIA', 'CANYON', 'ENVOY', 'JIMMY', 'SAVANA', 'SIERRA', 'TERRAIN', 'YUKON'],
  'LINCOLN': ['TOWN CAR', 'CONTINENTAL', 'NAVIGATOR', 'AVIATOR', 'CORSAIR', 'NAUTILUS', 'MKZ', 'MKC', 'MKT', 'MKS', 'LS'],
  'BUICK': ['PARK AVENUE', 'LESABRE', 'LE SABRE', 'RENDEZVOUS', 'RAINER', 'TERRAZA', 'CENTURY', 'RIVIERA', 'SKYLARK', 'ENCLAVE', 'ENCORE', 'ENVISION', 'REGAL', 'LACROSSE', 'VERANO', 'LUCERNE'],
  'HUMMER': ['H1', 'H2', 'H3', 'EV'],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseModel(brand, desc) {
  const upper = desc.toUpperCase();
  if (upper.startsWith('USE ') || upper.startsWith('BRUK ')) return null;
  
  let brandPos = upper.indexOf(brand);
  if (brandPos === -1) return null;
  
  let afterBrand = upper.substring(brandPos + brand.length).trim();
  afterBrand = afterBrand.replace(/^[\/&\-]+\s*/, '');
  
  const candidates = knownModels[brand] || [];
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  
  for (const model of sorted) {
    const escaped = escapeRegex(model);
    const regex = new RegExp('^' + escaped + '\\b');
    if (regex.test(afterBrand)) return model;
  }
  
  const firstWord = afterBrand.split(/\s+/)[0];
  if (firstWord && firstWord.length > 1 && /^[A-Z]/.test(firstWord)) {
    if (['FRONTRUTE', 'BAKRUTE', 'DØRRUTE', 'SIDERUTE', 'VENTILRUTE', 'WS', 'GN', 'BL', 'VS', 'HS'].includes(firstWord)) return null;
    return firstWord;
  }
  return null;
}

const byModel = {};
const unparseable = [];

for (const { brand, description } of descriptions) {
  const model = parseModel(brand, description);
  if (model) {
    const key = brand + '|' + model;
    byModel[key] = (byModel[key] || 0) + 1;
  } else {
    unparseable.push({ brand, description });
  }
}

console.log('=== PARSED MODELS ===');
for (const [key, count] of Object.entries(byModel).sort()) {
  console.log('  ' + key + ': ' + count);
}

console.log('\n=== UNPARSEABLE (' + unparseable.length + ') ===');
for (const u of unparseable.slice(0, 10)) {
  console.log('  ' + u.brand + ': ' + u.description.substring(0, 70));
}

const updates = [];
for (const key of Object.keys(byModel).sort()) {
  const [brand, model] = key.split('|');
  const safeModel = model.replace(/'/g, "''");
  updates.push("UPDATE glass_catalog SET model = '" + safeModel + "' WHERE brand = '" + brand + "' AND (model = '' OR model IS NULL) AND (description LIKE '%" + safeModel + "%');");
}

writeFileSync('/tmp/fix-american-models.sql', updates.join('\n'));
console.log('\nGenerated ' + updates.length + ' UPDATE statements');
console.log('Will fix ' + (descriptions.length - unparseable.length) + ' of ' + descriptions.length + ' products');
