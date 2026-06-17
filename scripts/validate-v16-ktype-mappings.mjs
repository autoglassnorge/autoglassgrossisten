#!/usr/bin/env node
/**
 * Validate V16 kType mappings against vin_ktype_map and glass_rules.
 * Generates filtered SQL for D1 deploy.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(DATA_DIR, 'tecdoc-import');

// 1. Load VIN kType map ktypes
function loadVinKtypeKtypes() {
  const sql = fs.readFileSync(path.join(DATA_DIR, 'finn-no-regnr', 'vin-ktype-map-all-inserts.sql'), 'utf-8');
  const ktypes = new Set();
  const regex = /\('([A-HJ-NPR-Z0-9]{17})',\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*([0-9.]+),\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(sql)) !== null) {
    ktypes.add(parseInt(m[2], 10));
  }
  return ktypes;
}

// 2. Load glass_rules ktypes from seed SQL
function loadGlassRulesKtypes() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'api', 'cf-worker', 'scripts', 'seed-glass-rules-from-vin-ktype-map.sql'), 'utf-8');
  const ktypes = new Set();
  const regex = /ktype,\s*confidence\)\s*VALUES\s*\((\d+),/g;
  let m;
  while ((m = regex.exec(sql)) !== null) {
    ktypes.add(parseInt(m[1], 10));
  }
  return ktypes;
}

// 3. Load V16 mappings
function loadV16Mappings() {
  const report = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'matching-report-v16.json'), 'utf-8'));
  return report.mappings || [];
}

function main() {
  console.log('Loading validation sources...');
  const vinKtypes = loadVinKtypeKtypes();
  const rulesKtypes = loadGlassRulesKtypes();
  const validatedKtypes = new Set([...vinKtypes, ...rulesKtypes]);
  console.log(`  vin_ktype_map ktypes: ${vinKtypes.size}`);
  console.log(`  glass_rules ktypes: ${rulesKtypes.size}`);
  console.log(`  total validated ktypes: ${validatedKtypes.size}`);

  const mappings = loadV16Mappings();
  console.log(`  V16 mappings: ${mappings.length}`);

  const kept = [];
  const dropped = [];

  for (const m of mappings) {
    const validated = validatedKtypes.has(m.ktype);
    if (m.score >= 0.7) {
      kept.push({ ...m, reason: 'high_score' });
    } else if (m.score >= 0.4 && validated) {
      kept.push({ ...m, reason: 'medium_score_validated' });
    } else {
      dropped.push({ ...m, reason: m.score < 0.4 ? 'low_score' : 'medium_score_not_validated' });
    }
  }

  console.log(`\n=== Validation results ===`);
  console.log(`Kept: ${kept.length} (${(kept.length / mappings.length * 100).toFixed(1)}%)`);
  console.log(`Dropped: ${dropped.length} (${(dropped.length / mappings.length * 100).toFixed(1)}%)`);

  const byReason = {};
  for (const k of kept) {
    byReason[k.reason] = (byReason[k.reason] || 0) + 1;
  }
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`  ${reason}: ${count}`);
  }

  // Generate validated SQL
  const updateStatements = kept.map(m =>
    `UPDATE glass_catalog SET ktype = ${m.ktype} WHERE eurocode = '${m.eurocode.replace(/'/g, "''")}';`
  );

  const ktypesToRegister = new Set(kept.map(m => m.ktype));
  const tecdocMapping = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'tecdoc-ktype-mapping.json'), 'utf-8'));
  const ktypeInfoMap = new Map(tecdocMapping.map(e => [e.ktype, e]));

  const registryStatements = [];
  for (const ktype of ktypesToRegister) {
    const info = ktypeInfoMap.get(ktype);
    if (!info) continue;
    const brand = (info.brand || '').replace(/'/g, "''");
    const model = (info.model || '').replace(/'/g, "''");
    const yf = info.year_from || 'NULL';
    const yt = info.year_to || 'NULL';
    registryStatements.push(
      `INSERT OR IGNORE INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, created_at) VALUES (${ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_v16_validated', datetime('now'));`
    );
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'glass-catalog-updates-v16-validated.sql'),
    `-- glass_catalog updates v16 validated (${kept.length} mappings)\n` +
    `-- Generated: ${new Date().toISOString()}\n` +
    `-- Filter: score>=0.7 OR (score>=0.4 AND ktype in vin_ktype_map/glass_rules)\n\n` +
    updateStatements.join('\n')
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'ktype-registry-inserts-v16-validated.sql'),
    `-- ktype_registry inserts v16 validated (${registryStatements.length} entries)\n` +
    `-- Generated: ${new Date().toISOString()}\n\n` +
    registryStatements.join('\n')
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'validation-report-v16.json'),
    JSON.stringify({
      total: mappings.length,
      kept: kept.length,
      dropped: dropped.length,
      kept_pct: kept.length / mappings.length,
      score_distribution: {
        kept_high: kept.filter(m => m.score >= 0.7).length,
        kept_medium: kept.filter(m => m.score >= 0.4 && m.score < 0.7).length,
      },
      sample_dropped: dropped.slice(0, 20),
    }, null, 2)
  );

  console.log(`\n✅ Validated SQL written:`);
  console.log(`   ${path.join(OUTPUT_DIR, 'glass-catalog-updates-v16-validated.sql')}`);
  console.log(`   ${path.join(OUTPUT_DIR, 'ktype-registry-inserts-v16-validated.sql')}`);
  console.log(`   ${path.join(OUTPUT_DIR, 'validation-report-v16.json')}`);
}

Promise.resolve(main()).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
