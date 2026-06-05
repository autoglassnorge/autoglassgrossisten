#!/usr/bin/env node
/**
 * merge-auto-glass-catalog.mjs
 * Merge auto-glass.no products (products-normalized.ndjson) into our catalog.
 * - Enrich existing records with price, sourceUrl from auto-glass.no
 * - Create new records for eurocodes only found in auto-glass.no
 */
import { readFileSync, writeFileSync } from 'fs';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MERGE auto-glass.no INTO MASTER CATALOG');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── Load our catalog ───
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;
const catalogByEurocode = new Map();
for (const r of records) {
  if (r.eurocode) catalogByEurocode.set(r.eurocode.toUpperCase(), r);
}

// ─── Load auto-glass.no products ───
const agLines = readFileSync('data/autoglass-scrape/products-normalized.ndjson', 'utf-8')
  .trim()
  .split('\n')
  .filter(Boolean);

const agProducts = [];
for (const line of agLines) {
  try {
    const d = JSON.parse(line);
    // Only products with VALID eurocode SKU (4 digits + at least 4 letters)
    if (d.sku && d.sku.match(/^\d{4}[A-Z]{4,}[A-Z0-9]*$/)) {
      agProducts.push(d);
    }
  } catch (e) {}
}

console.log(`📦 Auto-glass.no products with eurocode SKU: ${agProducts.length.toLocaleString()}`);
console.log(`   Our catalog records:                       ${records.length.toLocaleString()}\n`);

// ─── Categorize ───
let enriched = 0;
let enrichedWithPrice = 0;
let newRecords = 0;
const newByBrand = {};
const skipped = [];

// Position mapping from typeCode (Norway = left-hand drive)
const positionMap = {
  'DFF': 'driver',      // Door front front-side = left = driver in Norway
  'DFB': 'driver',      // Door back front-side = left = driver
  'DPF': 'passenger',   // Door front passenger-side = right
  'DPB': 'passenger',   // Door back passenger-side = right
  'SFB1': 'driver',
  'SPB1': 'passenger',
  'SFB2': 'driver',
  'SPB2': 'passenger',
};

for (const ag of agProducts) {
  const eurocode = ag.sku.toUpperCase();
  const existing = catalogByEurocode.get(eurocode);

  if (existing) {
    // Enrich existing record
    let changed = false;

    if (ag.price && !existing.price) {
      existing.price = ag.price;
      enrichedWithPrice++;
      changed = true;
    }
    if (ag.sourceUrl && !existing.imageUrl) {
      // Store auto-glass.no URL as reference (not image)
      if (!existing.crossReferences) existing.crossReferences = [];
      if (!existing.crossReferences.includes(ag.sourceUrl)) {
        existing.crossReferences.push(ag.sourceUrl);
        changed = true;
      }
    }
    if (ag.title && (!existing.description || existing.description.length < 10)) {
      existing.description = ag.title;
      changed = true;
    }
    if (ag.yearStart && existing.yearFrom === null) {
      existing.yearFrom = ag.yearStart;
      changed = true;
    }
    if (ag.yearEnd && existing.yearTo === null) {
      existing.yearTo = ag.yearEnd;
      changed = true;
    }
    // Enrich typeCode/typeCodeRel/position if missing
    if (!existing.typeCode && ag.typeCode) {
      existing.typeCode = ag.typeCode;
      changed = true;
    }
    if (!existing.typeCodeRel && ag.typeCodeDesc) {
      existing.typeCodeRel = ag.typeCodeDesc;
      changed = true;
    }
    if (!existing.position && positionMap[ag.typeCode]) {
      existing.position = positionMap[ag.typeCode];
      changed = true;
    }

    if (changed) enriched++;
  } else {
    // Create new record
    // TypeCode → category mapping (split door glass into front/rear)
    const typeMap = {
      'F': 'frontrute',
      'B': 'bakrute',
      'DFF': 'dørglass-frem',
      'DFB': 'dørglass-bak',
      'DPF': 'dørglass-frem',
      'DPB': 'dørglass-bak',
      'SFB1': 'sideglass',
      'SPB1': 'sideglass',
      'SFB2': 'sideglass',
      'SPB2': 'sideglass',
      'SFB3': 'sideglass',
      'SPB3': 'sideglass',
      'Q': 'annet',
      'L': 'annet',
      'V': 'annet',
    };

    // Update category for existing records based on typeCode
    if (existing.typeCode && typeMap[existing.typeCode] && existing.category !== typeMap[existing.typeCode]) {
      existing.category = typeMap[existing.typeCode];
      changed = true;
    }

    const newRecord = {
      eurocode: eurocode,
      articleNumber: eurocode,
      scanNumber: null,
      category: typeMap[ag.typeCode] || 'annet',
      typeCode: ag.typeCode || null,
      typeCodeRel: ag.typeCodeDesc || null,
      position: positionMap[ag.typeCode] || null,
      supplier: 'Autoglass AS',
      brand: (ag.brand || '').toUpperCase(),
      model: ag.model || null,
      yearFrom: ag.yearStart || null,
      yearTo: ag.yearEnd || null,
      adas: false,
      rainSensor: false,
      heated: false,
      acoustic: false,
      antenna: false,
      hud: false,
      shade: false,
      camera: false,
      laneAssist: false,
      price: ag.price || null,
      stockStatus: 0,
      warehouseLocation: null,
      oemNumbers: [],
      crossReferences: ag.sourceUrl ? [ag.sourceUrl] : [],
      nagsCodes: [],
      weight: null,
      dimensions: { width: null, height: null, thickness: null },
      description: ag.title || '',
      prefix4: eurocode.substring(0, 4),
      imageUrl: null,
      pdfUrl: null,
      source: 'auto-glass.no',
      lastUpdated: new Date().toISOString(),
    };
    
    // Skip if brand is clearly not a car brand (tool, accessory, etc.)
    const nonCarBrands = ['VERKTØY','TOOLS','FASTENER','ADHESIVE','SENSOR','RUBBER','BATTERY','BAG','HOOK'];
    if (nonCarBrands.includes(newRecord.brand)) {
      skipped.push({ eurocode, brand: newRecord.brand, title: ag.title });
      continue;
    }
    
    records.push(newRecord);
    catalogByEurocode.set(eurocode, newRecord);
    newRecords++;
    
    const b = newRecord.brand || 'UNKNOWN';
    newByBrand[b] = (newByBrand[b] || 0) + 1;
  }
}

// ─── Results ───
catalog.meta.totalRecords = records.length;
catalog.meta.mergedAt = new Date().toISOString();

console.log('📊 Results:');
console.log(`   Existing records enriched:     ${enriched.toLocaleString()} (${enrichedWithPrice} with price)`);
console.log(`   New records created:           ${newRecords.toLocaleString()}`);
console.log(`   Skipped (non-car):             ${skipped.length}`);
console.log(`   Total catalog now:             ${records.length.toLocaleString()}`);
console.log();

console.log('🏷️  New records by brand (top 15):');
for (const [brand, count] of Object.entries(newByBrand).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`   ${brand.padEnd(20)} ${count.toString().padStart(4)}`);
}
console.log();

if (skipped.length > 0) {
  console.log('⚠️  Skipped non-car products:');
  for (const s of skipped.slice(0, 10)) {
    console.log(`   ${s.eurocode} | ${s.brand} | ${s.title}`);
  }
  console.log();
}

writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
console.log('💾 Saved to data/catalog-prod.json');
console.log('═══════════════════════════════════════════════════════════════');
