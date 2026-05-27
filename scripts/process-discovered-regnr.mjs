#!/usr/bin/env node
/**
 * Process discovered regnr into ktype_matches + glass_catalog.ktype.
 * 
 * Reads data/bovsoft-discovered-regnr.json (output from discover-regnr-by-series.mjs)
 * and matches each ktype to eurocodes via prefix4 cache, then writes to D1.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

function loadPrefix4Cache() {
  const file = path.join(ROOT, 'data', 'ktype-prefix4-cache.json');
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  return data.entries || {};
}

function loadCatalog() {
  const file = path.join(ROOT, 'data', 'catalog-prod.json');
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  return data.records || [];
}

function loadDiscovered() {
  const file = path.join(ROOT, 'data', 'bovsoft-discovered-regnr.json');
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  return data.results || [];
}

function matchKtypeToEurocodes(discovery, prefix4Cache, catalog) {
  const { brand, model, yearFrom } = discovery;
  if (!brand || !model) return [];

  const modelPrefix = model.split(/\s/)[0].toUpperCase();
  const cacheKey = `${brand.toUpperCase()}:${modelPrefix}:${yearFrom || ""}`;
  const cacheKeyNoYear = `${brand.toUpperCase()}:${modelPrefix}`;

  const cacheEntries = prefix4Cache[cacheKey] || prefix4Cache[cacheKeyNoYear];
  if (!cacheEntries || cacheEntries.length === 0) return [];

  const best = cacheEntries.sort((a, b) => b.confidence - a.confidence)[0];
  const prefix4 = best.prefix4;

  const matches = catalog.filter((p) => p.prefix4 === prefix4 && p.brand?.toUpperCase() === brand.toUpperCase());

  return matches.map((p) => ({
    eurocode: p.eurocode,
    catalogBrand: p.brand,
    catalogModel: p.model,
    catalogYearFrom: p.yearFrom,
    catalogYearTo: p.yearTo,
    catalogCategory: p.category,
    prefix4,
  }));
}

function executeD1(sql) {
  const cmd = `cd ${path.join(ROOT, 'api/cf-worker')} && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;

  if (DRY_RUN) {
    console.log(`   [DRY-RUN] ${sql.slice(0, 150)}...`);
    return { success: true };
  }

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 60_000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function batchUpsert(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const values = batch.map((m) =>
      `(${m.ktype}, '${m.eurocode}', 1, datetime('now'), datetime('now'))`
    ).join(',');

    const sql = `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
      VALUES ${values}
      ON CONFLICT(ktype, eurocode) DO UPDATE SET
        hit_count = hit_count + 1,
        last_seen = datetime('now');`;

    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write('.');
    } else {
      failed += batch.length;
      process.stdout.write('X');
    }
  }

  return { success, failed };
}

function batchUpdateCatalog(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    // Only update if ktype is NULL or matches — don't overwrite different ktypes
    const cases = batch.map((m) => `WHEN '${m.eurocode}' COLLATE NOCASE THEN ${m.ktype}`).join(' ');
    const codes = batch.map((m) => `'${m.eurocode}'`).join(', ');

    const sql = `UPDATE glass_catalog SET ktype = CASE eurocode ${cases} END WHERE eurocode IN (${codes}) COLLATE NOCASE AND (ktype IS NULL);`;
    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write('.');
    } else {
      failed += batch.length;
      process.stdout.write('X');
    }
  }

  return { success, failed };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Process Discovered Regnr → kType → Eurocode');
  console.log('  Mode:', DRY_RUN ? 'DRY-RUN' : 'LIVE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const discoveries = loadDiscovered();
  const prefix4Cache = loadPrefix4Cache();
  const catalog = loadCatalog();

  console.log(`📂 Discovered regnr: ${discoveries.length}`);
  console.log(`📂 Prefix4 cache keys: ${Object.keys(prefix4Cache).length}`);
  console.log(`📂 Catalog products: ${catalog.length}\n`);

  // Match each discovery to eurocodes
  const allMatches = [];
  let matched = 0;
  let unmatched = 0;

  for (const d of discoveries) {
    const eurocodeMatches = matchKtypeToEurocodes(d, prefix4Cache, catalog);
    if (eurocodeMatches.length > 0) {
      matched++;
      for (const m of eurocodeMatches) {
        allMatches.push({ ktype: d.ktype, eurocode: m.eurocode, regnr: d.regnr });
      }
    } else {
      unmatched++;
    }
  }

  console.log(`🔍 Matched: ${matched}/${discoveries.length} discoveries`);
  console.log(`   Total eurocode matches: ${allMatches.length}`);
  console.log(`   Unmatched: ${unmatched}\n`);

  // Build unique mappings
  const seen = new Set();
  const mappings = [];

  for (const m of allMatches) {
    const key = `${m.ktype}:${m.eurocode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mappings.push(m);
  }

  console.log(`🔍 Unique ktype→eurocode mappings: ${mappings.length}`);

  if (mappings.length === 0) {
    console.log('⚠️  Ingen mappings. Avbryter.');
    return;
  }

  // 1. Upsert into ktype_matches
  console.log(`\n📝 Upserting ${mappings.length} rows into ktype_matches ...`);
  const ktypeResult = batchUpsert(mappings);
  console.log(`\n   Success: ${ktypeResult.success}, Failed: ${ktypeResult.failed}`);

  // 2. Update glass_catalog.ktype (only where NULL)
  console.log(`\n📝 Updating glass_catalog.ktype (only NULL entries) ...`);
  const catalogResult = batchUpdateCatalog(mappings);
  console.log(`\n   Success: ${catalogResult.success}, Failed: ${catalogResult.failed}`);

  // 3. Verify
  if (!DRY_RUN) {
    console.log(`\n🔍 Verifying ...`);
    const verifySql = `SELECT COUNT(*) as cnt FROM glass_catalog WHERE ktype IS NOT NULL;`;
    const verifyResult = executeD1(verifySql);
    if (verifyResult.success && verifyResult.output) {
      const match = verifyResult.output.match(/"cnt":\s*(\d+)/);
      if (match) {
        console.log(`   Products with ktype: ${match[1]} / 39458 (${(parseInt(match[1])/39458*100).toFixed(2)}%)`);
      }
    }
  }

  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
