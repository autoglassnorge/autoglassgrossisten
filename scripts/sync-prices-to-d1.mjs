#!/usr/bin/env node
/**
 * Sync prices from auto-glass.no CSV directly into D1 database
 * Fast batch approach: builds SQL file and executes via wrangler
 *
 * Usage:
 *   node scripts/sync-prices-to-d1.mjs
 *   node scripts/sync-prices-to-d1.mjs --dry-run
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CSV_FILE = resolve(ROOT, 'data/autoglass-scrape/products-autoglass-no.csv');
const SQL_FILE = resolve(ROOT, 'data/autoglass-scrape/prices-to-d1.sql');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Batch size for SQL statements (D1 limit ~100 rows per INSERT)
const BATCH_SIZE = 500;

async function main() {
  console.log('💰 Syncing prices from auto-glass.no CSV to D1...');
  console.log(`   Dry run: ${DRY_RUN}`);

  if (!readFileSync(CSV_FILE)) {
    console.error('❌ CSV not found:', CSV_FILE);
    process.exit(1);
  }

  // Load CSV
  const csvContent = readFileSync(CSV_FILE, 'utf-8');
  const records = parseCsv(csvContent, { columns: true, skip_empty_lines: true });
  console.log(`📋 Loaded ${records.length.toLocaleString()} CSV rows`);

  // Build eurocode → price mapping (only valid prices)
  const priceMap = new Map();
  let skipped = 0;
  for (const row of records) {
    const eurocode = row.sku?.trim().toUpperCase();
    const priceStr = row.price?.trim();
    if (!eurocode || !priceStr) {
      skipped++;
      continue;
    }
    const price = parseInt(priceStr, 10);
    if (isNaN(price) || price <= 0) {
      skipped++;
      continue;
    }
    // Keep max price if duplicate
    const existing = priceMap.get(eurocode);
    if (!existing || price > existing) {
      priceMap.set(eurocode, price);
    }
  }

  console.log(`💵 Valid price entries: ${priceMap.size.toLocaleString()}`);
  console.log(`⏭️  Skipped (no price): ${skipped.toLocaleString()}`);

  // Generate SQL
  const entries = [...priceMap.entries()];
  const sqlLines = [];
  sqlLines.push(`-- Price sync from auto-glass.no CSV → D1`);
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push(`-- Products: ${entries.length}`);
  sqlLines.push('');

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const values = batch
      .map(([eurocode, price]) => `('${eurocode.replace(/'/g, "''")}', ${price})`)
      .join(',\n  ');

    sqlLines.push(`UPDATE glass_catalog SET price = CASE eurocode`);
    for (const [eurocode, price] of batch) {
      sqlLines.push(`  WHEN '${eurocode.replace(/'/g, "''")}' THEN ${price}`);
    }
    sqlLines.push(`END`);
    sqlLines.push(`WHERE eurocode IN (${batch.map(([e]) => `'${e.replace(/'/g, "''")}'`).join(', ')});`);
    sqlLines.push('');
  }

  // Also update stock_status for all products that have a price
  sqlLines.push(`-- Set stock_status = 1 (in stock) for all products with price`);
  sqlLines.push(`UPDATE glass_catalog SET stock_status = 1 WHERE price > 0;`);
  sqlLines.push('');

  // Count how many will be updated
  sqlLines.push(`-- Verify`);
  sqlLines.push(`SELECT COUNT(*) as updated FROM glass_catalog WHERE price > 0;`);

  writeFileSync(SQL_FILE, sqlLines.join('\n'));
  console.log(`📝 SQL file: ${SQL_FILE}`);
  console.log(`   ${sqlLines.length} lines, ${Math.ceil(entries.length / BATCH_SIZE)} batches`);

  if (DRY_RUN) {
    console.log('🔒 Dry run — SQL written but not executed');
    return;
  }

  // Execute via wrangler
  console.log('\n🚀 Executing SQL on D1 (remote)...');
  const cmd = `cd ${resolve(ROOT, 'api/cf-worker')} && npx wrangler d1 execute glass-catalog-db --remote --file=${SQL_FILE} --yes 2>&1`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    console.log(output);

    // Parse result
    const match = output.match(/"updated":\s*(\d+)/);
    if (match) {
      console.log(`\n✅ ${match[1]} products now have price > 0 in D1`);
    }
  } catch (e) {
    console.error('❌ D1 execution failed:', e.message);
    if (e.stdout) console.error(e.stdout);
    if (e.stderr) console.error(e.stderr);
    process.exit(1);
  }

  console.log('\n✅ Price sync complete!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
