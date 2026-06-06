#!/usr/bin/env node
/**
 * Generate browse data from D1 and upload to KV
 *
 * Usage:
 *   node scripts/generate-browse-data.mjs
 *
 * What it does:
 *   1. Queries D1 glass_catalog for all unique brands with product counts
 *   2. For each brand: queries models, years, and products
 *   3. Builds JSON in BrowsePage expected format
 *   4. Uploads to KV as browse:brands and browse:brand:{name}
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

const D1_DB_NAME = "glass-catalog-db";
const KV_NAMESPACE_ID = "15099e572e51423dafb723996c01c668";

function wranglerD1(sql) {
  const cmd = `npx wrangler d1 execute ${D1_DB_NAME} --remote --command '${sql.replace(/'/g, "'\\''")}' --json 2>&1`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout: 60000 });
    // Wrangler v4 may print telemetry warning before JSON; find first '['
    const jsonStart = output.indexOf('[');
    if (jsonStart === -1) {
      console.error("No JSON array found in output:", output.slice(0, 200));
      return null;
    }
    return JSON.parse(output.slice(jsonStart));
  } catch (e) {
    console.error("D1 query failed:", e.message);
    return null;
  }
}

function wranglerKVSync(key, value) {
  const jsonStr = JSON.stringify(value);
  const tmpFile = `/tmp/kv-${key.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.json`;
  writeFileSync(tmpFile, jsonStr);
  
  const cmd = `npx wrangler kv key put "${key}" --namespace-id=${KV_NAMESPACE_ID} --path="${tmpFile}" --remote`;
  try {
    execSync(cmd, { encoding: "utf-8", timeout: 60000 });
    unlinkSync(tmpFile);
    return true;
  } catch (e) {
    console.error(`KV put failed for ${key}:`, e.message);
    try { unlinkSync(tmpFile); } catch {}
    return false;
  }
}

function main() {
  console.log("=== Generate Browse Data from D1 → KV ===\n");

  // ── Step 1: Get all brands with product counts ──
  console.log("Fetching brands from D1...");
  const brandsResult = wranglerD1(
    `SELECT brand, COUNT(*) as productCount FROM glass_catalog WHERE brand IS NOT NULL AND brand != '' GROUP BY brand ORDER BY productCount DESC`
  );

  if (!brandsResult || !brandsResult[0]?.results) {
    console.error("Failed to fetch brands. Raw output:", JSON.stringify(brandsResult).slice(0, 500));
    process.exit(1);
  }

  const brands = brandsResult[0].results.map((r) => ({
    name: r.brand,
    productCount: r.productCount,
  }));

  console.log(`  Found ${brands.length} brands`);
  console.log(`  Top 5: ${brands.slice(0, 5).map(b => `${b.name}(${b.productCount})`).join(", ")}\n`);

  // Upload brands list
  console.log("Uploading browse:brands to KV...");
  const brandsUploaded = wranglerKVSync("browse:brands", { brands });
  if (!brandsUploaded) {
    console.error("Failed to upload brands list");
    process.exit(1);
  }
  console.log("  ✓ browse:brands uploaded\n");

  // ── Step 2: For each brand, get models, years, and products ──
  let uploadedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const safeName = brand.name.replace(/\//g, "-").replace(/ /g, "_");
    const kvKey = `browse:brand:${safeName}`;

    process.stdout.write(`[${i + 1}/${brands.length}] ${brand.name}... `);

    // Get all products for this brand (use correct column names from D1 schema)
    const sql = `SELECT model, year_from, year_to, eurocode as title, article_number as sku, position as typeCode, category as typeCodeRel, price FROM glass_catalog WHERE brand = '${brand.name.replace(/'/g, "''")}' ORDER BY model, year_from`;
    const productsResult = wranglerD1(sql);

    if (!productsResult || !productsResult[0]?.results) {
      console.log("⚠️ no data");
      skippedCount++;
      continue;
    }

    const rows = productsResult[0].results;

    // Group by model → year → products
    const brandData = {
      name: brand.name,
      models: {},
    };

    for (const row of rows) {
      const model = row.model || "Ukjent modell";
      const year = row.year_from ? String(row.year_from) : "alle";

      if (!brandData.models[model]) {
        brandData.models[model] = {};
      }
      if (!brandData.models[model][year]) {
        brandData.models[model][year] = {
          url: `/browse/${encodeURIComponent(brand.name)}/${encodeURIComponent(model)}/${year}`,
          products: [],
        };
      }

      brandData.models[model][year].products.push({
        title: row.title || `${brand.name} ${model} ${year}`,
        sku: row.sku || null,
        typeCode: row.typeCode || null,
        typeCodeRel: row.typeCodeRel || null,
        price: row.price || null,
      });
    }

    // Upload to KV
    const uploaded = wranglerKVSync(kvKey, brandData);
    if (uploaded) {
      const modelCount = Object.keys(brandData.models).length;
      console.log(`✓ ${modelCount} models, ${rows.length} products`);
      uploadedCount++;
    } else {
      console.log("✗ upload failed");
      skippedCount++;
    }

    // Small delay to avoid rate limiting
    // We use execSync which is blocking, so no explicit delay needed
    // But let's be nice to the API
    // (wrangler kv put is rate limited to ~50 req/10s on free plan)
  }

  console.log(`\n=== Done ===`);
  console.log(`  Brands uploaded: ${uploadedCount}/${brands.length}`);
  console.log(`  Brands skipped:  ${skippedCount}/${brands.length}`);
}

main();
