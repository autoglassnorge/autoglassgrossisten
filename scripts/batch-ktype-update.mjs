#!/usr/bin/env node
/**
 * Batch kType Matches Update (v3 — Direct D1 Execution)
 * =======================================================
 * Efficiently bulk-insert or bulk-update ktype_matches from NDJSON or CSV.
 * Supports both SQL generation AND direct D1 execution via Cloudflare REST API.
 *
 * D1 batch constraints (verified 2026-05-29):
 *   - Max 100 SQL statements per batch via REST API
 *   - Max ~1 MB total request size
 *   - This script auto-chunks into safe batch sizes
 *
 * Usage:
 *   # Generate SQL only (default)
 *   node scripts/batch-ktype-update.mjs [--input=PATH] [--format=ndjson|csv] [--dry-run]
 *
 *   # Execute directly against D1 via Cloudflare API
 *   node scripts/batch-ktype-update.mjs --input=PATH --execute --db-id=UUID
 *
 *   # Upsert from verified Bovsoft results (auto-extracts ktype→eurocode)
 *   node scripts/batch-ktype-update.mjs --input=data/finn-no-regnr/verified-bovsoft.ndjson --format=bovsoft
 *
 * Env vars:
 *   CLOUDFLARE_ACCOUNT_ID  (required for --execute)
 *   CLOUDFLARE_API_TOKEN   (required for --execute)
 *   D1_DATABASE_ID         (or pass --db-id)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const DEFAULT_CONFIG = {
  input: resolve(process.cwd(), "data", "finn-no-regnr", "ktype-matches-seed.ndjson"),
  format: "ndjson", // ndjson | csv | bovsoft
  dryRun: false,
  execute: false,
  dbId: process.env.D1_DATABASE_ID || "",
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  apiToken: process.env.CLOUDFLARE_API_TOKEN || "",
  batchSize: 90, // Stay under D1's 100-statement limit with headroom
  apiBatchSize: 50, // Cloudflare D1 REST API safest batch size
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--input=")) opts.input = arg.split("=")[1];
    if (arg.startsWith("--format=")) opts.format = arg.split("=")[1];
    if (arg.startsWith("--db-id=")) opts.dbId = arg.split("=")[1];
    if (arg.startsWith("--account-id=")) opts.accountId = arg.split("=")[1];
    if (arg.startsWith("--api-token=")) opts.apiToken = arg.split("=")[1];
    if (arg === "--dry-run") opts.dryRun = true;
    if (arg === "--execute") opts.execute = true;
  }
  return opts;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Cloudflare D1 REST API — batch execution
// ---------------------------------------------------------------------------
async function executeD1Batch(accountId, dbId, apiToken, queries) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: queries.join(";") }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 API failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function executeBatchesViaApi(config, sqlStatements) {
  if (!config.accountId || !config.apiToken || !config.dbId) {
    console.error("❌ Missing Cloudflare credentials for --execute");
    console.error("   Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID");
    process.exit(1);
  }

  const batches = chunk(sqlStatements, config.apiBatchSize);
  console.log(`\n🚀 Executing ${sqlStatements.length} statements in ${batches.length} API batches...`);

  let totalRows = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`   API batch ${i + 1}/${batches.length} (${batch.length} stmts) ... `);
    try {
      const result = await executeD1Batch(config.accountId, config.dbId, config.apiToken, batch);
      const rowsAffected = Array.isArray(result)
        ? result.reduce((sum, r) => sum + (r.meta?.rows_written || 0), 0)
        : 0;
      totalRows += rowsAffected;
      console.log(`✅ ${rowsAffected} rows affected`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      // Save failed batch for retry
      const failPath = resolve(process.cwd(), "data", "finn-no-regnr", `batch-fail-${Date.now()}.sql`);
      writeFileSync(failPath, batch.join(";\n"));
      console.log(`   💾 Failed batch saved: ${failPath}`);
    }
    // Small rate-limit pause between API batches
    if (i < batches.length - 1) await sleep(500);
  }
  console.log(`\n📊 Total rows affected: ${totalRows}`);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
function loadRows(config) {
  if (!existsSync(config.input)) {
    console.error("❌ Input file not found:", config.input);
    process.exit(1);
  }

  let rows = [];

  if (config.format === "csv") {
    // Simple CSV parser (no external deps)
    const text = readFileSync(config.input, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    const headers = lines[0].split(",").map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row = {};
      headers.forEach((h, idx) => (row[h] = values[idx]));
      rows.push({
        ktype: parseInt(row.ktype, 10),
        eurocode: row.eurocode?.trim().toUpperCase(),
        hit_count: parseInt(row.hit_count, 10) || 1,
      });
    }
  } else if (config.format === "bovsoft") {
    // Extract (ktype, eurocode) from Bovsoft verified NDJSON
    // eurocode comes from separate mapping; for now we seed hit_count=1
    const lines = readFileSync(config.input, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.ktype) {
          rows.push({
            ktype: parseInt(r.ktype, 10),
            eurocode: null, // Will be learned later by Worker
            hit_count: 1,
            source: "bovsoft_seed",
          });
        }
      } catch {}
    }
  } else {
    // NDJSON
    const lines = readFileSync(config.input, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        const eurocode = r.eurocode ? String(r.eurocode).trim().toUpperCase() : "";
        if (!eurocode || eurocode === "UNDEFINED" || eurocode === "NULL") continue;
        rows.push({
          ktype: parseInt(r.ktype, 10),
          eurocode,
          hit_count: parseInt(r.hit_count, 10) || 1,
        });
      } catch {
        // skip malformed
      }
    }
  }

  // Deduplicate by (ktype, eurocode), keeping highest hit_count
  const deduped = new Map();
  for (const r of rows) {
    if (!r.ktype || !r.eurocode) continue;
    const key = `${r.ktype}:${r.eurocode}`;
    const existing = deduped.get(key);
    if (!existing || r.hit_count > existing.hit_count) {
      deduped.set(key, r);
    }
  }
  return Array.from(deduped.values());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const config = parseArgs();

  const rows = loadRows(config);

  console.log("📦 Batch kType Matches Update (v3)");
  console.log("====================================");
  console.log(`   Input: ${config.input}`);
  console.log(`   Format: ${config.format}`);
  console.log(`   Valid rows: ${rows.length}`);
  console.log(`   SQL batch size: ${config.batchSize}`);
  console.log(`   API batch size: ${config.apiBatchSize}`);
  console.log(`   Execute: ${config.execute ? "YES (live D1)" : "NO (SQL generation only)"}`);
  if (config.dryRun) {
    console.log("   ⚠️  DRY RUN — no DB changes\n");
  }

  // ---------------------------------------------------------------------------
  // Generate SQL (multi-value INSERT = most efficient for D1)
  // ---------------------------------------------------------------------------
  const sqlStatements = [];

  const batches = chunk(rows, config.batchSize);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const values = batch
      .map((r) => `(${r.ktype}, '${r.eurocode.replace(/'/g, "''")}', ${r.hit_count}, datetime('now'), datetime('now'))`)
      .join(",\n");

    const stmt =
      `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen) VALUES ` +
      values +
      ` ON CONFLICT(ktype, eurocode) DO UPDATE SET ` +
      `hit_count = MAX(hit_count, excluded.hit_count), ` +
      `last_seen = datetime('now');`;

    sqlStatements.push(stmt);
  }

  console.log(`   SQL statements: ${sqlStatements.length}`);

  // ---------------------------------------------------------------------------
  // Execute or save
  // ---------------------------------------------------------------------------
  if (config.execute && !config.dryRun) {
    await executeBatchesViaApi(config, sqlStatements);
  }

  const sqlOutput = resolve(process.cwd(), "data", "finn-no-regnr", "batch-ktype-matches.sql");
  if (!config.dryRun) {
    writeFileSync(sqlOutput, sqlStatements.map((s) => s + "\n").join("\n"));
    console.log(`\n✅ SQL written: ${sqlOutput}`);
    if (!config.execute) {
      console.log("\n   Apply with:");
      console.log(`   wrangler d1 execute glass-catalog-db --remote --file ${sqlOutput}`);
    }
  } else {
    console.log("\n📝 Dry-run SQL preview (first statement):");
    if (sqlStatements.length > 0) {
      console.log(sqlStatements[0].slice(0, 800) + "...\n");
    } else {
      console.log("(no statements generated)\n");
    }
  }

  // Summary
  const byKtype = new Map();
  for (const r of rows) {
    byKtype.set(r.ktype, (byKtype.get(r.ktype) || 0) + 1);
  }

  console.log(`\n📊 Summary`);
  console.log(`   Unique ktypes: ${byKtype.size}`);
  console.log(`   Total mappings: ${rows.length}`);
  console.log(`   Batches: ${batches.length}`);
  console.log(`   Avg mappings per ktype: ${byKtype.size ? (rows.length / byKtype.size).toFixed(1) : 0}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
