#!/usr/bin/env node
/**
 * Build brand|model|year → ktype mapping from all Bovsoft discoveries.
 * 
 * Sources:
 * - data/bovsoft-bootstrap-results.json (Fase 1)
 * - data/bovsoft-discovered-regnr.json (Fase 2+3)
 * - Any future discovery files
 * 
 * Output: data/brand-model-ktype-map.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDiscoveries() {
  const sources = [];
  
  // Bootstrap results
  const bootstrapFile = path.join(ROOT, 'data', 'bovsoft-bootstrap-results.json');
  if (existsSync(bootstrapFile)) {
    const data = JSON.parse(readFileSync(bootstrapFile, 'utf-8'));
    sources.push(...(data.results || []).map(r => ({
      regnr: r.regnr,
      ktype: r.ktype,
      brand: r.brand,
      model: r.model,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
      body: r.body,
      source: 'bootstrap',
    })));
  }
  
  // Discovered regnr
  const discoveredFile = path.join(ROOT, 'data', 'bovsoft-discovered-regnr.json');
  if (existsSync(discoveredFile)) {
    const data = JSON.parse(readFileSync(discoveredFile, 'utf-8'));
    sources.push(...(data.results || []).map(r => ({
      regnr: r.regnr,
      ktype: r.ktype,
      brand: r.brand,
      model: r.model,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
      body: r.body,
      source: 'discovered',
    })));
  }
  
  return sources;
}

function normalizeModel(model) {
  if (!model) return '';
  // Extract first word (base model name)
  return model.split(/\s/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buildMap(discoveries) {
  const exactMap = {};
  const aliases = [];
  const byKtype = {};
  
  for (const d of discoveries) {
    const brand = d.brand?.toUpperCase() || '';
    const model = normalizeModel(d.model);
    const year = d.yearFrom || '';
    
    if (!brand || !model || !d.ktype) continue;
    
    const key = `${brand}|${model}|${year}`;
    const keyNoYear = `${brand}|${model}`;
    
    // Track all variants for this ktype
    if (!byKtype[d.ktype]) {
      byKtype[d.ktype] = { brand, model, yearFrom: d.yearFrom, yearTo: d.yearTo, regnrs: [], sources: new Set() };
    }
    byKtype[d.ktype].regnrs.push(d.regnr);
    byKtype[d.ktype].sources.add(d.source);
    
    // Only add if not already present
    if (!exactMap[key]) {
      exactMap[key] = d.ktype;
    }
    if (!exactMap[keyNoYear]) {
      exactMap[keyNoYear] = d.ktype;
    }
    
    // Add alias with full model name
    const fullModel = d.model?.toUpperCase().replace(/\s+/g, '_') || '';
    const aliasKey = `${brand}|${fullModel}|${year}`;
    if (!exactMap[aliasKey]) {
      exactMap[aliasKey] = d.ktype;
      aliases.push({ key: aliasKey, ktype: d.ktype, model: d.model });
    }
  }
  
  return { exactMap, aliases, byKtype, totalDiscoveries: discoveries.length };
}

async function main() {
  console.log('🔧 Building brand|model|year → ktype map');
  console.log('');
  
  const discoveries = loadDiscoveries();
  console.log(`📂 Total discoveries loaded: ${discoveries.length}`);
  
  const { exactMap, aliases, byKtype, totalDiscoveries } = buildMap(discoveries);
  
  console.log(`\n📊 Map statistics:`);
  console.log(`   Exact mappings: ${Object.keys(exactMap).length}`);
  console.log(`   Aliases: ${aliases.length}`);
  console.log(`   Unique ktypes: ${Object.keys(byKtype).length}`);
  
  console.log(`\n📋 By ktype (top 20):`);
  const sortedKtypes = Object.entries(byKtype)
    .sort((a, b) => b[1].regnrs.length - a[1].regnrs.length)
    .slice(0, 20);
  
  for (const [ktype, info] of sortedKtypes) {
    console.log(`   ${ktype}: ${info.brand} ${info.model} (${info.yearFrom}${info.yearTo ? '-' + info.yearTo : ''}) — ${info.regnrs.length} regnr`);
  }
  
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalDiscoveries,
      exactMappings: Object.keys(exactMap).length,
      aliasCount: aliases.length,
      uniqueKtypes: Object.keys(byKtype).length,
    },
    exact_map: exactMap,
    aliases: aliases.map(a => ({ key: a.key, ktype: a.ktype })),
    by_ktype: Object.fromEntries(
      Object.entries(byKtype).map(([ktype, info]) => [
        ktype,
        {
          brand: info.brand,
          model: info.model,
          year_from: info.yearFrom,
          year_to: info.yearTo,
          regnr_count: info.regnrs.length,
          sources: [...info.sources],
        }
      ])
    ),
  };
  
  const outputFile = path.join(ROOT, 'data', 'brand-model-ktype-map.json');
  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  
  console.log(`\n💾 Saved to ${outputFile}`);
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
