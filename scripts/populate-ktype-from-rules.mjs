#!/usr/bin/env node
/**
 * Populate kType for glass_catalog products using glass_rules data.
 * Builds SQL batches and executes via wrangler.
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SQL_FILE = resolve(ROOT, 'data/populate-ktype.sql');

function d1Query(sql) {
  const cmd = `cd ${resolve(ROOT, 'api/cf-worker')} && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const jsonMatch = output.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!jsonMatch) throw new Error('Could not parse D1 output: ' + output.slice(0, 200));
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed[0]?.results || [];
}

async function main() {
  console.log('🔍 Populating kType from glass_rules...\n');

  // Get all glass_rules with kType
  const rules = d1Query(`SELECT normalized_key, ktype FROM glass_rules WHERE ktype IS NOT NULL AND active = 1`);
  console.log(`📋 Found ${rules.length} glass_rules with kType`);

  // Build SQL
  const sqlLines = [];
  sqlLines.push(`-- Auto-generated kType population from glass_rules`);
  sqlLines.push(`-- Generated: ${new Date().toISOString()}`);
  sqlLines.push('');

  for (const rule of rules) {
    const key = rule.normalized_key;
    const ktype = rule.ktype;
    const parts = key.split(':');
    if (parts.length < 3) continue;

    const brand = parts[0].toUpperCase();
    const year = parseInt(parts[2].slice(0, 4), 10);
    if (!year || isNaN(year)) continue;

    // Simple approach: update by brand + year overlap
    // Model matching is tricky, so we do brand + year range only
    sqlLines.push(`UPDATE glass_catalog SET ktype = ${ktype} WHERE brand = '${brand}' AND year_from <= ${year} AND year_to >= ${year} AND (ktype IS NULL OR ktype = 0);`);
  }

  sqlLines.push('');
  sqlLines.push(`SELECT COUNT(*) as with_ktype FROM glass_catalog WHERE ktype IS NOT NULL AND ktype > 0;`);

  writeFileSync(SQL_FILE, sqlLines.join('\n'));
  console.log(`📝 SQL file: ${SQL_FILE} (${sqlLines.length} lines)`);

  // Execute
  console.log('\n🚀 Executing on D1...');
  const cmd = `cd ${resolve(ROOT, 'api/cf-worker')} && npx wrangler d1 execute glass-catalog-db --remote --file=${SQL_FILE} --yes 2>&1`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  console.log(output);

  console.log('\n✅ kType population complete!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
