#!/usr/bin/env node
/**
 * 05-review-tool.mjs
 * Interactive CLI tool for manual review of position categorization.
 * Usage: node 05-review-tool.mjs [--batch-size N] [--filter source]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

const DATA = 'data/autoglass-scrape/catalog-with-positions.json';
const DECISIONS = 'data/position-audit/review-decisions.json';
const POSITIONS = ['FR', 'RR', 'FD', 'RD', 'FV', 'RV', 'RQ', 'MQ', 'FQ', 'HOLD', 'UNKNOWN'];

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

async function main() {
  const batchSize = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--batch-size') || '20');
  const filterSource = process.argv.find((a, i) => process.argv[i - 1] === '--filter') || null;

  const data = JSON.parse(readFileSync(DATA, 'utf-8'));
  const products = data.products;

  // Load existing decisions
  const decisions = existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf-8')) : {};

  // Find review items not yet decided
  let reviewItems = products.filter(p => p.parseStatus === 'REVIEW' && !decisions[p.eurocode]);
  if (filterSource) {
    reviewItems = reviewItems.filter(p => p.parseSource === filterSource);
  }

  console.log(`\n🔍 Review Tool — ${reviewItems.length} items pending`);
  console.log(`   Batch size: ${batchSize}`);
  if (filterSource) console.log(`   Filter: ${filterSource}`);
  console.log(`\nCommands: y = accept, n = reject (HOLD), s = skip, q = quit`);
  console.log(`Positions: ${POSITIONS.join(', ')}\n`);

  let reviewed = 0;
  let accepted = 0;
  let rejected = 0;

  for (let i = 0; i < Math.min(batchSize, reviewItems.length); i++) {
    const p = reviewItems[i];
    console.log(`\n[${i + 1}/${Math.min(batchSize, reviewItems.length)}] ${p.eurocode}`);
    console.log(`   Brand: ${p.brand} | Model: ${p.model}`);
    console.log(`   Category: ${p.category} | Proposed: ${p.position} | Source: ${p.parseSource}`);
    if (p.warnings?.length) console.log(`   Warnings: ${p.warnings.join(', ')}`);

    const answer = await ask(`   Accept ${p.position}? (y/n/s/q/custom): `);

    if (answer.toLowerCase() === 'q') {
      console.log('   Quitting...');
      break;
    }
    if (answer.toLowerCase() === 's') {
      console.log('   Skipped');
      continue;
    }

    if (answer.toLowerCase() === 'y') {
      decisions[p.eurocode] = { status: 'OK', position: p.position, side: p.side, reviewedAt: new Date().toISOString() };
      accepted++;
      console.log('   ✅ Accepted');
    } else if (answer.toLowerCase() === 'n') {
      decisions[p.eurocode] = { status: 'HOLD', position: null, side: null, reviewedAt: new Date().toISOString() };
      rejected++;
      console.log('   ❌ Rejected (HOLD)');
    } else if (POSITIONS.includes(answer.toUpperCase())) {
      decisions[p.eurocode] = { status: 'OK', position: answer.toUpperCase(), side: p.side, reviewedAt: new Date().toISOString() };
      accepted++;
      console.log(`   ✅ Accepted as ${answer.toUpperCase()}`);
    } else {
      console.log('   ⚠️ Unknown command, skipped');
    }

    reviewed++;

    // Save every 5 items
    if (reviewed % 5 === 0) {
      writeFileSync(DECISIONS, JSON.stringify(decisions, null, 2));
      console.log(`   💾 Saved (${Object.keys(decisions).length} total decisions)`);
    }
  }

  // Final save
  writeFileSync(DECISIONS, JSON.stringify(decisions, null, 2));

  console.log(`\n📊 Session Summary`);
  console.log(`   Reviewed: ${reviewed}`);
  console.log(`   Accepted: ${accepted}`);
  console.log(`   Rejected: ${rejected}`);
  console.log(`   Total decisions: ${Object.keys(decisions).length}`);
  console.log(`   Remaining: ${reviewItems.length - reviewed}`);
  console.log(`\n   Decisions saved to: ${DECISIONS}`);

  rl.close();
}

main().catch(e => { console.error('❌', e); rl.close(); process.exit(1); });
