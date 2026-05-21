#!/usr/bin/env node
/**
 * Match auto-glass.no prices to catalog records.
 * Multi-layer matching: eurocode → brand+model+year+type → fuzzy description
 */
import { readFileSync, writeFileSync } from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';

const CATALOG_PATH = '/Users/taj/bilglass/data/catalog-prod.json';
const CSV_PATH = '/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv';

function normalizeBrand(b) {
  return (b || '').toUpperCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/LAND ROVER/g, 'LANDROVER')
    .replace(/MERCEDES-BENZ/g, 'MERCEDES')
    .replace(/VW\s+/g, 'VOLKSWAGEN ');
}

function normalizeModel(m) {
  return (m || '').toUpperCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/UNLIMITED/g, '')
    .replace(/SPORT/g, '')
    .replace(/COUPE/g, '')
    .replace(/CABRIOLET/g, 'CAB')
    .trim();
}

function typeCodeFromCategory(cat) {
  const map = {
    frontrute: 'F', bakrute: 'B', dørglass: 'DFF',
    sideglass: 'SFB1', annet: 'Q', tak: 'L', siderute: 'V'
  };
  return map[cat?.toLowerCase()] || 'F';
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MATCH auto-glass.no PRICES TO CATALOG');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  const records = catalog.records;
  console.log(`Catalog records: ${records.length.toLocaleString()}`);

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const csvRows = parseCsv(csvContent, { columns: true, skip_empty_lines: true });
  console.log(`Auto-glass CSV rows: ${csvRows.length.toLocaleString()}`);

  // Layer 1: Build eurocode → price
  const eurocodePrices = new Map();
  const brandModelYearPrices = new Map();
  const fuzzyPrices = [];

  for (const r of csvRows) {
    const price = parseInt(r.price, 10);
    if (isNaN(price) || price <= 0) continue;

    const sku = (r.sku || '').toUpperCase().trim();
    const brand = normalizeBrand(r.brand);
    const model = normalizeModel(r.model);
    const yearStart = parseInt(r.year_start, 10) || null;
    const yearEnd = parseInt(r.year_end, 10) || null;
    const typeCode = (r.type_code || 'F').toUpperCase();

    // Eurocode match
    if (sku && sku.match(/^\d{4}[A-Z]{4,}/)) {
      eurocodePrices.set(sku, price);
    }

    // Brand+model+year+type match
    const bmyKey = `${brand}:${model}:${yearStart}:${yearEnd}:${typeCode}`;
    if (!brandModelYearPrices.has(bmyKey) || price > brandModelYearPrices.get(bmyKey)) {
      brandModelYearPrices.set(bmyKey, price);
    }

    // Fuzzy: store for description matching
    fuzzyPrices.push({ brand, model, yearStart, yearEnd, typeCode, price, title: r.title });
  }

  console.log(`Eurocode prices: ${eurocodePrices.size.toLocaleString()}`);
  console.log(`Brand+model+year prices: ${brandModelYearPrices.size.toLocaleString()}`);
  console.log(`Fuzzy entries: ${fuzzyPrices.length.toLocaleString()}\n`);

  // Apply matches
  let eurocodeMatched = 0;
  let bmyMatched = 0;
  let fuzzyMatched = 0;
  let alreadyHadPrice = 0;

  for (const r of records) {
    if (r.price && r.price > 0) {
      alreadyHadPrice++;
      continue;
    }

    const eurocode = (r.eurocode || '').toUpperCase();
    if (eurocodePrices.has(eurocode)) {
      r.price = eurocodePrices.get(eurocode);
      eurocodeMatched++;
      continue;
    }

    const brand = normalizeBrand(r.brand);
    const model = normalizeModel(r.model);
    const yearStart = r.yearFrom;
    const yearEnd = r.yearTo;
    const typeCode = typeCodeFromCategory(r.category);

    // Try exact BMY match
    const bmyKey = `${brand}:${model}:${yearStart}:${yearEnd}:${typeCode}`;
    if (brandModelYearPrices.has(bmyKey)) {
      r.price = brandModelYearPrices.get(bmyKey);
      bmyMatched++;
      continue;
    }

    // Try fuzzy BMY match (without exact years)
    const bmyKeyNoYear = `${brand}:${model}`;
    for (const [key, price] of brandModelYearPrices) {
      if (key.startsWith(bmyKeyNoYear + ':') && key.endsWith(':' + typeCode)) {
        const parts = key.split(':');
        const csvYearStart = parseInt(parts[2], 10);
        const csvYearEnd = parseInt(parts[3], 10);
        if ((yearStart >= csvYearStart && yearStart <= csvYearEnd) ||
            (yearEnd >= csvYearStart && yearEnd <= csvYearEnd) ||
            (!yearStart && !yearEnd)) {
          r.price = price;
          fuzzyMatched++;
          break;
        }
      }
    }
  }

  console.log('Results:');
  console.log(`  Already had price:     ${alreadyHadPrice.toLocaleString()}`);
  console.log(`  Eurocode matched:      ${eurocodeMatched.toLocaleString()}`);
  console.log(`  Brand+model+year:      ${bmyMatched.toLocaleString()}`);
  console.log(`  Fuzzy matched:         ${fuzzyMatched.toLocaleString()}`);
  console.log(`  Still without price:   ${records.filter(r => !r.price).length.toLocaleString()}`);
  console.log(`  Total with price:      ${records.filter(r => r.price).length.toLocaleString()}`);

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`\n💾 Saved to ${CATALOG_PATH}`);
}

main();
