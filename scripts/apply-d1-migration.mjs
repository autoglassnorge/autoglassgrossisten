#!/usr/bin/env node
/**
 * Apply D1 migration for kType support
 * Usage: node scripts/apply-d1-migration.mjs
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";

const MIGRATION_FILE = "api/cf-worker/migrations/0002_add_ktype.sql";
const DB_NAME = "glass-catalog-db";

console.log("🔄 Applying D1 migration for kType support...\n");

try {
  const sql = readFileSync(MIGRATION_FILE, "utf-8");
  console.log("📄 Migration SQL:");
  console.log(sql);
  console.log("\n⏳ Executing via wrangler d1 execute...\n");

  const result = execSync(
    `cd api/cf-worker && npx wrangler d1 execute ${DB_NAME} --file=../../${MIGRATION_FILE}`,
    { encoding: "utf-8", stdio: "inherit" }
  );

  console.log("\n✅ Migration applied successfully!");
} catch (err) {
  console.error("\n❌ Migration failed:", err.message);
  process.exit(1);
}
