#!/usr/bin/env node
/**
 * Generate D1 SQL inserts from Bovsoft-verified regnr
 * ====================================================
 *
 * Reads verified-bovsoft.ndjson and generates SQL INSERT statements
 * for the ktype_matches table.
 *
 * Usage:
 *   node scripts/generate-ktype-inserts.mjs [--input=PATH] [--output=PATH]
 *
 * Output:
 *   - SQL file with INSERT OR REPLACE statements
 *   - Metadata about what will be inserted
 *
 * To apply to D1:
 *   wrangler d1 execute glass-catalog-db --remote --file generated-ktype-inserts.sql
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const DEFAULT_CONFIG = {
  input: resolve(process.cwd(), "data", "finn-no-regnr", "verified-bovsoft.ndjson"),
  output: resolve(process.cwd(), "data", "finn-no-regnr", "generated-ktype-inserts.sql"),
  metaOutput: resolve(process.cwd(), "data", "finn-no-regnr", "ktype-insert-meta.json"),
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--input=")) opts.input = arg.split("=")[1];
    if (arg.startsWith("--output=")) opts.output = arg.split("=")[1];
  }
  return opts;
}

async function main() {
  const config = parseArgs();

  if (!existsSync(config.input)) {
    console.error("❌ Input file not found:", config.input);
    console.error("Run verify-with-bovsoft.mjs first.");
    process.exit(1);
  }

  // Read verified records
  const lines = readFileSync(config.input, "utf-8").split("\n");
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {}
  }

  console.log("📊 Generating D1 SQL inserts");
  console.log("=============================");
  console.log(`   Input records: ${records.length}`);

  // Build ktype → {eurocodes, metadata} mapping
  // Since we don't know eurocodes yet, we'll create INSERT statements
  // that can be joined with glass_catalog later, or we can add a placeholder
  //
  // Actually, ktype_matches needs eurocode. We need to either:
  // 1. Query glass_catalog to find matching eurocodes for each ktype
  // 2. Insert with a placeholder and update later
  // 3. Use a separate table for raw ktype data
  //
  // Best approach: Create a staging table for raw ktype → vehicle data,
  // then use Worker logic to match with glass_catalog.
  //
  // For now, let's generate inserts for a new table: ktype_registry
  // which stores the raw Bovsoft data (regnr, ktype, brand, model, year)
  // This is GDPR-safe because we can delete regnr after processing.

  // Actually, looking at the existing schema, ktype_matches is designed
  // for (ktype, eurocode) pairs with hit_count. We need eurocodes.
  //
  // Let's create a staging table insert first, then a separate script
  // can join with glass_catalog to populate ktype_matches.

  const sql = [];
  sql.push("-- Generated kType inserts from Finn.no + Bovsoft");
  sql.push(`-- Generated at: ${new Date().toISOString()}`);
  sql.push(`-- Source: ${records.length} verified records, ${new Set(records.map(r => r.ktype)).size} unique kTypes`);
  sql.push("");

  // Create staging table if not exists
  sql.push("CREATE TABLE IF NOT EXISTS ktype_registry (");
  sql.push("  id INTEGER PRIMARY KEY AUTOINCREMENT,");
  sql.push("  ktype INTEGER NOT NULL,");
  sql.push("  brand TEXT,");
  sql.push("  model TEXT,");
  sql.push("  year_from INTEGER,");
  sql.push("  year_to INTEGER,");
  sql.push("  body TEXT,");
  sql.push("  source TEXT DEFAULT 'finn_bovsoft',");
  sql.push("  created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
  sql.push(");");
  sql.push("CREATE INDEX IF NOT EXISTS idx_ktype_registry_ktype ON ktype_registry(ktype);");
  sql.push("CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);");
  sql.push("");

  // Insert unique ktypes
  const seenKtypes = new Set();
  let insertCount = 0;

  for (const r of records) {
    const ktype = parseInt(r.ktype, 10);
    if (seenKtypes.has(ktype)) continue;
    seenKtypes.add(ktype);

    const brand = (r.brand || "").replace(/'/g, "''");
    const model = (r.model || "").replace(/'/g, "''");
    const yearFrom = r.yearFrom || "NULL";
    const yearTo = r.yearTo || "NULL";
    const body = (r.body || "").replace(/'/g, "''");

    sql.push(
      `INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) ` +
      `VALUES (${ktype}, '${brand}', '${model}', ${yearFrom}, ${yearTo}, '${body}', 'finn_bovsoft') ` +
      `ON CONFLICT DO NOTHING;`
    );
    insertCount++;
  }

  sql.push("");
  sql.push(`-- Total inserts: ${insertCount}`);

  writeFileSync(config.output, sql.join("\n"));

  // Generate metadata
  const byBrand = {};
  const byYear = {};
  for (const r of records) {
    const b = r.brand || "Unknown";
    byBrand[b] = (byBrand[b] || 0) + 1;
    const y = r.yearFrom ? String(r.yearFrom).slice(0, 4) : "Unknown";
    byYear[y] = (byYear[y] || 0) + 1;
  }

  const meta = {
    totalRecords: records.length,
    uniqueKtypes: seenKtypes.size,
    insertsGenerated: insertCount,
    byBrand,
    byYear,
    sqlFile: config.output,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(config.metaOutput, JSON.stringify(meta, null, 2));

  console.log(`\n✅ Generated ${insertCount} SQL inserts`);
  console.log(`   SQL: ${config.output}`);
  console.log(`   Meta: ${config.metaOutput}`);
  console.log("\n   To apply to D1:");
  console.log(`   wrangler d1 execute glass-catalog-db --remote --file ${config.output}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
