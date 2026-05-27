#!/usr/bin/env node
/**
 * Finn.no Regnr Scraper CLI
 * =========================
 *
 * Usage:
 *   node scripts/scrape-finn-regnr.mjs [--step=N] [--max-pages=N] [--reset] [--test]
 *
 * Steps:
 *   1: Scrape search pages → finnkodes.ndjson
 *   2: Scrape ad pages → regnr.ndjson
 *   3: Deduplicate → regnr-list.txt + regnr-metadata.json
 *
 * Examples:
 *   node scripts/scrape-finn-regnr.mjs                    # Run all steps
 *   node scripts/scrape-finn-regnr.mjs --step=1           # Only step 1
 *   node scripts/scrape-finn-regnr.mjs --step=2           # Only step 2
 *   node scripts/scrape-finn-regnr.mjs --step=3           # Only step 3
 *   node scripts/scrape-finn-regnr.mjs --max-pages=10     # Test with 10 pages
 *   node scripts/scrape-finn-regnr.mjs --reset            # Reset checkpoint
 *   node scripts/scrape-finn-regnr.mjs --test             # Quick test (5 pages, 20 ads)
 */

import {
  scrapeSearchPages,
  scrapeAdPages,
  deduplicateAndOutput,
  resetCheckpoint,
  DEFAULT_CONFIG,
} from "./lib/finn-regnr-scraper.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    step: null,       // null = all steps
    maxPages: null,
    reset: false,
    test: false,
    delay: null,
  };

  for (const arg of args) {
    if (arg.startsWith("--step=")) opts.step = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--max-pages=")) opts.maxPages = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--delay=")) opts.delay = parseInt(arg.split("=")[1], 10);
    else if (arg === "--reset") opts.reset = true;
    else if (arg === "--test") opts.test = true;
  }

  return opts;
}

async function main() {
  const opts = parseArgs();

  // Build config
  const config = { ...DEFAULT_CONFIG };
  if (opts.maxPages) config.maxPages = opts.maxPages;
  if (opts.delay) config.requestDelayMs = opts.delay;

  if (opts.test) {
    config.maxPages = 5;
    config.requestDelayMs = 500;
    console.log("🧪 TEST MODE: 5 pages, 500ms delay\n");
  }

  console.log("🚗 Finn.no Regnr Scraper");
  console.log("========================");
  console.log(`   Config: maxPages=${config.maxPages}, delay=${config.requestDelayMs}ms, batchSize=${config.batchSize}`);
  console.log(`   Output: ${config.outputDir}\n`);

  // Reset if requested
  if (opts.reset) {
    resetCheckpoint(config);
    if (opts.step === null) {
      console.log("Checkpoint reset. Exiting. Run again without --reset to start scraping.");
      return;
    }
  }

  const startTime = Date.now();

  // Step 1: Scrape search pages
  if (opts.step === null || opts.step === 1) {
    const count = await scrapeSearchPages(config, (progress) => {
      // Optional: detailed progress callback
    });
    if (count === 0 && !opts.reset) {
      console.log("⚠️  No finnkodes collected. Check if step 1 already completed.");
    }
  }

  // Step 2: Scrape ad pages
  if (opts.step === null || opts.step === 2) {
    const count = await scrapeAdPages(config, (progress) => {
      // Optional: detailed progress callback
    });
    if (count === 0 && !opts.reset) {
      console.log("⚠️  No regnr extracted. Check if step 2 already completed or no finnkodes available.");
    }
  }

  // Step 3: Deduplicate
  if (opts.step === null || opts.step === 3) {
    const result = deduplicateAndOutput(config);
    if (result.unique === 0) {
      console.log("⚠️  No unique regnr found. Check if step 2 produced output.");
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n⏱️  Total time: ${elapsed} minutes`);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
