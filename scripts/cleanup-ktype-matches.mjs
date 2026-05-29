#!/usr/bin/env node
/**
 * Cleanup ktype_matches — Maintenance Script
 * ============================================
 * Removes low-frequency noise to prevent table bloat from one-off errors.
 * Also archives deleted rows before removal for audit purposes.
 *
 * Rules:
 *   - DELETE WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days')
 *   - Optionally also DELETE WHERE hit_count = 2 AND last_seen < datetime('now', '-60 days')
 *
 * Usage:
 *   # Dry-run (default)
 *   node scripts/cleanup-ktype-matches.mjs
 *
 *   # Live execution via D1 API
 *   node scripts/cleanup-ktype-matches.mjs --execute [--aggressive]
 *
 *   # Generate SQL only
 *   node scripts/cleanup-ktype-matches.mjs --sql-only
 *
 * Env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   D1_DATABASE_ID
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const DEFAULT_CONFIG = {
  execute: false,
  sqlOnly: false,
  aggressive: false,
  dbId: process.env.D1_DATABASE_ID || "",
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  apiToken: process.env.CLOUDFLARE_API_TOKEN || "",
  archiveDir: resolve(process.cwd(), "data", "ktype-recon"),
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--db-id=")) opts.dbId = arg.split("=")[1];
    if (arg === "--execute") opts.execute = true;
    if (arg === "--sql-only") opts.sqlOnly = true;
    if (arg === "--aggressive") opts.aggressive = true;
  }
  return opts;
}

async function executeD1Command(accountId, dbId, apiToken, sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
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

async function main() {
  const config = parseArgs();

  console.log("🧹 ktype_matches Cleanup");
  console.log("========================");
  console.log(`   Aggressive: ${config.aggressive ? "YES" : "NO"}`);
  console.log(`   Execute: ${config.execute ? "LIVE D1" : "DRY RUN"}`);
  console.log("");

  // ---------------------------------------------------------------------------
  // Build SQL
  // ---------------------------------------------------------------------------
  const sqlLines = [];

  // Count before cleanup
  sqlLines.push("-- Count rows before cleanup");
  sqlLines.push("SELECT 'before_total' AS metric, COUNT(*) AS cnt FROM ktype_matches;");
  sqlLines.push("SELECT 'before_noise_1' AS metric, COUNT(*) AS cnt FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');");

  if (config.aggressive) {
    sqlLines.push("SELECT 'before_noise_2' AS metric, COUNT(*) AS cnt FROM ktype_matches WHERE hit_count = 2 AND last_seen < datetime('now', '-60 days');");
  }

  sqlLines.push("");

  // Archive query (for audit — GDPR-safe, no regnr)
  sqlLines.push("-- Archive low-confidence rows before deletion (run separately if needed)");
  sqlLines.push(`-- SELECT ktype, eurocode, hit_count, first_seen, last_seen FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');`);
  sqlLines.push("");

  // Delete noise
  sqlLines.push("-- Remove low-frequency noise (>30 days old, single hit)");
  sqlLines.push("DELETE FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');");

  if (config.aggressive) {
    sqlLines.push("-- Remove medium-frequency noise (>60 days old, 2 hits)");
    sqlLines.push("DELETE FROM ktype_matches WHERE hit_count = 2 AND last_seen < datetime('now', '-60 days');");
  }

  sqlLines.push("");

  // Vacuum hint (D1 auto-vacuums, but good for documentation)
  sqlLines.push("-- D1 auto-vacuum runs periodically; manual VACUUM not needed");
  sqlLines.push("SELECT 'after_total' AS metric, COUNT(*) AS cnt FROM ktype_matches;");

  const sqlText = sqlLines.join("\n");
  const sqlPath = resolve(process.cwd(), "data", "ktype-recon", "cleanup-ktype-matches.sql");
  mkdirSync(dirname(sqlPath), { recursive: true });
  writeFileSync(sqlPath, sqlText);

  console.log(`📄 SQL saved: ${sqlPath}`);

  // ---------------------------------------------------------------------------
  // Dry-run preview
  // ---------------------------------------------------------------------------
  if (!config.execute) {
    console.log("\n📝 Dry-run SQL preview:");
    console.log(sqlText);
    console.log("\n✅ Dry run complete. Use --execute to apply to D1.");
    console.log(`   Or run manually: wrangler d1 execute glass-catalog-db --remote --file ${sqlPath}`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Live execution
  // ---------------------------------------------------------------------------
  if (!config.accountId || !config.apiToken || !config.dbId) {
    console.error("❌ Missing Cloudflare credentials for --execute");
    console.error("   Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID");
    process.exit(1);
  }

  console.log("\n🚀 Executing cleanup on D1...\n");

  try {
    // Step 1: Get counts before
    const beforeTotal = await executeD1Command(
      config.accountId,
      config.dbId,
      config.apiToken,
      "SELECT COUNT(*) AS cnt FROM ktype_matches"
    );
    const beforeNoise = await executeD1Command(
      config.accountId,
      config.dbId,
      config.apiToken,
      "SELECT COUNT(*) AS cnt FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days')"
    );

    const totalBefore = beforeTotal?.[0]?.results?.[0]?.cnt ?? "?";
    const noiseBefore = beforeNoise?.[0]?.results?.[0]?.cnt ?? "?";

    console.log(`   Rows before: ${totalBefore}`);
    console.log(`   Noise (hit_count=1, >30d): ${noiseBefore}`);

    // Step 2: Archive (fetch rows before deletion)
    if (noiseBefore > 0) {
      const archiveResult = await executeD1Command(
        config.accountId,
        config.dbId,
        config.apiToken,
        `SELECT ktype, eurocode, hit_count, first_seen, last_seen FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days')`
      );
      const archived = archiveResult?.[0]?.results || [];
      const archivePath = resolve(config.archiveDir, `cleanup-archive-${new Date().toISOString().slice(0, 10)}.json`);
      writeFileSync(archivePath, JSON.stringify(archived, null, 2));
      console.log(`   💾 Archived ${archived.length} rows: ${archivePath}`);
    }

    // Step 3: Delete
    const deleteResult = await executeD1Command(
      config.accountId,
      config.dbId,
      config.apiToken,
      "DELETE FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days')"
    );
    const deleted = deleteResult?.[0]?.meta?.rows_written ?? "?";
    console.log(`   🗑  Deleted rows: ${deleted}`);

    if (config.aggressive) {
      const del2 = await executeD1Command(
        config.accountId,
        config.dbId,
        config.apiToken,
        "DELETE FROM ktype_matches WHERE hit_count = 2 AND last_seen < datetime('now', '-60 days')"
      );
      const deleted2 = del2?.[0]?.meta?.rows_written ?? "?";
      console.log(`   🗑  Deleted (aggressive): ${deleted2}`);
    }

    // Step 4: Count after
    const afterTotal = await executeD1Command(
      config.accountId,
      config.dbId,
      config.apiToken,
      "SELECT COUNT(*) AS cnt FROM ktype_matches"
    );
    const totalAfter = afterTotal?.[0]?.results?.[0]?.cnt ?? "?";
    console.log(`   Rows after: ${totalAfter}`);

    console.log("\n✅ Cleanup complete!");
  } catch (e) {
    console.error("\n❌ Cleanup failed:", e.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
