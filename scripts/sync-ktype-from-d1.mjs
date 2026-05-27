#!/usr/bin/env node
/**
 * Sync ktype values from D1 back to local catalog-prod.json
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

function d1Query(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf-8' });
  const jsonMatch = out.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not parse D1 output');
  const data = JSON.parse(jsonMatch[0]);
  return data[0].results;
}

async function main() {
  console.log('🔄 Syncing ktype from D1 to catalog-prod.json...\n');
  
  // Load catalog
  const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
  console.log(`📂 Catalog products: ${catalog.records.length}`);
  
  // Fetch all products with ktype from D1
  const rows = d1Query(`SELECT eurocode, ktype FROM glass_catalog WHERE ktype IS NOT NULL`);
  console.log(`📊 Products with ktype in D1: ${rows.length}`);
  
  // Build eurocode → ktype map
  const ktypeMap = new Map();
  for (const row of rows) {
    ktypeMap.set(row.eurocode, row.ktype);
  }
  
  // Update local catalog
  let updated = 0;
  for (const product of catalog.records) {
    const ktype = ktypeMap.get(product.eurocode);
    if (ktype !== undefined && product.ktype !== ktype) {
      product.ktype = ktype;
      updated++;
    }
  }
  
  console.log(`✅ Updated ${updated} products in local catalog`);
  
  // Save
  catalog.meta = catalog.meta || {};
  catalog.meta.ktypeSyncedAt = new Date().toISOString();
  catalog.meta.productsWithKtype = rows.length;
  
  writeFileSync('data/catalog-prod.json', JSON.stringify(catalog, null, 2));
  console.log(`💾 Saved to data/catalog-prod.json`);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
