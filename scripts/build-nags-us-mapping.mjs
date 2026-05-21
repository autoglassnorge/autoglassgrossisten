#!/usr/bin/env node
/**
 * build-nags-us-mapping.mjs — Focused NAGS matching for genuine US models only
 * Matches 715 real US vehicles from auto-glass.no against NAGS database
 */
import { readFileSync, writeFileSync } from 'fs';

const CSV_PATH = 'data/autoglass-scrape/products-autoglass-no.csv';
const NAGS_PATH = 'data/nags-all-combined.json';
const OUT_PATH = 'data/nags-us-mapping.json';

// Whole-word genuine US models
// Genuine US models with word-boundary matching
const US_MODELS = new Set([
  // Trucks & SUVs
  'F150','F250','F350','F450','F550','SILVERADO','TAHOE','SUBURBAN',
  'EXPEDITION','ESCALADE','NAVIGATOR','YUKON','SAVANA','ACADIA',
  'GRAND CHEROKEE','WRANGLER','CHEROKEE','LIBERTY','PATRIOT','COMMANDER',
  'COMPASS','RENEGADE','WAGONEER','DURANGO','JOURNEY','GRAND CARAVAN',
  'CARAVAN','AVENGER','NITRO','CALIBER','CHALLENGER','CHARGER','VIPER',
  'AVALANCHE','COLORADO','TRAILBLAZER','BLAZER','EQUINOX','TRAVERSE',
  'ENCLAVE','ENVISION','RANGER','BRONCO','EXPLORER','EDGE','FLEX',
  'TRANSIT','AEROSTAR','EXPEDITION','EXCURSION','EXPLORER SPORT TRAC',
  'MUSTANG','SHELBY','COBRA','MACH 1','BULLITT','BOSS','GT500','GT350',
  'CAMARO','CORVETTE','IMPALA','MONTE CARLO','COBALT','MALIBU',
  'LUMINA','CAVALIER','CELEBRITY','CORSICA','BERETTA',
  'GTO','FIREBIRD','TRANS AM','GRAND PRIX','BONNEVILLE','G6','G8',
  'AZTEK','TORRENT','VIBE','MONTANA','SILHOUETTE','TRANS SPORT',
  'GRAND AM','SUNFIRE','SUNBIRD','ACHIEVA','ALERO','INTRIGUE',
  'REGAL','LACROSSE','LESABRE','PARK AVENUE','RIVIERA','ELECTRA',
  'CENTURY','SKYLARK','ROADMASTER','RENDEZVOUS','TERRAZA','RAINIER',
  'LUCERNE','VERANO','CASCADA','ENCORE',
  'TOWN CAR','CONTINENTAL','MARK LT','MKZ','MKS','MKT','MKX','MKC',
  'NAUTILUS','AVIATOR','CORS AIR','ZEPHYR','VERSAILLES','PARK LANE',
  'SABLE','MOUNTAINEER','MARINER','MILAN','MONTEGO','COUGAR',
  'GRAND MARQUIS','TRACER','TOPAZ','TEMPO','PROBE','CONTOUR',
  'CROWN VICTORIA','THUNDERBIRD','TORINO','FALCON','FAIRLANE',
  'MAVERICK','RAPTOR','LIGHTNING','F SERIES','F-SERIES',
  'H1','H2','H3',
  'CTS','XTS','ATS','CT6','XT4','XT5','XT6','SRX','STS','DTS','ELR',
  '300C','300M','CHRYSLER 300','PACIFICA','VOYAGER','ASPEN','PT CRUISER',
  'SEBRING','CIRRUS','STRATUS','BREEZE','LHS','CONCORDE','NEW YORKER',
  'GTC','CROSSFIRE','PROWLER','VIPER','NEON','SRT4',
  'GRAND VITARA','SAMURAI','SIDEKICK','XL7','FORENZA','RENO','VERONA',
  'RODEO','PASSPORT','AMIGO','AXIOM','TROOPER','VEHICROSS',
  'REDBIRD','FIREBIRD','SKYLARK','CUTLASS','CIERA','EIGHTY EIGHT','NINETY EIGHT',
  'BRAVADA','AURORA','SILHOUETTE','ACHIEVA','INTRIGUE','ALERO',
  'S10','S15','SONOMA','JIMMY','TYPHOON','SYCLONE','VANDURA','RALLY',
  'R/V SERIES','C/K SERIES','SIERRA','CANYON','TERRAIN','YUKON XL',
  'SAVANA','ENVOY','SAFARI','SPRINT','SPRINT VAN',
]);

// Exclude these non-US makes even if title contains US model name
const NON_US_MAKES = new Set([
  'NISSAN','TOYOTA','HONDA','MAZDA','MITSUBISHI','SUBARU','SUZUKI',
  'HYUNDAI','KIA','LEXUS','INFINITI','ACURA','ISUZU','DAIHATSU',
  'PEUGEOT','CITROEN','RENAULT','FIAT','ALFA ROMEO','LANCIA',
  'SEAT','SKODA','VOLKSWAGEN','VW','AUDI','BMW','MERCEDES','OPEL',
  'SAAB','VOLVO','DAEWOO','SSANGYONG','TATA','MAHINDRA',
]);

function isNonUsMake(title) {
  const t = title.toUpperCase();
  for (const make of NON_US_MAKES) {
    if (t.includes(make)) return true;
  }
  return false;
}

const NAGS_PREFIX_TO_TYPE = {
  DW: 'frontrute', FW: 'frontrute', DL: 'frontrute', FL: 'frontrute',
  DB: 'bakrute', FB: 'bakrute',
  DD: 'siderute', FD: 'siderute', DQ: 'siderute', FQ: 'siderute',
  DV: 'siderute', FV: 'siderute', DS: 'siderute', FS: 'siderute',
  DR: 'tak', FR: 'tak',
};

const AG_TYPE_TO_GLASS = {
  F: 'frontrute', B: 'bakrute',
  DFF: 'dørglass', DFB: 'dørglass', DPF: 'dørglass', DPB: 'dørglass',
  SFB1: 'siderute', SPB1: 'siderute', SFB2: 'siderute', SPB2: 'siderute',
  DFFV: 'siderute', DPFV: 'siderute', DFBV: 'siderute', DPBV: 'siderute',
  SFB3: 'siderute', SPB3: 'siderute',
};

function normalize(s) {
  if (!s) return '';
  return s.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function detectUsModel(title) {
  const t = normalize(title);
  // Sort by length descending to match longest first (GRAND CHEROKEE before CHEROKEE)
  const sorted = Array.from(US_MODELS).sort((a, b) => b.length - a.length);
  for (const model of sorted) {
    // Whole-word or boundary match
    const re = new RegExp('\\b' + model.replace(/\s/g, '\\s+') + '\\b');
    if (re.test(t)) return model;
  }
  return null;
}

function yearsOverlap(yf1, yt1, yf2, yt2) {
  const a1 = yf1 ?? 1800, a2 = yt1 ?? 2100;
  const b1 = yf2 ?? 1800, b2 = yt2 ?? 2100;
  return a1 <= b2 && b1 <= a2;
}

function inferMakeFromTitle(title) {
  const t = title.toUpperCase();
  const makes = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER','LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];
  for (const m of makes) if (t.includes(m)) return m;
  return null;
}

function main() {
  const nagsData = JSON.parse(readFileSync(NAGS_PATH, 'utf8'));
  const nagsEntries = nagsData.entries;

  const csvRaw = readFileSync(CSV_PATH, 'utf8');
  const csvLines = csvRaw.split('\n').filter(l => l.trim());

  // Index NAGS by make
  const nagsByMake = new Map();
  for (const e of nagsEntries) {
    const mk = (e.make || '').toUpperCase().trim();
    if (!mk) continue;
    if (!nagsByMake.has(mk)) nagsByMake.set(mk, []);
    nagsByMake.get(mk).push(e);
  }

  const mappings = [];
  let processed = 0, matched = 0;
  const byModel = {};

  for (let i = 1; i < csvLines.length; i++) {
    const row = parseCsvLine(csvLines[i]);
    if (row.length < 12) continue;

    const sku = row[0];
    const title = row[1];
    let brand = row[2]?.trim() || '';
    const model = row[3]?.trim() || '';
    const yearStart = parseInt(row[5], 10) || null;
    const yearEnd = parseInt(row[6], 10) || null;
    const typeCode = row[8]?.trim() || '';
    const price = parseInt(row[10], 10) || 0;

    const usModel = detectUsModel(title);
    if (!usModel) continue;
    // Skip if title contains a non-US make (e.g., Nissan 300ZX, Lexus RX300)
    if (isNonUsMake(title)) continue;
    processed++;
    byModel[usModel] = (byModel[usModel] || 0) + 1;

    // Infer make
    if (brand === 'USA CARS') {
      const inferred = inferMakeFromTitle(title);
      if (inferred) brand = inferred;
    }

    const agType = AG_TYPE_TO_GLASS[typeCode] || 'annet';
    const candidates = nagsByMake.get(brand.toUpperCase()) || [];

    let bestMatch = null;
    let bestScore = 0;

    for (const nags of candidates) {
      const nagsType = nags.glassType || NAGS_PREFIX_TO_TYPE[nags.nagsCode?.substring(0, 2).toUpperCase()] || 'annet';
      if (agType !== nagsType && nagsType !== 'annet' && agType !== 'annet') continue;
      if (!yearsOverlap(yearStart, yearEnd, nags.yearFrom, nags.yearTo)) continue;

      // Check if NAGS model contains the US model name
      const nagsModelNorm = normalize(nags.model);
      const usModelNorm = normalize(usModel);
      if (!nagsModelNorm.includes(usModelNorm)) continue;

      // Score based on year overlap precision
      const yf = Math.max(yearStart || 1800, nags.yearFrom || 1800);
      const yt = Math.min(yearEnd || 2100, nags.yearTo || 2100);
      const overlap = yt - yf;
      const span = Math.max((yearEnd || yearStart || 2000) - (yearStart || yearEnd || 2000), 1);
      const yearScore = Math.max(0, Math.min(1, overlap / span));

      // Score based on model specificity (shorter model name = more specific = better)
      const specificity = usModelNorm.length / Math.max(nagsModelNorm.length, 1);

      const score = 0.5 + yearScore * 0.3 + specificity * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = nags;
      }
    }

    if (bestMatch && bestScore >= 0.4) {
      matched++;
      mappings.push({
        autoGlassSku: sku,
        autoGlassTitle: title,
        nagsCode: bestMatch.nagsCode,
        nagsSuffix: bestMatch.suffix,
        make: brand,
        model: usModel,
        yearFrom: yearStart,
        yearTo: yearEnd,
        typeCode,
        glassType: agType,
        nagsGlassType: bestMatch.glassType || NAGS_PREFIX_TO_TYPE[bestMatch.nagsCode?.substring(0, 2).toUpperCase()],
        nagsModel: bestMatch.model,
        nagsYearFrom: bestMatch.yearFrom,
        nagsYearTo: bestMatch.yearTo,
        confidence: Math.round(bestScore * 100) / 100,
        price,
        source: bestMatch.source,
      });
    }
  }

  mappings.sort((a, b) => b.confidence - a.confidence);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalUsProducts: processed,
      matchedCount: matched,
      coveragePercent: processed > 0 ? Math.round((matched / processed) * 100 * 10) / 10 : 0,
      topSources: {},
      byModel,
    },
    mappings,
  };

  for (const m of mappings) {
    output.meta.topSources[m.source] = (output.meta.topSources[m.source] || 0) + 1;
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  console.log('\n=== NAGS US Mapping Report ===');
  console.log(`Genuine US products: ${processed.toLocaleString()}`);
  console.log(`Matched with NAGS: ${matched.toLocaleString()}`);
  console.log(`Coverage: ${output.meta.coveragePercent}%`);
  console.log('\nBy US model:');
  Object.entries(byModel).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
  console.log('\nTop NAGS sources:');
  for (const [src, count] of Object.entries(output.meta.topSources).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${src}: ${count}`);
  }
  console.log('\nConfidence:');
  const high = mappings.filter(m => m.confidence >= 0.7).length;
  const med = mappings.filter(m => m.confidence >= 0.4 && m.confidence < 0.7).length;
  const low = mappings.filter(m => m.confidence < 0.4).length;
  console.log(`  High (≥0.70): ${high}`);
  console.log(`  Medium (0.40-0.69): ${med}`);
  console.log(`  Low (<0.40): ${low}`);
  console.log(`\nFile: ${OUT_PATH} (${(readFileSync(OUT_PATH).length / 1024).toFixed(1)} KB)`);
}

main();
