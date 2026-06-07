#!/usr/bin/env node
/**
 * Enterprise batch kType resolver for all glass_catalog products.
 * Uses standalone TecDoc resolver (mirrors tecdoc-resolver.ts logic).
 * CommonJS version for stability.
 */
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const { join } = require('path');
const { writeFile } = require('fs/promises');
const { execSync } = require('child_process');

const DATA_DIR = join(process.cwd(), 'data', 'tecdoc-import');

// ── Brand normalization (mirrors brand.ts) ───────────────────
function normalizeBrand(raw) {
  if (!raw) return '';
  return raw.toUpperCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^VW\b/, 'VOLKSWAGEN')
    .replace(/MERCEDES\s*BENZ/, 'MERCEDES')
    .replace(/MERCEDES-BENZ/, 'MERCEDES')
    .replace(/LAND\s*ROVER/, 'LAND ROVER')
    .replace(/ALFA\s*ROMEO/, 'ALFA ROMEO');
}

function getBrandAliases(brand) {
  const norm = normalizeBrand(brand);
  const map = {
    'VW': ['VOLKSWAGEN'], 'VOLKSWAGEN': ['VW'],
    'MERCEDES': ['MERCEDES-BENZ'], 'MERCEDES-BENZ': ['MERCEDES'],
    'OPEL': ['VAUXHALL'], 'VAUXHALL': ['OPEL'],
    'LAND ROVER': ['LANDROVER'], 'LANDROVER': ['LAND ROVER'],
    'ALFA ROMEO': ['ALFA'], 'ALFA': ['ALFA ROMEO'],
    'ROLLS-ROYCE': ['ROLLS ROYCE'], 'ROLLS ROYCE': ['ROLLS-ROYCE'],
    'CHEVROLET': ['CHEVY'], 'CHEVY': ['CHEVROLET'],
  };
  return map[norm] || [];
}

// ── Model normalization (mirrors tecdoc-resolver.ts) ─────────
const NOISE_WORDS = new Set([
  'HATCHBACK','STATIONWAGON','ESTATE','BREAK','AVANT','TOURING','SEDAN',
  'SALOON','LIMOUSINE','COUPE','CABRIOLET','CONVERTIBLE','ROADSTER',
  'SPIDER','TARGA','FASTBACK','SPORTBACK','SHOOTING','SW','WAGON',
  'VAN','MINIVAN','MPV','SUV','CROSSOVER','OFFROAD','PICKUP',
  'CHASSIS','FLATBED','COMBI','3D','4D','5D','DOOR','DOORS',
  'AUTOMATIC','MANUAL','TIPTRONIC','DSG','CVT','X-DRIVE','XDRIVE',
  'QUATTRO','4MATIC','4X4','AWD','RWD','FWD','TDI','TSI','FSI',
  'DCI','HDI','CDI','TCE','GDI','MPI','TFSI','MULTIJET','JTDM',
  'JTD','VVTI','VVT-I','D-4D','D4D','CDTI','TDCI','SDI','ECOBOOST',
  'SKYACTIV','MIVEC','VTEC','I-VTEC','IVTEC','CLASS','SERIES',
  'STASJONSVOGN','KASSEVOGN','VAREBIL','LASTEVOGN','LASTEBIL',
  'AUTOMOBILES','CARS','VANS','HBK','SED','CAB','WAG','AFMKT','NO',
  'RAM','SOFTTOP','SOFT/TOP','HARDTOP','HARD/TOP','ST','VOGN',
]);

const MODEL_ALIASES = {
  '3 SERIES': '3', '5 SERIES': '5', '7 SERIES': '7',
  '1 SERIES': '1', '2 SERIES': '2', '4 SERIES': '4',
  '6 SERIES': '6', '8 SERIES': '8',
  'C-CLASS': 'C CLASS', 'E-CLASS': 'E CLASS', 'S-CLASS': 'S CLASS',
  'A-CLASS': 'A CLASS', 'B-CLASS': 'B CLASS', 'G-CLASS': 'G CLASS',
  'M-CLASS': 'M CLASS', 'R-CLASS': 'R CLASS', 'X-CLASS': 'X CLASS',
  'CL-CLASS': 'CL CLASS', 'CLK-CLASS': 'CLK CLASS', 'CLS-CLASS': 'CLS CLASS',
  'SL-CLASS': 'SL CLASS', 'SLK-CLASS': 'SLK CLASS',
  'GL-CLASS': 'GL CLASS', 'GLA-CLASS': 'GLA CLASS', 'GLB-CLASS': 'GLB CLASS',
  'GLC-CLASS': 'GLC CLASS', 'GLE-CLASS': 'GLE CLASS', 'GLS-CLASS': 'GLS CLASS',
  'CR-V': 'CRV', 'CX-3': 'CX3', 'CX-5': 'CX5', 'CX-7': 'CX7', 'CX-9': 'CX9',
  'MX-5': 'MX5', 'MX-3': 'MX3', 'MX-6': 'MX6',
  'RX-7': 'RX7', 'RX-8': 'RX8',
  'HI-LUX': 'HILUX', 'LAND-CRUISER': 'LAND CRUISER',
  'LANDCRUISER': 'LAND CRUISER', 'X-TRAIL': 'XTRAIL',
  'CMAX': 'C-MAX', 'BMAX': 'B-MAX', 'SMAX': 'S-MAX',
  'GOLF 7': 'GOLF VII', 'GOLF 6': 'GOLF VI', 'GOLF 5': 'GOLF V', 'GOLF 4': 'GOLF IV',
  'POLO 6': 'POLO 6R', 'POLO 5': 'POLO 9N',
  'PASSAT 8': 'PASSAT B8', 'PASSAT 7': 'PASSAT B7',
  'A4 B8': 'A4 B8', 'A4 B9': 'A4 B9', 'A6 C7': 'A6 C7', 'A3 8P': 'A3 8P', 'A3 8V': 'A3 8V',
  '3 E90': '3 E90', '3 F30': '3 F30', '5 E60': '5 E60', '5 F10': '5 F10',
  'C W204': 'C CLASS W204', 'C W205': 'C CLASS W205',
  'E W212': 'E CLASS W212', 'E W213': 'E CLASS W213',
  'QASHQAI 1': 'QASHQAI J10', 'QASHQAI 2': 'QASHQAI J11',
};

const CHASSIS_GENERATIONS = {
  'E90': { brand: 'BMW', model: '3', years: [2005, 2013] },
  'E46': { brand: 'BMW', model: '3', years: [1998, 2007] },
  'E39': { brand: 'BMW', model: '5', years: [1995, 2004] },
  'E60': { brand: 'BMW', model: '5', years: [2003, 2010] },
  'F30': { brand: 'BMW', model: '3', years: [2012, 2019] },
  'F10': { brand: 'BMW', model: '5', years: [2010, 2017] },
  'G20': { brand: 'BMW', model: '3', years: [2019, 2025] },
  'G30': { brand: 'BMW', model: '5', years: [2017, 2025] },
  'W204': { brand: 'MERCEDES', model: 'C CLASS', years: [2007, 2014] },
  'W205': { brand: 'MERCEDES', model: 'C CLASS', years: [2014, 2021] },
  'W212': { brand: 'MERCEDES', model: 'E CLASS', years: [2009, 2016] },
  'W213': { brand: 'MERCEDES', model: 'E CLASS', years: [2016, 2023] },
  'B8': { brand: 'AUDI', model: 'A4', years: [2008, 2015] },
  'B9': { brand: 'AUDI', model: 'A4', years: [2015, 2023] },
  'C7': { brand: 'AUDI', model: 'A6', years: [2011, 2018] },
  'C8': { brand: 'AUDI', model: 'A6', years: [2018, 2025] },
  '8P': { brand: 'AUDI', model: 'A3', years: [2003, 2012] },
  '8V': { brand: 'AUDI', model: 'A3', years: [2012, 2020] },
  '5G1': { brand: 'VOLKSWAGEN', model: 'GOLF', years: [2013, 2020] },
  '1K1': { brand: 'VOLKSWAGEN', model: 'GOLF', years: [2004, 2013] },
  '1J1': { brand: 'VOLKSWAGEN', model: 'GOLF', years: [1998, 2005] },
  'AD': { brand: 'VOLKSWAGEN', model: 'TIGUAN', years: [2016, 2025] },
  '5N': { brand: 'VOLKSWAGEN', model: 'TIGUAN', years: [2008, 2016] },
  'J10': { brand: 'NISSAN', model: 'QASHQAI', years: [2007, 2013] },
  'J11': { brand: 'NISSAN', model: 'QASHQAI', years: [2014, 2021] },
};

function normalizeModelText(raw) {
  let text = raw.toUpperCase().trim();
  for (const [alias, repl] of Object.entries(MODEL_ALIASES)) {
    text = text.replace(new RegExp('\\b' + alias.replace(/[-/]/g, '[-/]?') + '\\b', 'g'), repl);
  }
  text = text.replace(/[^A-Z0-9\s\(\)\-/]/g, ' ').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const noise of NOISE_WORDS) {
    text = text.replace(new RegExp('\\b' + noise.replace(/[-/]/g, '[-/]?') + '\\b', 'g'), ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function extractTokens(text) {
  const norm = normalizeModelText(text);
  return norm.split(/\s+/).filter(t => t.length >= 2 || /^\d$/.test(t));
}

function extractChassisCodes(text) {
  const codes = [];
  const m1 = text.match(/\b([A-Z]\d{1,3}[A-Z]?)\b/g);
  if (m1) codes.push(...m1);
  const m2 = text.match(/\b(\d[A-Z]\d{1,2})\b/g);
  if (m2) codes.push(...m2);
  const m3 = text.match(/\b(V?I{1,3}|IV|VI{1,3}|IX|X{1,3})\b/gi);
  if (m3) codes.push(...m3.map(r => r.toUpperCase()));
  return codes;
}

function isYearCompatible(year, from, to) {
  if (from === null && to === null) return true;
  if (from !== null && year < from - 1) return false;
  if (to !== null && year > to + 1) return false;
  return true;
}

// ── Load TecDoc data ─────────────────────────────────────────
async function loadTecDoc() {
  const entries = [];
  
  const manufacturers = new Map();
  const manLines = await readLines('manufacturers.csv');
  for (let i = 1; i < manLines.length; i++) {
    const cols = manLines[i].split('\t');
    manufacturers.set(parseInt(cols[0], 10), cols[3]?.trim());
  }
  
  const models = new Map();
  const modelLines = await readLines('models.csv');
  for (let i = 1; i < modelLines.length; i++) {
    const cols = modelLines[i].split('\t');
    models.set(parseInt(cols[0], 10), { manId: parseInt(cols[1], 10), name: cols[4]?.trim() });
  }
  
  // Passenger cars
  const pc = await readLines('passengercars.csv');
  for (let i = 1; i < pc.length; i++) {
    const cols = pc[i].split('\t');
    entries.push({
      ktype: parseInt(cols[1], 10),
      brand: normalizeBrand(cols[3]),
      model: cols[8]?.trim(),
      yearFrom: parseYear(cols[5]),
      yearTo: parseYear(cols[6]),
    });
  }
  
  // Commercial
  const cv = await readLines('commercialvehicles.csv');
  for (let i = 1; i < cv.length; i++) {
    const cols = cv[i].split('\t');
    const modelId = parseInt(cols[2], 10);
    const mi = models.get(modelId);
    if (!mi) continue;
    const brand = normalizeBrand(manufacturers.get(mi.manId));
    if (!brand) continue;
    entries.push({ ktype: parseInt(cols[1], 10), brand, model: cols[6]?.trim(), yearFrom: parseYear(cols[3]), yearTo: parseYear(cols[4]) });
  }
  
  // Motorbikes
  const bikes = await readLines('motorbikes.csv');
  for (let i = 1; i < bikes.length; i++) {
    const cols = bikes[i].split('\t');
    entries.push({ ktype: parseInt(cols[1], 10), brand: normalizeBrand(cols[3]), model: cols[8]?.trim(), yearFrom: parseYear(cols[5]), yearTo: parseYear(cols[6]) });
  }
  
  return entries.filter(e => e.ktype && e.brand && e.model);
}

async function readLines(filename) {
  const lines = [];
  const stream = createReadStream(join(DATA_DIR, filename), 'utf-8');
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  return new Promise((resolve, reject) => {
    rl.on('line', line => lines.push(line));
    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

function parseYear(s) {
  if (!s || s === '0000-00-00') return null;
  const y = parseInt(s.split('-')[0], 10);
  return isNaN(y) || y === 0 ? null : y;
}

// ── Pre-compute metadata ─────────────────────────────────────
function buildMeta(entries) {
  return entries.map(e => {
    const normText = normalizeModelText(e.model);
    const tokens = extractTokens(e.model);
    const chassis = extractChassisCodes(e.model);
    return { ...e, normText, tokenSet: new Set(tokens), chassisSet: new Set(chassis) };
  });
}

function groupByBrand(entries) {
  const map = new Map();
  for (const e of entries) {
    const list = map.get(e.brand);
    if (list) list.push(e);
    else map.set(e.brand, [e]);
  }
  return map;
}

// ── Scoring ──────────────────────────────────────────────────
function scoreEntry(inputBrand, inputNorm, inputTokens, inputChassis, year, entry) {
  let score = 0;
  const reasons = [];
  
  if (inputBrand && entry.brand) {
    if (inputBrand === entry.brand) { score += 0.4; reasons.push('exact brand'); }
    else {
      const aliases = getBrandAliases(inputBrand);
      if (aliases.some(a => normalizeBrand(a) === entry.brand)) { score += 0.3; reasons.push('alias brand'); }
    }
  }
  
  if (inputChassis.size > 0 && entry.chassisSet.size > 0) {
    let common = 0;
    for (const c of inputChassis) if (entry.chassisSet.has(c)) common++;
    if (common > 0) { score += 0.35; reasons.push('chassis match'); }
  }
  
  // Chassis generation bonus
  if (inputChassis.size > 0 && year !== undefined) {
    for (const chassis of inputChassis) {
      const gen = CHASSIS_GENERATIONS[chassis];
      if (!gen) continue;
      if (entry.brand === gen.brand) {
        if (entry.normText.includes(gen.model)) {
          if (year >= gen.years[0] - 1 && year <= gen.years[1] + 1) {
            score += 0.15;
            reasons.push('chassis generation confirmed');
          }
        }
      }
    }
  }
  
  if (inputTokens.size > 0 && entry.tokenSet.size > 0) {
    let common = 0;
    for (const t of inputTokens) if (entry.tokenSet.has(t)) common++;
    const overlap = inputTokens.size <= 2
      ? common / inputTokens.size
      : common / Math.max(inputTokens.size, entry.tokenSet.size);
    if (overlap >= 0.7) { score += 0.3; reasons.push('strong model'); }
    else if (overlap >= 0.4) { score += 0.15; reasons.push('moderate model'); }
    
    if (inputNorm.length >= 1 && entry.normText.includes(inputNorm)) { score += 0.1; reasons.push('containment'); }
    else if (entry.normText.length >= 2 && inputNorm.includes(entry.normText)) { score += 0.05; reasons.push('containment'); }
  }
  
  if (year !== undefined && year !== null) {
    if (isYearCompatible(year, entry.yearFrom, entry.yearTo)) { score += 0.2; reasons.push('year ok'); }
    else { score -= 0.1; reasons.push('year mismatch'); }
  }
  
  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function resolveKType(make, model, year, entriesByBrand, allEntries) {
  const normBrand = normalizeBrand(make);
  const inputNorm = normalizeModelText(model);
  const inputTokens = new Set(extractTokens(model));
  const inputChassis = new Set(extractChassisCodes(model));
  
  const pools = [];
  const exact = entriesByBrand.get(normBrand);
  if (exact) pools.push(exact);
  
  const aliasSet = new Set();
  for (const alias of getBrandAliases(make)) {
    const canon = normalizeBrand(alias);
    if (canon !== normBrand) aliasSet.add(canon);
  }
  for (const canon of aliasSet) {
    const p = entriesByBrand.get(canon);
    if (p) pools.push(p);
  }
  
  if (pools.length === 0) pools.push(allEntries);
  
  const bestByKtype = new Map();
  for (const pool of pools) {
    for (const entry of pool) {
      const { score, reasons } = scoreEntry(normBrand, inputNorm, inputTokens, inputChassis, year, entry);
      if (score < 0.15) continue;
      const existing = bestByKtype.get(entry.ktype);
      if (!existing || existing.score < score) {
        bestByKtype.set(entry.ktype, { entry, score, reasons });
      }
    }
  }
  
  const candidates = Array.from(bestByKtype.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(c => ({
      ktype: c.entry.ktype,
      brand: c.entry.brand,
      model: c.entry.model,
      yearFrom: c.entry.yearFrom,
      yearTo: c.entry.yearTo,
      score: c.score,
      reasons: c.reasons,
    }));
  
  if (candidates.length === 0) return { status: 'no_match', candidates: [] };
  
  const bestScore = candidates[0].score;
  const status = bestScore >= 0.75 ? 'resolved' : bestScore >= 0.4 ? 'ambiguous' : 'no_match';
  return { status, candidates };
}

// ── Fetch catalog ────────────────────────────────────────────
function fetchCatalog() {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute GLASS_CATALOG_D1 --local --command="SELECT id, eurocode, brand, model, description, year_from, year_to FROM glass_catalog WHERE brand IS NOT NULL" --json`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024, timeout: 60000 });
  try {
    const parsed = JSON.parse(output.trim());
    if (Array.isArray(parsed) && parsed[0]?.results) return parsed[0].results;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
  } catch {
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t[0] !== '[') continue;
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed) && parsed[0]?.results) return parsed[0].results;
      } catch { /* continue */ }
    }
  }
  throw new Error('Could not parse D1 output');
}

function extractModel(product) {
  const model = (product.model || '').trim();
  if (model && model.length >= 2) return model;
  const desc = (product.description || '').trim();
  const brand = normalizeBrand(product.brand || '');
  let clean = desc.replace(new RegExp('^' + brand + '\\s+', 'i'), '');
  const tokens = clean.split(/\s+/).filter(t => t.length >= 1);
  return tokens.slice(0, 3).join(' ');
}

function extractYear(product) {
  if (product.year_from) {
    const y = parseInt(product.year_from, 10);
    if (!isNaN(y) && y > 1900) return y;
  }
  const m = (product.description || '').match(/(\d{4})\s*[-–]\s*(\d{4}|\w+)/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== Enterprise Batch kType Resolver ===\n');
  
  console.log('Loading TecDoc data...');
  const entries = await loadTecDoc();
  const meta = buildMeta(entries);
  const byBrand = groupByBrand(meta);
  console.log(`  ${entries.length} entries, ${byBrand.size} brands`);
  
  console.log('Fetching catalog...');
  const catalog = fetchCatalog();
  console.log(`  ${catalog.length} products`);
  
  const mappings = [];
  const skipped = [];
  let resolved = 0, ambiguous = 0, noMatch = 0;
  
  for (let i = 0; i < catalog.length; i++) {
    const p = catalog[i];
    const brand = p.brand;
    const model = extractModel(p);
    const year = extractYear(p);
    
    if (!brand || !model) {
      skipped.push({ eurocode: p.eurocode, reason: 'missing data' });
      noMatch++;
      continue;
    }
    
    const result = resolveKType(brand, model, year, byBrand, meta);
    
    if (result.status === 'no_match') {
      skipped.push({ eurocode: p.eurocode, brand, model, year, reason: 'no_match' });
      noMatch++;
      continue;
    }
    
    const best = result.candidates[0];
    if (result.status === 'resolved') resolved++;
    else ambiguous++;
    
    mappings.push({
      eurocode: p.eurocode,
      catalogBrand: brand,
      catalogModel: model,
      catalogYear: year,
      ktype: best.ktype,
      tecdocBrand: best.brand,
      tecdocModel: best.model,
      score: best.score,
      status: result.status,
      reasons: best.reasons,
      allCandidates: result.candidates,
    });
    
    if ((i + 1) % 1000 === 0 || i === catalog.length - 1) {
      console.log(`  ${i + 1}/${catalog.length} — resolved: ${resolved}, ambiguous: ${ambiguous}, no match: ${noMatch}`);
    }
  }
  
  console.log(`\n========== RESULTS ==========`);
  console.log(`Total:     ${catalog.length}`);
  console.log(`Resolved:  ${resolved} (${(resolved/catalog.length*100).toFixed(1)}%)`);
  console.log(`Ambiguous: ${ambiguous} (${(ambiguous/catalog.length*100).toFixed(1)}%)`);
  console.log(`No match:  ${noMatch} (${(noMatch/catalog.length*100).toFixed(1)}%)`);
  
  // Score distribution
  const scoreBins = { '0.9+': 0, '0.8-0.9': 0, '0.7-0.8': 0, '0.6-0.7': 0, '0.5-0.6': 0, '0.4-0.5': 0 };
  for (const m of mappings) {
    if (m.score >= 0.9) scoreBins['0.9+']++;
    else if (m.score >= 0.8) scoreBins['0.8-0.9']++;
    else if (m.score >= 0.7) scoreBins['0.7-0.8']++;
    else if (m.score >= 0.6) scoreBins['0.6-0.7']++;
    else if (m.score >= 0.5) scoreBins['0.5-0.6']++;
    else scoreBins['0.4-0.5']++;
  }
  console.log('\nScore distribution:');
  for (const [bin, count] of Object.entries(scoreBins)) {
    console.log(`  ${bin}: ${count}`);
  }
  
  await writeFile('data/batch-ktype-resolver-results.json', JSON.stringify({
    mappings, skipped,
    stats: { total: catalog.length, resolved, ambiguous, noMatch, scoreBins, timestamp: new Date().toISOString() }
  }, null, 2));
  
  console.log('\nSaved: data/batch-ktype-resolver-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
