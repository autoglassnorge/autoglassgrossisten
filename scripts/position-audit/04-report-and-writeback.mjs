#!/usr/bin/env node
/**
 * 04-report-and-writeback.mjs
 * Generate report + write positions to D1 with review queue.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DATA = 'data/autoglass-scrape/catalog-with-positions.json';
const REPORT = 'scripts/position-audit/audit-report.md';
const DB = 'glass-catalog-db';

function d1Execute(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute ${DB} --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;
  return execSync(cmd, { encoding: 'utf-8' });
}

function generateReport(data) {
  const stats = data.meta?.stats || data.stats || {};
  const products = data.products || [];
  const ok = products.filter(p => p.parseStatus === 'OK');
  const review = products.filter(p => p.parseStatus === 'REVIEW');
  const hold = products.filter(p => p.parseStatus === 'HOLD');
  
  // Sample products for review
  const reviewSamples = review.slice(0, 20);
  const holdSamples = hold.slice(0, 20);
  
  return `# Posisjonsaudit-rapport — glass_catalog

**Generert:** ${new Date().toISOString()}

## Oppsummering

| Status | Antall | Prosent |
|--------|--------|---------|
| ✅ OK (auto-glass exact) | ${stats.autoglassExact} | ${(stats.autoglassExact/stats.total*100).toFixed(1)}% |
| ⚠️ OK (auto-glass prefix4) | ${stats.autoglassPrefix} | ${(stats.autoglassPrefix/stats.total*100).toFixed(1)}% |
| 🔍 REVIEW (description) | ${stats.description} | ${(stats.description/stats.total*100).toFixed(1)}% |
| 🔴 HOLD (ukjent) | ${stats.unknown} | ${(stats.unknown/stats.total*100).toFixed(1)}% |
| **Totalt** | ${stats.total} | 100% |

## Posisjonsfordeling

| Posisjon | Antall | Beskrivelse |
|----------|--------|-------------|
| FR | ${stats.byPosition.FR || 0} | Frontrute |
| RR | ${stats.byPosition.RR || 0} | Bakrute |
| FD | ${stats.byPosition.FD || 0} | Dørrute fremme |
| RD | ${stats.byPosition.RD || 0} | Dørrute bak |
| FV | ${stats.byPosition.FV || 0} | Ventilrute fremme |
| RV | ${stats.byPosition.RV || 0} | Ventilrute bak |
| RQ | ${stats.byPosition.RQ || 0} | Siderute bakre |
| MQ | ${stats.byPosition.MQ || 0} | Åpnbar siderute |
| FQ | ${stats.byPosition.FQ || 0} | Quarter fremme |
| UNKNOWN | ${stats.byPosition.UNKNOWN || 0} | Ukjent |

## Sample — REVIEW (trenger verifisering)

| Eurocode | Brand | Model | Description | Parsed pos | Kilde |
|----------|-------|-------|-------------|------------|-------|
${reviewSamples.map(p => `| ${p.eurocode} | ${p.brand} | ${p.model} | ${p.description?.slice(0, 40)} | ${p.position} | ${p.parseSource} |`).join('\n')}

## Sample — HOLD (mangler posisjon)

| Eurocode | Brand | Model | Category | Beskrivelse |
|----------|-------|-------|----------|-------------|
${holdSamples.map(p => `| ${p.eurocode} | ${p.brand} | ${p.model} | ${p.category} | ${p.description?.slice(0, 50)} |`).join('\n')}

## Neste steg

1. **Manuell review** av REVIEW-rader (${stats.description} stk)
2. **Research** av HOLD-rader (${stats.unknown} stk) — sjekk auto-glass.no direkte
3. **Batch-oppdatering** av OK-rader til D1

## D1 Migration

\`\`\`sql
ALTER TABLE glass_catalog ADD COLUMN position TEXT;
ALTER TABLE glass_catalog ADD COLUMN side TEXT;
ALTER TABLE glass_catalog ADD COLUMN opening_type TEXT;
ALTER TABLE glass_catalog ADD COLUMN parse_status TEXT DEFAULT 'HOLD';
ALTER TABLE glass_catalog ADD COLUMN parse_source TEXT;
ALTER TABLE glass_catalog ADD COLUMN parse_confidence REAL DEFAULT 0;
\`\`\`
`;
}

function buildUpdateSQL(products, status) {
  const batch = products.filter(p => p.parseStatus === status).slice(0, 100);
  if (batch.length === 0) return null;
  
  const cases = batch.map(p => 
    `WHEN '${p.eurocode}' THEN '${p.position}'`
  ).join(' ');
  const codes = batch.map(p => `'${p.eurocode}'`).join(',');
  
  return `UPDATE glass_catalog SET position = CASE eurocode ${cases} END WHERE eurocode IN (${codes});`;
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  
  console.log('📊 Generating report...');
  const data = JSON.parse(readFileSync(DATA, 'utf-8'));
  const report = generateReport(data);
  writeFileSync(REPORT, report);
  console.log(`   Report: ${REPORT}`);
  
  const okCount = data.products.filter(p => p.parseStatus === 'OK').length;
  const reviewCount = data.products.filter(p => p.parseStatus === 'REVIEW').length;
  const holdCount = data.products.filter(p => p.parseStatus === 'HOLD').length;
  
  console.log(`\n📋 Status:`);
  console.log(`   OK: ${okCount}`);
  console.log(`   REVIEW: ${reviewCount}`);
  console.log(`   HOLD: ${holdCount}`);
  
  if (dryRun) {
    console.log('\n🧪 DRY RUN — no D1 changes');
    console.log(`   Would update ${okCount} products with status=OK`);
    console.log(`   ${reviewCount} products need manual REVIEW`);
    console.log(`   ${holdCount} products on HOLD`);
    console.log('\n📝 Run with --apply to write to D1');
    return;
  }
  
  console.log('\n⚡ Writing to D1...');
  
  // 1. Add columns
  try {
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN position TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN side TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN opening_type TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_status TEXT DEFAULT 'HOLD';`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_source TEXT;`);
    d1Execute(`ALTER TABLE glass_catalog ADD COLUMN parse_confidence REAL DEFAULT 0;`);
    console.log('   Columns added');
  } catch (e) {
    console.log('   Columns may already exist');
  }
  
  // 2. Batch update OK products
  const okProducts = data.products.filter(p => p.parseStatus === 'OK');
  const BATCH_SIZE = 50;
  let updated = 0;
  
  for (let i = 0; i < okProducts.length; i += BATCH_SIZE) {
    const batch = okProducts.slice(i, i + BATCH_SIZE);
    const cases = batch.map(p => `WHEN '${p.eurocode}' THEN '${p.position}'`).join(' ');
    const codes = batch.map(p => `'${p.eurocode}'`).join(',');
    const sql = `UPDATE glass_catalog SET position = CASE eurocode ${cases} END, parse_status = 'OK' WHERE eurocode IN (${codes});`;
    
    try {
      d1Execute(sql);
      updated += batch.length;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('X');
    }
  }
  
  console.log(`\n   Updated ${updated} products`);
  
  // 3. Update REVIEW products
  const reviewProducts = data.products.filter(p => p.parseStatus === 'REVIEW');
  let reviewUpdated = 0;
  
  for (let i = 0; i < reviewProducts.length; i += BATCH_SIZE) {
    const batch = reviewProducts.slice(i, i + BATCH_SIZE);
    const cases = batch.map(p => `WHEN '${p.eurocode}' THEN '${p.position}'`).join(' ');
    const codes = batch.map(p => `'${p.eurocode}'`).join(',');
    const sql = `UPDATE glass_catalog SET position = CASE eurocode ${cases} END, parse_status = 'REVIEW' WHERE eurocode IN (${codes});`;
    
    try {
      d1Execute(sql);
      reviewUpdated += batch.length;
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('X');
    }
  }
  
  console.log(`\n   Updated ${reviewUpdated} products with REVIEW status`);
  
  console.log('\n✅ Done!');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
