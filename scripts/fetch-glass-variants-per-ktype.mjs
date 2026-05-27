#!/usr/bin/env node
/**
 * fetch-glass-variants-per-ktype.mjs
 * =================================
 * Henter alle glassvarianter per kType fra tilgjengelig kilde.
 *
 * Primærkilde:
 *  - MACS VIS live API via VIN -> kandidat-kType er allerede testet i repoet,
 *    men full glassvariant-katalog per kType er ikke verifisert.
 *
 * Dette scriptet er derfor bygget som en produksjonsklar ramme med:
 *  1. Input fra fil eller CLI
 *  2. Normalisert output til data/ktype-glass-variants.json
 *  3. Pluggbar provider-funksjon for MACS VIS / annen katalogkilde
 *  4. Rate limit, retry, timeout og feillogging
 *
 * BRUK:
 *   node scripts/fetch-glass-variants-per-ktype.mjs --ktype 32787
 *   node scripts/fetch-glass-variants-per-ktype.mjs --input data/ktype-list.txt
 *   node scripts/fetch-glass-variants-per-ktype.mjs --input data/ktype-list.txt --output data/ktype-glass-variants.json
 *
 * ENV:
 *   MACS_VIS_API_KEY=...
 *   MACS_VIS_BASE_URL=https://api.macsds.com
 *
 * VIKTIG:
 *   Endepunktet for "alle glassvarianter per kType" må bekreftes mot faktisk leverandør.
 *   Default path under er lagt som eksplisitt konfigurasjon for å unngå skjult magi.
 */

import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const DEFAULT_OUTPUT = path.join(cwd, 'data', 'ktype-glass-variants.json');
const DEFAULT_ERRORS = path.join(cwd, 'data', 'ktype-glass-variants-errors.json');
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RETRIES = 2;

const MACS_VIS_API_KEY = process.env.MACS_VIS_API_KEY || '';
const MACS_VIS_BASE_URL = (process.env.MACS_VIS_BASE_URL || 'https://api.macsds.com').replace(/\/$/, '');
const MACS_VIS_KTYPE_VARIANTS_PATH = process.env.MACS_VIS_KTYPE_VARIANTS_PATH || '/vis/v1/ktype/{ktype}/glass';
const MACS_VIS_ALT_PATHS = [
  '/vis/v1/vin/{ktype}/glass',
  '/vis/v1/ktype/{ktype}/variants',
  '/vis/v1/ktype/{ktype}/glassvariants',
  '/vis/v1/glass/ktype/{ktype}',
];

function parseArgs(argv) {
  const args = {
    ktypes: [],
    input: null,
    output: DEFAULT_OUTPUT,
    errors: DEFAULT_ERRORS,
    provider: 'macs_vis',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    retries: DEFAULT_RETRIES,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ktype') args.ktypes.push(String(argv[++i] || '').trim());
    else if (arg === '--input') args.input = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--errors') args.errors = argv[++i];
    else if (arg === '--provider') args.provider = argv[++i];
    else if (arg === '--timeout-ms') args.timeoutMs = parseInt(argv[++i], 10);
    else if (arg === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (arg === '--retries') args.retries = parseInt(argv[++i], 10);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
fetch-glass-variants-per-ktype.mjs

Bruk:
  node scripts/fetch-glass-variants-per-ktype.mjs --ktype 32787
  node scripts/fetch-glass-variants-per-ktype.mjs --input data/ktype-list.txt

Flagg:
  --ktype <id>           Ett kType-id, kan brukes flere ganger
  --input <fil>          Tekstfil eller JSON-fil med kType-liste
  --output <fil>         Output JSON (default: data/ktype-glass-variants.json)
  --errors <fil>         Feil JSON (default: data/ktype-glass-variants-errors.json)
  --provider <navn>      Default: macs_vis
  --timeout-ms <ms>      Default: 15000
  --concurrency <n>      Default: 2
  --retries <n>          Default: 2
  --dry-run              Valider input uten nettverkskall
`);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
}

function readKtypesFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map(item => typeof item === 'object' ? item.ktype ?? item.kType ?? item.id : item);
    }
    if (Array.isArray(data.ktypes)) return data.ktypes;
    if (Array.isArray(data.results)) {
      return data.results.map(item => item.ktype ?? item.kType ?? item.id);
    }
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map(line => line.replace(/#.*/, '').trim())
    .filter(Boolean);
}

function normalizeOpening(value) {
  const v = String(value || '').toLowerCase();
  if (!v) return 'unknown';
  if (/(wind|front.*glass|frontrute|windshield)/.test(v)) return 'windshield';
  if (/(back|rear.*glass|bakrute|backglass)/.test(v)) return 'backglass';
  if (/(door|side|vent|quarter|siderute)/.test(v)) return 'sideglass';
  return v;
}

function normalizeVariant(raw, ktype, source) {
  const openingRaw = raw.opening || raw.glassType || raw.partType || raw.category || raw.position || '';
  return {
    ktype: String(ktype),
    source,
    opening: normalizeOpening(openingRaw),
    openingRaw,
    eurocode: raw.eurocode || raw.euroCode || raw.code || null,
    oemPartNumber: raw.oemPartNumber || raw.oem || raw.oe || null,
    articleNumber: raw.articleNumber || raw.articleNo || raw.sku || null,
    description: raw.description || raw.name || raw.title || null,
    features: {
      camera: Boolean(raw.camera || raw.adasCamera || raw.hasCamera),
      hud: Boolean(raw.hud || raw.headUpDisplay),
      heated: Boolean(raw.heated || raw.heating),
      rainSensor: Boolean(raw.rainSensor || raw.sensorRain),
      acoustic: Boolean(raw.acoustic || raw.soundproof),
      antenna: Boolean(raw.antenna || raw.integratedAntenna),
      encapsulated: Boolean(raw.encapsulated || raw.encapsulation),
      solar: Boolean(raw.solar || raw.sunProtect),
    },
    raw,
  };
}

async function fetchJson(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, statusText: res.statusText, data, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVariantsFromMacsVis(ktype, timeoutMs) {
  if (!MACS_VIS_API_KEY) {
    throw new Error('MACS_VIS_API_KEY mangler');
  }

  const paths = [MACS_VIS_KTYPE_VARIANTS_PATH, ...MACS_VIS_ALT_PATHS];
  const attempts = [];

  for (const pathTemplate of paths) {
    const endpoint = pathTemplate.replace('{ktype}', encodeURIComponent(String(ktype)));
    const url = `${MACS_VIS_BASE_URL}${endpoint}`;
    attempts.push(url);

    try {
      const res = await fetchJson(url, {
        timeoutMs,
        headers: {
          Authorization: `Bearer ${MACS_VIS_API_KEY}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if ([401, 403, 404, 405].includes(res.status)) continue;
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const payload = res.data ?? {};
      const variants = payload.variants || payload.results || payload.glass || payload.items || payload.data || [];
      if (!Array.isArray(variants)) {
        continue;
      }

      return {
        provider: 'macs_vis',
        endpoint: url,
        count: variants.length,
        variants: variants.map(v => normalizeVariant(v, ktype, 'macs_vis')),
        raw: payload,
        attempts,
      };
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|TLS|CERT|abort/i.test(msg)) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`fetch failed after ${paths.length} paths: ${attempts.join(' | ')}`);
}

async function fetchVariantsForKtype(ktype, args) {
  if (args.provider !== 'macs_vis') {
    throw new Error(`Ukjent provider: ${args.provider}`);
  }
  return fetchVariantsFromMacsVis(ktype, args.timeoutMs);
}

async function withRetry(fn, retries) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function summarize(records, failures) {
  const totalVariants = records.reduce((sum, r) => sum + (r.count || 0), 0);
  const byOpening = {};
  for (const record of records) {
    for (const variant of record.variants || []) {
      byOpening[variant.opening] = (byOpening[variant.opening] || 0) + 1;
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    ktypesRequested: records.length + failures.length,
    ktypesSucceeded: records.length,
    ktypesFailed: failures.length,
    totalVariants,
    byOpening,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const fileKtypes = args.input ? readKtypesFromFile(path.resolve(args.input)) : [];
  const ktypes = unique([...args.ktypes, ...fileKtypes]);

  if (ktypes.length === 0) {
    console.error('❌ Ingen kType oppgitt. Bruk --ktype eller --input.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Fetch glass variants per kType');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Provider:     ${args.provider}`);
  console.log(`kTypes:       ${ktypes.length}`);
  console.log(`Concurrency:  ${args.concurrency}`);
  console.log(`Timeout:      ${args.timeoutMs} ms`);
  console.log(`Retries:      ${args.retries}`);
  console.log(`Output:       ${args.output}`);
  console.log(`Errors:       ${args.errors}`);
  console.log(`Dry run:      ${args.dryRun ? 'yes' : 'no'}`);
  console.log('');

  if (args.dryRun) {
    console.log('kTypes:');
    for (const ktype of ktypes) console.log(` - ${ktype}`);
    return;
  }

  const failures = [];
  const records = [];

  await runPool(ktypes, args.concurrency, async (ktype) => {
    process.stdout.write(`→ ${ktype} ... `);
    try {
      const result = await withRetry(() => fetchVariantsForKtype(ktype, args), args.retries);
      console.log(`OK (${result.count} variants)`);
      records.push({
        ktype: String(ktype),
        provider: result.provider,
        endpoint: result.endpoint,
        count: result.count,
        variants: result.variants,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log(`FAIL (${err.message})`);
      failures.push({
        ktype: String(ktype),
        error: err.message,
        failedAt: new Date().toISOString(),
      });
    }
  });

  const summary = summarize(records, failures);

  ensureDir(args.output);
  ensureDir(args.errors);

  fs.writeFileSync(args.output, JSON.stringify({ summary, records }, null, 2));
  fs.writeFileSync(args.errors, JSON.stringify({ generatedAt: new Date().toISOString(), failures }, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Oppsummering');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ Suksess: ${summary.ktypesSucceeded}`);
  console.log(`❌ Feil:    ${summary.ktypesFailed}`);
  console.log(`🪟 Varianter totalt: ${summary.totalVariants}`);
  console.log(`📄 Skrevet: ${args.output}`);
  console.log(`⚠️  Feilfil: ${args.errors}`);

  if (failures.length > 0) {
    process.exitCode = 2;
  }
}

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
