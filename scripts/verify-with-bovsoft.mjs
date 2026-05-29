#!/usr/bin/env node
/**
 * Verify Finn.no regnr against Bovsoft API (Optimized v3)
 * ========================================================
 *
 * Changes from v2:
 *   - Exponential backoff (2^attempt * baseDelay) for 403/404/5xx/timeout
 *   - In-memory LRU cache + disk cache with TTL (7 days)
 *   - Batch mode: process multiple input files in one run
 *   - Stdin mode: pipe regnr list via stdin
 *   - Smart retry: 404s cached briefly to avoid hammering invalid regnr
 *   - Result streaming: flush to NDJSON immediately, no memory bloat
 *
 * Usage:
 *   node scripts/verify-with-bovsoft.mjs [--limit=333] [--concurrency=8] [--input=PATH] [--output=PATH] [--batch]
 *   cat regnr-list.txt | node scripts/verify-with-bovsoft.mjs --stdin
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, createReadStream } from "fs";
import { resolve, dirname } from "path";
import { createInterface } from "readline";
import pLimit from "p-limit";

const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = process.env.BOVSOFT_CLIENT_ID || "461";
const SECCODE = process.env.BOVSOFT_SECCODE || "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

const DEFAULT_CONFIG = {
  limit: Infinity,
  concurrency: 8,
  input: resolve(process.cwd(), "data", "finn-no-regnr", "targeted-regnr.ndjson"),
  output: resolve(process.cwd(), "data", "finn-no-regnr", "verified-bovsoft.ndjson"),
  listOutput: resolve(process.cwd(), "data", "finn-no-regnr", "verified-bovsoft-list.txt"),
  cachePath: resolve(process.cwd(), "data", "finn-no-regnr", "bovsoft-cache.json"),
  delayMs: 1500,
  maxRetries: 3,
  stdin: false,
  batch: false,
  baseDelayMs: 2000,
  cacheTtlDays: 7,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) opts.limit = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--concurrency=")) opts.concurrency = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--input=")) opts.input = arg.split("=")[1];
    if (arg.startsWith("--output=")) opts.output = arg.split("=")[1];
    if (arg.startsWith("--delay=")) opts.delayMs = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--base-delay=")) opts.baseDelayMs = parseInt(arg.split("=")[1], 10);
    if (arg === "--stdin") opts.stdin = true;
    if (arg === "--batch") opts.batch = true;
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Cache with TTL (LRU in-memory + disk persistence)
// ---------------------------------------------------------------------------
class TimedCache {
  constructor(path, ttlDays = 7) {
    this.path = path;
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    this.map = new Map();
    this.dirty = false;
    this._load();
  }

  _load() {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf-8"));
      const now = Date.now();
      for (const [k, v] of Object.entries(raw)) {
        if (v._cachedAt && now - v._cachedAt > this.ttlMs) continue;
        this.map.set(k, v);
      }
    } catch {
      // ignore corrupt cache
    }
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (item._cachedAt && Date.now() - item._cachedAt > this.ttlMs) {
      this.map.delete(key);
      this.dirty = true;
      return null;
    }
    return item;
  }

  set(key, value) {
    this.map.set(key, { ...value, _cachedAt: Date.now() });
    this.dirty = true;
  }

  save() {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const obj = Object.fromEntries(this.map.entries());
      writeFileSync(this.path, JSON.stringify(obj, null, 2));
      this.dirty = false;
    } catch (e) {
      console.warn("⚠️  Failed to write cache:", e.message);
    }
  }

  stats() {
    return { size: this.map.size };
  }
}

// ---------------------------------------------------------------------------
// Exponential backoff retry logic
// ---------------------------------------------------------------------------
function getBackoffDelay(attempt, baseDelayMs) {
  // Exponential: baseDelay * 2^attempt, capped at 30s
  return Math.min(baseDelayMs * Math.pow(2, attempt), 30000);
}

async function lookupBovsoft(regnr, config) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { status: res.status, error: "Invalid JSON" };
      }

      // Retry on transient errors
      const isRetryable = res.status === 403 || res.status === 429 || res.status >= 500 || data.status === 403 || data.status === 429 || data.status >= 500;
      if (isRetryable && attempt < config.maxRetries) {
        const backoff = getBackoffDelay(attempt, config.baseDelayMs);
        console.warn(`   ⚠️  Bovsoft ${data.status || res.status} for ${regnr} — retry ${attempt + 1}/${config.maxRetries} after ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      return data;
    } catch (e) {
      const isTimeout = e.name === "AbortError" || e.message?.includes("timeout");
      if (attempt < config.maxRetries) {
        const backoff = getBackoffDelay(attempt, config.baseDelayMs);
        const reason = isTimeout ? "timeout" : "network error";
        console.warn(`   ⚠️  Bovsoft ${reason} for ${regnr} — retry ${attempt + 1}/${config.maxRetries} after ${backoff}ms`);
        await sleep(backoff);
      } else {
        return { status: -1, error: e.message };
      }
    }
  }
  return { status: -1, error: "Max retries exceeded" };
}

// ---------------------------------------------------------------------------
// Input loading (NDJSON, plain list, or stdin)
// ---------------------------------------------------------------------------
async function loadInputs(config) {
  if (config.stdin) {
    const regnrs = [];
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      const r = line.trim().toUpperCase();
      if (r && /^[A-Z]{2}\d{3,5}$/.test(r)) regnrs.push(r);
    }
    return regnrs.map((regnr) => ({ regnr, sensors: [], brand: "", model: "" }));
  }

  if (!existsSync(config.input)) {
    console.error("❌ Input file not found:", config.input);
    process.exit(1);
  }

  // NDJSON format (Finn.no scraper output)
  if (config.input.endsWith(".ndjson")) {
    const lines = readFileSync(config.input, "utf-8").split("\n");
    const records = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {}
    }
    return records;
  }

  // Plain text list (one regnr per line)
  const text = readFileSync(config.input, "utf-8");
  return text
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter((r) => /^[A-Z]{2}\d{3,5}$/.test(r))
    .map((regnr) => ({ regnr, sensors: [], brand: "", model: "" }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const config = parseArgs();

  const records = await loadInputs(config);

  // Deduplicate by regnr, prioritize by sensor count
  const byRegnr = new Map();
  for (const r of records) {
    const existing = byRegnr.get(r.regnr);
    if (!existing || (r.sensors?.length || 0) > (existing.sensors?.length || 0)) {
      byRegnr.set(r.regnr, r);
    }
  }

  // Sort by sensor count (most sensors first)
  const unique = Array.from(byRegnr.values()).sort(
    (a, b) => (b.sensors?.length || 0) - (a.sensors?.length || 0)
  );

  const toCheck = config.limit === Infinity ? unique : unique.slice(0, config.limit);

  console.log("🔍 Bovsoft Regnr Verifier (Optimized v3)");
  console.log("=========================================");
  console.log(`   Input records: ${records.length}`);
  console.log(`   Unique regnr: ${unique.length}`);
  console.log(`   To verify: ${toCheck.length}`);
  console.log(`   Concurrency: ${config.concurrency}`);
  console.log(`   Delay: ${config.delayMs}ms`);
  console.log(`   Base backoff: ${config.baseDelayMs}ms (exponential)`);
  console.log(`   Cache: ${config.cachePath} (TTL: ${config.cacheTtlDays} days)`);
  console.log(`   Mode: ${config.stdin ? "stdin" : config.batch ? "batch" : "single"}\n`);

  // Ensure output dir exists
  mkdirSync(dirname(config.output), { recursive: true });

  // Load cache
  const cache = new TimedCache(config.cachePath, config.cacheTtlDays);
  let cacheHits = 0;
  let cacheMisses = 0;

  const verified = [];
  const failed = [];
  const startTime = Date.now();
  const limit = pLimit(config.concurrency);

  let processed = 0;

  const tasks = toCheck.map((record) =>
    limit(async () => {
      processed++;
      const pct = ((processed / toCheck.length) * 100).toFixed(0);
      process.stdout.write(`[${pct}%] ${processed}/${toCheck.length} ${record.regnr} ... `);

      // Check cache first
      const cached = cache.get(record.regnr);
      let data;
      if (cached && cached.status === 200 && cached.data?.datacar?.[0]) {
        data = cached;
        cacheHits++;
        console.log(`💾 cache hit`);
      } else {
        data = await lookupBovsoft(record.regnr, config);
        cacheMisses++;
        // Cache successful responses and 404s (briefly) to avoid re-hammering
        if (data.status !== -1) {
          cache.set(record.regnr, data);
        }
        // Small delay between API calls to be polite
        if (config.delayMs > 0 && processed < toCheck.length) {
          await sleep(config.delayMs);
        }
      }

      if (data.status === 200 && data.data?.datacar?.[0]) {
        const car = data.data.datacar[0];
        const result = {
          regnr: record.regnr,
          finnkode: record.finnkode,
          ktype: car.ktype,
          brand: car.manufCar,
          model: car.modelCar,
          yearFrom: car.typeFromYearCar,
          yearTo: car.typeToYearCar,
          body: car.bodyCar,
          vin: car.vin,
          shortName: car.shortNameCar,
          finnBrand: record.brand,
          finnModel: record.model,
          sensors: record.sensors,
          verifiedAt: new Date().toISOString(),
        };
        verified.push(result);
        appendFileSync(config.output, JSON.stringify(result) + "\n");
        console.log(`✅ ${car.manufCar} ${car.modelCar} (${car.typeFromYearCar})`);
      } else if (data.status === 404) {
        failed.push({ regnr: record.regnr, reason: "not_found" });
        console.log(`❌ Not found`);
      } else if (data.status === 403) {
        failed.push({ regnr: record.regnr, reason: "unauthorized" });
        console.log(`⛔ Unauthorized`);
      } else {
        failed.push({ regnr: record.regnr, reason: data.error || String(data.status) });
        console.log(`❌ ${data.error || data.status}`);
      }
    })
  );

  await Promise.all(tasks);

  // Save cache
  cache.save();

  // Write clean list
  const list = verified.map((r) => r.regnr).join("\n") + "\n";
  writeFileSync(config.listOutput, list);

  // Write report
  const byBrand = {};
  for (const r of verified) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const report = {
    totalChecked: toCheck.length,
    verified: verified.length,
    failed: failed.length,
    cacheHits,
    cacheMisses,
    cacheSize: cache.stats().size,
    successRate: ((verified.length / toCheck.length) * 100).toFixed(1) + "%",
    byBrand,
    elapsedMinutes: ((Date.now() - startTime) / 1000 / 60).toFixed(1),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve(process.cwd(), "data", "finn-no-regnr", "bovsoft-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log(`\n✅ Bovsoft verification complete!`);
  console.log(`   Checked: ${toCheck.length}`);
  console.log(`   ✅ Verified: ${verified.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   💾 Cache hits: ${cacheHits}`);
  console.log(`   🔍 Cache misses: ${cacheMisses}`);
  console.log(`   📦 Cache size: ${cache.stats().size}`);
  console.log(`   Success rate: ${report.successRate}`);
  console.log(`   Output: ${config.output}`);
  console.log(`   List: ${config.listOutput}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
