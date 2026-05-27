#!/usr/bin/env node
/**
 * parse-html-catalog-to-glass-variants.mjs
 *
 * Leser eksisterende katalog/HTML-normalisert JSON og mapper til D1 glass_variants-schema.
 * Støtter både exact-map og fuzzy alias matching mot kType-map.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : fallback;
};

const INPUT = path.resolve(arg('--input', 'data/catalog-prod-v2.json'));
const OUTPUT = path.resolve(arg('--output', 'data/glass-variants-from-catalog.json'));
const KTYPE_MAP_PATH = arg('--ktype-map', null) ? path.resolve(arg('--ktype-map')) : null;
const SOURCE_OVERRIDE = arg('--source', null);
const MARKET = arg('--market', 'EU');
const CONFIDENCE = Number(arg('--confidence', '0.70'));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s === '' || s === '-' ? null : s;
}

function normBrand(v) {
  const s = (clean(v) || '').toUpperCase();
  const aliases = {
    'VW': 'VOLKSWAGEN',
    'V.W.': 'VOLKSWAGEN',
    'ŠKODA': 'SKODA',
    'VAUXHALL': 'OPEL',
  };
  return aliases[s] || s;
}

function normModel(v) {
  return (clean(v) || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function modelTokens(v) {
  const stop = new Set(['II','III','IV','V','VI','VII','VIII','BUSS','BUS','EST','HBK','MPV','SUV','STASJONSVOGN','SEDAN','CABRIOLET','KABRIOLET','RHD','LHD']);
  const toks = normModel(v)
    .replace(/[()\/,.-]/g, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => x.length >= 3)
    .filter(x => !stop.has(x));
  return [...new Set(toks)];
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function uniq(arrIn) {
  return [...new Set(arrIn.filter(Boolean))];
}

function normalizeOpening(category, description = '') {
  const c = (category || '').toLowerCase();
  const d = (description || '').toLowerCase();

  if (c.includes('frontrute') || d.includes('windscreen') || d.includes('windshield') || d.includes(' ws ')) return 'windshield';
  if (c.includes('bakrute') || d.includes('backglass') || d.includes('rear window')) return 'backglass';
  if (c.includes('siderute') || d.includes('door glass') || d.includes('sideglass')) return 'sideglass';
  if (c.includes('annet') && d.includes('moulding')) return 'moulding';
  return 'unknown';
}

function featureSignature(features) {
  const parts = [
    `cam:${features.camera ? 1 : 0}`,
    `hud:${features.hud ? 1 : 0}`,
    `heat:${features.heated ? 1 : 0}`,
    `rain:${features.rainSensor ? 1 : 0}`,
    `acou:${features.acoustic ? 1 : 0}`,
    `ant:${features.antenna ? 1 : 0}`,
    `shade:${features.shade ? 1 : 0}`,
    `lane:${features.laneAssist ? 1 : 0}`,
    `adas:${features.adas ? 1 : 0}`,
  ];
  const sig = parts.join('|');
  return sig === 'cam:0|hud:0|heat:0|rain:0|acou:0|ant:0|shade:0|lane:0|adas:0' ? 'default' : sig;
}

function recordKey(rec) {
  return [
    normBrand(rec.brand),
    normModel(rec.model),
    clean(rec.yearFrom) || '',
    clean(rec.yearTo) || '',
    clean(rec.eurocode) || '',
    clean(rec.articleNumber) || ''
  ].join('|');
}

function loadKtypeMap(file) {
  if (!file) return null;
  const raw = readJson(file);

  if (raw.exact_map || raw.aliases) {
    return {
      exact: raw.exact_map || {},
      aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    };
  }

  if (Array.isArray(raw)) {
    const exact = {};
    for (const row of raw) {
      const key = [
        normBrand(row.brand),
        normModel(row.model),
        clean(row.yearFrom) || '',
        clean(row.yearTo) || '',
        clean(row.eurocode) || '',
        clean(row.articleNumber) || ''
      ].join('|');
      if (row.ktype) exact[key] = Number(row.ktype);
    }
    return { exact, aliases: [] };
  }

  if (raw && typeof raw === 'object' && raw.map) {
    return { exact: raw.map, aliases: [] };
  }

  return { exact: {}, aliases: [] };
}

function fuzzyMatchKtype(rec, mapObj) {
  if (!mapObj) return { ktype: null, matchType: 'none' };

  const exactKey = recordKey(rec);
  if (mapObj.exact && mapObj.exact[exactKey]) {
    return { ktype: Number(mapObj.exact[exactKey]), matchType: 'exact' };
  }

  const brand = normBrand(rec.brand);
  const model = normModel(rec.model);
  const tokens = modelTokens(model);
  const yearFrom = rec.yearFrom ?? null;
  const yearTo = rec.yearTo ?? null;

  let best = null;

  for (const alias of mapObj.aliases || []) {
    if (normBrand(alias.brand) !== brand) continue;

    const overlap = (alias.model_tokens || []).filter(t => tokens.includes(t));
    if (overlap.length === 0) continue;

    let score = overlap.length * 10;

    if (yearFrom && alias.yearFrom && Number(yearFrom) === Number(alias.yearFrom)) score += 5;
    if (yearTo && alias.yearTo && Number(yearTo) === Number(alias.yearTo)) score += 5;
    if (model.includes(alias.model) || alias.model.includes(model)) score += 8;

    if (!best || score > best.score) {
      best = { ktype: Number(alias.ktype), matchType: 'fuzzy', score, overlap, alias };
    }
  }

  if (best && best.score >= 10) {
    return best;
  }

  return { ktype: null, matchType: 'none' };
}

function toVariantRow(rec, match) {
  const features = {
    adas: !!rec.adas,
    rainSensor: !!rec.rainSensor,
    heated: !!rec.heated,
    acoustic: !!rec.acoustic,
    antenna: !!rec.antenna,
    hud: !!rec.hud,
    shade: !!rec.shade,
    camera: !!rec.camera,
    laneAssist: !!rec.laneAssist,
  };

  const oem = uniq(arr(rec.oemNumbers).map(clean)).join(', ') || null;
  const opening = normalizeOpening(rec.category, rec.description || '');

  return {
    ktype: match.ktype,
    market: MARKET,
    source: clean(SOURCE_OVERRIDE || rec.source || rec.supplier || 'catalog_html') || 'catalog_html',
    opening,
    opening_raw: clean(rec.category),
    eurocode: clean(rec.eurocode),
    oem_part_number: oem,
    article_number: clean(rec.articleNumber),
    description: clean(rec.description),
    feature_signature: featureSignature(features),
    features_json: features,
    raw_payload: rec,
    confidence: CONFIDENCE,
    active: 1,
    join_key: recordKey(rec),
    match_type: match.matchType,
    match_score: match.score || null,
    match_overlap: match.overlap || [],
    join_meta: {
      brand: clean(rec.brand),
      model: clean(rec.model),
      yearFrom: rec.yearFrom ?? null,
      yearTo: rec.yearTo ?? null,
      supplier: clean(rec.supplier),
    }
  };
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ Input mangler: ${INPUT}`);
    process.exit(1);
  }

  const root = readJson(INPUT);
  const records = Array.isArray(root) ? root : (root.records || []);
  const mapObj = loadKtypeMap(KTYPE_MAP_PATH);

  const variants = [];
  let matched = 0;
  let exactMatched = 0;
  let fuzzyMatched = 0;
  let unmatched = 0;

  for (const rec of records) {
    const match = fuzzyMatchKtype(rec, mapObj);
    if (match.ktype) {
      matched += 1;
      if (match.matchType === 'exact') exactMatched += 1;
      if (match.matchType === 'fuzzy') fuzzyMatched += 1;
    } else {
      unmatched += 1;
    }
    variants.push(toVariantRow(rec, match));
  }

  const d1Ready = variants.filter(v => Number.isInteger(v.ktype));
  const unresolved = variants.filter(v => !Number.isInteger(v.ktype));

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      input: INPUT,
      output: OUTPUT,
      sourceRecords: records.length,
      totalVariants: variants.length,
      d1ReadyRows: d1Ready.length,
      unresolvedRows: unresolved.length,
      ktypeMapUsed: !!KTYPE_MAP_PATH,
      market: MARKET,
      confidence: CONFIDENCE,
      exactMatched,
      fuzzyMatched,
      unmatched,
    },
    d1_ready_rows: d1Ready,
    unresolved_rows: unresolved.slice(0, 500),
  };

  writeJson(OUTPUT, output);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Parse HTML/catalog → glass_variants schema');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Input:         ${INPUT}`);
  console.log(`Output:        ${OUTPUT}`);
  console.log(`Records:       ${records.length}`);
  console.log(`KType map:     ${KTYPE_MAP_PATH || 'none'}`);
  console.log(`D1-ready:      ${d1Ready.length}`);
  console.log(`Unresolved:    ${unresolved.length}`);
  console.log(`Exact matched: ${exactMatched}`);
  console.log(`Fuzzy matched: ${fuzzyMatched}`);
  console.log(`No kType:      ${unmatched}`);
}

main();
