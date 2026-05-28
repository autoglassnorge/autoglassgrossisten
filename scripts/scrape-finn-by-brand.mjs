#!/usr/bin/env node
/**
 * Finn.no Brand Regnr Scraper
 * ============================
 *
 * Searches finn.no for a specific brand, scraping registration numbers
 * from car ad pages. Designed to increase kType diversity beyond
 * sensor-heavy brands like Audi.
 *
 * Usage:
 *   node scripts/scrape-finn-by-brand.mjs "Mercedes" [--pages=5] [--delay=300] [--timeout=30000] [--resume]
 *
 * Output:
 *   data/finn-no-regnr/by-brand/{brand}-regnr.ndjson
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, renameSync } from "fs";
import { resolve } from "path";

const OUTPUT_DIR = resolve(process.cwd(), "data", "finn-no-regnr", "by-brand");

const DEFAULT_CONFIG = {
  pages: 5,                // Pages to scrape (5 × 50 = ~250 ads)
  requestDelayMs: 300,
  requestTimeoutMs: 30000, // Hard per-request deadline
  batchSize: 50,
  maxRetries: 3,
  userAgent: "AutoglassAS-B2B-Scraper/1.0 (+https://auto-glass.no; contact@auto-glass.no)",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const brand = args.find((a) => !a.startsWith("--"));
  const opts = { ...DEFAULT_CONFIG, brand };
  for (const arg of args) {
    if (arg.startsWith("--pages=")) opts.pages = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--delay=")) opts.requestDelayMs = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--timeout=")) opts.requestTimeoutMs = parseInt(arg.split("=")[1], 10);
    if (arg === "--resume") opts.resume = true;
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hardTimeout(ms, label) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`HARD TIMEOUT after ${ms}ms (${label})`));
    }, ms);
    if (timer.unref) timer.unref();
  });
}

async function fetchWithRetry(url, config, retries = null) {
  const maxRetries = retries ?? config.maxRetries ?? 3;
  const timeoutMs = config.requestTimeoutMs ?? 30000;

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

      const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
      if (abortTimer.unref) abortTimer.unref();

      const res = await Promise.race([
        fetchPromise,
        hardTimeout(timeoutMs + 2000, url),
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

function parseSearchPage(html) {
  const results = [];
  const articles = html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g);

  for (const match of articles) {
    const art = match[1];
    const finnkodeMatch = art.match(/\/mobility\/(?:item|used)\/(\d+)/);
    if (!finnkodeMatch) continue;
    const finnkode = finnkodeMatch[1];

    const titleMatch = art.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
    let fullTitle = "";

    if (titleMatch) {
      fullTitle = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    results.push({ finnkode, title: fullTitle, url: `https://www.finn.no/mobility/item/${finnkode}` });
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

function safeBrandFilename(brand) {
  return brand.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

async function main() {
  const config = parseArgs();

  if (!config.brand) {
    console.error("Usage: node scripts/scrape-finn-by-brand.mjs <Brand> [--pages=N] [--delay=MS] [--timeout=MS] [--resume]");
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const brandFile = safeBrandFilename(config.brand);
  const resultsFile = resolve(OUTPUT_DIR, `${brandFile}-regnr.ndjson`);
  const checkpointFile = resolve(OUTPUT_DIR, `${brandFile}-checkpoint.json`);
  const logFile = resolve(OUTPUT_DIR, `${brandFile}-scrape.log`);

  // Resume support
  let startPage = 1;
  let totalRegnr = 0;
  const shouldResume = config.resume && existsSync(checkpointFile);

  if (shouldResume) {
    try {
      const cp = JSON.parse(readFileSync(checkpointFile, "utf-8"));
      startPage = (cp.lastPage || 0) + 1;
      totalRegnr = cp.totalRegnr || 0;
      console.log(`🔄 Resuming ${config.brand} from page ${startPage} (${totalRegnr} regnr so far)\n`);
    } catch (e) {
      console.warn(`⚠️  Failed to read checkpoint, starting from scratch: ${e.message}\n`);
      startPage = 1;
      totalRegnr = 0;
    }
  } else if (config.resume) {
    console.log(`⚠️  --resume requested but no checkpoint found. Starting from scratch.\n`);
  }

  if (startPage > config.pages) {
    console.log(`✅ ${config.brand} already complete (${config.pages} pages). Skipping.`);
    return;
  }

  console.log(`🚗 Finn.no Brand Scraper: ${config.brand}`);
  console.log("=" .repeat(40));
  console.log(`   Pages: ${startPage}-${config.pages}`);
  console.log(`   Delay: ${config.requestDelayMs}ms`);
  console.log(`   Timeout: ${config.requestTimeoutMs}ms`);
  console.log(`   Output: ${resultsFile}`);
  console.log("");

  const seenFinnkodes = new Set();
  const seenRegnr = new Set();
  let batch = [];
  const startTime = Date.now();

  // Load already-seen regnr from existing output to avoid duplicates on restart
  if (existsSync(resultsFile)) {
    const existing = readFileSync(resultsFile, "utf-8").split("\n");
    for (const line of existing) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.finnkode) seenFinnkodes.add(r.finnkode);
        if (r.regnr) seenRegnr.add(r.regnr);
      } catch {
        // skip
      }
    }
    console.log(`   📂 Loaded ${seenRegnr.size} existing regnr from prior run`);
  }

  function flushBatch() {
    if (batch.length > 0) {
      appendFileSync(resultsFile, batch.map((r) => JSON.stringify(r)).join("\n") + "\n");
      batch = [];
    }
  }

  function saveCheckpoint(lastPage, done = false) {
    const tmp = checkpointFile + ".tmp";
    const payload = JSON.stringify({
      brand: config.brand,
      lastPage,
      totalRegnr,
      done,
      at: new Date().toISOString(),
    }, null, 2);
    writeFileSync(tmp, payload);
    try {
      renameSync(tmp, checkpointFile);
    } catch {
      writeFileSync(checkpointFile, payload);
    }
  }

  for (let page = startPage; page <= config.pages; page++) {
    const url = `https://www.finn.no/mobility/search/car?q=${encodeURIComponent(config.brand)}&registration_class=1&page=${page}`;

    process.stdout.write(`[${page}/${config.pages}] ${config.brand} search page ${page}...`);

    try {
      const html = await fetchWithRetry(url, config);
      const ads = parseSearchPage(html);

      if (ads.length === 0) {
        process.stdout.write(` no results — stopping early.\n`);
        break;
      }

      process.stdout.write(` ${ads.length} ads`);
      let pageRegnr = 0;

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
              brand: config.brand,
              title: ad.title,
              url: ad.url,
              scrapedAt: new Date().toISOString(),
            });
            totalRegnr++;
            pageRegnr++;
          }
        } catch (e) {
          // Skip failed ad pages silently
        }

        await sleep(config.requestDelayMs);
      }

      if (batch.length >= config.batchSize) {
        flushBatch();
      }

      saveCheckpoint(page);

      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      process.stdout.write(` → +${pageRegnr} regnr | ${totalRegnr} total | ${elapsed}min\n`);

    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}\n`);
      saveCheckpoint(page - 1);
      // Continue to next page rather than dying
    }

    await sleep(config.requestDelayMs);
  }

  flushBatch();
  saveCheckpoint(config.pages, true);

  // Append to log
  const logEntry = `[${new Date().toISOString()}] ${config.brand}: ${totalRegnr} unique regnr (${startPage}-${config.pages} pages)\n`;
  appendFileSync(logFile, logEntry);

  console.log(`\n✅ ${config.brand} complete!`);
  console.log(`   Unique regnr: ${totalRegnr}`);
  console.log(`   Output: ${resultsFile}`);
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e.message);
  process.exit(1);
});
