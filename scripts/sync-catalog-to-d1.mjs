#!/usr/bin/env node
/**
 * Sync enriched catalog-prod.json → D1 (local SQLite or remote)
 *
 * Features:
 *   - Maps properties JSON to individual columns + stores full JSON
 *   - Generates chunked SQL files for remote wrangler deploy
 *   - Can execute directly against local SQLite for testing
 *
 * Usage:
 *   node scripts/sync-catalog-to-d1.mjs --local          # Direct to local SQLite
 *   node scripts/sync-catalog-to-d1.mjs --sql /tmp/out   # Generate SQL files
 *   node scripts/sync-catalog-to-d1.mjs --remote         # Via wrangler d1 execute (NYI)
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const CATALOG_PATH = 'data/catalog-prod.json';
const CHUNK_SIZE = 100;

// Schema columns (must match glass_catalog table)
const COLUMNS = [
  'eurocode', 'article_number', 'scan_number', 'category', 'supplier', 'brand',
  'model', 'year_from', 'year_to', 'adas', 'rain_sensor', 'heated', 'acoustic',
  'antenna', 'hud', 'shade', 'camera', 'lane_assist', 'price', 'stock_status',
  'warehouse_location', 'oem_numbers', 'cross_references', 'weight', 'dimensions',
  'description', 'type_description', 'properties', 'prefix4', 'image_url', 'pdf_url',
  'source', 'nags_codes', 'brand_original', 'ktype'
];

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (Array.isArray(val)) return escapeSql(JSON.stringify(val));
  if (typeof val === 'object') return escapeSql(JSON.stringify(val));
  const s = String(val).replace(/'/g, "''").replace(/\0/g, '');
  return `'${s}'`;
}

function mapPropertiesToColumns(record) {
  const props = record.properties || {};
  return {
    adas: props.adas ? 1 : 0,
    rain_sensor: props.rainSensor ? 1 : 0,
    heated: props.heated ? 1 : 0,
    acoustic: props.acoustic ? 1 : 0,
    antenna: props.antenna ? 1 : 0,
    hud: props.hud ? 1 : 0,
    lane_assist: props.laneAssist ? 1 : 0,
    shade: props.solar ? 1 : 0,        // solar → shade
    camera: props.darkGreen ? 1 : 0,   // darkGreen → camera (closest match)
  };
}

function recordToRow(record) {
  const props = mapPropertiesToColumns(record);
  const row = {
    eurocode: record.eurocode,
    article_number: record.article_number,
    scan_number: record.scan_number || null,
    category: record.category,
    supplier: record.supplier,
    brand: record.brand,
    model: record.model,
    year_from: record.year_from,
    year_to: record.year_to,
    adas: props.adas,
    rain_sensor: props.rain_sensor,
    heated: props.heated,
    acoustic: props.acoustic,
    antenna: props.antenna,
    hud: props.hud,
    shade: props.shade,
    camera: props.camera,
    lane_assist: props.lane_assist,
    price: record.price,
    stock_status: record.stock_status || 0,
    warehouse_location: record.warehouse_location || null,
    oem_numbers: record.oem_numbers ? JSON.stringify(record.oem_numbers) : null,
    cross_references: record.cross_references ? JSON.stringify(record.cross_references) : null,
    weight: record.weight || null,
    dimensions: record.dimensions ? JSON.stringify(record.dimensions) : null,
    description: record.description || null,
    type_description: record.type_description || null,
    properties: record.properties ? JSON.stringify(record.properties) : null,
    prefix4: record.prefix4 || null,
    image_url: record.image_url || null,
    pdf_url: record.pdf_url || null,
    source: record.source || null,
    nags_codes: record.nags_codes ? JSON.stringify(record.nags_codes) : null,
    brand_original: record.brand_original || null,
    ktype: record.ktype || null,
  };
  return row;
}

function rowToValues(row) {
  const vals = COLUMNS.map(col => escapeSql(row[col]));
  return `  (${vals.join(', ')})`;
}

function generateSqlChunks(records, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
  console.log(`Generating ${totalChunks} SQL chunks for ${records.length} records...\n`);

  const header = `INSERT OR REPLACE INTO glass_catalog (${COLUMNS.join(', ')}) VALUES`;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, records.length);
    const chunk = records.slice(start, end);

    const lines = chunk.map((r, idx) => {
      const row = recordToRow(r);
      const suffix = idx === chunk.length - 1 ? ';' : ',';
      return rowToValues(row) + suffix;
    });

    const sql = `-- Chunk ${String(i).padStart(3, '0')}: rows ${start + 1}-${end}\n${header}\n${lines.join('\n')}\n`;
    const filePath = path.join(outDir, `d1-sync-chunk-${String(i).padStart(3, '0')}.sql`);
    fs.writeFileSync(filePath, sql);
    console.log(`  ${filePath}: ${chunk.length} rows`);
  }

  // Meta insert
  const metaSql = `INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES ('total_records', '${records.length}', datetime('now'));`;
  fs.writeFileSync(path.join(outDir, 'd1-sync-meta.sql'), metaSql);
  console.log(`  ${path.join(outDir, 'd1-sync-meta.sql')}: metadata`);

  // Cleanup + pragma
  const pragmaSql = `PRAGMA foreign_keys = OFF;\nDELETE FROM glass_catalog;\n${metaSql}\n`;
  fs.writeFileSync(path.join(outDir, 'd1-sync-cleanup.sql'), pragmaSql);
  console.log(`  ${path.join(outDir, 'd1-sync-cleanup.sql')}: cleanup`);
}

function executeLocal(records) {
  // Find local D1 SQLite file
  const stateDir = 'api/cf-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  if (!fs.existsSync(stateDir)) {
    console.error('Local D1 state directory not found:', stateDir);
    console.error('Run: cd api/cf-worker && wrangler d1 migrations apply glass-catalog-db --local');
    process.exit(1);
  }

  const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.sqlite'));
  if (files.length === 0) {
    console.error('No SQLite file found in', stateDir);
    process.exit(1);
  }

  const dbPath = path.join(stateDir, files[0]);
  console.log(`Using local D1: ${dbPath}\n`);

  // First, add missing columns via ALTER TABLE (safe for existing tables)
  console.log('Applying schema updates...');
  const alterStatements = [
    `ALTER TABLE glass_catalog ADD COLUMN type_description TEXT;`,
    `ALTER TABLE glass_catalog ADD COLUMN properties TEXT;`,
  ];
  for (const sql of alterStatements) {
    try {
      execSync(`sqlite3 "${dbPath}" "${sql}"`, { stdio: 'pipe' });
      console.log(`  Added column: ${sql.match(/ADD COLUMN (\w+)/)?.[1]}`);
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log(`  Column already exists: ${sql.match(/ADD COLUMN (\w+)/)?.[1]}`);
      } else {
        console.warn(`  Schema alter warning: ${e.message.slice(0, 100)}`);
      }
    }
  }

  // Recreate glass_catalog to apply schema changes (SQLite can't drop constraints)
  console.log('Recreating glass_catalog table with updated schema...');
  const recreateSql = `
    ALTER TABLE glass_catalog RENAME TO glass_catalog_old;
    CREATE TABLE glass_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eurocode TEXT NOT NULL,
      article_number TEXT,
      scan_number TEXT,
      category TEXT,
      supplier TEXT,
      brand TEXT,
      model TEXT,
      year_from INTEGER,
      year_to INTEGER,
      adas INTEGER DEFAULT 0,
      rain_sensor INTEGER DEFAULT 0,
      heated INTEGER DEFAULT 0,
      acoustic INTEGER DEFAULT 0,
      antenna INTEGER DEFAULT 0,
      hud INTEGER DEFAULT 0,
      shade INTEGER DEFAULT 0,
      camera INTEGER DEFAULT 0,
      lane_assist INTEGER DEFAULT 0,
      price REAL,
      stock_status INTEGER DEFAULT 0,
      warehouse_location TEXT,
      oem_numbers TEXT,
      cross_references TEXT,
      weight REAL,
      dimensions TEXT,
      description TEXT,
      type_description TEXT,
      properties TEXT,
      prefix4 TEXT,
      image_url TEXT,
      pdf_url TEXT,
      source TEXT,
      nags_codes TEXT,
      brand_original TEXT,
      ktype INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_brand ON glass_catalog(brand);
    CREATE INDEX IF NOT EXISTS idx_category ON glass_catalog(category);
    CREATE INDEX IF NOT EXISTS idx_prefix4 ON glass_catalog(prefix4);
    CREATE INDEX IF NOT EXISTS idx_year_from ON glass_catalog(year_from);
    CREATE INDEX IF NOT EXISTS idx_year_to ON glass_catalog(year_to);
    CREATE INDEX IF NOT EXISTS idx_supplier ON glass_catalog(supplier);
    CREATE INDEX IF NOT EXISTS idx_eurocode ON glass_catalog(eurocode);
    CREATE INDEX IF NOT EXISTS idx_ktype ON glass_catalog(ktype);
    CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_year ON glass_catalog(brand, year_from, year_to);
    CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_model ON glass_catalog(brand, model);
    CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_category ON glass_catalog(brand, category);
    DROP TABLE glass_catalog_old;
  `;
  fs.writeFileSync('/tmp/d1-recreate.sql', recreateSql);
  execSync(`sqlite3 "${dbPath}" < /tmp/d1-recreate.sql`, { stdio: 'pipe' });
  console.log('  Table recreated successfully');

  // Insert in chunks via sqlite3
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
  console.log(`Inserting ${records.length} records in ${totalChunks} chunks...\n`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, records.length);
    const chunk = records.slice(start, end);

    const values = chunk.map(r => rowToValues(recordToRow(r))).join(',\n');
    const sql = `INSERT OR REPLACE INTO glass_catalog (${COLUMNS.join(', ')}) VALUES\n${values};`;

    // Write to temp file and pipe to avoid command-line length limits
    const tmpFile = `/tmp/d1-sync-chunk-${i}.sql`;
    fs.writeFileSync(tmpFile, sql);

    try {
      execSync(`sqlite3 "${dbPath}" < "${tmpFile}"`, { stdio: 'pipe' });
      process.stdout.write(`\r  Chunk ${i + 1}/${totalChunks} (${start + 1}-${end}) ✓     `);
      fs.unlinkSync(tmpFile);
    } catch (e) {
      console.error(`\nChunk ${i} failed:`, e.message.slice(0, 200));
      console.error(`  Saved to ${tmpFile}`);
    }
  }

  console.log('\n\nVerifying...');
  const count = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM glass_catalog;"`, { encoding: 'utf8' }).trim();
  const withEuro = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM glass_catalog WHERE eurocode IS NOT NULL;"`, { encoding: 'utf8' }).trim();
  const withProps = execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM glass_catalog WHERE properties IS NOT NULL;"`, { encoding: 'utf8' }).trim();

  console.log(`  Total records: ${count}`);
  console.log(`  With eurocode: ${withEuro}`);
  console.log(`  With properties: ${withProps}`);

  // Update meta
  execSync(`sqlite3 "${dbPath}" "INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES ('total_records', '${count}', datetime('now'));"`, { stdio: 'pipe' });

  console.log('\n✓ Local D1 sync complete!');
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--local';
  const outDir = args[1] || '/tmp/d1-sync';

  console.log('=== Catalog → D1 Sync ===\n');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const allRecords = catalog.records;
  const records = allRecords.filter(r => r.eurocode);
  console.log(`Loaded ${allRecords.length} records from ${CATALOG_PATH}`);
  console.log(`Filtered to ${records.length} records with eurocode (${allRecords.length - records.length} skipped)\n`);

  if (mode === '--sql') {
    generateSqlChunks(records, outDir);
    console.log(`\nSQL files written to ${outDir}`);
    console.log(`Deploy with: cd api/cf-worker && wrangler d1 execute glass-catalog-db --file=${outDir}/d1-sync-cleanup.sql`);
  } else if (mode === '--local') {
    executeLocal(records);
  } else {
    console.log('Usage:');
    console.log('  node scripts/sync-catalog-to-d1.mjs --local          # Sync to local D1 SQLite');
    console.log('  node scripts/sync-catalog-to-d1.mjs --sql /tmp/out   # Generate SQL files');
    process.exit(1);
  }
}

main();
