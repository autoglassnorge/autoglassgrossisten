#!/usr/bin/env node
/**
 * Populate glass_catalog.ktype from ktype_matches statistics.
 * 
 * Strategy: For each ktype, find the dominant eurocode(s).
 * If a single eurocode has hit_count >= 10 and > 50% of total hits,
 * set it as the primary ktype for that product.
 * 
 * Also: For any eurocode with hit_count >= 5 (regardless of ratio),
 * add to a secondary mapping table or consider for direct population.
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const DB_NAME = 'glass-catalog-db';

function d1Query(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  // Parse JSON from wrangler output
  const match = out.match(/\{[\s\S]*?"results"[\s\S]*?\](?=\s*\}|\s*$)/);
  if (!match) {
    // Try to find the JSON array
    const arrMatch = out.match(/\[[\s\S]*?\](?=\s*\}|\s*$)/);
    if (arrMatch) {
      return JSON.parse(arrMatch[0]);
    }
    throw new Error('Could not parse D1 output: ' + out.slice(0, 500));
  }
  return JSON.parse(match[0] + '}');
}

function d1Execute(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  return out;
}

// Fetch all ktype_matches with stats per ktype
async function fetchKtypeStats() {
  console.log('📊 Fetching ktype match statistics...');
  
  // Get per-ktype aggregates
  const sql = `
    SELECT 
      ktype,
      COUNT(*) as eurocode_count,
      SUM(hit_count) as total_hits,
      MAX(hit_count) as max_hit,
      (SELECT eurocode FROM ktype_matches km2 WHERE km2.ktype = km.ktype ORDER BY km2.hit_count DESC LIMIT 1) as dominant_eurocode,
      (SELECT hit_count FROM ktype_matches km2 WHERE km2.ktype = km.ktype ORDER BY km2.hit_count DESC LIMIT 1) as dominant_hit_count
    FROM ktype_matches km
    GROUP BY ktype
    ORDER BY total_hits DESC
  `;
  
  const out = execSync(
    `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' }
  );
  
  // Extract JSON result - wrangler outputs [ { results: [...], success: true, meta: {...} } ]
  const jsonMatch = out.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Could not parse output:', out.slice(0, 1000));
    process.exit(1);
  }
  
  const data = JSON.parse(jsonMatch[0]);
  return data[0].results;
}

// Find strong mappings: dominant eurocode with high confidence
function findStrongMappings(stats) {
  const strong = [];
  const moderate = [];
  
  for (const row of stats) {
    const { ktype, eurocode_count, total_hits, max_hit, dominant_eurocode, dominant_hit_count } = row;
    
    if (!dominant_eurocode || !dominant_hit_count) continue;
    
    const ratio = dominant_hit_count / total_hits;
    
    // Strong: dominant hit_count >= 10 and ratio > 0.3
    // (Relaxed ratio because many ktypes have many valid eurocodes for different positions)
    if (dominant_hit_count >= 10 && ratio > 0.3) {
      strong.push({
        ktype,
        eurocode: dominant_eurocode,
        hit_count: dominant_hit_count,
        total_hits,
        ratio: ratio.toFixed(2),
        eurocode_count
      });
    }
    // Moderate: dominant hit_count >= 3 and ratio > 0.15
    else if (dominant_hit_count >= 3 && ratio > 0.15) {
      moderate.push({
        ktype,
        eurocode: dominant_eurocode,
        hit_count: dominant_hit_count,
        total_hits,
        ratio: ratio.toFixed(2),
        eurocode_count
      });
    }
  }
  
  return { strong, moderate };
}

// Update glass_catalog.ktype for strong mappings
async function updateCatalog(updates, dryRun = true) {
  console.log(`\n${dryRun ? '🧪 DRY RUN' : '⚡ LIVE'}: Updating glass_catalog.ktype...`);
  
  if (updates.length === 0) {
    console.log('No updates to apply.');
    return;
  }
  
  const sql = updates.map(u => 
    `UPDATE glass_catalog SET ktype = ${u.ktype} WHERE eurocode = '${u.eurocode}' AND (ktype IS NULL OR ktype != ${u.ktype});`
  ).join('\n');
  
  // Also update adas_features if present
  const checkSql = updates.map(u =>
    `SELECT eurocode, ktype FROM glass_catalog WHERE eurocode = '${u.eurocode}';`
  ).join('\n');
  
  if (dryRun) {
    console.log(`Would execute ${updates.length} UPDATE statements.`);
    console.log('\nSample SQL:');
    console.log(updates.slice(0, 3).map(u => 
      `UPDATE glass_catalog SET ktype = ${u.ktype} WHERE eurocode = '${u.eurocode}';`
    ).join('\n'));
    return;
  }
  
  // Execute in batches of 20 to avoid overwhelming D1
  const BATCH_SIZE = 20;
  let updated = 0;
  let skipped = 0;
  
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const batchSql = batch.map(u => 
      `UPDATE glass_catalog SET ktype = ${u.ktype} WHERE eurocode = '${u.eurocode}' AND (ktype IS NULL OR ktype != ${u.ktype});`
    ).join('\n');
    
    try {
      const out = d1Execute(batchSql);
      // Count affected rows from meta
      const metaMatch = out.match(/"changes"\s*:\s*(\d+)/);
      const changes = metaMatch ? parseInt(metaMatch[1]) : 0;
      updated += changes;
      console.log(`  Batch ${i/BATCH_SIZE + 1}: ${changes} rows updated`);
    } catch (e) {
      console.error(`  Batch ${i/BATCH_SIZE + 1} failed:`, e.message);
      skipped += batch.length;
    }
  }
  
  console.log(`\n✅ Total updated: ${updated}, skipped: ${skipped}`);
}

// Also write to ground_truth for all strong mappings
async function writeGroundTruth(updates, dryRun = true) {
  console.log(`\n${dryRun ? '🧪 DRY RUN' : '⚡ LIVE'}: Writing ground_truth entries...`);
  
  if (updates.length === 0) return;
  
  // Check if ground_truth table exists
  try {
    const out = execSync(
      `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='ground_truth';"`,
      { encoding: 'utf-8' }
    );
    if (!out.includes('ground_truth')) {
      console.log('⚠️ ground_truth table does not exist, skipping.');
      return;
    }
  } catch (e) {
    console.log('⚠️ Could not check for ground_truth table, skipping.');
    return;
  }
  
  const entries = updates.map(u => ({
    ktype: u.ktype,
    eurocode: u.eurocode,
    source: 'statistical_confidence',
    confidence_score: parseFloat(u.ratio),
    hit_count: u.hit_count,
    notes: `Dominant mapping: ${u.ratio} ratio, ${u.eurocode_count} total eurocodes`
  }));
  
  console.log(`Would insert ${entries.length} ground_truth entries.`);
  
  if (dryRun) return;
  
  // Insert in batches
  const BATCH_SIZE = 20;
  let inserted = 0;
  
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const values = batch.map(e => 
      `(${e.ktype}, '${e.eurocode}', '${e.source}', ${e.confidence_score}, ${e.hit_count}, '${e.notes.replace(/'/g, "''")}')`
    ).join(', ');
    
    const sql = `INSERT OR IGNORE INTO ground_truth (ktype, eurocode, source, confidence_score, hit_count, notes) VALUES ${values};`;
    
    try {
      const out = d1Execute(sql);
      const metaMatch = out.match(/"changes"\s*:\s*(\d+)/);
      const changes = metaMatch ? parseInt(metaMatch[1]) : 0;
      inserted += changes;
    } catch (e) {
      console.error(`  Batch failed:`, e.message);
    }
  }
  
  console.log(`✅ Total ground_truth inserted: ${inserted}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
  
  console.log('🔧 kType → Catalog Population Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN (--dry-run)' : 'LIVE (--apply)'}`);
  console.log('');
  
  const stats = await fetchKtypeStats();
  console.log(`Found ${stats.length} unique ktypes in ktype_matches`);
  
  const { strong, moderate } = findStrongMappings(stats);
  
  console.log(`\n🟢 Strong mappings (${strong.length}):`);
  console.log('  ktype      | eurocode           | hits | total | ratio | variants');
  console.log('  -----------+--------------------+------+-------+-------+---------');
  for (const s of strong) {
    console.log(`  ${String(s.ktype).padEnd(10)} | ${s.eurocode.padEnd(18)} | ${String(s.hit_count).padStart(4)} | ${String(s.total_hits).padStart(5)} | ${s.ratio.padStart(5)} | ${s.eurocode_count}`);
  }
  
  console.log(`\n🟡 Moderate mappings (${moderate.length}):`);
  console.log('  ktype      | eurocode           | hits | total | ratio | variants');
  console.log('  -----------+--------------------+------+-------+-------+---------');
  for (const m of moderate.slice(0, 20)) {
    console.log(`  ${String(m.ktype).padEnd(10)} | ${m.eurocode.padEnd(18)} | ${String(m.hit_count).padStart(4)} | ${String(m.total_hits).padStart(5)} | ${m.ratio.padStart(5)} | ${m.eurocode_count}`);
  }
  if (moderate.length > 20) {
    console.log(`  ... and ${moderate.length - 20} more`);
  }
  
  // Write summary to file
  const summary = {
    generatedAt: new Date().toISOString(),
    totalKtypes: stats.length,
    strongMappings: strong,
    moderateMappings: moderate,
    stats: stats.map(s => ({
      ktype: s.ktype,
      eurocode_count: s.eurocode_count,
      total_hits: s.total_hits,
      dominant_eurocode: s.dominant_eurocode,
      dominant_hit_count: s.dominant_hit_count
    }))
  };
  writeFileSync('data/ktype-match-analysis.json', JSON.stringify(summary, null, 2));
  console.log('\n💾 Summary written to data/ktype-match-analysis.json');
  
  // Update catalog with strong mappings
  await updateCatalog(strong, dryRun);
  
  // Write ground truth
  await writeGroundTruth(strong, dryRun);
  
  if (dryRun) {
    console.log('\n📝 To apply changes, run with --apply flag');
  }
}

main().catch(e => {
  console.error('❌ Fatal error:', e.message);
  process.exit(1);
});
