#!/usr/bin/env node
/**
 * Full price update pipeline:
 * 1. Scrape prices from auto-glass.no
 * 2. Update CSV
 * 3. Sync prices to catalog-prod.json
 * 4. Generate report
 *
 * Usage:
 *   node scripts/update-prices-full.mjs
 *   node scripts/update-prices-full.mjs --dry-run
 *   node scripts/update-prices-full.mjs --sample=N
 */
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SAMPLE_ARG = args.find(a => a.startsWith('--sample='));

function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ ${cmd} ${args.join(' ')}`);
    const child = spawn('node', [cmd, ...args], {
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', code => {
      if (code !== 0) reject(new Error(`Command failed with code ${code}`));
      else resolve();
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FULL PRICE UPDATE PIPELINE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Dry run: ${DRY_RUN}`);
  console.log(`   Started: ${new Date().toISOString()}\n`);

  // Step 1: Scrape prices
  const scrapeArgs = [];
  if (DRY_RUN) scrapeArgs.push('--dry-run');
  if (SAMPLE_ARG) scrapeArgs.push(SAMPLE_ARG);
  if (!SAMPLE_ARG && !args.includes('--full')) scrapeArgs.push('--full');

  await run('scripts/update-prices.mjs', scrapeArgs);

  if (DRY_RUN) {
    console.log('\n🔒 Dry run complete — no catalog changes');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Done in ${duration}s`);
    return;
  }

  // Check if there were changes
  const diffFile = 'data/autoglass-scrape/price-diff.json';
  if (existsSync(diffFile)) {
    const diff = JSON.parse(readFileSync(diffFile, 'utf-8'));
    if (diff.changes === 0 && diff.newSkus === 0) {
      console.log('\n✅ No price changes detected — skipping catalog sync');
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Done in ${duration}s`);
      return;
    }
    console.log(`\n📈 ${diff.changes} price changes detected — syncing to catalog`);
  }

  // Step 2: Sync to catalog
  await run('scripts/sync-prices-to-catalog.mjs');

  // Step 3: Upload to KV (optional — only if --upload flag)
  if (args.includes('--upload')) {
    console.log('\n☁️  Uploading catalog to KV...');
    await run('api/cf-worker/scripts/upload-catalog.ts');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`✅ Full pipeline complete in ${duration}s`);
  console.log(`═══════════════════════════════════════════════════════════════`);
}

main().catch(e => {
  console.error('\n❌ Pipeline failed:', e.message);
  process.exit(1);
});
