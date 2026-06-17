#!/usr/bin/env node
/**
 * Upload gzipped equipment profiles to Cloudflare KV.
 *
 * Usage:
 *   node scripts/upload-equipment-profiles-to-kv.mjs [--local] [--env <path>]
 *
 * The profile is read from data/ktype-equipment-profiles.json, gzipped,
 * and stored under the key "equipment:profiles:v1".
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';

const INPUT_PATH = './data/ktype-equipment-profiles.json';
const KV_KEY = 'equipment:profiles:v1';
const KV_BINDING = 'GLASS_CATALOG';

const args = process.argv.slice(2);
const localFlag = args.includes('--local');
const remoteFlag = args.includes('--remote');
const envIndex = args.indexOf('--env');
const envFile = envIndex !== -1 ? args[envIndex + 1] : null;

async function main() {
  console.log('📦 Preparing equipment profile upload...');

  const inputPath = path.resolve(INPUT_PATH);
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Profile file not found: ${inputPath}`);
    console.error('   Run: node scripts/build-ktype-equipment-profile.mjs');
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath);
  const compressed = gzipSync(raw);
  console.log(`   Raw size: ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Gzipped:  ${(compressed.length / 1024).toFixed(2)} KB`);

  // Write a temporary file for wrangler to upload
  const tmpFile = path.join(process.cwd(), '.tmp-equipment-profiles.json.gz');
  fs.writeFileSync(tmpFile, compressed);

  try {
    const envArg = envFile ? `--env ${envFile}` : '';
    const locationArg = remoteFlag ? '--remote' : localFlag ? '--local' : '--remote';
    const cmd = `npx wrangler kv key put "${KV_KEY}" --path="${tmpFile}" --binding=${KV_BINDING} ${envArg} ${locationArg}`.trim();

    console.log(`\n🚀 Uploading to KV...`);
    console.log(`   ${cmd}`);

    execSync(cmd, {
      stdio: 'inherit',
      cwd: path.resolve('./api/cf-worker'),
    });

    console.log(`\n✅ Upload complete.`);
    console.log(`   Key: ${KV_KEY}`);
    console.log(`   Binding: ${KV_BINDING}`);
  } catch (e) {
    console.error('\n❌ Upload failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
