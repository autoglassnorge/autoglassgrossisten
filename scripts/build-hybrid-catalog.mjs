#!/usr/bin/env node
/**
 * Build Hybrid Catalog — auto-glass.no (master) + Pilkington + Glavista
 * ====================================================================
 * Strategy:
 * 1. auto-glass.no CSV = master source (prices, brand, model, year)
 * 2. Pilkington products = supplement (scanNumber, oemNumbers, imageUrl, 
 *    pdfUrl, flags, dimensions, crossReferences)
 * 3. Glavista products = supplement (same as Pilkington)
 * 4. Products only in Pilkington/Glavista (not on auto-glass.no) are added
 *    with price=null
 * 
 * Output: GlassRecord-compatible catalog in auto-glass.no format + extras
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';

/* ── Paths ─────────────────────────────────────────────────── */
const AUTOGLASS_CSV = resolve('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv');
const PILKINGTON_JSON = resolve('/Users/taj/bilglass/data/pilkington-products.json');
const GLAVISTA_JSON = resolve('/Users/taj/bilglass/data/glavista-catalog.json');
const OUTPUT_JSON = resolve('/Users/taj/bilglass/data/catalog-prod-hybrid.json');

const skuRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;

/* ── Type mapping ──────────────────────────────────────────── */
function mapTypeCode(typeDesc) {
  if (!typeDesc) return null;
  const t = typeDesc.toLowerCase();
  if (t.includes('frontrute')) return 'F';
  if (t.includes('bakrute')) return 'B';
  if (t.includes('dørrute') || t.includes('dørglass')) return 'D';
  if (t.includes('siderute') || t.includes('ventil') || t.includes('sideglass')) return 'S';
  if (t.includes('quarter')) return 'Q';
  return 'A'; // annet/other
}

function mapTypeDesc(code) {
  const map = { F: 'Frontrute', B: 'Bakrute', D: 'Dørrute', S: 'Siderute', Q: 'Quarter', A: 'Annet' };
  return map[code] || 'Annet';
}

/* ── Load auto-glass.no CSV ────────────────────────────────── */
function loadAutoglassCsv() {
  console.log('📖 Loading auto-glass.no CSV...');
  const rows = parseCsv(readFileSync(AUTOGLASS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true });
  console.log(`   Rows: ${rows.length.toLocaleString()}`);

  const records = [];
  const byEurocode = new Map();
  const bySku = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = row.sku?.trim().toUpperCase();
    const title = row.title?.trim();
    const brand = row.brand?.trim().toUpperCase();
    const model = row.model?.trim().toUpperCase();
    const submodel = row.submodel?.trim() || null;
    const yearStart = row.year_start?.trim();
    const yearEnd = row.year_end?.trim();
    const yearFrom = yearStart ? parseInt(yearStart, 10) || null : null;
    const yearTo = yearEnd ? parseInt(yearEnd, 10) || null : null;
    const typeCode = row.type_code?.trim() || null;
    const typeDesc = row.type_code_desc?.trim() || null;
    const priceStr = row.price?.replace(/[\s,]/g, '').replace(',', '.');
    const price = priceStr ? parseFloat(priceStr) || null : null;
    const sourceUrl = row.source_url?.trim() || null;

    // Determine eurocode: if SKU matches eurocode pattern, use it
    const eurocode = skuRegex.test(sku) ? sku : null;

    const record = {
      id: i + 1,
      supplier_sku: sku,
      eurocode,
      article_number: sku,
      category: typeDesc?.toLowerCase() || 'annet',
      supplier: 'auto-glass.no',
      brand,
      model,
      submodel,
      year_from: yearFrom,
      year_to: yearTo,
      type_code: typeCode,
      type_description: typeDesc,
      price,
      description: title,
      source_url: sourceUrl,
      source: 'auto-glass.no',
      created_at: new Date().toISOString(),
      // Extras from Pilkington/Glavista (merged later)
      scan_number: null,
      oem_numbers: [],
      image_url: null,
      pdf_url: null,
      adas: false,
      rain_sensor: false,
      heated: false,
      acoustic: false,
      antenna: false,
      hud: false,
      shade: false,
      camera: false,
      lane_assist: false,
      weight: null,
      dimensions: { width: null, height: null, thickness: null },
      cross_references: [],
      prefix4: eurocode ? eurocode.slice(0, 4) : null,
    };

    records.push(record);
    if (eurocode) byEurocode.set(eurocode, record);
    bySku.set(sku, record);
  }

  console.log(`   Records: ${records.length.toLocaleString()}`);
  console.log(`   With eurocode: ${byEurocode.size.toLocaleString()}`);
  return { records, byEurocode, bySku };
}

/* ── Merge Pilkington/Glavista data ────────────────────────── */
function mergeSupplierData(master, supplierRecords, sourceName) {
  let matched = 0;
  let added = 0;
  let nextId = master.records.length + 1;

  for (const p of supplierRecords) {
    const eurocode = p.eurocode?.toUpperCase().trim();
    const articleNumber = p.articleNumber?.toUpperCase().trim();
    const scanNumber = p.scanNumber || null;
    const brand = p.brand?.toUpperCase().trim();
    const model = p.model?.toUpperCase().trim();
    const yearFrom = p.yearFrom || null;
    const yearTo = p.yearTo || null;
    const description = p.description || null;
    const imageUrl = p.imageUrl || p.url || null;
    const pdfUrl = p.pdfUrl || null;
    const oemNumbers = p.oemNumbers || [];
    const crossReferences = p.crossReferences || [];
    const weight = p.weight || null;
    const dimensions = p.dimensions || { width: null, height: null, thickness: null };
    const prefix4 = p.prefix4 || (eurocode ? eurocode.slice(0, 4) : null);

    // Flags
    const flags = {
      adas: !!p.adas,
      rain_sensor: !!p.rainSensor,
      heated: !!p.heated,
      acoustic: !!p.acoustic,
      antenna: !!p.antenna,
      hud: !!p.hud,
      shade: !!p.shade,
      camera: !!p.camera,
      lane_assist: !!p.laneAssist,
    };

    // Try to match by eurocode first
    let existing = eurocode ? master.byEurocode.get(eurocode) : null;

    // Fallback: match by articleNumber (which is also eurocode in Pilkington)
    if (!existing && articleNumber) {
      existing = master.byEurocode.get(articleNumber);
    }

    if (existing) {
      // Merge: add Pilkington extras to existing auto-glass record
      if (scanNumber && !existing.scan_number) existing.scan_number = scanNumber;
      if (oemNumbers.length > 0) {
        const set = new Set(existing.oem_numbers);
        for (const oem of oemNumbers) set.add(oem);
        existing.oem_numbers = Array.from(set);
      }
      if (imageUrl && !existing.image_url) existing.image_url = imageUrl;
      if (pdfUrl && !existing.pdf_url) existing.pdf_url = pdfUrl;
      if (weight && !existing.weight) existing.weight = weight;
      if (dimensions.width && !existing.dimensions.width) existing.dimensions = dimensions;
      if (crossReferences.length > 0) {
        const set = new Set(existing.cross_references);
        for (const ref of crossReferences) set.add(ref);
        existing.cross_references = Array.from(set);
      }
      // Merge flags (true wins)
      for (const [key, val] of Object.entries(flags)) {
        if (val) existing[key] = true;
      }
      // Add prefix4 if missing
      if (!existing.prefix4 && prefix4) existing.prefix4 = prefix4;
      // Track merged source
      if (!existing.source.includes(sourceName)) {
        existing.source = `${existing.source},${sourceName}`;
      }
      matched++;
    } else {
      // Product not in auto-glass.no — add it as a new record
      const typeCode = mapTypeCode(p.category);
      const typeDesc = mapTypeDesc(typeCode);
      const newRecord = {
        id: nextId++,
        supplier_sku: articleNumber || eurocode || null,
        eurocode: eurocode || null,
        article_number: articleNumber || eurocode || null,
        category: p.category || 'annet',
        supplier: sourceName,
        brand: brand || null,
        model: model || null,
        submodel: null,
        year_from: yearFrom,
        year_to: yearTo,
        type_code: typeCode,
        type_description: typeDesc,
        price: p.price || null, // Pilkington may have price
        description: description,
        source_url: imageUrl || pdfUrl || null,
        source: sourceName,
        created_at: new Date().toISOString(),
        scan_number: scanNumber,
        oem_numbers: oemNumbers,
        image_url: imageUrl,
        pdf_url: pdfUrl,
        ...flags,
        weight,
        dimensions,
        cross_references: crossReferences,
        prefix4,
      };
      master.records.push(newRecord);
      if (eurocode) master.byEurocode.set(eurocode, newRecord);
      added++;
    }
  }

  return { matched, added };
}

/* ── Main ──────────────────────────────────────────────────── */
function main() {
  console.log('🔨 Building Hybrid Catalog');
  console.log('==========================\n');

  const startTime = Date.now();

  // 1. Load auto-glass.no as master
  const master = loadAutoglassCsv();

  // 2. Load Pilkington
  console.log('\n📖 Loading Pilkington products...');
  const pilkington = JSON.parse(readFileSync(PILKINGTON_JSON, 'utf-8'));
  console.log(`   Records: ${pilkington.records.length.toLocaleString()}`);

  const pResult = mergeSupplierData(master, pilkington.records, 'pilkington-irl');
  console.log(`   → Matched with auto-glass: ${pResult.matched.toLocaleString()}`);
  console.log(`   → Added (not on auto-glass): ${pResult.added.toLocaleString()}`);

  // 3. Load Glavista
  console.log('\n📖 Loading Glavista products...');
  const glavista = JSON.parse(readFileSync(GLAVISTA_JSON, 'utf-8'));
  console.log(`   Records: ${glavista.records.length.toLocaleString()}`);

  const gResult = mergeSupplierData(master, glavista.records, 'glavista');
  console.log(`   → Matched with auto-glass: ${gResult.matched.toLocaleString()}`);
  console.log(`   → Added (not on auto-glass): ${gResult.added.toLocaleString()}`);

  // 4. Filter out invalid products (missing vehicle info)
  const beforeFilter = master.records.length;
  master.records = master.records.filter(r => {
    // Keep auto-glass.no products regardless (they're validated)
    if (r.source === 'auto-glass.no' || r.source.includes('auto-glass.no')) return true;
    // Filter Pilkington/Glavista products without proper vehicle data
    if (!r.brand || r.brand === 'PILKINGTON' || r.brand === 'UNKNOWN') return false;
    if (!r.model || r.model.trim() === '') return false;
    // Filter dummy descriptions like "Pilkington 2481LGSS4RD1J"
    if (r.description && r.description.startsWith('Pilkington ') && r.description.includes(r.supplier_sku || '')) return false;
    return true;
  });
  const filtered = beforeFilter - master.records.length;
  if (filtered > 0) {
    console.log(`\n🧹 Filtered ${filtered.toLocaleString()} invalid products (missing brand/model)`);
  }

  // 5. Write output
  const total = master.records.length;
  const withPrice = master.records.filter(r => r.price && r.price > 0).length;
  const withoutPrice = total - withPrice;
  const sources = {};
  for (const r of master.records) {
    const src = r.source;
    sources[src] = (sources[src] || 0) + 1;
  }

  // Category counts
  const categories = {};
  for (const r of master.records) {
    const cat = r.category || 'annet';
    categories[cat] = (categories[cat] || 0) + 1;
  }

  // Brand counts (top 20)
  const brands = {};
  for (const r of master.records) {
    const b = r.brand || 'UNKNOWN';
    brands[b] = (brands[b] || 0) + 1;
  }
  const topBrands = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 20);

  // VW Transporter check
  const vwTransporter = master.records.filter(r => 
    r.brand === 'VW' && r.model && r.model.includes('TRANSPORTER')
  );
  const vwTransporterT5 = vwTransporter.filter(r => 
    r.model && (r.model.includes('T5') || r.model.includes('2003') || r.model.includes('2009'))
  );

  console.log('\n📊 Hybrid Catalog Stats');
  console.log('======================');
  console.log(`   Total records:       ${total.toLocaleString()}`);
  console.log(`   With price > 0:      ${withPrice.toLocaleString()}`);
  console.log(`   Without price:       ${withoutPrice.toLocaleString()}`);
  console.log(`\n   Sources:`);
  for (const [src, count] of Object.entries(sources).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${src}: ${count.toLocaleString()}`);
  }
  console.log(`\n   Categories:`);
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${cat}: ${count.toLocaleString()}`);
  }
  console.log(`\n   Top 20 brands:`);
  for (const [brand, count] of topBrands) {
    console.log(`      ${brand}: ${count.toLocaleString()}`);
  }
  console.log(`\n   VW Transporter: ${vwTransporter.length} products`);
  console.log(`   VW Transporter T5+: ${vwTransporterT5.length} products`);
  if (vwTransporterT5.length > 0) {
    console.log(`   T5 models:`);
    const t5Models = [...new Set(vwTransporterT5.map(r => r.model))].sort();
    for (const m of t5Models) {
      const count = vwTransporterT5.filter(r => r.model === m).length;
      console.log(`      ${m}: ${count}`);
    }
  }

  // 5. Convert to camelCase for D1 compatibility
  console.log('\n🔄 Converting to camelCase for D1 import...');
  const camelRecords = master.records.map(r => ({
    eurocode: r.eurocode,
    articleNumber: r.article_number,
    scanNumber: r.scan_number,
    category: r.category,
    supplier: r.supplier,
    brand: r.brand,
    model: r.model,
    yearFrom: r.year_from,
    yearTo: r.year_to,
    year_from: r.year_from,
    year_to: r.year_to,
    adas: r.adas,
    rainSensor: r.rain_sensor,
    heated: r.heated,
    acoustic: r.acoustic,
    antenna: r.antenna,
    hud: r.hud,
    shade: r.shade,
    camera: r.camera,
    laneAssist: r.lane_assist,
    price: r.price,
    stockStatus: r.price ? 1 : 0,
    warehouseLocation: null,
    oemNumbers: r.oem_numbers,
    crossReferences: r.cross_references,
    nagsCodes: [],
    weight: r.weight,
    dimensions: r.dimensions,
    description: r.description,
    prefix4: r.prefix4,
    imageUrl: r.image_url,
    pdfUrl: r.pdf_url,
    source: r.source,
    lastUpdated: r.created_at,
  }));

  const output = {
    meta: {
      name: 'Autoglass AS — Hybrid Catalog (auto-glass.no + Pilkington + Glavista)',
      generatedAt: new Date().toISOString(),
      totalRecords: total,
      withPrice,
      withoutPrice,
      sources,
      categories,
      version: '3.0-hybrid',
    },
    records: camelRecords,
  };

  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n💾 Saved to ${OUTPUT_JSON}`);
  console.log(`   Size: ${(readFileSync(OUTPUT_JSON).length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Time: ${elapsed}s`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
