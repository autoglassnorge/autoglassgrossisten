#!/usr/bin/env node
/**
 * Backup catalog-prod.json before mutating operations
 * ===================================================
 * Keeps the last 10 gzipped backups in data/.catalog-backups/
 *
 * Usage:
 *   node scripts/backup-catalog.mjs
 */

import * as fs from "fs";
import * as path from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const BACKUP_DIR = path.join(process.cwd(), "data", ".catalog-backups");
const MAX_BACKUPS = 10;

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.log("⚠️  catalog-prod.json not found, skipping backup");
    process.exit(0);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const backupName = `catalog-prod-${timestamp()}.json.gz`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  await pipeline(
    fs.createReadStream(CATALOG_PATH),
    createGzip(),
    fs.createWriteStream(backupPath)
  );

  const stats = fs.statSync(backupPath);
  console.log(`💾 Backed up catalog → ${backupName} (${(stats.size / 1024).toFixed(1)} KB)`);

  // Prune old backups
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("catalog-prod-") && f.endsWith(".json.gz"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    console.log(`🗑️  Pruned old backup: ${file.name}`);
  }
}

main().catch((e) => {
  console.error("❌ Backup failed:", e.message);
  process.exit(1);
});
