#!/usr/bin/env node
/**
 * Finn.no Broad Regnr Scraper
 * ===========================
 *
 * Scrapes ALL Norwegian car listings on Finn.no (not just Hella Gutmann ads)
 * to extract license plates (regnr) for kType mapping research at Autoglass AS.
 *
 * Usage:
 *   node scripts/scrape-finn-broad.mjs [--max-pages=N] [--delay=MS] [--timeout=MS] [--resume] [--output-dir=PATH]
 *
 * Options:
 *   --max-pages=N      Max search pages to scrape (default: unlimited)
 *   --delay=MS         Delay between requests in ms (default: 1000)
 *   --timeout=MS       Per-request timeout in ms (default: 25000)
 *   --resume           Resume from last checkpoint
 *   --output-dir=PATH  Output directory (default: data/finn-no-regnr)
 *   --test             Quick test: 3 pages, 500ms delay
 *
 * Output:
 *   data/finn-no-regnr/broad-scrape-YYYY-MM-DD.ndjson
 *   data/finn-no-regnr/broad-scrape-checkpoint.json
 *   data/finn-no-regnr/broad-scrape-report.json
 *
 * Each NDJSON line:
 *   { regnr, finnkode, brand, model, year, url, scrapedAt }
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, renameSync } from "fs";
import { resolve } from "path";

// ─── Configuration ──────────────────────────────────────────────
const DEFAULT_CONFIG = {
  maxPages: Infinity,
  requestDelayMs: 1000,      // 1 req/sec — respectful to Finn.no
  requestTimeoutMs: 25000,   // Hard per-request deadline
  batchSize: 50,
  maxRetries: 3,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  outputDir: resolve(process.cwd(), "data", "finn-no-regnr"),
};

// Multi-word brands that appear at the start of titles
const MULTI_WORD_BRANDS = [
  "Alfa Romeo",
  "Aston Martin",
  "Land Rover",
  "Rolls Royce",
  "Great Wall",
  "Mercedes Benz",
  "Mercedes-Benz",
];

// ─── Args ───────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--max-pages=")) opts.maxPages = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--delay=")) opts.requestDelayMs = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--timeout=")) opts.requestTimeoutMs = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--output-dir=")) opts.outputDir = resolve(arg.split("=")[1]);
    if (arg === "--resume") opts.resume = true;
    if (arg === "--test") {
      opts.maxPages = 3;
      opts.requestDelayMs = 500;
      opts.test = true;
    }
  }
  return opts;
}

// ─── Helpers ────────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getOutputFile(config) {
  return resolve(config.outputDir, `broad-scrape-${getToday()}.ndjson`);
}

function getCheckpointFile(config) {
  return resolve(config.outputDir, "broad-scrape-checkpoint.json");
}

function getReportFile(config) {
  return resolve(config.outputDir, "broad-scrape-report.json");
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

// ─── Fetch with retry ───────────────────────────────────────────
async function fetchWithRetry(url, config, retries = null) {
  const maxRetries = retries ?? config.maxRetries ?? 3;
  const timeoutMs = config.requestTimeoutMs ?? 25000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const fetchPromise = fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0",
        },
        signal: controller.signal,
      });

      const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
      if (abortTimer.unref) abortTimer.unref();

      const res = await Promise.race([fetchPromise, hardTimeout(timeoutMs + 2000, url)]);
      clearTimeout(abortTimer);

      if (res.status === 429) {
        process.stdout.write(`   ⚠️  HTTP 429 — waiting 60s...\n`);
        await sleep(60_000);
        continue;
      }
      if (res.status === 403) {
        process.stdout.write(`   ⚠️  HTTP 403 — waiting 30s...\n`);
        await sleep(30_000);
        continue;
      }
      if (res.status === 404) {
        // Don't retry 404s — ad was likely removed
        throw new Error(`HTTP 404`);
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

// ─── Parsing: Search page ───────────────────────────────────────
function extractYearFromTitle(title) {
  const matches = title.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!matches || matches.length === 0) return null;
  const year = parseInt(matches[matches.length - 1], 10);
  if (year >= 1950 && year <= 2035) return year;
  return null;
}

function parseBrandModel(title) {
  let remaining = title.trim();
  let brand = "";
  let model = "";

  for (const mw of MULTI_WORD_BRANDS) {
    if (remaining.toLowerCase().startsWith(mw.toLowerCase())) {
      brand = mw;
      remaining = remaining.slice(mw.length).trim();
      break;
    }
  }

  if (!brand) {
    const firstSpace = remaining.indexOf(" ");
    if (firstSpace > 0) {
      brand = remaining.slice(0, firstSpace).trim();
      remaining = remaining.slice(firstSpace + 1).trim();
    } else {
      brand = remaining;
      remaining = "";
    }
  }

  model = remaining;
  return { brand, model };
}

function parseSearchPage(html) {
  const results = [];
  const articles = html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g);

  for (const match of articles) {
    const art = match[1];

    // Extract finnkode from URL inside the article
    const finnkodeMatch = art.match(/\/mobility\/(?:item|used)\/(\d+)/);
    if (!finnkodeMatch) continue;
    const finnkode = finnkodeMatch[1];

    // Extract title from h2/h3
    const titleMatch = art.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
    let fullTitle = "";

    if (titleMatch) {
      fullTitle = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Skip non-car articles (e.g., job ads that slip through)
    if (!fullTitle || fullTitle.length < 3) continue;

    // Parse brand, model, year from title
    const year = extractYearFromTitle(fullTitle);
    let cleanTitle = fullTitle;
    if (year) {
      cleanTitle = fullTitle.replace(new RegExp(`\\b${year}\\b`, "g"), "").trim().replace(/\s+/g, " ");
    }
    const { brand, model } = parseBrandModel(cleanTitle);

    results.push({
      finnkode,
      brand,
      model,
      year,
      title: fullTitle,
      url: `https://www.finn.no/mobility/item/${finnkode}`,
    });
  }

  return results;
}

// ─── Parsing: Ad page ───────────────────────────────────────────
function parseAdPage(html) {
  // Norwegian plate pattern: 2 uppercase letters + 3-5 digits
  // e.g. AB12345, KJ36935, EL49228, DK4932
  const matches = html.match(/\b[A-Z]{2}\d{3,5}\b/g);
  if (!matches || matches.length === 0) return null;

  // Count occurrences — the actual regnr appears multiple times in the HTML
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

function parseYearFromAdPage(html) {
  const patterns = [
    // JSON-LD structured data
    /"vehicleModelDate"["']?\s*:\s*["']?(\d{4})/i,
    /"modelDate"["']?\s*:\s*["']?(\d{4})/i,
    /"productionDate"["']?\s*:\s*["']?(\d{4})/i,
    // HTML field labels (Finn.no detail page)
    /Modellår[^>]*>[^<]*(\d{4})/i,
    /Modellår[^\d]{0,40}(\d{4})/i,
    /Førstegangsregistrert[^>]*>[^<]*(?:\d{2}\.)?(\d{4})/i,
    /Førstegangsregistrert[^\d]{0,40}(?:\d{2}\.)?(\d{4})/i,
    /modelYear["']?\s*:\s*["']?(\d{4})/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const year = parseInt(m[1], 10);
      if (year >= 1950 && year <= 2035) return year;
    }
  }
  return null;
}

// ─── Checkpoint & I/O ───────────────────────────────────────────
function loadCheckpoint(config) {
  const cpFile = getCheckpointFile(config);
  if (!existsSync(cpFile)) {
    return {
      lastPage: 0,
      totalRegnr: 0,
      outputFile: getOutputFile(config),
      done: false,
      at: new Date().toISOString(),
    };
  }
  try {
    return JSON.parse(readFileSync(cpFile, "utf-8"));
  } catch {
    return {
      lastPage: 0,
      totalRegnr: 0,
      outputFile: getOutputFile(config),
      done: false,
      at: new Date().toISOString(),
    };
  }
}

function saveCheckpoint(config, checkpoint) {
  const cpFile = getCheckpointFile(config);
  const tmp = cpFile + ".tmp";
  const payload = JSON.stringify({ ...checkpoint, at: new Date().toISOString() }, null, 2);
  writeFileSync(tmp, payload);
  try {
    renameSync(tmp, cpFile);
  } catch {
    writeFileSync(cpFile, payload);
  }
}

function loadSeenSets(outputFile) {
  const seenFinnkodes = new Set();
  const seenRegnr = new Set();

  if (!existsSync(outputFile)) return { seenFinnkodes, seenRegnr };

  const lines = readFileSync(outputFile, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.finnkode) seenFinnkodes.add(String(r.finnkode));
      if (r.regnr) seenRegnr.add(r.regnr);
    } catch {
      // skip corrupt
    }
  }
  return { seenFinnkodes, seenRegnr };
}

function appendNDJSON(filePath, records) {
  if (records.length === 0) return;
  const data = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  appendFileSync(filePath, data);
}

function countByBrand(outputFile) {
  if (!existsSync(outputFile)) return {};
  const counts = {};
  const lines = readFileSync(outputFile, "utf-8").split("\n");
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

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const config = parseArgs();
  mkdirSync(config.outputDir, { recursive: true });

  const checkpoint = loadCheckpoint(config);
  let outputFile = checkpoint.outputFile || getOutputFile(config);

  // If not resuming, start fresh from page 1 with today's file
  let startPage = 1;
  let totalRegnr = 0;
  const shouldResume = config.resume && !checkpoint.done && checkpoint.lastPage > 0;

  if (shouldResume) {
    startPage = checkpoint.lastPage + 1;
    totalRegnr = checkpoint.totalRegnr || 0;
    outputFile = checkpoint.outputFile || outputFile;
    console.log(`🔄 Resuming from page ${startPage} (${totalRegnr} regnr so far)`);
    console.log(`   Output: ${outputFile}\n`);
  } else if (config.resume) {
    console.log(`⚠️  --resume requested but no valid checkpoint found. Starting from scratch.\n`);
  } else if (config.test) {
    console.log(`🧪 TEST MODE: 3 pages, 500ms delay\n`);
  }

  // Load already-seen finnkodes/regnr from existing output to deduplicate
  const { seenFinnkodes, seenRegnr } = loadSeenSets(outputFile);
  console.log(`📂 Loaded ${seenFinnkodes.size} seen finnkodes, ${seenRegnr.size} seen regnr from prior runs`);

  console.log("🚗 Finn.no Broad Regnr Scraper");
  console.log("===============================");
  console.log(`   Pages: ${startPage} → ${config.maxPages === Infinity ? "unlimited" : config.maxPages}`);
  console.log(`   Delay: ${config.requestDelayMs}ms`);
  console.log(`   Timeout: ${config.requestTimeoutMs}ms`);
  console.log(`   Output: ${outputFile}`);
  console.log(`   Checkpoint: ${getCheckpointFile(config)}`);
  console.log("");

  let batch = [];
  let consecutiveEmptyPages = 0;
  const maxConsecutiveEmpty = 3; // Stop after 3 empty pages (end of results)
  const startTime = Date.now();

  for (let page = startPage; page <= config.maxPages; page++) {
    const url = `https://www.finn.no/mobility/search/car?registration_class=1&page=${page}`;
    process.stdout.write(`[page ${page}] Searching...`);

    let ads = [];
    try {
      const html = await fetchWithRetry(url, config);
      ads = parseSearchPage(html);
    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}\n`);
      saveCheckpoint(config, { lastPage: page - 1, totalRegnr, outputFile, done: false });
      await sleep(config.requestDelayMs);
      continue;
    }

    if (ads.length === 0) {
      process.stdout.write(` no results`);
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= maxConsecutiveEmpty) {
        process.stdout.write(` — ${maxConsecutiveEmpty} empty pages, stopping.\n`);
        break;
      }
      process.stdout.write(` (${consecutiveEmptyPages}/${maxConsecutiveEmpty} empty)\n`);
      saveCheckpoint(config, { lastPage: page, totalRegnr, outputFile, done: false });
      await sleep(config.requestDelayMs);
      continue;
    }

    consecutiveEmptyPages = 0;
    process.stdout.write(` ${ads.length} ads`);
    let pageRegnr = 0;
    let skippedSeen = 0;

    for (const ad of ads) {
      if (seenFinnkodes.has(ad.finnkode)) {
        skippedSeen++;
        continue;
      }
      seenFinnkodes.add(ad.finnkode);

      try {
        const adHtml = await fetchWithRetry(ad.url, config);
        const regnr = parseAdPage(adHtml);

        if (!regnr) {
          // No regnr found — likely imported or listing without plate display
          continue;
        }

        if (seenRegnr.has(regnr)) {
          skippedSeen++;
          continue;
        }
        seenRegnr.add(regnr);

        // Try to enrich year from ad page if missing from title
        let year = ad.year;
        if (!year) {
          year = parseYearFromAdPage(adHtml);
        }

        batch.push({
          regnr,
          finnkode: ad.finnkode,
          brand: ad.brand,
          model: ad.model,
          year,
          url: ad.url,
          scrapedAt: new Date().toISOString(),
        });
        totalRegnr++;
        pageRegnr++;
      } catch (e) {
        // Skip failed ad pages silently (404s, timeouts, etc.)
        if (e.message && e.message.includes("404")) {
          // Ad was removed — no need to retry later
        }
      }

      await sleep(config.requestDelayMs);
    }

    if (batch.length >= config.batchSize) {
      appendNDJSON(outputFile, batch);
      batch = [];
    }

    saveCheckpoint(config, { lastPage: page, totalRegnr, outputFile, done: false });

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(` → +${pageRegnr} regnr | ${totalRegnr} total | ${elapsed}min`);
    if (skippedSeen > 0) process.stdout.write(` | ${skippedSeen} skipped`);
    process.stdout.write(`\n`);

    await sleep(config.requestDelayMs);
  }

  // Final flush
  if (batch.length > 0) {
    appendNDJSON(outputFile, batch);
  }

  saveCheckpoint(config, { lastPage: config.maxPages, totalRegnr, outputFile, done: true });

  // Generate report
  const report = {
    scraper: "finn-broad",
    totalRegnr,
    outputFile,
    checkpointFile: getCheckpointFile(config),
    byBrand: countByBrand(outputFile),
    generatedAt: new Date().toISOString(),
    elapsedMinutes: parseFloat(((Date.now() - startTime) / 1000 / 60).toFixed(1)),
  };
  writeFileSync(getReportFile(config), JSON.stringify(report, null, 2));

  console.log(`\n✅ Broad scraping complete!`);
  console.log(`   Unique regnr: ${totalRegnr}`);
  console.log(`   Output: ${outputFile}`);
  console.log(`   Report: ${getReportFile(config)}`);
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e.message);
  process.exit(1);
});
