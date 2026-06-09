#!/usr/bin/env node
/**
 * SVV → TecDoc Fuzzy Matcher CLI
 * Usage: node scripts/fuzzy-match-svv-tecdoc.mjs <regnr> [regnr2 ...]
 * Env: SVV_API_KEY required
 * Outputs:
 *   - D1 SQL INSERT statements to stdout (redirect to file for wrangler d1 execute --file=...)
 *   - MemPalace KG facts appended to .kimi/mempalace/kg-append.jsonl
 */
import { runFuzzyMatch } from './lib/svv-fuzzy.mjs';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPaths = [
    resolve(root, '.env.local'),
    resolve(root, '.env.production'),
    resolve(root, '.env'),
  ];
  for (const p of envPaths) {
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^SVV_API_KEY=(.+)$/);
        if (m) {
          // Strip optional quotes and inline comments
          let val = m[1].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          const hashIdx = val.indexOf(' #');
          if (hashIdx >= 0) val = val.slice(0, hashIdx);
          return val.trim();
        }
      }
    }
  }
  const envKey = process.env.SVV_API_KEY;
  if (!envKey) {
    console.error('Error: SVV_API_KEY environment variable not set');
    process.exit(1);
  }
  return envKey;
}

function escapeSqlString(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function appendKGFact(subject, predicate, object, validFrom) {
  const kgPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  const dir = dirname(kgPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const line = JSON.stringify({ subject, predicate, object, validFrom: validFrom || new Date().toISOString() }) + '\n';
  appendFileSync(kgPath, line);
}

function generateSqlInsert(result, regnrHash) {
  const best = result.tecdocResult?.candidates?.[0] || null;
  const cols = [
    'regnr', 'regnr_hash', 'make', 'model', 'year', 'normalized_make', 'normalized_model',
    'ktype', 'tecdoc_brand', 'tecdoc_model', 'tecdoc_year_from', 'tecdoc_year_to',
    'confidence_score', 'confidence_level', 'match_reasons', 'svv_status', 'svv_source', 'created_at'
  ];
  const vals = [
    escapeSqlString(result.regnr),
    escapeSqlString(regnrHash),
    escapeSqlString(result.vehicle?.make ?? ''),
    escapeSqlString(result.vehicle?.model ?? ''),
    result.vehicle?.year ?? 'NULL',
    escapeSqlString(result.normalizedMake),
    escapeSqlString(result.normalizedModel),
    best?.ktype ?? 'NULL',
    escapeSqlString(best?.brand),
    escapeSqlString(best?.model),
    best?.yearFrom ?? 'NULL',
    best?.yearTo ?? 'NULL',
    result.confidenceScore ?? 'NULL',
    escapeSqlString(result.confidenceLevel),
    escapeSqlString(JSON.stringify(result.matchReasons)),
    escapeSqlString(result.svvStatus),
    escapeSqlString('svv.enkeltoppslag'),
    escapeSqlString(result.createdAt),
  ];
  return `INSERT INTO svv_tecdoc_matches (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
}

const NORWEGIAN_REGNR_RE = /^[A-Z]{2}\d{4,5}$/;

async function main() {
  const rawRegnrs = process.argv.slice(2).map(r => r.toUpperCase().replace(/\s/g, ''));
  const regnrs = rawRegnrs.filter(r => {
    if (NORWEGIAN_REGNR_RE.test(r)) return true;
    console.error(`Warning: skipping invalid regnr format "${r}" (expected Norwegian format, e.g. AB12345)`);
    return false;
  });
  if (regnrs.length === 0) {
    console.error('Usage: node scripts/fuzzy-match-svv-tecdoc.mjs <regnr> [regnr2 ...]');
    process.exit(1);
  }

  const svvApiKey = loadEnv();
  if (!svvApiKey || svvApiKey === 'NOT_SET') {
    console.error('Error: SVV_API_KEY not found in .env.local or environment');
    process.exit(1);
  }

  const sqlLines = [];

  for (const regnr of regnrs) {
    console.error(`[FuzzyMatch] Processing ${regnr}...`);
    const result = await runFuzzyMatch(regnr, svvApiKey);
    const regnrHash = await sha256(regnr);

    // Generate SQL
    sqlLines.push(generateSqlInsert(result, regnrHash));

    // Append to MemPalace KG
    const ts = result.createdAt;
    appendKGFact(`regnr:${regnr}`, 'svv_lookup_status', result.svvStatus, ts);
    if (result.svvStatus === 'ok') {
      appendKGFact(`regnr:${regnr}`, 'normalized_make', result.normalizedMake, ts);
      appendKGFact(`regnr:${regnr}`, 'normalized_model', result.normalizedModel, ts);
      appendKGFact(`regnr:${regnr}`, 'vehicle_year', String(result.vehicle.year), ts);
      if (result.tecdocResult?.candidates?.length > 0) {
        const best = result.tecdocResult.candidates[0];
        appendKGFact(`regnr:${regnr}`, 'matched_ktype', String(best.ktype), ts);
        appendKGFact(`regnr:${regnr}`, 'tecdoc_brand', best.brand, ts);
        appendKGFact(`regnr:${regnr}`, 'tecdoc_model', best.model, ts);
        appendKGFact(`regnr:${regnr}`, 'match_confidence_score', String(Number(best.score ?? 0).toFixed(3)), ts);
        appendKGFact(`regnr:${regnr}`, 'match_confidence_level', result.confidenceLevel, ts);
        appendKGFact(`regnr:${regnr}`, 'match_reasons', JSON.stringify(result.matchReasons), ts);
      } else {
        appendKGFact(`regnr:${regnr}`, 'matched_ktype', 'none', ts);
      }
    }

    // Print human-readable summary to stderr
    console.error(`  SVV: ${result.svvStatus} | Make: ${result.normalizedMake} | Model: ${result.normalizedModel} | Year: ${result.vehicle?.year || 'N/A'}`);
    if (result.tecdocResult?.candidates?.length > 0) {
      const best = result.tecdocResult.candidates[0];
      console.error(`  Best kType: ${best.ktype} (${best.brand} ${best.model}) score=${Number(best.score ?? 0).toFixed(3)} level=${result.confidenceLevel}`);
    } else {
      console.error(`  No TecDoc match`);
    }
  }

  // Output SQL to stdout (no BEGIN/COMMIT — Wrangler D1 does not support transactions)
  console.log(sqlLines.join('\n'));

  console.error(`[FuzzyMatch] Done. ${regnrs.length} regnr(s) processed. SQL emitted to stdout. KG appended to .kimi/mempalace/kg-append.jsonl`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
