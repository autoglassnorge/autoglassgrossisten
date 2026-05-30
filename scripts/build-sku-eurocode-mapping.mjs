#!/usr/bin/env node
/**
 * Build SKU→eurocode mapping via fuzzy title matching.
 * Matches auto-glass.no CSV titles against catalog descriptions.
 */
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const CATALOG_PATH = '/Users/taj/bilglass/data/catalog-prod.json';
const CSV_PATH = '/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv';
const OUTPUT_PATH = '/Users/taj/bilglass/data/autoglass-scrape/sku-eurocode-mapping.json';

function normalize(text) {
  return text.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(' ').filter(t => t.length >= 2));
}

function tokenSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  return intersection.size / Math.max(setA.size, setB.size);
}

function extractYear(text) {
  const match = text.match(/\b(\d{2,4})\s*-\s*(\d{0,4})?\b/);
  if (!match) return null;
  const from = parseInt(match[1], 10);
  const to = match[2] ? parseInt(match[2], 10) : null;
  // Handle 2-digit years
  const fullFrom = from < 50 ? from + 2000 : from < 100 ? from + 1900 : from;
  const fullTo = to ? (to < 50 ? to + 2000 : to < 100 ? to + 1900 : to) : null;
  return { from: fullFrom, to: fullTo };
}

function yearOverlap(y1, y2) {
  if (!y1 || !y2) return 0.5; // Unknown = neutral
  const start = Math.max(y1.from || 1900, y2.from || 1900);
  const end = Math.min(y1.to || 2030, y2.to || 2030);
  if (end < start) return 0; // No overlap
  const span1 = (y1.to || 2030) - (y1.from || 1900);
  const span2 = (y2.to || 2030) - (y2.from || 1900);
  const overlap = end - start;
  return overlap / Math.max(span1, span2, 1);
}

function main() {
  console.log('🔨 Building SKU→eurocode mapping...');

  // Load catalog
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  const catalogRecords = catalog.records;
  console.log(`   Catalog: ${catalogRecords.length.toLocaleString()} records`);

  // Build catalog index with precomputed tokens
  const catalogIndex = catalogRecords.map(r => ({
    eurocode: r.eurocode,
    brand: (r.brand || '').toUpperCase(),
    model: (r.model || '').toUpperCase(),
    description: r.description || '',
    yearFrom: r.year_from,
    yearTo: r.year_to,
    tokens: tokenSet(`${r.brand || ''} ${r.model || ''} ${r.description || ''}`),
    years: { from: r.year_from, to: r.year_to },
  })).filter(r => r.eurocode);

  // Load CSV
  const csv = parse(readFileSync(CSV_PATH, 'utf-8'), { columns: true, skip_empty_lines: true });
  console.log(`   CSV: ${csv.length.toLocaleString()} rows`);

  // Track existing direct matches
  const existingEurocodes = new Set(catalogRecords.map(r => r.eurocode?.toUpperCase()).filter(Boolean));
  const directMatches = csv.filter(r => existingEurocodes.has(r.sku?.trim().toUpperCase()));
  console.log(`   Direct SKU=eurocode matches: ${directMatches.length}`);

  // Build mapping
  const mapping = {};
  let matched = 0;
  let failed = 0;

  for (const row of csv) {
    const sku = row.sku?.trim();
    const csvTitle = row.title || '';
    const csvBrand = (row.brand || '').toUpperCase();
    const csvPrice = row.price?.trim();

    if (!sku || !csvTitle || !csvPrice) continue;

    // Skip if already direct match
    if (existingEurocodes.has(sku.toUpperCase())) continue;

    const csvTokens = tokenSet(csvTitle);
    const csvYears = extractYear(csvTitle);

    let bestMatch = null;
    let bestScore = 0;

    for (const cat of catalogIndex) {
      // Brand must match (or one is empty)
      if (csvBrand && cat.brand && csvBrand !== cat.brand) continue;

      // Token overlap
      const intersection = new Set([...csvTokens].filter(x => cat.tokens.has(x)));
      const tokenScore = intersection.size / Math.max(csvTokens.size, cat.tokens.size);

      // Year overlap bonus
      const yearScore = yearOverlap(csvYears, cat.years);

      // Combined score: 70% tokens, 30% years
      const combinedScore = tokenScore * 0.7 + yearScore * 0.3;

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = cat;
      }
    }

    if (bestMatch && bestScore >= 0.6) {
      mapping[sku] = {
        eurocode: bestMatch.eurocode,
        score: Math.round(bestScore * 100) / 100,
        csvTitle: csvTitle.substring(0, 60),
        catDesc: bestMatch.description.substring(0, 80),
      };
      matched++;
    } else {
      failed++;
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(mapping, null, 2));

  console.log(`\n📊 Results:`);
  console.log(`   Matched: ${matched.toLocaleString()}`);
  console.log(`   Failed: ${failed.toLocaleString()}`);
  console.log(`   Total mapped: ${(matched + directMatches.length).toLocaleString()}`);
  console.log(`   Output: ${OUTPUT_PATH}`);

  // Show sample of high-quality matches
  const sorted = Object.entries(mapping).sort((a, b) => b[1].score - a[1].score);
  console.log(`\n📋 Top 10 matches:`);
  for (const [sku, data] of sorted.slice(0, 10)) {
    console.log(`   ${sku} → ${data.eurocode} (score: ${data.score})`);
    console.log(`      CSV: ${data.csvTitle}`);
    console.log(`      CAT: ${data.catDesc}`);
  }

  // Show distribution
  const scoreBuckets = { '0.90+': 0, '0.80-0.89': 0, '0.70-0.79': 0, '0.60-0.69': 0 };
  for (const data of Object.values(mapping)) {
    if (data.score >= 0.90) scoreBuckets['0.90+']++;
    else if (data.score >= 0.80) scoreBuckets['0.80-0.89']++;
    else if (data.score >= 0.70) scoreBuckets['0.70-0.79']++;
    else scoreBuckets['0.60-0.69']++;
  }
  console.log(`\n📋 Score distribution:`);
  for (const [bucket, count] of Object.entries(scoreBuckets)) {
    console.log(`   ${bucket}: ${count}`);
  }
}

main();
