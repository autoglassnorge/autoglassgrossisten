#!/usr/bin/env node
/**
 * merge-nags-into-catalog.mjs
 * Merge NAGS codes into catalog-prod.json based on nags-us-mapping.json
 */
import { readFileSync, writeFileSync } from 'fs';

const CATALOG_PATH = 'data/catalog-prod.json';
const NAGS_MAP_PATH = 'data/nags-us-mapping.json';
const OUT_PATH = 'data/catalog-prod.json';

function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const nagsMap = JSON.parse(readFileSync(NAGS_MAP_PATH, 'utf8'));

  let updated = 0;
  let alreadyHad = 0;

  // Build lookup: autoGlassSku → nagsCodes[]
  const nagsBySku = new Map();
  for (const m of nagsMap.mappings) {
    if (!nagsBySku.has(m.autoGlassSku)) {
      nagsBySku.set(m.autoGlassSku, []);
    }
    nagsBySku.get(m.autoGlassSku).push({
      code: m.nagsCode,
      suffix: m.nagsSuffix,
      confidence: m.confidence,
      model: m.model,
    });
  }

  // Also build by title fuzzy match (fallback)
  const nagsByTitle = new Map();
  for (const m of nagsMap.mappings) {
    const key = `${m.make}:${m.model}:${m.yearFrom}:${m.yearTo}:${m.typeCode}`;
    if (!nagsByTitle.has(key)) {
      nagsByTitle.set(key, []);
    }
    nagsByTitle.get(key).push(m.nagsCode);
  }

  for (const record of catalog.records) {
    const existing = record.nagsCodes || [];
    if (existing.length > 0) {
      alreadyHad++;
      continue;
    }

    // Try match by auto-glass SKU in source_url or description
    let matched = false;
    for (const [sku, nagsList] of nagsBySku) {
      // Check if SKU appears in description or source
      const desc = (record.description || '').toUpperCase();
      const src = (record.source || '').toUpperCase();
      if (desc.includes(sku) || src.includes(sku)) {
        record.nagsCodes = [...new Set(nagsList.map(n => n.code))];
        updated++;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    // Fallback: match by brand+model+year+type
    const agKey = `${record.brand}:${record.model}:${record.yearFrom}:${record.yearTo}:${record.category}`;
    if (nagsByTitle.has(agKey)) {
      record.nagsCodes = [...new Set(nagsByTitle.get(agKey))];
      updated++;
    }
  }

  catalog.meta.nagsMergedAt = new Date().toISOString();
  catalog.meta.nagsCoverage = updated;

  writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2));

  console.log('=== NAGS Merge Report ===');
  console.log(`Records updated with NAGS: ${updated}`);
  console.log(`Already had NAGS: ${alreadyHad}`);
  console.log(`Unique NAGS codes added: ${new Set(nagsMap.mappings.map(m => m.nagsCode)).size}`);
  console.log(`Total catalog records: ${catalog.records.length}`);
}

main();
