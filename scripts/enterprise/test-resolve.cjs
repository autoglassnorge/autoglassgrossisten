const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const { join } = require('path');
const { execSync } = require('child_process');
const { writeFile } = require('fs/promises');

const DATA_DIR = join(process.cwd(), 'data', 'tecdoc-import');

function normalizeBrand(raw) {
  if (!raw) return '';
  return raw.toUpperCase().trim().replace(/\s+/g, ' ').replace(/^VW\b/, 'VOLKSWAGEN').replace(/MERCEDES\s*BENZ/, 'MERCEDES').replace(/MERCEDES-BENZ/, 'MERCEDES').replace(/LAND\s*ROVER/, 'LAND ROVER').replace(/ALFA\s*ROMEO/, 'ALFA ROMEO');
}

const NOISE_WORDS = new Set(['HATCHBACK','STATIONWAGON','ESTATE','BREAK','AVANT','TOURING','SEDAN','SALOON','LIMOUSINE','COUPE','CABRIOLET','CONVERTIBLE','ROADSTER','SPIDER','TARGA','FASTBACK','SPORTBACK','SHOOTING','SW','WAGON','VAN','MINIVAN','MPV','SUV','CROSSOVER','OFFROAD','PICKUP','CHASSIS','FLATBED','COMBI','3D','4D','5D','DOOR','DOORS','AUTOMATIC','MANUAL','TIPTRONIC','DSG','CVT','X-DRIVE','XDRIVE','QUATTRO','4MATIC','4X4','AWD','RWD','FWD','TDI','TSI','FSI','DCI','HDI','CDI','TCE','GDI','MPI','TFSI','MULTIJET','JTDM','JTD','VVTI','VVT-I','D-4D','D4D','CDTI','TDCI','SDI','ECOBOOST','SKYACTIV','MIVEC','VTEC','I-VTEC','IVTEC','CLASS','SERIES']);

const MODEL_ALIASES = { '3 SERIES': '3', '5 SERIES': '5', '7 SERIES': '7', 'C-CLASS': 'C CLASS', 'E-CLASS': 'E CLASS', 'S-CLASS': 'S CLASS', 'CR-V': 'CRV', 'CX-3': 'CX3', 'CX-5': 'CX5', 'MX-5': 'MX5', 'HI-LUX': 'HILUX', 'LAND-CRUISER': 'LAND CRUISER', 'LANDCRUISER': 'LAND CRUISER', 'X-TRAIL': 'XTRAIL', 'CMAX': 'C-MAX', 'BMAX': 'B-MAX', 'SMAX': 'S-MAX', 'GOLF 7': 'GOLF VII', 'GOLF 6': 'GOLF VI', 'GOLF 5': 'GOLF V', 'GOLF 4': 'GOLF IV', 'POLO 6': 'POLO 6R', 'POLO 5': 'POLO 9N', 'PASSAT 8': 'PASSAT B8', 'PASSAT 7': 'PASSAT B7', 'A4 B8': 'A4 B8', 'A4 B9': 'A4 B9', 'A6 C7': 'A6 C7', 'A3 8P': 'A3 8P', 'A3 8V': 'A3 8V', '3 E90': '3 E90', '3 F30': '3 F30', '5 E60': '5 E60', '5 F10': '5 F10', 'C W204': 'C CLASS W204', 'C W205': 'C CLASS W205', 'E W212': 'E CLASS W212', 'E W213': 'E CLASS W213', 'QASHQAI 1': 'QASHQAI J10', 'QASHQAI 2': 'QASHQAI J11' };

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

function scoreEntry(inputBrand, inputNorm, inputTokens, inputChassis, year, entry) {
  let score = 0;
  const reasons = [];
  if (inputBrand && entry.brand) {
    if (inputBrand === entry.brand) { score += 0.4; reasons.push('exact brand'); }
  }
  if (inputChassis.size > 0 && entry.chassisSet.size > 0) {
    let common = 0;
    for (const c of inputChassis) if (entry.chassisSet.has(c)) common++;
    if (common > 0) { score += 0.35; reasons.push('chassis match'); }
  }
  if (inputTokens.size > 0 && entry.tokenSet.size > 0) {
    let common = 0;
    for (const t of inputTokens) if (entry.tokenSet.has(t)) common++;
    const overlap = inputTokens.size <= 2 ? common / inputTokens.size : common / Math.max(inputTokens.size, entry.tokenSet.size);
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
  if (pools.length === 0) pools.push(allEntries);
  const bestByKtype = new Map();
  for (const pool of pools) {
    for (const entry of pool) {
      const { score, reasons } = scoreEntry(normBrand, inputNorm, inputTokens, inputChassis, year, entry);
      if (score < 0.15) continue;
      const existing = bestByKtype.get(entry.ktype);
      if (!existing || existing.score < score) { bestByKtype.set(entry.ktype, { entry, score, reasons }); }
    }
  }
  const candidates = Array.from(bestByKtype.values()).sort((a, b) => b.score - a.score).slice(0, 5).map(c => ({ ktype: c.entry.ktype, brand: c.entry.brand, model: c.entry.model, yearFrom: c.entry.yearFrom, yearTo: c.entry.yearTo, score: c.score, reasons: c.reasons }));
  if (candidates.length === 0) return { status: 'no_match', candidates: [] };
  const bestScore = candidates[0].score;
  const status = bestScore >= 0.75 ? 'resolved' : bestScore >= 0.4 ? 'ambiguous' : 'no_match';
  return { status, candidates };
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
  if (product.year_from) { const y = parseInt(product.year_from, 10); if (!isNaN(y) && y > 1900) return y; }
  const m = (product.description || '').match(/(\d{4})\s*[-–]\s*(\d{4}|\w+)/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

async function main() {
  console.log('Loading TecDoc...');
  const entries = [];
  
  const pc = await readLines('passengercars.csv');
  for (let i = 1; i < pc.length; i++) { const cols = pc[i].split('\t'); entries.push({ ktype: parseInt(cols[1], 10), brand: normalizeBrand(cols[3]), model: cols[8]?.trim(), yearFrom: parseYear(cols[5]), yearTo: parseYear(cols[6]) }); }
  console.log('  Passenger:', entries.length);
  
  const cv = await readLines('commercialvehicles.csv');
  const models = new Map();
  const modelLines = await readLines('models.csv');
  for (let i = 1; i < modelLines.length; i++) { const cols = modelLines[i].split('\t'); models.set(parseInt(cols[0], 10), { manId: parseInt(cols[1], 10), name: cols[4]?.trim() }); }
  const manufacturers = new Map();
  const manLines = await readLines('manufacturers.csv');
  for (let i = 1; i < manLines.length; i++) { const cols = manLines[i].split('\t'); manufacturers.set(parseInt(cols[0], 10), cols[3]?.trim()); }
  for (let i = 1; i < cv.length; i++) { const cols = cv[i].split('\t'); const modelId = parseInt(cols[2], 10); const mi = models.get(modelId); if (!mi) continue; const brand = normalizeBrand(manufacturers.get(mi.manId)); if (!brand) continue; entries.push({ ktype: parseInt(cols[1], 10), brand, model: cols[6]?.trim(), yearFrom: parseYear(cols[3]), yearTo: parseYear(cols[4]) }); }
  console.log('  +Commercial:', entries.length);
  
  const bikes = await readLines('motorbikes.csv');
  for (let i = 1; i < bikes.length; i++) { const cols = bikes[i].split('\t'); entries.push({ ktype: parseInt(cols[1], 10), brand: normalizeBrand(cols[3]), model: cols[8]?.trim(), yearFrom: parseYear(cols[5]), yearTo: parseYear(cols[6]) }); }
  console.log('  +Bikes:', entries.length);
  
  const filtered = entries.filter(e => e.ktype && e.brand && e.model);
  console.log('  Filtered:', filtered.length);
  
  console.log('Building meta...');
  const meta = buildMeta(filtered);
  console.log('  Meta:', meta.length);
  
  console.log('Grouping by brand...');
  const byBrand = groupByBrand(meta);
  console.log('  Brands:', byBrand.size);
  
  console.log('Fetching catalog...');
  const cmd = 'cd api/cf-worker && npx wrangler d1 execute GLASS_CATALOG_D1 --local --command=\"SELECT id, eurocode, brand, model, description, year_from, year_to FROM glass_catalog WHERE brand IS NOT NULL\" --json';
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024, timeout: 60000 });
  const parsed = JSON.parse(output.trim());
  const catalog = parsed[0].results;
  console.log('  Catalog:', catalog.length);
  
  console.log('Resolving...');
  const mappings = [];
  let resolved = 0, ambiguous = 0, noMatch = 0;
  for (let i = 0; i < catalog.length; i++) {
    const p = catalog[i];
    const brand = p.brand;
    const model = extractModel(p);
    const year = extractYear(p);
    if (!brand || !model) { noMatch++; continue; }
    const result = resolveKType(brand, model, year, byBrand, meta);
    if (result.status === 'no_match') { noMatch++; continue; }
    const best = result.candidates[0];
    if (result.status === 'resolved') resolved++; else ambiguous++;
    mappings.push({ eurocode: p.eurocode, catalogBrand: brand, catalogModel: model, catalogYear: year, ktype: best.ktype, tecdocBrand: best.brand, tecdocModel: best.model, score: best.score, status: result.status, reasons: best.reasons });
    if ((i + 1) % 1000 === 0 || i === catalog.length - 1) {
      console.log('  ' + (i + 1) + '/' + catalog.length + ' — resolved: ' + resolved + ', ambiguous: ' + ambiguous + ', no match: ' + noMatch);
    }
  }
  
  console.log('\n========== RESULTS ==========');
  console.log('Total:     ' + catalog.length);
  console.log('Resolved:  ' + resolved + ' (' + (resolved/catalog.length*100).toFixed(1) + '%)');
  console.log('Ambiguous: ' + ambiguous + ' (' + (ambiguous/catalog.length*100).toFixed(1) + '%)');
  console.log('No match:  ' + noMatch + ' (' + (noMatch/catalog.length*100).toFixed(1) + '%)');
  
  await writeFile('data/batch-ktype-resolver-results.json', JSON.stringify({ mappings, stats: { total: catalog.length, resolved, ambiguous, noMatch, timestamp: new Date().toISOString() } }, null, 2));
  console.log('\nSaved: data/batch-ktype-resolver-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
