#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const NEW_PRICES_FILE = resolve(ROOT, 'data/autoglass-scrape/new-prices.json');
const SQL_FILE = resolve(ROOT, 'data/autoglass-scrape/new-prices-to-d1.sql');
const BATCH_SIZE = 500;

async function main() {
  console.log('💰 Syncing NEW prices to D1...');

  const priceMap = JSON.parse(readFileSync(NEW_PRICES_FILE, 'utf-8'));
  const entries = Object.entries(priceMap).filter(([_, price]) => price > 0);
  console.log(`📋 ${entries.length} new price entries`);

  const sqlLines = [];
  sqlLines.push(`-- New price sync → D1`);
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push(`-- Entries: ${entries.length}`);
  sqlLines.push('');

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    sqlLines.push(`UPDATE glass_catalog SET price = CASE eurocode`);
    for (const [eurocode, price] of batch) {
      sqlLines.push(`  WHEN '${eurocode.replace(/'/g, "''")}' THEN ${price}`);
    }
    sqlLines.push(`END`);
    sqlLines.push(`WHERE eurocode IN (${batch.map(([e]) => `'${e.replace(/'/g, "''")}'`).join(', ')});`);
    sqlLines.push('');
  }

  sqlLines.push(`UPDATE glass_catalog SET stock_status = 1 WHERE price > 0;`);
  sqlLines.push(`SELECT COUNT(*) as updated FROM glass_catalog WHERE price > 0;`);

  writeFileSync(SQL_FILE, sqlLines.join('\n'));
  console.log(`📝 SQL: ${SQL_FILE}`);

  console.log('\n🚀 Executing on D1...');
  const cmd = `cd ${resolve(ROOT, 'api/cf-worker')} && npx wrangler d1 execute glass-catalog-db --remote --file=${SQL_FILE} --yes 2>&1`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    console.log(output);
  } catch (e) {
    console.error('❌ D1 failed:', e.message);
    process.exit(1);
  }

  console.log('\n✅ New prices synced to D1!');
}

main().catch(e => { console.error(e); process.exit(1); });
