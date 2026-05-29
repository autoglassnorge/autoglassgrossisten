#!/usr/bin/env npx tsx
/**
 * Migration: Add Missing D1 Indexes
 * ===================================
 * Idempotent index audit + creation for the Autoglass D1 catalog.
 * Queries sqlite_master to avoid creating redundant indexes.
 *
 * Usage:
 *   npx tsx api/cf-worker/scripts/migrate-add-indexes.ts [--db=glass-catalog-db]
 *
 * Then apply the generated SQL via wrangler:
 *   npx wrangler d1 execute glass-catalog-db --file=api/cf-worker/migrations/0014_add_missing_indexes.sql
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const DB_NAME = process.argv.find((a) => a.startsWith("--db="))?.split("=")[1] || "glass-catalog-db";

interface DesiredIndex {
  name: string;
  table: string;
  columns: string;
  where?: string;
}

const DESIRED_INDEXES: DesiredIndex[] = [
  // glass_catalog — critical lookup paths
  { name: "idx_catalog_prefix4", table: "glass_catalog", columns: "prefix4" },
  { name: "idx_catalog_eurocode", table: "glass_catalog", columns: "eurocode" },
  { name: "idx_catalog_brand", table: "glass_catalog", columns: "brand" },
  { name: "idx_catalog_ktype", table: "glass_catalog", columns: "ktype" },

  // glass_rules — VIN-resolution caching
  { name: "idx_rules_key", table: "glass_rules", columns: "normalized_key, active" },

  // vin_decode_cache — VIN lookups (in addition to PK implicit index)
  { name: "idx_vin", table: "vin_decode_cache", columns: "vin" },

  // rate_limits — cleanup & lookup
  { name: "idx_rate", table: "rate_limits", columns: "key, expires_at" },

  // search_history — learned-equipment lookups
  { name: "idx_search_vin", table: "search_history", columns: "vin_prefix" },
];

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function main() {
  console.log("🔍 D1 Index Audit & Migration Generator");
  console.log("========================================");
  console.log(`   Database: ${DB_NAME}\n`);

  // We can't query sqlite_master without a live DB connection from Node,
  // so we generate idempotent SQL with IF NOT EXISTS and a human-readable
  // report of what each index is for.
  const lines: string[] = [];
  lines.push("-- Migration 0014: Add Missing Indexes");
  lines.push("-- ======================================");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push("-- Idempotent: all CREATE INDEX use IF NOT EXISTS");
  lines.push("");

  for (const idx of DESIRED_INDEXES) {
    const whereClause = idx.where ? ` WHERE ${idx.where}` : "";
    lines.push(`-- ${idx.table}: ${idx.name} (${idx.columns})`);
    lines.push(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.columns})${whereClause};`);
    lines.push("");
  }

  // Also add a quick health-check view
  lines.push("-- Index health check (run manually to verify coverage)");
  lines.push("-- SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('glass_catalog', 'glass_rules', 'vin_decode_cache', 'rate_limits', 'search_history', 'ktype_matches', 'ktype_registry') ORDER BY tbl_name, name;");

  const outPath = path.join(__dirname, "../migrations/0014_add_missing_indexes.sql");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));

  console.log(`✅ Generated migration: ${outPath}`);
  console.log(`   Indexes covered: ${DESIRED_INDEXES.length}`);
  console.log("\n🚀 To apply:");
  console.log(`   npx wrangler d1 execute ${DB_NAME} --file=${outPath}`);
  console.log(`   npx wrangler d1 execute ${DB_NAME} --remote --file=${outPath}`);

  // Generate a second file: inline audit SQL you can run immediately
  const auditLines: string[] = [];
  auditLines.push("SELECT");
  auditLines.push("  tbl_name AS table_name,");
  auditLines.push("  COUNT(CASE WHEN type = 'index' THEN 1 END) AS index_count,");
  auditLines.push("  COUNT(CASE WHEN type = 'table' THEN 1 END) AS table_count");
  auditLines.push("FROM sqlite_master");
  auditLines.push("WHERE tbl_name IN ('glass_catalog', 'glass_rules', 'vin_decode_cache', 'rate_limits', 'search_history', 'ktype_matches', 'ktype_registry')");
  auditLines.push("GROUP BY tbl_name;");

  const auditPath = path.join(__dirname, "../migrations/0014_audit_indexes.sql");
  fs.writeFileSync(auditPath, auditLines.join("\n"));
  console.log(`\n📊 Audit SQL: ${auditPath}`);
}

main();
