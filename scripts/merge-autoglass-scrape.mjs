#!/usr/bin/env node
/**
 * Merge products-complete.ndjson with products-missing.ndjson
 * De-duplicate by URL, prefer newer scrapedAt
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const COMPLETE_FILE = resolve(DATA_DIR, 'products-complete.ndjson');
const MISSING_FILE = resolve(DATA_DIR, 'products-missing.ndjson');
const MERGED_FILE = resolve(DATA_DIR, 'products-merged-v2.ndjson');
const STATS_FILE = resolve(DATA_DIR, 'merge-stats.json');

const urlMap = new Map();

// Load complete
console.log('Loading products-complete.ndjson...');
let completeCount = 0;
const completeLines = readFileSync(COMPLETE_FILE, 'utf-8').trim().split('\n');
for (const line of completeLines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  urlMap.set(record.url, record);
  completeCount++;
}
console.log(`  Loaded ${completeCount} records`);

// Load missing and merge
let missingCount = 0;
let addedCount = 0;
let updatedCount = 0;

if (existsSync(MISSING_FILE)) {
  console.log('Loading products-missing.ndjson...');
  const missingLines = readFileSync(MISSING_FILE, 'utf-8').trim().split('\n');
  for (const line of missingLines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    missingCount++;
    
    if (urlMap.has(record.url)) {
      const existing = urlMap.get(record.url);
      // Prefer newer if both have products, or missing if it has products
      if (record.products?.length > 0 && (!existing.products?.length || record.scrapedAt > existing.scrapedAt)) {
        urlMap.set(record.url, record);
        updatedCount++;
      }
    } else {
      urlMap.set(record.url, record);
      addedCount++;
    }
  }
  console.log(`  Loaded ${missingCount} records`);
}

// Write merged
console.log('\nWriting merged file...');
const merged = Array.from(urlMap.values());
let out = '';
for (const record of merged) {
  out += JSON.stringify(record) + '\n';
}
writeFileSync(MERGED_FILE, out);

// Stats
const totalProducts = merged.reduce((sum, r) => sum + (r.products?.length || 0), 0);
const emptyUrls = merged.filter(r => !r.products?.length).length;
const stats = {
  totalUrls: merged.length,
  totalProducts,
  emptyUrls,
  fromComplete: completeCount,
  fromMissing: missingCount,
  addedFromMissing: addedCount,
  updatedFromMissing: updatedCount,
  mergedAt: new Date().toISOString()
};
writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

console.log(`\n✅ Merge complete!`);
console.log(`  Total URLs: ${stats.totalUrls}`);
console.log(`  Total products: ${stats.totalProducts.toLocaleString()}`);
console.log(`  Empty URLs: ${stats.emptyUrls}`);
console.log(`  Added from missing: ${stats.addedFromMissing}`);
console.log(`  Updated from missing: ${stats.updatedFromMissing}`);
console.log(`  Output: ${MERGED_FILE}`);
