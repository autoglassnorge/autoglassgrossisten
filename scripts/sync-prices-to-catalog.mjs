#!/usr/bin/env node
/**
 * Sync prices from auto-glass.no CSV into catalog-prod.json
 * Updates existing records and sets lastUpdated timestamp.
 *
 * Usage:
 *   node scripts/sync-prices-to-catalog.mjs
 *   node scripts/sync-prices-to-catalog.mjs --csv=./data/autoglass-scrape/products-autoglass-no.csv
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';

const CATALOG_FILE = resolve('/Users/taj/bilglass/data/catalog-prod.json');
const CSV_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv');

const args = process.argv.slice(2);
const CSV_ARG = args.find(a => a.startsWith('--csv='));
const inputCsv = CSV_ARG ? resolve(CSV_ARG.split('=')[1]) : CSV_FILE;

async function main() {
  console.log('💰 Syncing prices from auto-glass.no CSV to catalog...');

  if (!existsSync(inputCsv)) {
    console.error('❌ CSV not found:', inputCsv);
    process.exit(1);
  }
  if (!existsSync(CATALOG_FILE)) {
    console.error('❌ Catalog not found:', CATALOG_FILE);
    process.exit(1);
  }

  // Load catalog
  console.log('📖 Loading catalog...');
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
  const records = catalog.records;
  const byEurocode = new Map();
  for (let i = 0; i < records.length; i++) {
    if (records[i].eurocode) {
      byEurocode.set(records[i].eurocode.toUpperCase(), i);
    }
  }
  console.log(`   Catalog: ${records.length.toLocaleString()} records`);
  console.log(`   Unique eurocodes: ${byEurocode.size.toLocaleString()}`);

  // Load CSV
  console.log('📖 Loading CSV...');
  const csvContent = readFileSync(inputCsv, 'utf-8');
  const csvRecords = parseCsv(csvContent, { columns: true, skip_empty_lines: true });
  console.log(`   CSV rows: ${csvRecords.length.toLocaleString()}`);

  // Build eurocode → price mapping from CSV
  const csvPrices = new Map();
  for (const row of csvRecords) {
    const sku = row.sku?.trim().toUpperCase();
    const priceStr = row.price?.trim();
    if (sku && sku.match(/^\d{4}[A-Z]{4,}[A-Z0-9]*$/) && priceStr) {
      const price = parseInt(priceStr, 10);
      if (!isNaN(price) && price > 0) {
        // Keep max price if duplicate SKUs
        const existing = csvPrices.get(sku);
        if (!existing || price > existing) {
          csvPrices.set(sku, price);
        }
      }
    }
  }
  console.log(`   Valid price entries: ${csvPrices.size.toLocaleString()}`);

  // Update catalog
  let updated = 0;
  let unchanged = 0;
  let newPrice = 0; // Was null/0, now has price
  let changed = 0;  // Price changed
  const now = new Date().toISOString();

  for (const [eurocode, price] of csvPrices) {
    const idx = byEurocode.get(eurocode);
    if (idx === undefined) continue;

    const record = records[idx];
    const oldPrice = record.price;

    if (!oldPrice || oldPrice === 0) {
      record.price = price;
      record.lastUpdated = now;
      newPrice++;
      updated++;
    } else if (oldPrice !== price) {
      record.price = price;
      record.lastUpdated = now;
      changed++;
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   Records with new price:     ${newPrice.toLocaleString()}`);
  console.log(`   Records with changed price: ${changed.toLocaleString()}`);
  console.log(`   Records unchanged:          ${unchanged.toLocaleString()}`);
  console.log(`   Total updated:              ${updated.toLocaleString()}`);

  if (updated > 0) {
    catalog.meta.lastPriceSync = now;
    writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
    console.log(`\n💾 Saved to ${CATALOG_FILE}`);
  } else {
    console.log(`\n✅ No price changes — catalog not modified`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
