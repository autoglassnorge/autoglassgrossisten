#!/usr/bin/env node
/**
 * Compute prefix4 (first 4 chars of eurocode) for all glass_catalog records.
 * Trivial operation — prefix4 is derived directly from eurocode.
 */
import { execSync } from 'child_process';
import { writeFile } from 'fs/promises';

function fetchCatalog() {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute GLASS_CATALOG_D1 --local --command="SELECT id, eurocode FROM glass_catalog WHERE eurocode IS NOT NULL AND (prefix4 IS NULL OR prefix4 = '')" --json`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
  // Wrangler outputs JSON array: [{results: [{...}], success: true, meta: {...}}]
  try {
    const parsed = JSON.parse(output.trim());
    if (Array.isArray(parsed) && parsed[0]?.results) {
      return parsed[0].results;
    }
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results;
    }
  } catch {
    // Fallback: line-by-line parsing
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] !== '[') continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed[0]?.results) return parsed[0].results;
      } catch { /* continue */ }
    }
  }
  throw new Error('Could not parse D1 output');
}

async function main() {
  console.log('Fetching catalog records without prefix4...');
  const records = fetchCatalog();
  console.log(`  ${records.length} records need prefix4`);

  if (records.length === 0) {
    console.log('All records already have prefix4. Nothing to do.');
    return;
  }

  const updates = records.map(r => {
    const prefix4 = r.eurocode ? String(r.eurocode).substring(0, 4).toUpperCase() : null;
    return { id: r.id, eurocode: r.eurocode, prefix4 };
  }).filter(u => u.prefix4 && u.prefix4.length === 4);

  console.log(`  ${updates.length} valid updates`);

  // Generate SQL
  const sql = updates.map(u =>
    `UPDATE glass_catalog SET prefix4 = '${u.prefix4}' WHERE id = ${u.id};`
  ).join('\n');

  const header = `-- prefix4 update (${updates.length} records)\n-- Generated: ${new Date().toISOString()}\n\nBEGIN TRANSACTION;\n\n`;
  const footer = `\n\nCOMMIT;`;

  await writeFile('data/prefix4-updates.sql', header + sql + footer);
  console.log('SQL saved to: data/prefix4-updates.sql');
  console.log('Apply with: npx wrangler d1 execute GLASS_CATALOG_D1 --local --file=data/prefix4-updates.sql');
}

main().catch(e => { console.error(e); process.exit(1); });
