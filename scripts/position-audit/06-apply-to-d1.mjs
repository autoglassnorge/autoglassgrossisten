#!/usr/bin/env node
/**
 * 06-apply-to-d1.mjs
 * Apply categorized positions to D1 database.
 * Requires: wrangler login (Cloudflare auth)
 * Usage: node 06-apply-to-d1.mjs [--dry-run]
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const DATA = 'data/autoglass-scrape/catalog-with-positions.json';
const DECISIONS = 'data/position-audit/review-decisions.json';
const DB = 'glass-catalog-db';
const BATCH_SIZE = 50;

function d1Execute(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB} --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;
  console.log(`   SQL: ${sql.slice(0, 120)}...`);
  return execSync(cmd, { encoding: 'utf-8' });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('📊 Loading data...');
  const data = JSON.parse(readFileSync(DATA, 'utf-8'));
  const products = data.products;

  // Load manual review decisions
  const decisions = existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf-8')) : {};
  console.log(`   Loaded ${products.length} products, ${Object.keys(decisions).length} manual decisions`);

  // Build final state
  const updates = [];
  for (const p of products) {
    const decision = decisions[p.eurocode];
    let status = p.parseStatus;
    let position = p.position;
    let side = p.side;
    let confidence = p.parseConfidence;
    let source = p.parseSource;

    if (decision) {
      status = decision.status;
      position = decision.position;
      side = decision.side;
      confidence = 1.0;
      source = 'manual_review';
    }

    if (status === 'OK' && position) {
      updates.push({ eurocode: p.eurocode, position, side, status, source, confidence });
    }
  }

  console.log(`\n📋 Ready to update ${updates.length} products`);

  if (dryRun) {
    console.log('\n🧪 DRY RUN — no D1 changes');
    console.log(`   Would update ${updates.length} products`);
    console.log('   Run without --dry-run to apply');
    return;
  }

  console.log('\n⚡ Applying to D1...');

  // Ensure columns exist (idempotent)
  try {
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN position TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN side TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_status TEXT DEFAULT 'HOLD';`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_source TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_confidence REAL DEFAULT 0;`);
    console.log('   Columns added/verified');
  } catch (e) {
    console.log('   Columns may already exist (OK)');
  }

  // Batch update
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const cases = batch.map(p => `WHEN '${p.eurocode}' THEN '${p.position}'`).join(' ');
    const codes = batch.map(p => `'${p.eurocode}'`).join(',');
    const sql = `UPDATE glass_catalog SET position = CASE eurocode ${cases} END, parse_status = 'OK', parse_source = 'audit_pipeline', parse_confidence = 0.9 WHERE eurocode IN (${codes});`;

    try {
      d1Execute(sql);
      updated += batch.length;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('X');
      failed += batch.length;
    }
  }

  console.log(`\n\n✅ Done! Updated ${updated}, failed ${failed}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
