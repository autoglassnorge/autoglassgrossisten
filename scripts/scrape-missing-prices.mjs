#!/usr/bin/env node
/**
 * Targeted price scraper for products without prices
 * Scrapes only category URLs that contain products missing prices
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { fetchPricesFromCategory, loadCookieHeader } from './lib/price-scraper.mjs';

const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const COOKIE_FILE = resolve(DATA_DIR, 'cookies.json');
const CSV_FILE = resolve(DATA_DIR, 'products-autoglass-no.csv');

const CONCURRENCY = 20;
const RATE_LIMIT_MS = 80;

const PROGRESS_FILE = resolve(DATA_DIR, '.scrape-progress.json');

async function main() {
  const startTime = Date.now();
  console.log('🎯 Targeted price scraper for missing prices');

  const cookieHeader = loadCookieHeader(COOKIE_FILE);
  const { records } = loadCsv(CSV_FILE);

  // Load previous progress
  let previousPrices = new Map();
  let processedUrls = new Set();
  try {
    const progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
    previousPrices = new Map(Object.entries(progress.prices || {}));
    processedUrls = new Set(progress.processedUrls || []);
    console.log(`📂 Resumed: ${previousPrices.size} SKUs from ${processedUrls.size} URLs`);
  } catch {}

  // Find products without prices and their URLs
  const noPriceUrls = new Set();
  const noPriceSkus = new Set();
  for (const r of records) {
    const price = r.price ? parseInt(r.price, 10) : 0;
    if (!price || price <= 0) {
      if (r.source_url) noPriceUrls.add(r.source_url);
      if (r.sku) noPriceSkus.add(r.sku.trim().toUpperCase());
    }
  }

  // Filter out already processed URLs
  const urls = [...noPriceUrls].filter(u => !processedUrls.has(u));
  console.log(`📋 ${records.length} total products`);
  console.log(`❓ ${noPriceSkus.size} products without price`);
  console.log(`🔗 ${urls.length} remaining URLs to scrape (${processedUrls.size} done)`);

  if (urls.length === 0) {
    console.log('✅ No remaining URLs!');
    return;
  }

  // Scrape
  const newPrices = new Map(previousPrices);
  let processed = 0;
  let errors = 0;
  const newlyProcessed = new Set(processedUrls);

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, Math.min(i + CONCURRENCY, urls.length));
    const pct = (((processedUrls.size + i) / (processedUrls.size + urls.length)) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r[${pct}%] ${processedUrls.size + i + 1}/${processedUrls.size + urls.length} | SKUs: ${newPrices.size} | Errors: ${errors} | ${elapsed}s`);

    const results = await Promise.allSettled(
      batch.map(url => fetchPricesFromCategory(url, cookieHeader))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        for (const { sku, price } of result.value) {
          if (sku && price && !newPrices.has(sku)) {
            newPrices.set(sku, price);
          }
        }
        processed++;
        newlyProcessed.add(batch[j]);
      } else {
        errors++;
      }
    }

    // Save progress every 5 batches
    if (i % (CONCURRENCY * 5) === 0) {
      saveProgress(newPrices, newlyProcessed);
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  saveProgress(newPrices, newlyProcessed);
  console.log(`\n\n📊 Scraped ${newPrices.size} total SKUs from ${processedUrls.size + processed} URLs (${errors} errors)`);

  // Update CSV
  let updated = 0;
  for (let i = 0; i < records.length; i++) {
    const sku = records[i].sku?.trim().toUpperCase();
    if (sku && newPrices.has(sku)) {
      const oldPrice = records[i].price ? parseInt(records[i].price, 10) : 0;
      const newPrice = newPrices.get(sku);
      if (!oldPrice || oldPrice <= 0) {
        records[i].price = String(newPrice);
        updated++;
      }
    }
  }

  console.log(`💾 Updated ${updated} records in CSV`);

  // Save CSV
  const { stringify } = await import('csv-stringify/sync');
  const headers = Object.keys(records[0]);
  const output = stringify(records, { header: true, columns: headers });
  writeFileSync(CSV_FILE, output);

  // Save new prices for D1 sync
  const priceMap = {};
  for (const [sku, price] of newPrices) {
    priceMap[sku] = price;
  }
  writeFileSync(resolve(DATA_DIR, 'new-prices.json'), JSON.stringify(priceMap, null, 2));

  // Clear progress file on success
  try { require('fs').unlinkSync(PROGRESS_FILE); } catch {}

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Done in ${duration}s`);
}

function saveProgress(prices, processedUrls) {
  const obj = {};
  for (const [k, v] of prices) obj[k] = v;
  writeFileSync(PROGRESS_FILE, JSON.stringify({
    prices: obj,
    processedUrls: [...processedUrls],
    timestamp: new Date().toISOString(),
  }));
}

function loadCsv(path) {
  const content = readFileSync(path, 'utf-8');
  const records = parseCsv(content, { columns: true, skip_empty_lines: true });
  const headers = Object.keys(records[0] || {});
  return { headers, records };
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
