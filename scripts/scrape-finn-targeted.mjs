#!/usr/bin/env node
/**
 * Targeted Finn.no Regnr Scraper
 * ================================
 *
 * Searches finn.no for specific brand+model combinations from
 * Hella Gutmann CSC list, prioritizing models with the most sensors.
 *
 * Usage:
 *   node scripts/scrape-finn-targeted.mjs [--limit=N] [--delay=MS] [--pages-per-query=N] [--resume]
 *
 * Strategy:
 *   1. Read Hella Gutmann brand+model list
 *   2. Sort by sensor count (most ADAS = highest priority)
 *   3. Search finn.no: q=Brand+Model
 *   4. Scrape ad pages for registration numbers
 *   5. Deduplicate and output
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, renameSync } from "fs";
import { resolve } from "path";

const OUTPUT_DIR = resolve(process.cwd(), "data", "finn-no-regnr");
const QUERIES_FILE = resolve(process.cwd(), "data", "csc-parsed", "finn-search-queries.json");
const CHECKPOINT_FILE = resolve(OUTPUT_DIR, "targeted-checkpoint.json");
const RESULTS_FILE = resolve(OUTPUT_DIR, "targeted-regnr.ndjson");

const DEFAULT_CONFIG = {
  limit: 200,              // Max brand+model queries to run
  pagesPerQuery: 3,        // Pages to scrape per query (3 × 50 = 150 ads)
  requestDelayMs: 500,
  requestTimeoutMs: 25000, // Hard per-request deadline (must be < 30s to beat fetch stalls)
  batchSize: 50,
  maxRetries: 3,
  userAgent: "AutoglassAS-B2B-Scraper/1.0 (+https://auto-glass.no; contact@auto-glass.no)",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) opts.limit = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--pages-per-query=")) opts.pagesPerQuery = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--delay=")) opts.requestDelayMs = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--timeout=")) opts.requestTimeoutMs = parseInt(arg.split("=")[1], 10);
    if (arg === "--resume") opts.resume = true;
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Race fetch against a hard timer promise.
 * Even if fetch ignores AbortSignal, the timer WILL reject.
 */
function hardTimeout(ms, label) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`HARD TIMEOUT after ${ms}ms (${label})`));
    }, ms);
    // Prevent timer from keeping process alive if everything else finishes
    if (timer.unref) timer.unref();
  });
}

async function fetchWithRetry(url, config, retries = null) {
  const maxRetries = retries ?? config.maxRetries ?? 3;
  const timeoutMs = config.requestTimeoutMs ?? 25000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const fetchPromise = fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });

      // Start abort timer so fetch gets a signal, but ALSO race against a hard timer
      const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
      if (abortTimer.unref) abortTimer.unref();

      const res = await Promise.race([
        fetchPromise,
        hardTimeout(timeoutMs + 2000, url), // hard deadline slightly after abort
      ]);

      clearTimeout(abortTimer);

      if (res.status === 429) {
        process.stdout.write(`   ⚠️  HTTP 429 — waiting 60s...\n`);
        await sleep(60_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      const isLast = i === maxRetries - 1;
      if (isLast) throw e;
      const backoff = config.requestDelayMs * (i + 1);
      process.stdout.write(`   ⚠️  fetch error (attempt ${i + 1}/${maxRetries}): ${e.message} — backing off ${backoff}ms\n`);
      await sleep(backoff);
    }
  }
  throw new Error("Max retries exceeded");
}

function parseSearchPage(html, query) {
  const results = [];
  const articles = html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g);

  for (const match of articles) {
    const art = match[1];
    const finnkodeMatch = art.match(/\/mobility\/(?:item|used)\/(\d+)/);
    if (!finnkodeMatch) continue;
    const finnkode = finnkodeMatch[1];

    const titleMatch = art.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
    let brand = "";
    let model = "";
    let fullTitle = "";

    if (titleMatch) {
      fullTitle = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const parts = fullTitle.split(/\s+/);
      brand = parts[0] || "";
      model = parts.slice(1).join(" ") || "";
    }

    results.push({ finnkode, brand, model, title: fullTitle, url: `https://www.finn.no/mobility/item/${finnkode}` });
  }

  return results;
}

function parseAdPage(html) {
  const matches = html.match(/\b[A-Z]{2}\d{3,5}\b/g);
  if (!matches || matches.length === 0) return null;

  const counts = new Map();
  for (const m of matches) {
    counts.set(m, (counts.get(m) || 0) + 1);
  }

  let best = null;
  let bestCount = 0;
  for (const [reg, count] of counts) {
    if (count > bestCount) {
      best = reg;
      bestCount = count;
    }
  }
  return best;
}

async function main() {
  const config = parseArgs();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load queries
  if (!existsSync(QUERIES_FILE)) {
    console.error("❌ Queries file not found:", QUERIES_FILE);
    console.error("Run: node -e \"...\" to generate finn-search-queries.json first");
    process.exit(1);
  }

  const queries = JSON.parse(readFileSync(QUERIES_FILE, "utf-8"));
  // Sort by sensor count (descending)
  queries.sort((a, b) => b.sensors.length - a.sensors.length);

  // Determine start position
  let startIdx = 0;
  let totalRegnr = 0;
  const shouldResume = config.resume && existsSync(CHECKPOINT_FILE);

  if (shouldResume) {
    try {
      const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8"));
      startIdx = cp.lastQueryIndex || 0;
      totalRegnr = cp.totalRegnr || 0;
      console.log(`🔄 Resuming from query ${startIdx} (${totalRegnr} regnr so far)\n`);
    } catch (e) {
      console.warn(`⚠️  Failed to read checkpoint, starting from scratch: ${e.message}\n`);
      startIdx = 0;
      totalRegnr = 0;
    }
  } else if (config.resume) {
    console.log(`⚠️  --resume requested but no checkpoint found. Starting from scratch.\n`);
  }

  const queriesToRun = queries.slice(startIdx, startIdx + config.limit);

  console.log("🎯 Targeted Finn.no Regnr Scraper");
  console.log("=================================");
  console.log(`   Queries: ${queriesToRun.length} (from ${startIdx} to ${startIdx + queriesToRun.length})`);
  console.log(`   Pages per query: ${config.pagesPerQuery}`);
  console.log(`   Delay: ${config.requestDelayMs}ms`);
  console.log(`   Timeout: ${config.requestTimeoutMs}ms`);
  console.log(`   Est. ads: ~${queriesToRun.length * config.pagesPerQuery * 40}`);
  console.log("");

  const seenFinnkodes = new Set();
  const seenRegnr = new Set();
  let batch = [];
  const startTime = Date.now();

  // Helper to persist batch and checkpoint atomically-ish
  function flushBatchAndCheckpoint(queryIndex, isDone = false) {
    if (batch.length > 0) {
      appendFileSync(RESULTS_FILE, batch.map((r) => JSON.stringify(r)).join("\n") + "\n");
      batch = [];
    }
    saveCheckpoint(queryIndex, totalRegnr, isDone);
  }

  for (let qi = 0; qi < queriesToRun.length; qi++) {
    const q = queriesToRun[qi];
    const globalIdx = startIdx + qi;

    process.stdout.write(`[${globalIdx + 1}/${queries.length}] ${q.query} (${q.sensors.length} sensors)`);

    // Search multiple pages for this query
    let queryAdsScanned = 0;
    let queryRegnrFound = 0;

    for (let page = 1; page <= config.pagesPerQuery; page++) {
      const url = `https://www.finn.no/mobility/search/car?q=${encodeURIComponent(q.query)}&registration_class=1&page=${page}`;

      try {
        const html = await fetchWithRetry(url, config);
        const ads = parseSearchPage(html, q.query);

        if (ads.length === 0) {
          if (page === 1) {
            process.stdout.write(` — no results`);
          }
          break; // No more pages
        }

        queryAdsScanned += ads.length;

        // Scrape each ad page for regnr
        for (const ad of ads) {
          if (seenFinnkodes.has(ad.finnkode)) continue;
          seenFinnkodes.add(ad.finnkode);

          try {
            const adHtml = await fetchWithRetry(ad.url, config);
            const regnr = parseAdPage(adHtml);

            if (regnr && !seenRegnr.has(regnr)) {
              seenRegnr.add(regnr);
              batch.push({
                regnr,
                finnkode: ad.finnkode,
                brand: q.brand,
                model: q.model,
                title: ad.title,
                url: ad.url,
                sensors: q.sensors,
                scrapedAt: new Date().toISOString(),
              });
              totalRegnr++;
              queryRegnrFound++;
            }
          } catch (e) {
            // Skip failed ad pages
          }

          await sleep(config.requestDelayMs);
        }

        // Flush batch when it reaches batchSize
        if (batch.length >= config.batchSize) {
          appendFileSync(RESULTS_FILE, batch.map((r) => JSON.stringify(r)).join("\n") + "\n");
          batch = [];
        }

      } catch (e) {
        process.stdout.write(` — page ${page} error: ${e.message}`);
      }

      await sleep(config.requestDelayMs);
    }

    // Save checkpoint after EVERY query completes
    flushBatchAndCheckpoint(globalIdx + 1);

    // Progress line (overwrite-friendly or newline)
    const pct = (((qi + 1) / queriesToRun.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(` → ${pct}% | ${totalRegnr} unique regnr | ${elapsed}min | +${queryRegnrFound} this query (${queryAdsScanned} ads scanned)\n`);
  }

  // Final flush
  flushBatchAndCheckpoint(startIdx + queriesToRun.length, true);

  // Generate report
  const report = {
    totalQueries: queriesToRun.length,
    totalRegnr,
    byBrand: countByBrand(RESULTS_FILE),
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(OUTPUT_DIR, "targeted-report.json"), JSON.stringify(report, null, 2));

  console.log(`\n✅ Targeted scraping complete!`);
  console.log(`   Queries run: ${queriesToRun.length}`);
  console.log(`   Unique regnr: ${totalRegnr}`);
  console.log(`   Output: ${RESULTS_FILE}`);
  console.log(`   Report: ${resolve(OUTPUT_DIR, "targeted-report.json")}`);
}

function saveCheckpoint(lastQueryIndex, totalRegnr, done = false) {
  const tmp = CHECKPOINT_FILE + ".tmp";
  const payload = JSON.stringify({ lastQueryIndex, totalRegnr, done, at: new Date().toISOString() }, null, 2);
  writeFileSync(tmp, payload);
  // Atomic-ish rename
  try {
    renameSync(tmp, CHECKPOINT_FILE);
  } catch {
    writeFileSync(CHECKPOINT_FILE, payload);
  }
}

function countByBrand(file) {
  if (!existsSync(file)) return {};
  const counts = {};
  const lines = readFileSync(file, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      const b = r.brand || "Unknown";
      counts[b] = (counts[b] || 0) + 1;
    } catch {
      // skip
    }
  }
  return counts;
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e.message);
  process.exit(1);
});
