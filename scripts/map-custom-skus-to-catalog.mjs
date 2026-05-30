#!/usr/bin/env node
/**
 * Map custom SKUs from auto-glass.no CSV to catalog via fuzzy matching.
 * Uses substring model matching, year overlap, and glass type scoring.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';

const CATALOG_FILE = resolve('/Users/taj/bilglass/data/catalog-prod.json');
const CSV_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv');
const OUTPUT_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/custom-sku-mappings.json');
const CONFIDENCE_THRESHOLD = 0.50;

const BRAND_NORMALIZATIONS = {
  'FIAT TRUCKS': 'FIAT', 'FORD TRUCKS': 'FORD', 'CITROEN TRUCKS': 'CITROEN',
  'IVECO (FIAT) TRUCKS': 'IVECO', 'DAEWOO (CHEVROLET)': 'DAEWOO',
  'LADA / TOGLIATTI': 'LADA', 'DFSK (SERES)': 'DFSK', 'JAC (CH)': 'JAC',
  'MERCEDES GELANDEWAGEN': 'MERCEDES-BENZ', 'MERCEDES GELANDERWAGEN': 'MERCEDES-BENZ',
  'LAND ROVER': 'RANGE ROVER',
};

function normBrand(b) { return BRAND_NORMALIZATIONS[(b||'').toUpperCase().trim()] || (b||'').toUpperCase().trim(); }
function normModel(m) { return (m||'').toUpperCase().trim().replace(/&#039;/g, "'").replace(/&QUOT;/g, '"').replace(/&NBSP;/g, ' '); }

const GLASS_TYPE_KEYWORDS = {
  'Frontrute': ['WS', 'FRONTRUTE', 'WINDSHIELD'],
  'Bakrute': ['BL', 'BAKRUTE', 'BACK', 'BACKLITE', 'REAR'],
  'Dørrute fremre førerside': ['DØRRUTE', 'DOOR', 'LFD', 'VS', 'LEFT'],
  'Dørrute fremre passasjerside': ['DØRRUTE', 'DOOR', 'RFD', 'HS', 'RIGHT'],
  'Dørrute bakre førerside': ['DØRRUTE', 'DOOR', 'LRD', 'VS', 'LEFT', 'BAKRE'],
  'Dørrute bakre passasjerside': ['DØRRUTE', 'DOOR', 'RRD', 'HS', 'RIGHT', 'BAKRE'],
  'Siderute bakre 1 førerside': ['SIDERUTE', 'SIDE', 'LRQ', 'VS', 'LEFT'],
  'Siderute bakre 1 passasjerside': ['SIDERUTE', 'SIDE', 'RRQ', 'HS', 'RIGHT'],
  'Ventil/siderute fremre førerside': ['VENTIL', 'LFD', 'VS', 'LEFT'],
  'Ventil/siderute fremre passasjerside': ['VENTIL', 'RFD', 'HS', 'RIGHT'],
  'Ventil/siderute bakre førerside': ['VENTIL', 'LRD', 'VS', 'LEFT'],
  'Ventil/siderute bakre passasjerside': ['VENTIL', 'RRD', 'HS', 'RIGHT'],
};

function scoreGlassType(typeCodeDesc, catalogDescription) {
  const keywords = GLASS_TYPE_KEYWORDS[typeCodeDesc];
  if (!keywords || !catalogDescription) return 0;
  const desc = catalogDescription.toUpperCase();
  let matches = 0;
  for (const kw of keywords) {
    if (desc.includes(kw)) matches++;
  }
  return matches > 0 ? 1 : 0; // binary: at least one keyword match
}

function parseYears(str) {
  const m = String(str).match(/\d{4}/g);
  return m ? m.map(Number) : [];
}

function yearOverlap(csvStart, csvEnd, catDesc) {
  const catYears = parseYears(catDesc);
  if (catYears.length === 0) return 0.5; // neutral
  const catMin = Math.min(...catYears);
  const catMax = Math.max(...catYears);
  const csvMin = csvStart || 1900;
  const csvMax = csvEnd || 2100;
  const oStart = Math.max(csvMin, catMin);
  const oEnd = Math.min(csvMax, catMax);
  if (oEnd < oStart) return 0;
  const oLen = oEnd - oStart;
  const csvLen = Math.max(1, csvMax - csvMin);
  return Math.min(1, oLen / csvLen);
}

function tokenSetSim(a, b) {
  const sa = new Set((a || '').toUpperCase().replace(/[^A-Z0-9ÆØÅ]/g, ' ').split(/\s+/).filter(t => t.length >= 2));
  const sb = new Set((b || '').toUpperCase().replace(/[^A-Z0-9ÆØÅ]/g, ' ').split(/\s+/).filter(t => t.length >= 2));
  const inter = new Set([...sa].filter(x => sb.has(x)));
  const union = new Set([...sa, ...sb]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

function modelMatches(csvModel, catModel) {
  if (!csvModel || !catModel) return false;
  const c = normModel(csvModel);
  const m = normModel(catModel);
  if (m === c) return true;
  if (m.includes(c)) return true;
  if (c.includes(m)) return true;
  // Handle cases like "PANDA 81-" vs "PANDA"
  const mBase = m.replace(/\s*\d{2,4}[-–].*$/, '').trim();
  const cBase = c.replace(/\s*\d{2,4}[-–].*$/, '').trim();
  return mBase === cBase;
}

async function main() {
  console.log('🔍 Mapping custom SKUs to catalog (v2)...');

  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
  const records = catalog.records;

  // Build index by brand (models checked at query time)
  const brandIndex = new Map();
  for (const r of records) {
    const b = normBrand(r.brand);
    if (!b) continue;
    if (!brandIndex.has(b)) brandIndex.set(b, []);
    brandIndex.get(b).push(r);
  }
  console.log(`   Catalog: ${records.length.toLocaleString()} records`);
  console.log(`   Unique brands: ${brandIndex.size.toLocaleString()}`);

  const csvRecords = parseCsv(readFileSync(CSV_FILE, 'utf-8'), { columns: true, skip_empty_lines: true });
  const skuRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;
  const customSkus = [];
  const seen = new Set();

  for (const row of csvRecords) {
    const sku = row.sku?.trim().toUpperCase();
    if (!sku || skuRegex.test(sku)) continue;
    if (seen.has(sku)) continue;
    seen.add(sku);
    const price = parseFloat(row.price?.trim().replace(/\s/g, '').replace(',', '.'));
    if (!price || price <= 0) continue;
    customSkus.push({
      sku, price,
      brand: normBrand(row.brand),
      model: normModel(row.model),
      yearStart: parseYears(row.year_start)[0] || null,
      yearEnd: parseYears(row.year_end)[0] || null,
      typeCodeDesc: row.type_code_desc?.trim() || '',
      title: (row.title || '').trim(),
    });
  }
  console.log(`   Custom SKUs with price: ${customSkus.length.toLocaleString()}`);

  const mappings = [];
  const unmatched = [];
  let high = 0, med = 0, low = 0;

  for (const sku of customSkus) {
    const candidates = (brandIndex.get(sku.brand) || []).filter(r => modelMatches(sku.model, r.model));

    if (candidates.length === 0) {
      unmatched.push({ sku: sku.sku, reason: 'no_match', title: sku.title });
      continue;
    }

    const scored = candidates.map(r => {
      const yScore = yearOverlap(sku.yearStart, sku.yearEnd, r.description);
      const gScore = scoreGlassType(sku.typeCodeDesc, r.description);
      const tScore = tokenSetSim(sku.title, r.description);

      // Confidence formula
      let conf = 0.40; // base for brand+model
      conf += yScore * 0.20;
      conf += gScore * 0.25;
      conf += tScore * 0.15;

      // Bonus for single candidate
      if (candidates.length === 1) conf += 0.10;

      return { record: r, confidence: Math.min(1, conf), yScore, gScore, tScore };
    });

    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    if (best.confidence >= CONFIDENCE_THRESHOLD) {
      mappings.push({
        sku: sku.sku,
        eurocode: best.record.eurocode,
        price: sku.price,
        confidence: Math.round(best.confidence * 100) / 100,
        signals: { candidates: candidates.length, year: best.yScore, glass: best.gScore, title: best.tScore },
        csvTitle: sku.title,
        catalogDesc: best.record.description,
      });
      if (best.confidence >= 0.75) high++;
      else med++;
    } else {
      unmatched.push({ sku: sku.sku, reason: 'low_conf', conf: Math.round(best.confidence * 100) / 100, candidates: candidates.length, title: sku.title, bestDesc: best.record.description });
      low++;
    }
  }

  // Save
  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      threshold: CONFIDENCE_THRESHOLD,
      totalCustomSkus: customSkus.length,
      mappings: mappings.length,
      unmatched: unmatched.length,
      highConfidence: high,
      mediumConfidence: med,
      lowConfidence: low,
    },
    mappings: mappings.sort((a, b) => b.confidence - a.confidence),
    unmatched: unmatched.slice(0, 500),
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

  console.log(`\n📊 Results:`);
  console.log(`   High (≥0.75):    ${high.toLocaleString()}`);
  console.log(`   Medium (0.50-0.74): ${med.toLocaleString()}`);
  console.log(`   Low (<0.50):     ${low.toLocaleString()}`);
  console.log(`   Total mapped:    ${mappings.length.toLocaleString()}`);
  console.log(`   Unmatched:       ${unmatched.length.toLocaleString()}`);
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
