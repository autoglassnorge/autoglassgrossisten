#!/usr/bin/env node
/**
 * Build browse-friendly data structure from scraped auto-glass.no products
 * Output: JSON with brand -> model -> year -> products tree
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const COMPLETE_FILE = resolve(DATA_DIR, 'products-complete.ndjson');
const MERGED_FILE = resolve(DATA_DIR, 'products-merged-v2.ndjson');
const OUTPUT_FILE = resolve('/Users/taj/bilglass/data/autoglass-browse-tree.json');

function loadNdjson(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').trim().split('\n');
  return lines.filter(l => l.trim()).map(l => JSON.parse(l));
}

// Load all sources
const records = [];
records.push(...loadNdjson(COMPLETE_FILE));
records.push(...loadNdjson(MERGED_FILE));

console.log(`Loaded ${records.length} records`);

// Build tree: brand -> model -> submodel -> year -> products
const tree = {};

for (const record of records) {
  const brand = record.brand;
  const model = record.model;
  const submodel = record.submodel || '_default';
  const year = record.yearRange;
  
  if (!tree[brand]) tree[brand] = {};
  if (!tree[brand][model]) tree[brand][model] = {};
  if (!tree[brand][model][submodel]) tree[brand][model][submodel] = {};
  
  // Merge products for same year
  if (!tree[brand][model][submodel][year]) {
    tree[brand][model][submodel][year] = {
      url: record.url,
      products: record.products || []
    };
  } else {
    // Append products, dedupe by SKU
    const existingSkus = new Set(tree[brand][model][submodel][year].products.map(p => p.sku));
    for (const p of record.products || []) {
      if (p.sku && !existingSkus.has(p.sku)) {
        tree[brand][model][submodel][year].products.push(p);
        existingSkus.add(p.sku);
      }
    }
  }
}

// Stats
let totalBrands = Object.keys(tree).length;
let totalModels = 0;
let totalYearEntries = 0;
let totalProducts = 0;

for (const brand in tree) {
  for (const model in tree[brand]) {
    totalModels++;
    for (const submodel in tree[brand][model]) {
      for (const year in tree[brand][model][submodel]) {
        totalYearEntries++;
        totalProducts += tree[brand][model][submodel][year].products.length;
      }
    }
  }
}

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    totalBrands,
    totalModels,
    totalYearEntries,
    totalProducts,
    sourceFiles: [COMPLETE_FILE, MERGED_FILE].filter(f => existsSync(f))
  },
  tree
};

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n✅ Browse tree built!`);
console.log(`  Brands: ${totalBrands}`);
console.log(`  Models: ${totalModels}`);
console.log(`  Year entries: ${totalYearEntries}`);
console.log(`  Products: ${totalProducts.toLocaleString()}`);
console.log(`  Output: ${OUTPUT_FILE}`);
