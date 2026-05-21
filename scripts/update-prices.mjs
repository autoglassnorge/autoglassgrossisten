#!/usr/bin/env node
/**
 * Daily price updater for auto-glass.no catalog
 * Scrapes category pages for updated prices, compares with existing CSV,
 * generates diff report, and updates catalog files.
 *
 * Usage:
 *   node scripts/update-prices.mjs              # Full update
 *   node scripts/update-prices.mjs --dry-run    # Compare only, no writes
 *   node scripts/update-prices.mjs --sample=N   # Test with N categories
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { fetchPricesFromCategory, loadCookieHeader } from './lib/price-scraper.mjs';

const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const COOKIE_FILE = resolve(DATA_DIR, 'cookies.json');
const INPUT_CSV = resolve(DATA_DIR, 'products-autoglass-no.csv');
const OUTPUT_CSV = resolve(DATA_DIR, 'products-autoglass-no-updated.csv');
const DIFF_FILE = resolve(DATA_DIR, 'price-diff.json');
const REPORT_FILE = resolve(DATA_DIR, 'price-update-report.md');
const LOG_FILE = resolve(DATA_DIR, 'price-update.log');

const CONCURRENCY = 15;
const RATE_LIMIT_MS = 100;

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SAMPLE_ARG = args.find(a => a.startsWith('--sample='));
const SAMPLE_SIZE = SAMPLE_ARG ? parseInt(SAMPLE_ARG.split('=')[1], 10) : null;
const FULL_MODE = args.includes('--full');
const AUTO_SAMPLE_SIZE = 200; // Default daily sample size
const CHANGE_THRESHOLD_PCT = 1.0; // If >1% of sampled products changed, recommend full scrape

// ─── Load existing CSV ──────────────────────────────────────────────────────
function loadCsv(path) {
  const content = readFileSync(path, 'utf-8');
  const records = parseCsv(content, { columns: true, skip_empty_lines: true });
  const headers = Object.keys(records[0] || {});
  return { headers, records };
}

function saveCsv(path, headers, records) {
  const output = stringifyCsv(records, { header: true, columns: headers });
  writeFileSync(path, output);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log(`🔄 Price updater started at ${new Date().toISOString()}`);
  console.log(`   Dry run: ${DRY_RUN}`);
  if (SAMPLE_SIZE) console.log(`   Sample: ${SAMPLE_SIZE} categories`);

  if (!existsSync(COOKIE_FILE)) {
    console.error('❌ Cookie file not found:', COOKIE_FILE);
    process.exit(1);
  }
  if (!existsSync(INPUT_CSV)) {
    console.error('❌ Input CSV not found:', INPUT_CSV);
    process.exit(1);
  }

  const cookieHeader = loadCookieHeader(COOKIE_FILE);
  console.log('🔑 Cookies loaded');

  // Load existing catalog
  const { headers, records } = loadCsv(INPUT_CSV);
  console.log(`📋 Loaded ${records.length} products from ${INPUT_CSV}`);

  // Build SKU → record index mapping
  const skuToIndex = new Map();
  for (let i = 0; i < records.length; i++) {
    const sku = records[i].sku;
    if (sku) {
      if (!skuToIndex.has(sku)) skuToIndex.set(sku, []);
      skuToIndex.get(sku).push(i);
    }
  }

  // Collect unique category URLs
  const urlSet = new Set();
  for (const r of records) {
    if (r.source_url) urlSet.add(r.source_url);
  }
  let urls = [...urlSet];

  if (FULL_MODE) {
    console.log(`🔗 FULL MODE: ${urls.length} unique category URLs to scrape`);
  } else if (SAMPLE_SIZE) {
    urls = urls.slice(0, SAMPLE_SIZE);
    console.log(`🔗 SAMPLE MODE: ${urls.length} category URLs to scrape`);
  } else {
    // Daily sample: shuffle and pick N random
    urls = urls.sort(() => Math.random() - 0.5).slice(0, AUTO_SAMPLE_SIZE);
    console.log(`🔗 DAILY SAMPLE: ${urls.length} random category URLs (threshold: ${CHANGE_THRESHOLD_PCT}%)`);
  }

  // Scrape prices
  const newPrices = new Map(); // sku → price
  let processed = 0;
  let errors = 0;
  let emptyUrls = 0;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, Math.min(i + CONCURRENCY, urls.length));
    const pct = ((i / urls.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r[${pct}%] ${i+1}/${urls.length} | Fetched: ${newPrices.size} SKUs | Errors: ${errors} | Empty: ${emptyUrls} | ${elapsed}s`);

    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const prices = await fetchPricesFromCategory(url, cookieHeader);
        return { url, prices };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { url, prices } = result.value;
        if (prices.length === 0) {
          emptyUrls++;
        }
        for (const { sku, price } of prices) {
          if (sku) {
            // Keep first seen price per SKU (or could use max/min)
            if (!newPrices.has(sku)) {
              newPrices.set(sku, price);
            }
          }
        }
        processed++;
      } else {
        errors++;
      }
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\n\n📊 Scraped ${newPrices.size} unique SKUs from ${processed} URLs (${errors} errors, ${emptyUrls} empty)`);

  // Compare prices
  const changes = [];
  const unchanged = [];
  const newSkus = [];
  let priceUp = 0;
  let priceDown = 0;

  for (const [sku, newPrice] of newPrices) {
    const indices = skuToIndex.get(sku);
    if (!indices) {
      newSkus.push({ sku, price: newPrice });
      continue;
    }
    for (const idx of indices) {
      const oldPriceStr = records[idx].price;
      const oldPrice = oldPriceStr ? parseInt(oldPriceStr, 10) : null;

      if (oldPrice !== newPrice) {
        const change = {
          sku,
          title: records[idx].title,
          brand: records[idx].brand,
          model: records[idx].model,
          oldPrice,
          newPrice,
          diff: newPrice !== null && oldPrice !== null ? newPrice - oldPrice : null,
          pct: newPrice !== null && oldPrice !== null && oldPrice > 0
            ? (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1)
            : null,
        };
        changes.push(change);
        if (change.diff > 0) priceUp++;
        if (change.diff < 0) priceDown++;
      } else {
        unchanged.push(sku);
      }
    }
  }

  // Check for missing SKUs (in CSV but not found in scrape)
  const missingSkus = [];
  for (const [sku, indices] of skuToIndex) {
    if (!newPrices.has(sku)) {
      missingSkus.push({ sku, count: indices.length });
    }
  }

  console.log(`\n📈 Price changes: ${changes.length} (${priceUp} up, ${priceDown} down)`);
  console.log(`📉 Unchanged: ${unchanged.length}`);
  console.log(`🆕 New SKUs: ${newSkus.length}`);
  console.log(`❓ Missing SKUs: ${missingSkus.length}`);

  // Save diff report
  const diffReport = {
    updatedAt: new Date().toISOString(),
    urlsScraped: processed,
    errors,
    emptyUrls,
    totalProducts: records.length,
    skusScraped: newPrices.size,
    changes: changes.length,
    unchanged: unchanged.length,
    newSkus: newSkus.length,
    missingSkus: missingSkus.length,
    priceUp,
    priceDown,
    changedProducts: changes.slice(0, 100), // Limit report size
    newProducts: newSkus.slice(0, 100),
    missingProducts: missingSkus.slice(0, 100),
  };
  writeFileSync(DIFF_FILE, JSON.stringify(diffReport, null, 2));
  console.log(`\n📝 Diff report saved to ${DIFF_FILE}`);

  // Apply updates
  if (!DRY_RUN && changes.length > 0) {
    for (const change of changes) {
      const indices = skuToIndex.get(change.sku);
      if (indices) {
        for (const idx of indices) {
          records[idx].price = change.newPrice !== null ? String(change.newPrice) : '0';
        }
      }
    }
    saveCsv(OUTPUT_CSV, headers, records);
    console.log(`💾 Updated CSV saved to ${OUTPUT_CSV}`);

    // Also overwrite the original
    saveCsv(INPUT_CSV, headers, records);
    console.log(`💾 Original CSV updated: ${INPUT_CSV}`);
  } else if (DRY_RUN) {
    console.log('🔒 Dry run — no files modified');
  } else {
    console.log('✅ No price changes detected');
  }

  // Markdown report
  const reportMd = `# Price Update Report

**Date:** ${new Date().toISOString()}  
**Mode:** ${DRY_RUN ? 'Dry run' : 'Live update'}

## Summary

| Metric | Value |
|--------|-------|
| URLs scraped | ${processed} |
| Errors | ${errors} |
| Empty URLs | ${emptyUrls} |
| Total products | ${records.length} |
| SKUs found | ${newPrices.size} |
| Price changes | ${changes.length} |
| Unchanged | ${unchanged.length} |
| New SKUs | ${newSkus.length} |
| Missing SKUs | ${missingSkus.length} |
| Prices up | ${priceUp} |
| Prices down | ${priceDown} |

## Top Price Changes

| SKU | Title | Brand | Model | Old | New | Diff | % |
|-----|-------|-------|-------|-----|-----|------|---|
${changes.slice(0, 50).map(c => `| ${c.sku} | ${c.title?.substring(0, 30)?.replace(/\|/g, '\\|')} | ${c.brand} | ${c.model} | ${c.oldPrice ?? '-'} | ${c.newPrice ?? '-'} | ${c.diff ?? '-'} | ${c.pct ?? '-'} |`).join('\n')}

---
Generated by scripts/update-prices.mjs
`;
  writeFileSync(REPORT_FILE, reportMd);
  console.log(`📝 Markdown report saved to ${REPORT_FILE}`);

  // Log
  const logLine = `${new Date().toISOString()},${processed},${errors},${changes.length},${newSkus.length},${missingSkus.length}\n`;
  if (!existsSync(LOG_FILE)) {
    appendFileSync(LOG_FILE, 'timestamp,urls_scraped,errors,changes,new_skus,missing_skus\n');
  }
  appendFileSync(LOG_FILE, logLine);

  // Threshold check for daily sample mode
  if (!FULL_MODE && !SAMPLE_SIZE && changes.length > 0) {
    const sampledProductCount = newPrices.size;
    const changeRate = sampledProductCount > 0 ? (changes.length / sampledProductCount) * 100 : 0;
    console.log(`\n📊 Sample change rate: ${changeRate.toFixed(2)}% (${changes.length}/${sampledProductCount})`);
    if (changeRate > CHANGE_THRESHOLD_PCT) {
      console.log(`⚠️  CHANGE RATE ABOVE THRESHOLD (${CHANGE_THRESHOLD_PCT}%)`);
      console.log(`   Recommend running: node scripts/update-prices.mjs --full`);
    } else {
      console.log(`✅ Change rate below threshold — no full scrape needed`);
    }
  }

  // Write status file for CI
  const statusFile = resolve(DATA_DIR, '.price-update-status.json');
  writeFileSync(statusFile, JSON.stringify({
    hasChanges: changes.length > 0,
    changes: changes.length,
    newSkus: newSkus.length,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  }));

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${duration}s`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
