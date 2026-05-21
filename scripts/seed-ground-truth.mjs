#!/usr/bin/env node
/**
 * Seed ground_truth SQL from auto-glass.no mapping
 * Generates SQL INSERTs grouped by vehicle (brand:model:year)
 * Each vehicle gets all 12 glass types mapped to eurocodes
 */
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';

const MAPPING_PATH = 'data/autoglass-mapping.json';
const SQL_OUT = 'data/ground-truth-seed.sql';
const BATCH_SIZE = 500;

function hashRegnr(regnr) {
  return createHash('sha256').update(regnr.toUpperCase().trim()).digest('hex');
}

// Map type_code to ground_truth column
const typeToColumn = {
  F: 'frontrute_eurocode',
  B: 'bakrute_eurocode',
  DFF: 'dor_fv_eurocode',      // dør fremme førerside (venstre)
  DFB: 'dor_bv_eurocode',      // dør bak førerside (venstre)
  DPF: 'dor_fh_eurocode',      // dør fremme passasjerside (høyre)
  DPB: 'dor_bh_eurocode',      // dør bak passasjerside (høyre)
  SFB1: 'sideglass_bv_eurocode',  // siderute bak 1 førerside
  SPB1: 'sideglass_bh_eurocode',  // siderute bak 1 passasjerside
  DFFV: 'sideglass_fv_eurocode',  // ventil fremme førerside
  DPFV: 'sideglass_fh_eurocode',  // ventil fremme passasjerside
  DFBV: 'sideglass_fv_eurocode',  // ventil bak førerside → samme som DFFV (sideglass)
  DPBV: 'sideglass_fh_eurocode',  // ventil bak passasjerside → samme som DPFV
  SFB2: 'sideglass_bv_eurocode',  // siderute bak 2 førerside
  SPB2: 'sideglass_bh_eurocode',  // siderute bak 2 passasjerside
  SFB3: 'sideglass_bv_eurocode',  // siderute bak 3 førerside
  SPB3: 'sideglass_bh_eurocode',  // siderute bak 3 passasjerside
};

async function main() {
  const mapping = JSON.parse(await readFile(MAPPING_PATH, 'utf-8'));

  // Group by brand:model:yearFrom:yearTo
  const byVehicle = new Map();

  for (const [key, product] of Object.entries(mapping)) {
    const [brand, model, yearFrom, yearTo, typeCode] = key.split(':');
    if (!brand || !model || !typeCode) continue;

    const vKey = `${brand}:${model}:${yearFrom}:${yearTo}`;
    if (!byVehicle.has(vKey)) {
      byVehicle.set(vKey, {
        brand,
        model,
        yearFrom: yearFrom === 'null' ? null : parseInt(yearFrom, 10),
        yearTo: yearTo === 'null' ? null : parseInt(yearTo, 10),
        glasses: {},
      });
    }
    const v = byVehicle.get(vKey);
    const col = typeToColumn[typeCode];
    if (col) {
      // Prefer the first (or overwrite with same, they're from same source)
      v.glasses[col] = product.eurocode;
    }
  }

  // Generate SQL
  let sql = `-- Ground truth seed from auto-glass.no mapping\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- Source: ${Object.keys(mapping).length} mapped products\n`;
  sql += `-- Vehicles: ${byVehicle.size} unique\n\n`;

  const columns = [
    'regnr_hash', 'make', 'model', 'year', 'submodel',
    'frontrute_eurocode', 'bakrute_eurocode',
    'sideglass_fv_eurocode', 'sideglass_fh_eurocode',
    'sideglass_bv_eurocode', 'sideglass_bh_eurocode',
    'dor_fv_eurocode', 'dor_fh_eurocode',
    'dor_bv_eurocode', 'dor_bh_eurocode',
    'verified_by', 'verified_at', 'source_url', 'confidence'
  ];

  let batch = [];
  let totalInserted = 0;

  for (const [vKey, v] of byVehicle) {
    // Generate a deterministic "fake" regnr hash for seeding
    // In production, these would be replaced with real regnr from SVV/TecDoc
    const fakeRegnr = `SEED_${vKey}`;
    const regnrHash = hashRegnr(fakeRegnr);
    const year = v.yearFrom ?? v.yearTo ?? 2000;

    const values = [
      `'${regnrHash}'`,
      `'${v.brand.replace(/'/g, "''")}'`,
      `'${v.model.replace(/'/g, "''")}'`,
      year,
      'NULL',
      v.glasses.frontrute_eurocode ? `'${v.glasses.frontrute_eurocode}'` : 'NULL',
      v.glasses.bakrute_eurocode ? `'${v.glasses.bakrute_eurocode}'` : 'NULL',
      v.glasses.sideglass_fv_eurocode ? `'${v.glasses.sideglass_fv_eurocode}'` : 'NULL',
      v.glasses.sideglass_fh_eurocode ? `'${v.glasses.sideglass_fh_eurocode}'` : 'NULL',
      v.glasses.sideglass_bv_eurocode ? `'${v.glasses.sideglass_bv_eurocode}'` : 'NULL',
      v.glasses.sideglass_bh_eurocode ? `'${v.glasses.sideglass_bh_eurocode}'` : 'NULL',
      v.glasses.dor_fv_eurocode ? `'${v.glasses.dor_fv_eurocode}'` : 'NULL',
      v.glasses.dor_fh_eurocode ? `'${v.glasses.dor_fh_eurocode}'` : 'NULL',
      v.glasses.dor_bv_eurocode ? `'${v.glasses.dor_bv_eurocode}'` : 'NULL',
      v.glasses.dor_bh_eurocode ? `'${v.glasses.dor_bh_eurocode}'` : 'NULL',
      `'auto-glass.no'`,
      `datetime('now')`,
      `'https://www.auto-glass.no'`,
      '0.85',
    ];

    batch.push(`(${values.join(', ')})`);

    if (batch.length >= BATCH_SIZE) {
      sql += `INSERT INTO ground_truth (${columns.join(', ')}) VALUES\n`;
      sql += batch.join(',\n') + ';\n\n';
      totalInserted += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    sql += `INSERT INTO ground_truth (${columns.join(', ')}) VALUES\n`;
    sql += batch.join(',\n') + ';\n\n';
    totalInserted += batch.length;
  }

  await writeFile(SQL_OUT, sql);

  console.log(`\n=== Ground Truth Seed Report ===`);
  console.log(`Unique vehicles: ${byVehicle.size.toLocaleString()}`);
  console.log(`Total rows to insert: ${totalInserted.toLocaleString()}`);
  console.log(`Glass coverage per vehicle:`);

  let totalGlass = 0;
  let vehicleGlassCounts = [];
  for (const v of byVehicle.values()) {
    const count = Object.keys(v.glasses).length;
    vehicleGlassCounts.push(count);
    totalGlass += count;
  }
  vehicleGlassCounts.sort((a, b) => a - b);
  const median = vehicleGlassCounts[Math.floor(vehicleGlassCounts.length / 2)];
  console.log(`  Total glass entries: ${totalGlass.toLocaleString()}`);
  console.log(`  Average per vehicle: ${(totalGlass / byVehicle.size).toFixed(1)}`);
  console.log(`  Median per vehicle: ${median}`);
  console.log(`  Max per vehicle: ${Math.max(...vehicleGlassCounts)}`);
  console.log(`  Min per vehicle: ${Math.min(...vehicleGlassCounts)}`);
  console.log(`\nFile written: ${SQL_OUT} (${(await readFile(SQL_OUT)).length.toLocaleString()} bytes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
