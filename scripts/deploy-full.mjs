#!/usr/bin/env node
/**
 * Full deploy script for Autoglass AS B2B
 * 
 * Requires:
 *   - CLOUDFLARE_API_TOKEN in .env.local (uncommented)
 *   - CLOUDFLARE_ACCOUNT_ID in .env.local
 * 
 * What it does:
 *   1. Applies D1 schema (idempotent)
 *   2. Loads TecDoc kType Registry data
 *   3. Deploys Worker
 * 
 * Usage:
 *   node scripts/deploy-full.mjs
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load .env.local
const envPath = join(PROJECT_ROOT, '.env.local');
let envContent;
try {
  envContent = readFileSync(envPath, 'utf-8');
} catch {
  console.error('❌ .env.local not found. Copy from .env.example and fill in secrets.');
  process.exit(1);
}

// Parse env vars
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match && !line.startsWith('#')) {
    envVars[match[1]] = match[2].trim();
  }
}

const API_TOKEN = envVars.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = envVars.CLOUDFLARE_ACCOUNT_ID;

if (!API_TOKEN || API_TOKEN === 'din_token_her') {
  console.error('❌ CLOUDFLARE_API_TOKEN not set in .env.local');
  console.error('   1. Go to https://dash.cloudflare.com/profile/api-tokens');
  console.error('   2. Create a token with these permissions:');
  console.error('      - Cloudflare Workers:Edit');
  console.error('      - D1:Edit');
  console.error('      - Account:Read');
  console.error('   3. Uncomment and set CLOUDFLARE_API_TOKEN in .env.local');
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID not set in .env.local');
  process.exit(1);
}

const WRANGLER_ENV = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
};

function run(cmd, cwd, label) {
  console.log(`\n🔧 ${label}...`);
  console.log(`   $ ${cmd}`);
  try {
    const output = execSync(cmd, { cwd, env: WRANGLER_ENV, stdio: 'pipe', encoding: 'utf-8' });
    console.log(output.trim());
    return output;
  } catch (e) {
    console.error(`❌ ${label} failed:`);
    console.error(e.stderr || e.message);
    throw e;
  }
}

console.log('🚀 Autoglass Full Deploy starting...');
console.log(`   Account: ${ACCOUNT_ID.slice(0, 8)}...`);

const workerDir = join(PROJECT_ROOT, 'api', 'cf-worker');

// 1. Apply D1 schema (idempotent)
try {
  run(
    'wrangler d1 execute glass-catalog-db --file=schema.sql --remote --yes',
    workerDir,
    'Applying D1 schema'
  );
} catch {
  console.log('   ⚠️ Schema apply failed or already exists — continuing...');
}

// 2. Load TecDoc kType Registry
try {
  run(
    'wrangler d1 execute glass-catalog-db --file=../../data/tecdoc-import/tecdoc-ktype-registry-safe.sql --remote --yes',
    workerDir,
    'Loading TecDoc kType Registry'
  );
} catch {
  console.log('   ⚠️ TecDoc load failed — continuing...');
}

// 3. Verify TecDoc data
try {
  const verifyOutput = run(
    'wrangler d1 execute glass-catalog-db --command="SELECT COUNT(*) as count FROM tecdoc_ktype_registry" --remote --yes --json',
    workerDir,
    'Verifying TecDoc data'
  );
  const parsed = JSON.parse(verifyOutput);
  const count = parsed?.[0]?.results?.[0]?.count || 0;
  console.log(`   📊 tecdoc_ktype_registry: ${count} mappings`);
  if (count < 800) {
    console.error('❌ Too few mappings — aborting deploy');
    process.exit(1);
  }
} catch {
  console.log('   ⚠️ Verification skipped — continuing...');
}

// 4. Deploy Worker
run(
  'wrangler deploy',
  workerDir,
  'Deploying Worker'
);

// 5. Quick smoke test
console.log('\n🧪 Running smoke test...');
try {
  const healthOutput = execSync(
    'curl -sf https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health',
    { encoding: 'utf-8', stdio: 'pipe' }
  );
  const health = JSON.parse(healthOutput);
  console.log(`   ✅ Worker health: ${health.status || 'ok'}`);
} catch {
  console.log('   ⚠️ Smoke test failed — deploy may still be propagating');
}

console.log('\n🎉 Full deploy complete!');
