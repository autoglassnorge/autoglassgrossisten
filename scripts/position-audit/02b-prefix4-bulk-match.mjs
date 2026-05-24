#!/usr/bin/env node
/**
 * 02b-prefix4-bulk-match.mjs
 * Build prefix4 → position mapping from auto-glass.no and apply to ALL catalog products.
 */
import { readFileSync, writeFileSync } from 'fs';

const AUTOGLASS = 'data/autoglass-scrape/autoglass-flat.json';
const CATALOG = 'data/catalog-prod.json';
const OUTPUT = 'data/autoglass-scrape/prefix4-bulk-matches.json';

function main() {
  console.log('🔗 Building prefix4 position mapping from auto-glass.no...');
  const ag = JSON.parse(readFileSync(AUTOGLASS, 'utf-8'));
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf-8'));

  // Build prefix4 → positions map from auto-glass
  const prefix4Map = new Map(); // prefix4 → { position, count, brands }
  for (const p of ag.products) {
    if (!p.sku || p.sku.length < 4 || !p.position) continue;
    const prefix = p.sku.slice(0, 4);
    if (!prefix4Map.has(prefix)) {
      prefix4Map.set(prefix, { positions: {}, brands: new Set(), total: 0 });
    }
    const entry = prefix4Map.get(prefix);
    entry.positions[p.position] = (entry.positions[p.position] || 0) + 1;
    entry.brands.add(p.brand);
    entry.total++;
  }

  // For each prefix4, determine consensus position
  const consensusMap = new Map();
  for (const [prefix, data] of prefix4Map) {
    const entries = Object.entries(data.positions).sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    const confidence = top[1] / data.total;
    consensusMap.set(prefix, {
      position: top[0],
      confidence,
      total: data.total,
      brands: Array.from(data.brands),
    });
  }

  console.log(`   Built ${consensusMap.size} prefix4 consensus mappings`);

  // Apply to catalog products that are HOLD
  const matches = [];
  const stats = { total: 0, applied: 0, skipped: 0, byPosition: {} };

  for (const r of catalog.records) {
    if (!r.eurocode || r.eurocode.length < 4) continue;
    const prefix = r.eurocode.slice(0, 4);
    const consensus = consensusMap.get(prefix);
    if (consensus && consensus.confidence >= 0.7) {
      stats.applied++;
      stats.byPosition[consensus.position] = (stats.byPosition[consensus.position] || 0) + 1;
      matches.push({
        eurocode: r.eurocode,
        prefix4: prefix,
        position: consensus.position,
        confidence: consensus.confidence,
        autoGlassCount: consensus.total,
        brand: r.brand,
        model: r.model,
      });
    }
  }

  writeFileSync(OUTPUT, JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), stats },
    matches,
  }, null, 2));

  console.log(`\n✅ Prefix4 bulk matching complete`);
  console.log(`   Applied to ${stats.applied} catalog products`);
  console.log(`   By position:`, stats.byPosition);
}

main();
