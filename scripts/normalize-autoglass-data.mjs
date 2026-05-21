import { readFileSync, writeFileSync } from 'fs';

const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-complete.ndjson', 'utf-8').trim().split('\n');

const normalized = [];
const skuIndex = {}; // SKU → products mapping
let duplicateSkus = 0;

for (const line of lines) {
  const entry = JSON.parse(line);
  
  // Normalize brand names
  const brandNorm = entry.brand?.trim()?.toUpperCase() || 'UNKNOWN';
  
  // Normalize model
  const modelNorm = entry.model?.trim()?.toUpperCase() || null;
  
  // Parse year range
  let yearStart = null;
  let yearEnd = null;
  if (entry.yearRange) {
    const yearMatch = entry.yearRange.match(/(\d{4})/g);
    if (yearMatch) {
      yearStart = parseInt(yearMatch[0], 10);
      yearEnd = yearMatch.length > 1 ? parseInt(yearMatch[1], 10) : yearStart;
    }
  }
  
  // Process each product
  for (const p of entry.products) {
    if (!p.sku) continue;
    
    const sku = p.sku.trim().toUpperCase();
    
    // Track SKU duplicates
    if (skuIndex[sku]) {
      duplicateSkus++;
      skuIndex[sku].count++;
    } else {
      skuIndex[sku] = { count: 1, firstBrand: brandNorm };
    }
    
    normalized.push({
      sku,
      title: p.title?.trim() || null,
      brand: brandNorm,
      model: modelNorm,
      submodel: entry.submodel?.trim()?.toUpperCase() || null,
      yearStart,
      yearEnd,
      yearRange: entry.yearRange,
      typeCode: p.typeCodeRel || p.typeCode || null,
      typeCodeDesc: p.typeCode || null,
      price: p.price,
      sourceUrl: entry.url,
      scrapedAt: entry.scrapedAt,
    });
  }
}

// Sort by SKU then brand
normalized.sort((a, b) => {
  if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
  return a.brand.localeCompare(b.brand);
});

writeFileSync(
  '/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson',
  normalized.map(r => JSON.stringify(r)).join('\n') + '\n'
);

// Also create a compact JSON array
writeFileSync(
  '/Users/taj/bilglass/data/autoglass-scrape/products-normalized.json',
  JSON.stringify(normalized, null, 2)
);

// SKU analysis
const multiBrandSkus = Object.entries(skuIndex).filter(([k, v]) => v.count > 1);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  NORMALIZED DATA REPORT');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total normalized records: ${normalized.length.toLocaleString()}`);
console.log(`Unique SKUs: ${Object.keys(skuIndex).length.toLocaleString()}`);
console.log(`Duplicate SKU occurrences: ${duplicateSkus.toLocaleString()}`);
console.log(`SKUs used across multiple brands: ${multiBrandSkus.length}`);
console.log();
console.log('Top duplicate SKUs (used across different brand/model combos):');
const topDups = Object.entries(skuIndex)
  .filter(([k, v]) => v.count > 1)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 10);
for (const [sku, data] of topDups) {
  console.log(`  ${sku}: ${data.count} times (first: ${data.firstBrand})`);
}
console.log('═══════════════════════════════════════════════════════════════');
