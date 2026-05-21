#!/usr/bin/env node
/**
 * merge-nags-v3.mjs — Even stricter NAGS → Catalog matching
 * - US brands only
 * - European model blacklist
 * - Longer token requirement for substring match
 * - Max 3 NAGS per record
 */
import { readFileSync, writeFileSync } from 'fs';

const US_BRANDS = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];

// European models that should NEVER get NAGS codes (even under US brands)
const EUROPEAN_MODEL_BLACKLIST = [
  'KUGA','B-MAX','B MAX','TRANSIT','TOURNEO','FOCUS','FIESTA','ECOSPORT',
  'MONDEO','GALAXY','S-MAX','S MAX','C-MAX','C MAX','GRAND C-MAX','GRAND C MAX',
  'FUSION','KA','COURIER','CONNECT','RANGER','FIESTA','PUMA','ECOSPORT',
  'RENEGADE','COMPASS','PATRIOT','COMMANDER','NITRO','JOURNEY','CALIBER',
  'ASTRA','CORSA','AVEO','MATIZ','EPICA','CRUZE','ORLANDO','SPARK','CAPTIVA',
  'LACETTI','KALOS','NUBIRA','TACUMA','EVANDA','EVASION','XSARA','C3','C4',
  'C5','C6','DS3','DS4','DS5','BERLINGO','PICASSO','JUMPY','JUMPER',
  'GOLF','POLO','PASSAT','TIGUAN','TOUAREG','TIGUAN','T-ROC','T-CROSS','TAIGO',
  'ID3','ID4','ID5','ID7','IDBUZZ','UP','SHARAN','TOURAN','CADDY','AMAROK',
  'SAVEIRO','ATLAS','TACOMA','TUNDRA','SEQUOIA','4RUNNER','HIGHLANDER',
  'RAV4','COROLLA','CAMRY','YARIS','AYGO','PRIUS','AURIS','AVENSIS',
  'CIVIC','ACCORD','JAZZ','CR-V','HR-V','HR V','E','ELEMENT','INSIGHT',
  'MEGAN','CLIO','CAPTUR','ARKANA','KADJAR','SCENIC','ESPACE','TRAFIC',
  'MASTER','KOLEOS','ARKANA','CAPTUR','TWINGO','ZOE','FLUENCE','LAGUNA',
  'SANDERO','DUSTER','LOGAN','LODGY','DOKKER','STEPWAY','JOGGER',
  'A1','A2','A3','A4','A5','A6','A7','A8','Q2','Q3','Q5','Q7','Q8','TT','R8',
  '1 SERIES','2 SERIES','3 SERIES','4 SERIES','5 SERIES','6 SERIES','7 SERIES',
  'X1','X2','X3','X4','X5','X6','X7','Z3','Z4','I3','I4','IX3','IX','XM',
  'C CLASS','E CLASS','S CLASS','A CLASS','B CLASS','CLA','CLK','CLS','SL',
  'SLK','GLA','GLB','GLC','GLE','GLS','G CLASS','V CLASS','VIANO','VITO',
  'SPRINTER','CITAN','EQA','EQB','EQC','EQE','EQS','MAYBACH',
  'C30','C40','C60','C70','S40','S60','S80','S90','V40','V50','V60','V70','V90',
  'XC40','XC60','XC70','XC90','EX30','EX90','EM90',
  '308','208','2008','3008','5008','508','408','308 SW','508 SW',
  'PARTNER','EXPERT','BOXER','RIFTER','TRAVELLER','COMBO','VIVARO','MOVANO',
  'ASTRA','CORSA','GRANDLAND','CROSSLAND','MOKKA','ZAFIRA','ANTARA','FRONTERA',
  'BRAVA','GRANDE PUNTO','PUNTO','TIPO','DOBLO','FIORINO','DUCATO','SCUDO',
  'STILO','MAREA','MULTIPLA','SEDICI','QUBO','500','500L','500X','PANDA',
  'UNO','TEMPRA','COUPE','BARCHEtta','LINEA','CRONOS','ARGO','TORO',
  'MX-5','MX 5','CX-3','CX 3','CX-5','CX 5','CX-9','CX 9','CX-30','CX 30',
  'CX-60','CX 60','MAZDA2','MAZDA3','MAZDA6','MAZDA 2','MAZDA 3','MAZDA 6',
  'MX-30','MX 30','BT-50','BT 50','626','323','PREMACY','MPV','CX-7','CX 7',
  'IMPREZA','LEGACY','OUTBACK','FORESTER','XV','CROSSTREK','BRZ','WRX','ASCENT',
  'SOLARIS','KONA','TUCSON','SANTA FE','SORENTO','SPORTAGE','CEED','PICANTO',
  'RIO','STONIC','NIRO','EV6','EV9','SOUL','STINGER','K5','K8','CARNIVAL',
  'CARENS','MAGENTIS','OPTIMA','PROCEED','XCEED','TELLURIDE','SEL','HYUNDAI',
  'TUCSON','SANTA FE','KONA','IONIQ','VENUE','BAYON','PALISADE','TERRACAN',
  'SANTA CRUZ','CRETA','i10','i20','i30','i40','ELANTRA','SONATA','ACCENT',
  'GETZ','MATRIX','TRAJET','H1','H100','GALLOPER','SANTAMO','ATOS','COUPE',
  'LANTRA','XG','GRANDEUR','AZERA','GENESIS','EQUUS','CENTENNIAL','MAXCRUZ',
  'STAREX','PORTER','H350','EX8','PAVISE','MIGHTY','XCIENT','UNIVERSE',
  'AURIS','AVENSIS','AYGO','BELTA','BLADE','CALDINA','CAMI','CAMRY SOLARA',
  'CARINA','CELICA','CENTURY','COROLLA','CORONA','CRESSIDA','CROWN','CURREN',
  'DUET','ESTIMA','FUNCRUISER','FUNCARGO','GT86','GR86','GR 86','HARRIER',
  'HIACE','HIGHLANDER','HILUX','INNOVA','IPSUM','IQ','ISIS','KLUGER','LANDCRUISER',
  'LEVIN','LITEACE','MARK II','MATRIX','MEGA CRUISER','MR2','MR-S','NOAH',
  'PASO','PIXIS','PLATZ','PORTE','PREMIO','PREVIA','PRIUS','PROBOX','RACTIS',
  'RAUM','RAV4','ROOMY','RUSH','SAI','SCEPTER','SEQUOIA','SERA','SIENNA',
  'SOARER','SPADE','SPRINTER','STARLET','SUCCEED','SUPRA','TACOMA','TERCEL',
  'TOWNACE','TUNDRA','URBAN CRUISER','VANGUARD','VENZA','VEROSSA','VERSO',
  'VIOS','VISTA','VITZ','VOXY','WILL','WINDOM','WISH','YARIS','YARIS CROSS',
  'bB','IST','PASSO','RAIZE','ROOMY','RUMION','TANK','C-HR','C HR','BZ4X',
  'PRIUS C','PRIUS V','SIENNA','VENZA','TUNDRA','SEQUOIA','4RUNNER','HIGHLANDER'
];

const MAX_NAGS_PER_RECORD = 3;

function normalizeModel(model) {
  if (!model) return '';
  return model.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

function isEuropeanModel(model) {
  if (!model) return false;
  const m = normalizeModel(model);
  for (const em of EUROPEAN_MODEL_BLACKLIST) {
    if (m.includes(em.toUpperCase())) return true;
  }
  return false;
}

function strictModelMatches(nagsModel, catalogModel) {
  if (!catalogModel) return false;
  
  const nTokens = tokenizeModel(nagsModel);
  const cTokens = tokenizeModel(catalogModel);
  
  if (nTokens.length === 0 || cTokens.length === 0) return false;
  
  const nStr = normalizeModel(nagsModel);
  const cStr = normalizeModel(catalogModel);
  if (nStr === cStr) return true;
  
  // Direct inclusion (whole string)
  if (nStr.includes(cStr) || cStr.includes(nStr)) return true;
  
  // Token overlap
  const common = nTokens.filter(t => cTokens.includes(t));
  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 4) return true;
  
  // Short model whitelist — exact token match only
  const shortModels = ['F150','F250','F350','F450','H1','H2','H3','LS','CTS','PT','H2','H3'];
  for (const sm of shortModels) {
    if (nTokens.includes(sm) && cTokens.includes(sm)) return true;
  }
  
  // Substring within tokens (4+ chars only — stricter than v2)
  for (const nt of nTokens) {
    for (const ct of cTokens) {
      if (nt.length >= 4 && ct.length >= 4 && nt === ct) return true;
    }
  }
  
  return false;
}

function yearOverlap(nf, nt, cf, ct) {
  if (!nf && !nt) return true;
  if (!cf && !ct) return true;
  if (nf && ct && nf > ct + 1) return false;
  if (nt && cf && nt < cf - 1) return false;
  return true;
}

// ─── Load ───
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;
const nagsData = JSON.parse(readFileSync('data/nags-all-combined.json', 'utf-8'));
const nagsEntries = nagsData.entries;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MERGE NAGS v3 — Strict US-Only + European Model Blacklist');
console.log('═══════════════════════════════════════════════════════════════\n');

const usRecords = records.filter(r => US_BRANDS.includes(r.brand));
const usNags = nagsEntries.filter(n => US_BRANDS.includes((n.make || '').toUpperCase().trim()));

console.log(`📦 Catalog: ${records.length.toLocaleString()} | US: ${usRecords.length} | NAGS: ${usNags.length}\n`);

for (const r of records) {
  if (!r.nagsCodes) r.nagsCodes = [];
}

let updated = 0;
const stats = {};
const highMatchWarnings = [];

for (const nags of usNags) {
  const nMake = (nags.make || '').toUpperCase().trim();
  const nModel = nags.model || '';
  const nType = nags.glassType || inferGlassType(nags.nagsCode);
  
  const candidates = usRecords.filter(r => r.brand === nMake);
  
  const matches = candidates.filter(r => {
    // Skip European models
    if (isEuropeanModel(r.model)) return false;
    
    // Type match
    const rType = r.category?.toLowerCase() || 'annet';
    const nTypeLower = nType.toLowerCase();
    if (nTypeLower !== rType && rType !== 'annet') {
      const desc = (r.description || '').toLowerCase();
      if (nTypeLower === 'frontrute' && !desc.includes('windshield') && !desc.includes('frontrute')) return false;
      if (nTypeLower === 'bakrute' && !desc.includes('back') && !desc.includes('bakrute')) return false;
      if (nTypeLower === 'siderute' && !desc.includes('door') && !desc.includes('side') && !desc.includes('siderute') && !desc.includes('dør')) return false;
    }
    
    // Year overlap
    if (!yearOverlap(nags.yearFrom, nags.yearTo, r.yearFrom, r.yearTo)) return false;
    
    // Strict model match
    if (!strictModelMatches(nModel, r.model)) return false;
    
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
    
    stats[nMake] = (stats[nMake] || 0) + matches.length;
    
    if (matches.length > 5) {
      highMatchWarnings.push({ code: fullNags, make: nMake, model: nModel, matches: matches.length });
    }
  }
}

const withNags = usRecords.filter(r => r.nagsCodes && r.nagsCodes.length > 0);

console.log('📊 Results:');
console.log(`   NAGS codes added:          ${updated.toLocaleString()}`);
console.log(`   US records with NAGS:      ${withNags.length.toLocaleString()} (${(withNags.length/usRecords.length*100).toFixed(1)}%)`);
console.log();

console.log('🏷️  By brand:');
for (const [brand, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  const brandRecords = usRecords.filter(r => r.brand === brand && !isEuropeanModel(r.model)).length;
  console.log(`   ${brand.padEnd(15)} ${count.toString().padStart(5)} matches  (${brandRecords} non-EU records)`);
}
console.log();

if (highMatchWarnings.length > 0) {
  console.log('⚠️  High-match warnings (>5 matches):');
  for (const d of highMatchWarnings.slice(0, 10)) {
    console.log(`   ${d.code.padEnd(12)} ${d.make} ${d.model.slice(0,35).padEnd(38)} → ${d.matches}`);
  }
  console.log();
}

console.log('📝 Examples (true US models):');
withNags.filter(r => !isEuropeanModel(r.model)).slice(0, 15).forEach(r => {
  console.log(`   ${r.eurocode.padEnd(18)} | ${r.brand} ${r.model.slice(0,28).padEnd(30)} | ${r.nagsCodes.join(', ')}`);
});
console.log();

writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('💾 Saved');
console.log('═══════════════════════════════════════════════════════════════');
