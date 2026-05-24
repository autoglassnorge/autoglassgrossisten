#!/usr/bin/env node
/**
 * 03-categorize-all.mjs
 * Categorize ALL catalog products using auto-glass.no matches + description parsing.
 */
import { readFileSync, writeFileSync } from 'fs';

const MATCHES = 'data/autoglass-scrape/position-matches.json';
const PREFIX4_BULK = 'data/autoglass-scrape/prefix4-bulk-matches.json';
const CATALOG = 'data/catalog-prod.json';
const OUTPUT = 'data/autoglass-scrape/catalog-with-positions.json';

// Description-based position extraction
function parsePositionFromDescription(desc) {
  if (!desc) return null;
  const d = desc.toUpperCase();
  
  // Pattern: "; L FR" or "; R RQ" etc.
  const m = d.match(/;\s*([LR])\s+([A-Z]{2,})/);
  if (m) {
    return { side: m[1], position: m[2], source: 'description' };
  }
  
  // Pattern with CL (heated)
  const m2 = d.match(/;\s*([LR])\s+([A-Z]{2,})\s*CL/);
  if (m2) {
    return { side: m2[1], position: m2[2], source: 'description_cl' };
  }
  
  // Norwegian keywords
  if (d.includes('FRONTRUTE')) return { side: null, position: 'FR', source: 'description_no' };
  if (d.includes('BAKRUTE')) return { side: null, position: 'RR', source: 'description_no' };
  if (d.includes('DØRRUTE') || d.includes('DØR')) {
    if (d.includes('BAK') || d.includes('BAKRE')) return { side: null, position: 'RD', source: 'description_no' };
    if (d.includes('FREM') || d.includes('FREMM')) return { side: null, position: 'FD', source: 'description_no' };
    return { side: null, position: 'FD', source: 'description_no' };
  }
  if (d.includes('SIDERUTE') || d.includes('SIDE')) return { side: null, position: 'RQ', source: 'description_no' };
  if (d.includes('VENTRUTE') || d.includes('VENT')) return { side: null, position: 'FV', source: 'description_no' };
  
  // Pilkington WS = windscreen = FR
  if (d.includes('WS') && !d.includes('WSH')) return { side: null, position: 'FR', source: 'description_ws' };
  
  // English patterns in description
  if (d.includes('F DOOR') || d.includes('FRONT DOOR')) return { side: null, position: 'FD', source: 'description_en' };
  if (d.includes('R DOOR') || d.includes('REAR DOOR') || d.includes('BACK DOOR')) return { side: null, position: 'RD', source: 'description_en' };
  if (d.includes('QUARTER')) return { side: null, position: 'RQ', source: 'description_en' };
  if (d.includes('VENT') && d.includes('FRONT')) return { side: null, position: 'FV', source: 'description_en' };
  if (d.includes('VENT') && d.includes('REAR')) return { side: null, position: 'RV', source: 'description_en' };
  if (d.includes('WINDSCREEN')) return { side: null, position: 'FR', source: 'description_en' };
  if (d.includes('BACK WINDOW') || d.includes('REAR WINDOW')) return { side: null, position: 'RR', source: 'description_en' };
  
  return null;
}

function main() {
  console.log('📊 Categorizing all catalog products...');
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf-8'));
  const matches = JSON.parse(readFileSync(MATCHES, 'utf-8'));
  
  // Build eurocode → position map from matches
  const positionByEurocode = new Map();
  for (const m of matches.matches) {
    positionByEurocode.set(m.eurocode.toUpperCase(), {
      position: m.position,
      side: m.side,
      openingType: m.openingType,
      matchType: m.matchType,
      source: 'autoglass',
    });
  }
  
  // Build prefix4 bulk consensus map
  let prefix4Bulk = null;
  try {
    const bulk = JSON.parse(readFileSync(PREFIX4_BULK, 'utf-8'));
    prefix4Bulk = new Map();
    for (const m of bulk.matches) {
      prefix4Bulk.set(m.eurocode.toUpperCase(), m);
    }
    console.log(`   Loaded ${prefix4Bulk.size} prefix4 bulk matches`);
  } catch (e) {
    console.log('   No prefix4 bulk matches found');
  }
  
  const results = [];
  const stats = { total: 0, autoglassExact: 0, autoglassPrefix: 0, prefix4Bulk: 0, description: 0, category: 0, unknown: 0, byPosition: {} };
  
  for (const r of catalog.records) {
    stats.total++;
    const eurocode = (r.eurocode || '').toUpperCase();
    
    // 1. auto-glass match
    const ag = positionByEurocode.get(eurocode);
    if (ag) {
      const pos = ag.position || 'UNKNOWN';
      stats.byPosition[pos] = (stats.byPosition[pos] || 0) + 1;
      if (ag.matchType === 'exact') stats.autoglassExact++;
      else stats.autoglassPrefix++;
      
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: ag.position,
        side: ag.side,
        openingType: ag.openingType,
        parseStatus: 'OK',
        parseSource: ag.matchType === 'exact' ? 'autoglass_exact' : 'autoglass_prefix4',
        parseConfidence: ag.matchType === 'exact' ? 1.0 : 0.7,
        warnings: ag.matchType === 'prefix4' ? ['Prefix4 match - verify'] : [],
      });
      continue;
    }
    
    // 2. Prefix4 bulk consensus match
    if (prefix4Bulk) {
      const bulk = prefix4Bulk.get(eurocode);
      if (bulk) {
        const pos = bulk.position || 'UNKNOWN';
        stats.byPosition[pos] = (stats.byPosition[pos] || 0) + 1;
        stats.prefix4Bulk++;
        
        results.push({
          eurocode,
          brand: r.brand,
          model: r.model,
          description: r.description,
          category: r.category,
          position: bulk.position,
          side: null,
          openingType: null,
          parseStatus: 'REVIEW',
          parseSource: 'autoglass_prefix4_bulk',
          parseConfidence: bulk.confidence,
          warnings: [`Prefix4 bulk consensus (${(bulk.confidence*100).toFixed(0)}%) - verify`],
        });
        continue;
      }
    }
    
    // 3. Description parsing
    const parsed = parsePositionFromDescription(r.description);
    if (parsed) {
      const pos = parsed.position || 'UNKNOWN';
      stats.byPosition[pos] = (stats.byPosition[pos] || 0) + 1;
      stats.description++;
      
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: parsed.position,
        side: parsed.side,
        openingType: null,
        parseStatus: 'REVIEW',
        parseSource: parsed.source,
        parseConfidence: 0.6,
        warnings: ['Parsed from description - verify'],
      });
      continue;
    }
    
    // 3. Category-based
    if (r.category === 'frontrute') {
      stats.category++;
      stats.byPosition['FR'] = (stats.byPosition['FR'] || 0) + 1;
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: 'FR',
        side: null,
        openingType: null,
        parseStatus: 'OK',
        parseSource: 'category_frontrute',
        parseConfidence: 0.9,
        warnings: [],
      });
      continue;
    }
    
    if (r.category === 'bakrute') {
      stats.category++;
      stats.byPosition['RR'] = (stats.byPosition['RR'] || 0) + 1;
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: 'RR',
        side: null,
        openingType: null,
        parseStatus: 'OK',
        parseSource: 'category_bakrute',
        parseConfidence: 0.9,
        warnings: [],
      });
      continue;
    }
    
    if (r.category === 'dørglass') {
      stats.category++;
      // dørglass without description → HOLD (can't determine front/back)
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: null,
        side: null,
        openingType: null,
        parseStatus: 'HOLD',
        parseSource: 'category_door_unknown',
        parseConfidence: 0,
        warnings: ['Door glass - front/rear unknown'],
      });
      continue;
    }
    
    if (r.category === 'sideglass') {
      stats.category++;
      stats.byPosition['RQ'] = (stats.byPosition['RQ'] || 0) + 1;
      results.push({
        eurocode,
        brand: r.brand,
        model: r.model,
        description: r.description,
        category: r.category,
        position: 'RQ',
        side: null,
        openingType: null,
        parseStatus: 'REVIEW',
        parseSource: 'category_sideglass',
        parseConfidence: 0.6,
        warnings: ['Sideglass assumed RQ - verify'],
      });
      continue;
    }
    
    // 4. Unknown
    stats.unknown++;
    results.push({
      eurocode,
      brand: r.brand,
      model: r.model,
      description: r.description,
      category: r.category,
      position: null,
      side: null,
      openingType: null,
      parseStatus: 'HOLD',
      parseSource: 'none',
      parseConfidence: 0,
      warnings: ['No position found'],
    });
  }
  
  writeFileSync(OUTPUT, JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), stats },
    products: results,
  }, null, 2));
  
  console.log(`\n✅ Categorization complete`);
  console.log(`   Total catalog products: ${stats.total}`);
  console.log(`   auto-glass exact: ${stats.autoglassExact} (${(stats.autoglassExact/stats.total*100).toFixed(1)}%)`);
  console.log(`   auto-glass prefix4: ${stats.autoglassPrefix} (${(stats.autoglassPrefix/stats.total*100).toFixed(1)}%)`);
  console.log(`   prefix4 bulk: ${stats.prefix4Bulk} (${(stats.prefix4Bulk/stats.total*100).toFixed(1)}%)`);
  console.log(`   Description parsed: ${stats.description} (${(stats.description/stats.total*100).toFixed(1)}%)`);
  console.log(`   Category known: ${stats.category} (${(stats.category/stats.total*100).toFixed(1)}%)`);
  console.log(`   Unknown (HOLD): ${stats.unknown} (${(stats.unknown/stats.total*100).toFixed(1)}%)`);
  console.log(`   By position:`, stats.byPosition);
}

main();
