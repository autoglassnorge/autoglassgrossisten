#!/usr/bin/env node
/**
 * Enterprise Quality Gate for kType mappings.
 * Merges all sources, applies confidence thresholds, detects collisions.
 * Outputs production-ready SQL for glass_catalog.ktype + ktype_matches.
 */
const { readFileSync } = require('fs');
const { writeFile } = require('fs/promises');

// ── Configuration ────────────────────────────────────────────
const CONFIG = {
  sources: {
    'tecdoc-resolver-resolved': { priority: 8, minScore: 0.75 },
    'tecdoc-resolver-ambiguous': { priority: 5, minScore: 0.55 },
  },
  maxEurocodesPerKtype: 150,
  absoluteMinScore: 0.40,
};

// ── Load sources ─────────────────────────────────────────────
function loadResolverResults() {
  const data = JSON.parse(readFileSync('data/batch-ktype-resolver-results.json', 'utf-8'));
  const mappings = [];
  for (const m of data.mappings || []) {
    mappings.push({
      eurocode: m.eurocode,
      ktype: m.ktype,
      score: m.score,
      source: m.status === 'resolved' ? 'tecdoc-resolver-resolved' : 'tecdoc-resolver-ambiguous',
      reasons: m.reasons,
      catalogBrand: m.catalogBrand,
      catalogModel: m.catalogModel,
      catalogYear: m.catalogYear,
    });
  }
  return mappings;
}

// ── Merge and dedupe ─────────────────────────────────────────
function mergeSources(sources) {
  const byEurocode = new Map();
  
  for (const source of sources) {
    for (const m of source) {
      const existing = byEurocode.get(m.eurocode);
      const sourceConfig = CONFIG.sources[m.source] || { priority: 0, minScore: 0 };
      
      if (m.score < sourceConfig.minScore) continue;
      if (m.score < CONFIG.absoluteMinScore) continue;
      
      if (!existing) {
        byEurocode.set(m.eurocode, m);
        continue;
      }
      
      const existingConfig = CONFIG.sources[existing.source] || { priority: 0 };
      
      if (sourceConfig.priority > existingConfig.priority) {
        byEurocode.set(m.eurocode, m);
      }
      else if (sourceConfig.priority === existingConfig.priority && m.score > existing.score) {
        byEurocode.set(m.eurocode, m);
      }
    }
  }
  
  return Array.from(byEurocode.values());
}

// ── Collision detection ──────────────────────────────────────
function detectCollisions(mappings) {
  const byKtype = new Map();
  for (const m of mappings) {
    const list = byKtype.get(m.ktype);
    if (list) list.push(m);
    else byKtype.set(m.ktype, [m]);
  }
  
  const collisions = [];
  const safe = [];
  
  for (const [ktype, list] of byKtype) {
    if (list.length > CONFIG.maxEurocodesPerKtype) {
      collisions.push({ ktype, count: list.length, eurocodes: list.map(m => m.eurocode).slice(0, 10) });
    } else {
      safe.push(...list);
    }
  }
  
  return { safe, collisions };
}

// ── Generate SQL ─────────────────────────────────────────────
function generateSql(mappings) {
  const updates = mappings.map(m =>
    `UPDATE glass_catalog SET ktype = ${m.ktype} WHERE eurocode = '${m.eurocode.replace(/'/g, "''")}';`
  );
  
  const matches = mappings.map(m => {
    const hitCount = Math.max(1, Math.round(m.score * 10));
    return `INSERT OR REPLACE INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen) ` +
      `VALUES (${m.ktype}, '${m.eurocode.replace(/'/g, "''")}', ${hitCount}, datetime('now'), datetime('now'));`;
  });
  
  return `-- Enterprise kType Quality Gate (${mappings.length} mappings)\n` +
    `-- Generated: ${new Date().toISOString()}\n\n` +
    `BEGIN TRANSACTION;\n\n` +
    `-- Update glass_catalog.ktype\n${updates.join('\n')}\n\n` +
    `-- Insert ktype_matches\n${matches.join('\n')}\n\n` +
    `COMMIT;`;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== Enterprise kType Quality Gate ===\n');
  
  console.log('Loading data sources...');
  const resolverData = loadResolverResults();
  console.log(`  Resolver mappings: ${resolverData.length}`);
  
  console.log('\nMerging sources with priority scoring...');
  const merged = mergeSources([resolverData]);
  console.log(`  Merged: ${merged.length}`);
  
  console.log('\nDetecting collisions...');
  const { safe, collisions } = detectCollisions(merged);
  console.log(`  Safe mappings: ${safe.length}`);
  console.log(`  Collision groups: ${collisions.length} (${collisions.reduce((s, c) => s + c.count, 0)} mappings excluded)`);
  
  if (collisions.length > 0) {
    console.log('  Top collisions:');
    for (const c of collisions.sort((a, b) => b.count - a.count).slice(0, 5)) {
      console.log(`    kType ${c.ktype}: ${c.count} eurocodes`);
    }
  }
  
  // Score distribution of safe mappings
  const bins = { '0.9+': 0, '0.8-0.9': 0, '0.7-0.8': 0, '0.6-0.7': 0, '0.5-0.6': 0, '0.4-0.5': 0 };
  for (const m of safe) {
    if (m.score >= 0.9) bins['0.9+']++;
    else if (m.score >= 0.8) bins['0.8-0.9']++;
    else if (m.score >= 0.7) bins['0.7-0.8']++;
    else if (m.score >= 0.6) bins['0.6-0.7']++;
    else if (m.score >= 0.5) bins['0.5-0.6']++;
    else bins['0.4-0.5']++;
  }
  console.log('\nSafe mapping score distribution:');
  for (const [bin, count] of Object.entries(bins)) {
    console.log(`  ${bin}: ${count}`);
  }
  
  // Generate SQL
  const sql = generateSql(safe);
  await writeFile('data/enterprise-ktype-quality-gated.sql', sql);
  console.log('\nSQL saved to: data/enterprise-ktype-quality-gated.sql');
  
  // Save report
  await writeFile('data/quality-gate-report.json', JSON.stringify({
    config: CONFIG,
    stats: {
      resolverCount: resolverData.length,
      mergedCount: merged.length,
      safeCount: safe.length,
      collisionCount: collisions.length,
      collisionExcluded: collisions.reduce((s, c) => s + c.count, 0),
      scoreBins: bins,
      coveragePct: (safe.length / 27139 * 100).toFixed(1),
    },
    collisions: collisions.slice(0, 100),
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log('Report saved to: data/quality-gate-report.json');
}

main().catch(e => { console.error(e); process.exit(1); });
