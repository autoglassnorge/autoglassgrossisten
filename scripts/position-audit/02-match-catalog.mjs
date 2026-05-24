#!/usr/bin/env node
/**
 * 02-match-catalog.mjs
 * Match auto-glass.no SKU/eurocode against catalog-prod.json
 */
import { readFileSync, writeFileSync } from 'fs';

const AUTOGLASS = 'data/autoglass-scrape/autoglass-flat.json';
const CATALOG = 'data/catalog-prod.json';
const OUTPUT = 'data/autoglass-scrape/position-matches.json';

function loadCatalog() {
  const data = JSON.parse(readFileSync(CATALOG, 'utf-8'));
  const byEurocode = new Map();
  const byPrefix4 = new Map();
  for (const r of data.records || []) {
    if (r.eurocode) byEurocode.set(r.eurocode.toUpperCase(), r);
    if (r.prefix4) {
      const list = byPrefix4.get(r.prefix4) || [];
      list.push(r);
      byPrefix4.set(r.prefix4, list);
    }
  }
  return { byEurocode, byPrefix4, records: data.records };
}

function main() {
  console.log('🔗 Matching auto-glass.no against catalog...');
  const ag = JSON.parse(readFileSync(AUTOGLASS, 'utf-8'));
  const catalog = loadCatalog();

  const matches = [];
  const unmatched = [];
  const stats = { total: 0, exact: 0, prefix4: 0, none: 0, byPosition: {} };

  for (const p of ag.products) {
    stats.total++;
    const sku = (p.sku || '').toUpperCase().trim();
    const pos = p.position || 'UNKNOWN';
    stats.byPosition[pos] = (stats.byPosition[pos] || 0) + 1;

    // 1. Exact match by eurocode
    const exact = catalog.byEurocode.get(sku);
    if (exact) {
      stats.exact++;
      matches.push({
        autoglassSku: sku,
        eurocode: exact.eurocode,
        position: p.position,
        side: p.side,
        openingType: p.openingType,
        catalogCategory: exact.category,
        catalogDescription: exact.description,
        brand: p.brand,
        model: p.model,
        matchType: 'exact',
      });
      continue;
    }

    // 2. Prefix4 match (first 4 chars of SKU)
    const prefix4 = sku.slice(0, 4);
    const prefixMatches = catalog.byPrefix4.get(prefix4);
    if (prefixMatches && prefixMatches.length > 0) {
      stats.prefix4++;
      // Pick the one with same brand if possible
      const sameBrand = prefixMatches.find(r => r.brand?.toUpperCase() === p.brand);
      const chosen = sameBrand || prefixMatches[0];
      matches.push({
        autoglassSku: sku,
        eurocode: chosen.eurocode,
        position: p.position,
        side: p.side,
        openingType: p.openingType,
        catalogCategory: chosen.category,
        catalogDescription: chosen.description,
        brand: p.brand,
        model: p.model,
        matchType: 'prefix4',
      });
      continue;
    }

    // 3. No match
    stats.none++;
    unmatched.push({
      autoglassSku: sku,
      title: p.title,
      brand: p.brand,
      model: p.model,
      position: p.position,
      side: p.side,
    });
  }

  writeFileSync(OUTPUT, JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), stats },
    matches,
    unmatched,
  }, null, 2));

  console.log(`\n✅ Matching complete`);
  console.log(`   Total auto-glass products: ${stats.total}`);
  console.log(`   Exact eurocode match: ${stats.exact} (${(stats.exact/stats.total*100).toFixed(1)}%)`);
  console.log(`   Prefix4 match: ${stats.prefix4} (${(stats.prefix4/stats.total*100).toFixed(1)}%)`);
  console.log(`   No match: ${stats.none} (${(stats.none/stats.total*100).toFixed(1)}%)`);
  console.log(`   By position:`, stats.byPosition);
}

main();
