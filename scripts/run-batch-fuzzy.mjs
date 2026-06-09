#!/usr/bin/env node
/**
 * run-batch-fuzzy.mjs — Robust batch SVV→TecDoc fuzzy matcher
 *
 * Features:
 *   - Checkpointing (resumable)
 *   - Rate limiting (3 concurrent, 300ms delay between starts)
 *   - Exponential backoff (1s, 2s, 4s, max 3 retries)
 *   - Progress reporting every 50 regnr
 *   - Graceful SIGINT shutdown
 *
 * Usage:
 *   node scripts/run-batch-fuzzy.mjs
 *   node scripts/run-batch-fuzzy.mjs --input data/finn-no-regnr/regnr-list.txt --limit 50
 */

import { runFuzzyMatch } from './lib/svv-fuzzy.mjs';
import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/* ─── Config ─────────────────────────────────────────────────── */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const CONFIG = {
  maxConcurrent: 3,
  delayMs: 300,
  retries: 3,
  backoffBaseMs: 1000,
  progressInterval: 50,
  checkpointPath: resolve(root, '.kimi/mempalace/batch-checkpoint.json'),
  sqlOutputPath: resolve(root, '.kimi/mempalace/batch-output.sql'),
  kgAppendPath: resolve(root, '.kimi/mempalace/kg-append.jsonl'),
  errorLogPath: resolve(root, '.kimi/mempalace/batch-errors.jsonl'),
  defaultInput: resolve(root, 'data/finn-no-regnr/regnr-list.txt'),
  defaultDb: resolve(root, '.kimi/mempalace/batch-checkpoint.db'),
};

/* ─── CLI args ───────────────────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { input: CONFIG.defaultInput, limit: Infinity, db: CONFIG.defaultDb };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) parsed.input = resolve(root, args[++i]);
    if (args[i] === '--limit' && args[i + 1]) parsed.limit = parseInt(args[++i], 10);
    if (args[i] === '--db' && args[i + 1]) parsed.db = resolve(root, args[++i]);
  }
  return parsed;
}

/* ─── Env ────────────────────────────────────────────────────── */

function loadEnv() {
  const envPaths = [resolve(root, '.env.local'), resolve(root, '.env.production'), resolve(root, '.env')];
  for (const p of envPaths) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^SVV_API_KEY=(.+)$/);
      if (m) {
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
  const envKey = process.env.SVV_API_KEY;
  if (!envKey) {
    console.error('Error: SVV_API_KEY environment variable not set');
    process.exit(1);
  }
  return envKey;
}

/* ─── SQLite helpers ─────────────────────────────────────────── */

function ensureCheckpointDb(dbPath) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(dbPath)) {
    execSync(
      `sqlite3 "${dbPath}" "CREATE TABLE IF NOT EXISTS svv_tecdoc_matches (regnr_hash TEXT PRIMARY KEY, confidence_level TEXT, processed_at DATETIME DEFAULT CURRENT_TIMESTAMP);"`
    );
  }
}

function loadProcessedHashes(dbPath) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(dbPath)) return new Set();
  try {
    const out = execSync(
      `sqlite3 "${dbPath}" "SELECT regnr_hash FROM svv_tecdoc_matches WHERE confidence_level != 'none';"`,
      { encoding: 'utf8' }
    );
    return new Set(out.split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function insertProcessed(dbPath, regnrHash, confidenceLevel) {
  try {
    const sql = `INSERT OR REPLACE INTO svv_tecdoc_matches (regnr_hash, confidence_level) VALUES ('${regnrHash}', '${confidenceLevel}');`;
    execSync(`sqlite3 "${dbPath}" "${sql}"`);
  } catch (e) {
    // non-fatal: checkpoint JSON is primary source of truth
  }
}

/* ─── Checkpoint JSON ────────────────────────────────────────── */

function loadCheckpoint() {
  const defaultCp = {
    lastProcessed: null,
    totalDone: 0,
    totalFailed: 0,
    confidenceHistogram: { exact: 0, high: 0, medium: 0, low: 0, none: 0 },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!existsSync(CONFIG.checkpointPath)) return defaultCp;
  try {
    return JSON.parse(readFileSync(CONFIG.checkpointPath, 'utf8'));
  } catch {
    return defaultCp;
  }
}

function saveCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  const dir = dirname(CONFIG.checkpointPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG.checkpointPath, JSON.stringify(checkpoint, null, 2));
}

/* ─── Retry with exponential backoff ─────────────────────────── */

async function withRetry(fn, retries = CONFIG.retries, baseMs = CONFIG.backoffBaseMs) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNRESET') ||
        msg.includes('429');
      if (!isRetryable || attempt >= retries) throw err;
      const wait = baseMs * Math.pow(2, attempt);
      console.error(`[Retry] Attempt ${attempt + 1}/${retries + 1} failed, waiting ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/* ─── SHA-256 ────────────────────────────────────────────────── */

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ─── SQL escape ─────────────────────────────────────────────── */

function escapeSqlString(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
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

/* ─── Output appenders ───────────────────────────────────────── */

function appendSql(line) {
  const dir = dirname(CONFIG.sqlOutputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(CONFIG.sqlOutputPath, line + '\n');
}

function appendKGFact(subject, predicate, object, validFrom) {
  const dir = dirname(CONFIG.kgAppendPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ subject, predicate, object, validFrom: validFrom || new Date().toISOString() }) + '\n';
  appendFileSync(CONFIG.kgAppendPath, line);
}

function appendError(record) {
  const dir = dirname(CONFIG.errorLogPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
  appendFileSync(CONFIG.errorLogPath, line);
}

/* ─── Progress ───────────────────────────────────────────────── */

function printProgress(done, total, histogram, startTime) {
  const pct = total > 0 ? ((done / total) * 100).toFixed(0) : '0';
  const elapsed = Date.now() - startTime;
  const avgMs = done > 0 ? elapsed / done : 0;
  const remaining = total - done;
  const etaSec = Math.round((remaining * avgMs) / 1000);
  const etaMin = Math.ceil(etaSec / 60);
  const exact = histogram.exact || 0;
  const high = histogram.high || 0;
  const medium = histogram.medium || 0;
  const low = histogram.low || 0;
  const none = histogram.none || 0;
  console.error(
    `[Batch] ${done}/${total} (${pct}%) | exact:${exact} high:${high} medium:${medium} low:${low} none:${none} | ETA: ${etaMin}min`
  );
}

/* ─── Worker ─────────────────────────────────────────────────── */

async function workerLoop(queue, { svvApiKey, checkpoint, stats, dbPath, processedHashes, shuttingDownRef }) {
  while (true) {
    if (shuttingDownRef.shuttingDown) break;

    const regnr = queue.shift();
    if (!regnr) break;

    const regnrHash = await sha256(regnr);

    // Skip already processed
    if (processedHashes.has(regnrHash)) {
      stats.skipped++;
      continue;
    }

    // Rate limit delay
    await new Promise(r => setTimeout(r, CONFIG.delayMs));

    try {
      const result = await withRetry(() => runFuzzyMatch(regnr, svvApiKey));

      // SQL output
      const sql = generateSqlInsert(result, regnrHash);
      appendSql(sql);

      // KG output
      const ts = result.createdAt;
      appendKGFact(`regnr:${regnr}`, 'svv_lookup_status', result.svvStatus, ts);
      if (result.svvStatus === 'ok') {
        appendKGFact(`regnr:${regnr}`, 'normalized_make', result.normalizedMake, ts);
        appendKGFact(`regnr:${regnr}`, 'normalized_model', result.normalizedModel, ts);
        appendKGFact(`regnr:${regnr}`, 'vehicle_year', String(result.vehicle?.year ?? ''), ts);
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

      // Update stats & checkpoint
      checkpoint.lastProcessed = regnr;
      checkpoint.totalDone++;
      checkpoint.confidenceHistogram[result.confidenceLevel] =
        (checkpoint.confidenceHistogram[result.confidenceLevel] || 0) + 1;
      stats.done++;

      // SQLite checkpoint
      insertProcessed(dbPath, regnrHash, result.confidenceLevel);
      processedHashes.add(regnrHash);
    } catch (err) {
      checkpoint.totalFailed++;
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      appendError({ regnr, regnrHash, error: msg });
    }
  }
}

/* ─── Main ───────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs();
  const svvApiKey = loadEnv();

  if (!svvApiKey || svvApiKey === 'NOT_SET') {
    console.error('Error: SVV_API_KEY not found in .env.local or environment');
    process.exit(1);
  }

  // Load regnr list
  if (!existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }
  const allRegnrs = readFileSync(args.input, 'utf8')
    .split('\n')
    .map(r => r.trim().toUpperCase())
    .filter(r => /^[A-Z]{2}\d{3,5}$/.test(r));

  const limit = Math.min(args.limit, allRegnrs.length);
  const regnrs = allRegnrs.slice(0, limit);

  console.error(`[Batch] Loaded ${regnrs.length} regnr(s) from ${args.input}`);
  console.error(`[Batch] Checkpoint: ${CONFIG.checkpointPath}`);
  console.error(`[Batch] SQL output: ${CONFIG.sqlOutputPath}`);
  console.error(`[Batch] Max concurrent: ${CONFIG.maxConcurrent}, delay: ${CONFIG.delayMs}ms`);

  // Setup checkpoint DB
  ensureCheckpointDb(args.db);

  // Load checkpoint + processed hashes
  const checkpoint = loadCheckpoint();
  const processedHashes = loadProcessedHashes(args.db);
  console.error(`[Batch] Already processed (non-none): ${processedHashes.size}`);

  const stats = { done: 0, failed: 0, skipped: 0, startTime: Date.now() };
  const shuttingDownRef = { shuttingDown: false };
  const queue = [...regnrs];

  // Graceful shutdown
  function handleSignal(signal) {
    console.error(`\n[Batch] Received ${signal}, finishing in-flight requests...`);
    shuttingDownRef.shuttingDown = true;
  }
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  // Progress timer
  const progressTimer = setInterval(() => {
    if (stats.done > 0) {
      printProgress(stats.done, regnrs.length, checkpoint.confidenceHistogram, stats.startTime);
    }
  }, 30000); // every 30s as heartbeat

  // Spawn workers
  const workers = Array.from({ length: CONFIG.maxConcurrent }, () =>
    workerLoop(queue, { svvApiKey, checkpoint, stats, dbPath: args.db, processedHashes, shuttingDownRef })
  );

  await Promise.all(workers);

  clearInterval(progressTimer);

  // Final checkpoint
  saveCheckpoint(checkpoint);

  // Final report
  const total = stats.done + stats.failed;
  const elapsedSec = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const h = checkpoint.confidenceHistogram;
  const exactHighPct = total > 0 ? (((h.exact || 0) + (h.high || 0)) / total * 100).toFixed(1) : '0.0';

  console.error(`\n[Batch] DONE`);
  console.error(`[Batch] Processed: ${stats.done} | Failed: ${stats.failed} | Skipped: ${stats.skipped} | Total: ${total}`);
  console.error(`[Batch] Time: ${elapsedSec}s | Avg: ${total > 0 ? (elapsedSec / total).toFixed(2) : '0.00'}s/regnr`);
  console.error(`[Batch] Confidence: exact:${h.exact || 0} high:${h.high || 0} medium:${h.medium || 0} low:${h.low || 0} none:${h.none || 0}`);
  console.error(`[Batch] exact+high: ${exactHighPct}%`);

  if (shuttingDownRef.shuttingDown) {
    console.error('[Batch] Shut down gracefully. Checkpoint saved.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
