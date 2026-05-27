#!/usr/bin/env node
/**
 * Deduplicate glass_catalog.ktype by keeping only the most dominant ktype per eurocode.
 * 
 * Problem: batch-regnr-to-ktype.mjs overwrites ktype for each batch run.
 * If multiple ktypes map to the same eurocode, only the most confident one should remain.
 * 
 * Strategy:
 * 1. Find all eurocodes with multiple ktypes in ktype_matches
 * 2. For each, pick the ktype with highest hit_count
 * 3. Reset ktype to NULL for eurocodes where no single ktype dominates (ratio < 0.5 or max hit < 3)
 * 4. Set ktype to the winner for eurocodes with a clear dominant ktype
 */
import { execSync } from 'child_process';

const DB_NAME = 'glass-catalog-db';

function d1Query(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  const jsonMatch = out.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not parse D1 output');
  const data = JSON.parse(jsonMatch[0]);
  return data[0].results;
}

function d1Execute(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  return out;
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  
  console.log('🔧 Deduplicate glass_catalog.ktype');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');
  
  // 1. Find all eurocodes with their ktype stats
  console.log('📊 Analyzing ktype dominance per eurocode...');
  const stats = d1Query(`
    SELECT 
      eurocode,
      COUNT(*) as ktype_count,
      SUM(hit_count) as total_hits,
      MAX(hit_count) as max_hit,
      (SELECT ktype FROM ktype_matches km2 WHERE km2.eurocode = km.eurocode ORDER BY km2.hit_count DESC LIMIT 1) as winner_ktype,
      (SELECT hit_count FROM ktype_matches km2 WHERE km2.eurocode = km.eurocode ORDER BY km2.hit_count DESC LIMIT 1) as winner_hits
    FROM ktype_matches km
    GROUP BY eurocode
    ORDER BY ktype_count DESC, total_hits DESC
  `);
  
  console.log(`Found ${stats.length} eurocodes in ktype_matches`);
  
  const clearWinners = [];
  const ties = [];
  const singleKtype = [];
  
  for (const row of stats) {
    const ratio = row.winner_hits / row.total_hits;
    
    if (row.ktype_count === 1) {
      singleKtype.push({ ...row, ratio });
    } else if (row.winner_hits >= 3 && ratio >= 0.5) {
      clearWinners.push({ ...row, ratio });
    } else {
      ties.push({ ...row, ratio });
    }
  }
  
  console.log(`\n🟢 Single ktype (clear): ${singleKtype.length}`);
  console.log(`🟡 Clear winners (multi-ktype, dominant): ${clearWinners.length}`);
  console.log(`🔴 Ties/ambiguous (multi-ktype, no clear winner): ${ties.length}`);
  
  // 2. Plan updates
  const toSet = [];
  const toClear = [];
  
  // Set clear winners
  for (const w of [...singleKtype, ...clearWinners]) {
    toSet.push({ eurocode: w.eurocode, ktype: w.winner_ktype, hits: w.winner_hits, total: w.total_hits, ratio: w.ratio.toFixed(2) });
  }
  
  // Clear ambiguous
  for (const t of ties) {
    toClear.push({ eurocode: t.eurocode, ktype_count: t.ktype_count, winner_hits: t.winner_hits, total: t.total_hits, ratio: t.ratio.toFixed(2) });
  }
  
  console.log(`\n📋 Plan:`);
  console.log(`  Set ktype: ${toSet.length} eurocodes`);
  console.log(`  Clear ktype: ${toClear.length} eurocodes`);
  
  if (dryRun) {
    console.log('\n🧪 DRY RUN — showing samples:');
    console.log('\n  Sample set operations (first 5):');
    for (const s of toSet.slice(0, 5)) {
      console.log(`    ${s.eurocode} -> ktype ${s.ktype} (hits=${s.hits}/${s.total}, ratio=${s.ratio})`);
    }
    console.log('\n  Sample clear operations (first 5):');
    for (const c of toClear.slice(0, 5)) {
      console.log(`    ${c.eurocode} (ktypes=${c.ktype_count}, winner=${c.winner_hits}/${c.total}, ratio=${c.ratio})`);
    }
    console.log('\n📝 Run with --apply to execute');
    return;
  }
  
  // 3. Execute updates
  console.log('\n⚡ Executing updates...');
  
  // Set winners
  let setCount = 0;
  for (let i = 0; i < toSet.length; i += 20) {
    const batch = toSet.slice(i, i + 20);
    const cases = batch.map(s => `WHEN '${s.eurocode}' THEN ${s.ktype}`).join(' ');
    const codes = batch.map(s => `'${s.eurocode}'`).join(', ');
    const sql = `UPDATE glass_catalog SET ktype = CASE eurocode ${cases} END WHERE eurocode IN (${codes});`;
    
    try {
      const out = d1Execute(sql);
      const metaMatch = out.match(/"changes"\s*:\s*(\d+)/);
      const changes = metaMatch ? parseInt(metaMatch[1]) : 0;
      setCount += changes;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('X');
    }
  }
  console.log(`\n  Set: ${setCount} rows`);
  
  // Clear ambiguous
  let clearCount = 0;
  for (let i = 0; i < toClear.length; i += 20) {
    const batch = toClear.slice(i, i + 20);
    const codes = batch.map(c => `'${c.eurocode}'`).join(', ');
    const sql = `UPDATE glass_catalog SET ktype = NULL WHERE eurocode IN (${codes});`;
    
    try {
      const out = d1Execute(sql);
      const metaMatch = out.match(/"changes"\s*:\s*(\d+)/);
      const changes = metaMatch ? parseInt(metaMatch[1]) : 0;
      clearCount += changes;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('X');
    }
  }
  console.log(`\n  Cleared: ${clearCount} rows`);
  
  // Verify
  console.log('\n🔍 Verifying...');
  const verify = d1Query('SELECT COUNT(*) as cnt FROM glass_catalog WHERE ktype IS NOT NULL');
  console.log(`  Products with ktype: ${verify[0].cnt}`);
  
  console.log('\n✅ Done!');
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
