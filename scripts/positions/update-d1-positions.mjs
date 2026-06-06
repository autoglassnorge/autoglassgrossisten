#!/usr/bin/env node
/**
 * Update position data in D1 from catalog-prod.json
 * Generates SQL UPDATE statements and executes via wrangler
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const CATALOG_PATH = 'data/catalog-prod.json';
const CHUNK_SIZE = 500;

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  const s = String(val).replace(/'/g, "''").replace(/\0/g, '');
  return `'${s}'`;
}

function main() {
  console.log('=== Update D1 Positions ===\n');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const records = catalog.records.filter(r => r.position && r.eurocode);
  console.log(`Found ${records.length} records with position\n`);

  const tmpDir = path.join(process.cwd(), '.wrangler-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Generate chunked UPDATE statements using CASE
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Generating ${chunks.length} SQL chunks...\n`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cases = chunk.map(r => `WHEN ${escapeSql(r.eurocode)} THEN ${escapeSql(r.position)}`).join('\n  ');
    const eurocodes = chunk.map(r => escapeSql(r.eurocode)).join(', ');

    const sql = `UPDATE glass_catalog
  SET position = CASE eurocode
  ${cases}
  END
  WHERE eurocode IN (${eurocodes});`;

    const filePath = path.join(tmpDir, `d1-update-positions-${String(i).padStart(3, '0')}.sql`);
    fs.writeFileSync(filePath, sql);
    console.log(`  ${filePath}: ${chunk.length} rows`);
  }

  console.log(`\nExecute with:`);
  console.log(`  cd api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file=.wrangler-tmp/d1-update-positions-000.sql`);
  console.log(`  (repeat for all ${chunks.length} chunks)\n`);
}

main();
