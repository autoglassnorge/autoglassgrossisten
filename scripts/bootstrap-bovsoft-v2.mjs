#!/usr/bin/env node
/**
 * Bootstrap Bovsoft v2 — Enhanced Production Script
 * ==================================================
 *
 * Reads 1185 unique regnr from targeted-regnr-list.txt,
 * processes them in priority order (most sensors first),
 * calls Bovsoft REGNUM API, and incrementally saves results.
 *
 * Features:
 *   - Checkpoint / resume support
 *   - Incremental NDJSON output
 *   - Auto-generated D1 SQL after every 50 records
 *   - Graceful stop on 402 (out of credits)
 *   - Robust error handling & progress logging
 *
 * Usage:
 *   node scripts/bootstrap-bovsoft-v2.mjs [--limit=N] [--delay=1500]
 *
 * Outputs:
 *   data/finn-no-regnr/v2-results.ndjson          — incremental Bovsoft results
 *   data/finn-no-regnr/v2-checkpoint.json         — resume state
 *   data/finn-no-regnr/v2-batch-XXX.sql           — D1 inserts per 50-batch
 *   data/finn-no-regnr/v2-report.json             — final summary
 */

import * as fs from "fs";
import * as path from "path";

// ─── Configuration ───────────────────────────────────────────────────────────

const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = process.env.BOVSOFT_CLIENT_ID || "461";
const SECCODE = process.env.BOVSOFT_SECCODE || "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

const DATA_DIR = path.join(process.cwd(), "data", "finn-no-regnr");
const REGNR_LIST = path.join(DATA_DIR, "targeted-regnr-list.txt");
const REGNR_NDJSON = path.join(DATA_DIR, "targeted-regnr.ndjson");

const OUTPUT_NDJSON = path.join(DATA_DIR, "v2-results.ndjson");
const CHECKPOINT_FILE = path.join(DATA_DIR, "v2-checkpoint.json");
const REPORT_FILE = path.join(DATA_DIR, "v2-report.json");

const DEFAULT_DELAY_MS = 1500;
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

// ─── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: Infinity, delayMs: DEFAULT_DELAY_MS };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) opts.limit = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--delay=")) opts.delayMs = parseInt(arg.split("=")[1], 10);
  }
  return opts;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowISO() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function parseYear(yyyymm) {
  if (!yyyymm || String(yyyymm).length < 4) return null;
  return parseInt(String(yyyymm).slice(0, 4), 10);
}

function esc(str) {
  return (str || "").replace(/'/g, "''");
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    } catch (e) {
      console.warn(`⚠️  Corrupt checkpoint, starting fresh: ${e.message}`);
    }
  }
  return { processed: [], failed: [], lastBatch: 0, startedAt: nowISO() };
}

function saveCheckpoint(cp) {
  cp.updatedAt = nowISO();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function appendResult(record) {
  fs.appendFileSync(OUTPUT_NDJSON, JSON.stringify(record) + "\n");
}

function loadNdjsonRecords(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

// ─── Load & Prioritize Regnr ─────────────────────────────────────────────────

function loadRegnrPriorityMap() {
  // Build a map from NDJSON: regnr -> record with most sensors
  const records = loadNdjsonRecords(REGNR_NDJSON);
  const byRegnr = new Map();
  for (const r of records) {
    if (!r.regnr) continue;
    const existing = byRegnr.get(r.regnr);
    const sensorCount = Array.isArray(r.sensors) ? r.sensors.length : 0;
    if (!existing || sensorCount > existing.sensorCount) {
      byRegnr.set(r.regnr, { ...r, sensorCount });
    }
  }
  return byRegnr;
}

function buildQueue(limit) {
  const listText = fs.readFileSync(REGNR_LIST, "utf-8");
  const listRegnrs = listText
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);

  const priorityMap = loadRegnrPriorityMap();

  // Enrich list with priority data
  const enriched = listRegnrs.map((regnr) => {
    const meta = priorityMap.get(regnr);
    return {
      regnr,
      sensorCount: meta?.sensorCount || 0,
      sensors: meta?.sensors || [],
      finnBrand: meta?.brand || null,
      finnModel: meta?.model || null,
    };
  });

  // Sort: most sensors first, then alphabetically by regnr for stability
  enriched.sort((a, b) => {
    if (b.sensorCount !== a.sensorCount) return b.sensorCount - a.sensorCount;
    return a.regnr.localeCompare(b.regnr);
  });

  return enriched.slice(0, limit);
}

// ─── Bovsoft API ─────────────────────────────────────────────────────────────

async function callBovsoft(regnr, attempt = 1) {
  const url =
    `${BOVSOFT_URL}?id=${encodeURIComponent(CLIENT_ID)}` +
    `&seccode=${encodeURIComponent(SECCODE)}` +
    `&nameservice=${NAMESERVICE}` +
    `&regnum=${encodeURIComponent(regnr)}` +
    `&contenttype=JSON`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    // Graceful stop on 402 (out of credits)
    if (res.status === 402) {
      return { _outOfCredits: true, status: 402, rawStatus: res.status };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: res.status, error: "Invalid JSON", raw: text.slice(0, 200) };
    }

    // If rate-limited or server error, retry with backoff
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      const backoff = attempt * 3000;
      console.log(`   ⏳ ${regnr} → ${res.status}, retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
      await sleep(backoff);
      return callBovsoft(regnr, attempt + 1);
    }

    return { ...data, rawStatus: res.status };
  } catch (err) {
    clearTimeout(timeout);
    if (attempt <= MAX_RETRIES) {
      const backoff = attempt * 3000;
      console.log(`   ⏳ ${regnr} → ${err.message}, retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
      await sleep(backoff);
      return callBovsoft(regnr, attempt + 1);
    }
    return { status: -1, error: err.message, rawStatus: -1 };
  }
}

// ─── SQL Generation ──────────────────────────────────────────────────────────

function generateBatchSql(batchNumber, records) {
  // Deduplicate by ktype
  const seenKtypes = new Set();
  const unique = [];
  for (const r of records) {
    const ktype = parseInt(r.ktype, 10);
    if (!ktype || seenKtypes.has(ktype)) continue;
    seenKtypes.add(ktype);
    unique.push(r);
  }

  const lines = [];
  lines.push(`-- Bovsoft v2 batch ${batchNumber}`);
  lines.push(`-- Generated: ${nowISO()}`);
  lines.push(`-- Records in batch: ${records.length} | Unique kTypes: ${unique.length}`);
  lines.push("");

  for (const r of unique) {
    const ktype = parseInt(r.ktype, 10);
    const brand = esc(r.brand);
    const model = esc(r.model);
    const yearFrom = r.yearFrom ?? "NULL";
    const yearTo = r.yearTo ?? "NULL";
    const body = esc(r.body);
    const source = esc(r.source || "bovsoft_v2");

    lines.push(
      `INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) ` +
      `VALUES (${ktype}, '${brand}', '${model}', ${yearFrom}, ${yearTo}, '${body}', '${source}') ` +
      `ON CONFLICT DO NOTHING;`
    );
  }

  lines.push("");
  lines.push(`-- End of batch ${batchNumber}`);

  const sqlPath = path.join(DATA_DIR, `v2-batch-${String(batchNumber).padStart(3, "0")}.sql`);
  fs.writeFileSync(sqlPath, lines.join("\n"));
  return sqlPath;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log("\n🔥 Bovsoft Bootstrap v2 — Enhanced Production Script\n");
  console.log(`   Output NDJSON: ${OUTPUT_NDJSON}`);
  console.log(`   Checkpoint:    ${CHECKPOINT_FILE}`);
  console.log(`   Delay:         ${opts.delayMs}ms`);
  console.log(`   Batch size:    ${BATCH_SIZE}`);
  if (opts.limit !== Infinity) console.log(`   Limit:         ${opts.limit}`);
  console.log("");

  // Ensure output file exists
  if (!fs.existsSync(OUTPUT_NDJSON)) {
    fs.writeFileSync(OUTPUT_NDJSON, "");
  }

  const checkpoint = loadCheckpoint();
  const processedSet = new Set(checkpoint.processed.map((r) => r.regnr));
  const failedSet = new Set(checkpoint.failed.map((r) => r.regnr));
  const initialDoneCount = processedSet.size + failedSet.size;

  const queue = buildQueue(opts.limit);
  const remaining = queue.filter((q) => !processedSet.has(q.regnr) && !failedSet.has(q.regnr));

  console.log(`📋 Queue build complete`);
  console.log(`   Total regnr:   ${queue.length}`);
  console.log(`   Already done:  ${processedSet.size}`);
  console.log(`   Previously failed: ${failedSet.size}`);
  console.log(`   Remaining:     ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log("✅ Nothing left to process. Exiting.\n");
    return;
  }

  const startTime = Date.now();
  let success = 0;
  let notFound = 0;
  let error = 0;
  let outOfCredits = false;
  let batchAccum = [];
  let currentBatch = checkpoint.lastBatch || 0;

  // Pre-load existing NDJSON to avoid re-emitting duplicates in SQL
  const existingNdjson = loadNdjsonRecords(OUTPUT_NDJSON);
  const existingKtypes = new Set(existingNdjson.map((r) => r.ktype).filter(Boolean));

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    const globalIndex = initialDoneCount + i + 1;
    const pct = ((globalIndex / queue.length) * 100).toFixed(1);
    const elapsed = Date.now() - startTime;
    const avgMs = elapsed / (i + 1);
    const eta = formatDuration(avgMs * (remaining.length - i));

    process.stdout.write(`[${pct}% | ${globalIndex}/${queue.length} | ETA ${eta}] ${item.regnr} … `);

    const res = await callBovsoft(item.regnr);

    if (res._outOfCredits) {
      console.log(`💳 OUT OF CREDITS (402) — stopping gracefully`);
      outOfCredits = true;
      break;
    }

    if (res.status === 200 && res.data?.datacar?.[0]) {
      const car = res.data.datacar[0];
      const record = {
        regnr: item.regnr,
        ktype: car.ktype,
        brand: car.manufCar?.toUpperCase() || null,
        model: car.modelCar || null,
        body: car.bodyCar || null,
        yearFrom: parseYear(car.typeFromYearCar),
        yearTo: parseYear(car.typeToYearCar),
        vin: car.vin || null,
        shortName: car.shortNameCar || null,
        finnBrand: item.finnBrand,
        finnModel: item.finnModel,
        sensors: item.sensors,
        sensorCount: item.sensorCount,
        freeRequests: res.countFREERequests ?? null,
        source: "bovsoft_v2",
        fetchedAt: nowISO(),
      };

      appendResult(record);
      batchAccum.push(record);
      checkpoint.processed.push({ regnr: item.regnr, ktype: record.ktype, at: nowISO() });
      processedSet.add(item.regnr);

      const brandModel = `${record.brand || "?"} ${record.model || ""}`.trim();
      console.log(`✅ ktype=${record.ktype} ${brandModel.slice(0, 40)}`);
      success++;
    } else if (res.status === 404) {
      console.log(`🔍 Not found`);
      checkpoint.failed.push({ regnr: item.regnr, reason: "not_found", at: nowISO() });
      failedSet.add(item.regnr);
      notFound++;
    } else {
      const reason = res.error || `HTTP ${res.rawStatus}`;
      console.log(`❌ ${reason}`);
      checkpoint.failed.push({ regnr: item.regnr, reason, at: nowISO() });
      failedSet.add(item.regnr);
      error++;
    }

    // Save checkpoint after every record for maximum safety
    saveCheckpoint(checkpoint);

    // Batch SQL generation every 50 *successful* results
    if (batchAccum.length >= BATCH_SIZE) {
      currentBatch++;
      const sqlPath = generateBatchSql(currentBatch, batchAccum);
      const uniqueKtypes = new Set(batchAccum.map((r) => r.ktype).filter(Boolean)).size;
      console.log(`   💾 Batch ${currentBatch} SQL → ${sqlPath} (${batchAccum.length} recs, ${uniqueKtypes} unique kTypes)`);
      batchAccum = [];
      checkpoint.lastBatch = currentBatch;
      saveCheckpoint(checkpoint);
    }

    // Delay between requests (skip after last or if stopping)
    if (i < remaining.length - 1 && !outOfCredits) {
      await sleep(opts.delayMs);
    }
  }

  // Flush any remaining batch
  if (batchAccum.length > 0) {
    currentBatch++;
    const sqlPath = generateBatchSql(currentBatch, batchAccum);
    const uniqueKtypes = new Set(batchAccum.map((r) => r.ktype).filter(Boolean)).size;
    console.log(`   💾 Final batch ${currentBatch} SQL → ${sqlPath} (${batchAccum.length} recs, ${uniqueKtypes} unique kTypes)`);
    checkpoint.lastBatch = currentBatch;
    saveCheckpoint(checkpoint);
  }

  // Final report
  const elapsed = Date.now() - startTime;
  const allResults = loadNdjsonRecords(OUTPUT_NDJSON);
  const uniqueKtypes = new Set(allResults.map((r) => r.ktype).filter(Boolean)).size;

  const report = {
    totalQueued: queue.length,
    processedThisRun: success + notFound + error,
    success,
    notFound,
    error,
    outOfCredits,
    uniqueKtypesTotal: uniqueKtypes,
    totalNdjsonRecords: allResults.length,
    batchesGenerated: currentBatch,
    elapsedMs: elapsed,
    elapsedHuman: formatDuration(elapsed),
    startedAt: checkpoint.startedAt,
    finishedAt: nowISO(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log("📊  FINAL REPORT");
  console.log("═".repeat(60));
  console.log(`   ✅ Success:     ${success}`);
  console.log(`   🔍 Not found:   ${notFound}`);
  console.log(`   ❌ Error:       ${error}`);
  if (outOfCredits) console.log(`   💳 Stopped:     Out of credits (402)`);
  console.log(`   📁 Total saved: ${allResults.length} (unique kTypes: ${uniqueKtypes})`);
  console.log(`   💾 Batches:     ${currentBatch}`);
  console.log(`   ⏱  Duration:    ${formatDuration(elapsed)}`);
  console.log(`   📄 Report:      ${REPORT_FILE}`);
  console.log("═".repeat(60) + "\n");
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
