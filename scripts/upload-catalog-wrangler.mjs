#!/usr/bin/env node
/**
 * Upload Production Catalog to Cloudflare KV via Wrangler CLI
 * =============================================================
 * Uses wrangler kv bulk put — no API token needed (wrangler login handles auth).
 *
 * Kjøring:
 *   node scripts/upload-catalog-wrangler.mjs
 *   node scripts/upload-catalog-wrangler.mjs --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/* ── Config ────────────────────────────────────────────────── */
const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const CACHE_PATH = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
const CHUNK_SIZE = 500;
const IS_DRY_RUN = process.argv.includes("--dry-run");

/* ── Logger ────────────────────────────────────────────────── */
const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const RESET = "\x1b[0m";

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`  ${G}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${Y}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`  ${C}ℹ${RESET} ${msg}`); }

/* ── Wrangler helpers ──────────────────────────────────────── */
function wrangler(args, opts = {}) {
  const cmd = `npx wrangler ${args}`;
  if (IS_DRY_RUN) {
    info(`[DRY-RUN] ${cmd}`);
    return "";
  }
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: opts.silent ? "pipe" : "inherit",
    cwd: opts.cwd || path.join(process.cwd(), "api", "cf-worker"),
    ...opts,
  });
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  log("\n☁️  Upload production catalog to Cloudflare KV (via Wrangler)");
  log("=================================================================\n");

  if (IS_DRY_RUN) warn("DRY-RUN mode — no actual uploads\n");

  // Verify wrangler is logged in
  try {
    const whoami = wrangler("whoami", { silent: true });
    if (whoami.includes("Not logged in")) throw new Error("not logged in");
    ok("Wrangler authenticated");
  } catch (e) {
    fail("Wrangler not authenticated. Run: npx wrangler login");
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    fail(`Catalog not found: ${CATALOG_PATH}`);
    info("Run first: npm run merge");
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  log(`📂 ${catalog.meta?.version || catalog.meta?.mergedAt || "unknown version"}`);
  log(`   ${(catalog.meta?.totalRecords || 0).toLocaleString("nb-NO")} records from ${(catalog.meta?.sources || []).join(", ")}`);
  log(`   Categories: ${Object.entries(catalog.meta?.categories || {}).map(([k, v]) => `${k}=${v}`).join(", ")}\n`);

  // Build NDJSON entries for bulk upload
  const entries = [];

  // 1. Metadata
  entries.push({
    key: "catalog_meta",
    value: JSON.stringify({
      version: catalog.meta?.version,
      mergedAt: catalog.meta?.mergedAt,
      totalRecords: catalog.meta?.totalRecords,
      sources: catalog.meta?.sources,
      categories: catalog.meta?.categories,
    }),
  });

  // 2. Prefix4-cache
  if (fs.existsSync(CACHE_PATH)) {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    entries.push({ key: "prefix4_cache", value: JSON.stringify(cache) });
  }

  // 3. Chunked records
  const records = catalog.records || [];
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    entries.push({ key: `catalog_chunk_${i}`, value: JSON.stringify(chunks[i]) });
  }

  // 4. Chunk count
  entries.push({ key: "catalog_chunks", value: JSON.stringify({ count: chunks.length }) });

  // Write JSON-array temp file (wrangler v4 bulk put expects JSON array)
  const tmpDir = path.join(process.cwd(), ".wrangler-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const bulkFile = path.join(tmpDir, "kv-bulk-catalog.json");
  fs.writeFileSync(bulkFile, JSON.stringify(entries));

  log(`📤 Uploading ${entries.length} KV entries via bulk put...`);
  log(`   Total payload: ${(fs.statSync(bulkFile).size / 1024 / 1024).toFixed(2)} MB\n`);

  wrangler(
    `kv bulk put ${bulkFile} --namespace-id=15099e572e51423dafb723996c01c668 --remote`
  );

  ok(`Uploaded ${entries.length} entries (${chunks.length} chunks)`);
  log(`\n${G}✅ Done! Catalog uploaded via Wrangler.${RESET}\n`);
}

main().catch((e) => {
  console.error(`\n${R}❌ Unexpected error:${RESET}`, e.message);
  process.exit(1);
});
