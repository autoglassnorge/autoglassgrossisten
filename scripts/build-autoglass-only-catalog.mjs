#!/usr/bin/env node
/**
 * Build a filtered catalog containing ONLY products available on auto-glass.no
 * with prices from auto-glass.no exclusively.
 * 
 * Strategy:
 * 1. Direct eurocode matches: use CSV price
 * 2. Custom SKU mappings: use highest-confidence mapping price
 * 3. Skip products with duplicate custom SKU mappings at different prices (unsafe)
 * 4. Output: catalog-prod-autoglass.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';

const CATALOG_FILE = resolve('/Users/taj/bilglass/data/catalog-prod.json');
const CSV_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv');
const MAPPING_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/custom-sku-mappings.json');
const OUTPUT_FILE = resolve('/Users/taj/bilglass/data/catalog-autoglass-only.json');

function main() {
  console.log('🔨 Building auto-glass.no exclusive catalog...');

  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
  const csvRecords = parseCsv(readFileSync(CSV_FILE, 'utf-8'), { columns: true, skip_empty_lines: true });
  const mappingResult = JSON.parse(readFileSync(MAPPING_FILE, 'utf-8'));

  const skuRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;
  const now = new Date().toISOString();

  // Step 1: Build direct eurocode → price from CSV
  const directPrices = new Map(); // eurocode -> {price, sku}
  for (const row of csvRecords) {
    const sku = row.sku?.trim().toUpperCase();
    if (!sku || !skuRegex.test(sku)) continue;
    const price = parseFloat(row.price?.trim().replace(/\s/g, '').replace(',', '.'));
    if (!price || price <= 0) continue;
    // Keep highest price if duplicate
    const existing = directPrices.get(sku);
    if (!existing || price > existing.price) {
      directPrices.set(sku, { price, sku });
    }
  }
  console.log(`   Direct eurocode prices: ${directPrices.size.toLocaleString()}`);

  // Step 2: Build custom SKU mapping → pick best per eurocode
  // Group mappings by eurocode, keep highest confidence
  const customPrices = new Map(); // eurocode -> {price, sku, confidence, source}
  const mappingByEurocode = new Map();
  for (const m of mappingResult.mappings) {
    if (!mappingByEurocode.has(m.eurocode)) mappingByEurocode.set(m.eurocode, []);
    mappingByEurocode.get(m.eurocode).push(m);
  }

  for (const [eurocode, items] of mappingByEurocode) {
    // If multiple items map to same eurocode, check if prices are same
    const uniquePrices = [...new Set(items.map(i => i.price))];
    if (uniquePrices.length === 1) {
      // All same price - safe to use
      const best = items.sort((a, b) => b.confidence - a.confidence)[0];
      customPrices.set(eurocode, { price: best.price, sku: best.sku, confidence: best.confidence, source: 'custom-sku-uniform' });
    } else {
      // Different prices - only use if highest confidence >= 0.90 and take that one
      const best = items.sort((a, b) => b.confidence - a.confidence)[0];
      if (best.confidence >= 0.90) {
        customPrices.set(eurocode, { price: best.price, sku: best.sku, confidence: best.confidence, source: 'custom-sku-best' });
      }
      // Otherwise skip - too risky
    }
  }
  console.log(`   Custom SKU prices (safe): ${customPrices.size.toLocaleString()}`);

  // Step 3: Build filtered catalog
  const keptRecords = [];
  let directMatch = 0, customMatch = 0, skippedDup = 0;

  for (const record of catalog.records) {
    const eurocode = record.eurocode?.toUpperCase();
    if (!eurocode) continue;

    const direct = directPrices.get(eurocode);
    const custom = customPrices.get(eurocode);

    if (direct) {
      record.price = direct.price;
      record.priceSource = 'autoglass-eurocode';
      record.priceSku = direct.sku;
      record.lastUpdated = now;
      keptRecords.push(record);
      directMatch++;
    } else if (custom) {
      record.price = custom.price;
      record.priceSource = custom.source;
      record.priceSku = custom.sku;
      record.priceConfidence = custom.confidence;
      record.lastUpdated = now;
      keptRecords.push(record);
      customMatch++;
    }
    // If neither, skip - product not on auto-glass.no
  }

  // Step 4: Count duplicates we skipped
  for (const [eurocode, items] of mappingByEurocode) {
    const uniquePrices = [...new Set(items.map(i => i.price))];
    const hasCatalogEntry = catalog.records.some(r => r.eurocode?.toUpperCase() === eurocode);
    if (uniquePrices.length > 1 && hasCatalogEntry) {
      const best = items.sort((a, b) => b.confidence - a.confidence)[0];
      if (best.confidence < 0.90) skippedDup++;
    }
  }

  const output = {
    meta: {
      ...catalog.meta,
      name: 'Autoglass AS Catalog - auto-glass.no Only',
      generatedAt: now,
      totalRecords: keptRecords.length,
      directMatches: directMatch,
      customMatches: customMatch,
      skippedDuplicates: skippedDup,
      originalTotal: catalog.records.length,
      source: 'auto-glass.no filtered',
    },
    records: keptRecords,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n📊 Filtered Catalog:`);
  console.log(`   Direct eurocode matches: ${directMatch.toLocaleString()}`);
  console.log(`   Custom SKU matches:      ${customMatch.toLocaleString()}`);
  console.log(`   Skipped (unsafe dupes):  ${skippedDup.toLocaleString()}`);
  console.log(`   TOTAL kept:              ${keptRecords.length.toLocaleString()}`);
  console.log(`   Filtered OUT:            ${(catalog.records.length - keptRecords.length).toLocaleString()}`);
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
}

main();
