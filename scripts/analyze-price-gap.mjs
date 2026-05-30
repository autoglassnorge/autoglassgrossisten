import { readFileSync } from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';

const CATALOG = JSON.parse(readFileSync('/Users/taj/bilglass/data/catalog-prod.json', 'utf-8'));
const CSV = parseCsv(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv', 'utf-8'), {
  columns: true, skip_empty_lines: true
});

const catalogEurocodes = new Set(CATALOG.records.map(r => r.eurocode?.toUpperCase()).filter(Boolean));
console.log(`📊 Catalog records: ${CATALOG.records.length.toLocaleString()}`);
console.log(`📊 Catalog unique eurocodes: ${catalogEurocodes.size.toLocaleString()}`);
console.log(`📊 CSV rows: ${CSV.length.toLocaleString()}`);

const skuRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;
let eurocodeFormatSkus = 0;
let customSkus = 0;
let withPrice = 0;
let withoutPrice = 0;
let zeroPrice = 0;
const uniqueEurocodeSkus = new Map();
const unmatchedEurocodeSkus = new Map();

for (const row of CSV) {
  const sku = row.sku?.trim().toUpperCase();
  const priceStr = row.price?.trim();
  const price = priceStr ? parseInt(priceStr, 10) : NaN;
  
  if (!sku) continue;
  
  if (skuRegex.test(sku)) {
    eurocodeFormatSkus++;
    const hasPrice = !isNaN(price) && price > 0;
    if (hasPrice) withPrice++; else withoutPrice++;
    if (price === 0) zeroPrice++;
    
    const existing = uniqueEurocodeSkus.get(sku);
    if (existing) {
      existing.count++;
      if (hasPrice && price > existing.price) existing.price = price;
    } else {
      uniqueEurocodeSkus.set(sku, { price: hasPrice ? price : null, count: 1 });
    }
    
    if (!catalogEurocodes.has(sku)) {
      unmatchedEurocodeSkus.set(sku, (unmatchedEurocodeSkus.get(sku) || 0) + 1);
    }
  } else {
    customSkus++;
  }
}

console.log(`\n📊 CSV SKU Analysis:`);
console.log(`   Eurocode-format SKUs: ${eurocodeFormatSkus.toLocaleString()}`);
console.log(`   Custom SKUs:          ${customSkus.toLocaleString()}`);
console.log(`   Eurocode with price>0: ${withPrice.toLocaleString()}`);
console.log(`   Eurocode without price: ${withoutPrice.toLocaleString()}`);
console.log(`   Eurocode with price=0:  ${zeroPrice.toLocaleString()}`);
console.log(`   Unique eurocode SKUs:   ${uniqueEurocodeSkus.size.toLocaleString()}`);

let inCatalog = 0;
let notInCatalog = 0;
let inCatalogWithPrice = 0;
let inCatalogWithoutPrice = 0;

for (const [sku, data] of uniqueEurocodeSkus) {
  if (catalogEurocodes.has(sku)) {
    inCatalog++;
    if (data.price !== null) inCatalogWithPrice++;
    else inCatalogWithoutPrice++;
  } else {
    notInCatalog++;
  }
}

console.log(`\n📊 Catalog Match Analysis (unique eurocode SKUs):`);
console.log(`   In catalog:           ${inCatalog.toLocaleString()}`);
console.log(`   Not in catalog:       ${notInCatalog.toLocaleString()}`);
console.log(`   In catalog + price:   ${inCatalogWithPrice.toLocaleString()}`);
console.log(`   In catalog + no price: ${inCatalogWithoutPrice.toLocaleString()}`);

const alreadyPriced = CATALOG.records.filter(r => r.price && r.price > 0).length;
const unpriced = CATALOG.records.filter(r => !r.price || r.price === 0).length;
console.log(`\n📊 Catalog Price Status:`);
console.log(`   Already priced: ${alreadyPriced.toLocaleString()}`);
console.log(`   Unpriced:       ${unpriced.toLocaleString()}`);

console.log(`\n📊 Sample unmatched eurocode SKUs (first 20):`);
let i = 0;
for (const [sku, count] of unmatchedEurocodeSkus) {
  console.log(`   ${sku} (appears ${count}x)`);
  if (++i >= 20) break;
}

console.log(`\n📊 Unmatched SKU prefix patterns (first 20):`);
const prefixCounts = new Map();
for (const sku of unmatchedEurocodeSkus.keys()) {
  const prefix = sku.substring(0, 8);
  prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
}
const sortedPrefixes = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [prefix, count] of sortedPrefixes) {
  console.log(`   ${prefix}*: ${count} SKUs`);
}
