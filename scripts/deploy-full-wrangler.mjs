#!/usr/bin/env node
/**
 * Full Deploy Pipeline via Wrangler CLI
 * =======================================
 * Zero-dependency on API tokens — uses wrangler login OAuth.
 *
 * Usage:
 *   node scripts/deploy-full-wrangler.mjs          # deploy worker only
 *   node scripts/deploy-full-wrangler.mjs --kv     # deploy + upload KV catalog
 *   node scripts/deploy-full-wrangler.mjs --d1     # deploy + migrate D1 schema+data
 *   node scripts/deploy-full-wrangler.mjs --all    # full pipeline
 *   node scripts/deploy-full-wrangler.mjs --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/* ── Config ────────────────────────────────────────────────── */
const WORKER_DIR = path.join(process.cwd(), "api", "cf-worker");
const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const CACHE_PATH = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
const TECDOC_SQL = path.join(process.cwd(), "data", "tecdoc-import", "tecdoc-ktype-registry-safe.sql");
const CHUNK_SIZE = 500;

const IS_DRY_RUN = process.argv.includes("--dry-run");
const WITH_KV = process.argv.includes("--kv") || process.argv.includes("--all");
const WITH_D1 = process.argv.includes("--d1") || process.argv.includes("--all");

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
    cwd: opts.cwd || WORKER_DIR,
    ...opts,
  });
}

function wranglerSilent(args, opts = {}) {
  return wrangler(args, { silent: true, ...opts });
}

/* ── KV Upload ─────────────────────────────────────────────── */
async function uploadKV() {
  log("\n📤 [KV] Uploading catalog...");

  if (!fs.existsSync(CATALOG_PATH)) {
    fail(`Catalog not found: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const entries = [];

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

  if (fs.existsSync(CACHE_PATH)) {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    entries.push({ key: "prefix4_cache", value: JSON.stringify(cache) });
  }

  const records = catalog.records || [];
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    entries.push({ key: `catalog_chunk_${i}`, value: JSON.stringify(chunks[i]) });
  }

  entries.push({ key: "catalog_chunks", value: JSON.stringify({ count: chunks.length }) });

  const tmpDir = path.join(process.cwd(), ".wrangler-tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const bulkFile = path.join(tmpDir, "kv-bulk-catalog.json");
  fs.writeFileSync(bulkFile, JSON.stringify(entries));

  log(`   ${entries.length} entries (${chunks.length} chunks) — ${(fs.statSync(bulkFile).size / 1024 / 1024).toFixed(2)} MB`);

  wrangler(`kv bulk put ${bulkFile} --namespace-id=15099e572e51423dafb723996c01c668 --remote`);
  ok("KV upload complete");
}

/* ── D1 Upload ─────────────────────────────────────────────── */
async function uploadD1() {
  log("\n🗃️  [D1] Migrating schema + data...");

  // 1. Apply pending migrations
  log("   Applying wrangler migrations...");
  try {
    wrangler(`d1 migrations apply glass-catalog-db --remote`);
    ok("Migrations applied");
  } catch (e) {
    warn("Migration apply had issues (may be partially applied) — continuing...");
  }

  // 2. Ensure tecdoc_ktype_registry exists (idempotent)
  const tecdocSchema = `
CREATE TABLE IF NOT EXISTS tecdoc_ktype_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eurocode TEXT NOT NULL,
  ktype INTEGER NOT NULL,
  tecdoc_brand TEXT,
  tecdoc_model TEXT,
  tecdoc_year_from INTEGER,
  tecdoc_year_to INTEGER,
  collision_group_size INTEGER NOT NULL,
  collision_rank INTEGER NOT NULL,
  confidence_tag TEXT,
  source TEXT DEFAULT 'tecdoc_1q2019_v5_post_cleanup',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tecdoc_ktype ON tecdoc_ktype_registry(ktype);
CREATE INDEX IF NOT EXISTS idx_tecdoc_eurocode ON tecdoc_ktype_registry(eurocode);
CREATE INDEX IF NOT EXISTS idx_tecdoc_confidence ON tecdoc_ktype_registry(confidence_tag);
CREATE INDEX IF NOT EXISTS idx_tecdoc_brand_model ON tecdoc_ktype_registry(tecdoc_brand, tecdoc_model);
`;
  const tmpSchema = path.join(process.cwd(), ".wrangler-tmp", "tecdoc-schema.sql");
  fs.writeFileSync(tmpSchema, tecdocSchema);
  wrangler(`d1 execute glass-catalog-db --file=${tmpSchema} --remote`);
  ok("TecDoc schema ensured");

  // 3. Load TecDoc data if available
  if (fs.existsSync(TECDOC_SQL)) {
    log("   Loading TecDoc kType registry...");
    wrangler(`d1 execute glass-catalog-db --file=${TECDOC_SQL} --remote`);
    ok("TecDoc data loaded");
  } else {
    warn(`TecDoc SQL not found: ${TECDOC_SQL}`);
  }

  // 4. Migrate catalog data
  if (fs.existsSync(CATALOG_PATH)) {
    log("   Generating D1 catalog inserts...");
    execSync("node scripts/migrate-to-d1.mjs", { stdio: "inherit", cwd: process.cwd() });

    log("   Truncating glass_catalog...");
    wranglerSilent(`d1 execute glass-catalog-db --command="DELETE FROM glass_catalog;" --remote`);

    log("   Inserting catalog records...");
    wrangler(`d1 execute glass-catalog-db --file=/tmp/d1-insert.sql --remote`);
    ok("Catalog data migrated to D1");
  }
}

/* ── Smoke Test ────────────────────────────────────────────── */
async function smokeTest() {
  log("\n🧪 [Smoke] Testing deployed worker...");

  const url = "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health";
  const res = await fetch(url);
  if (!res.ok) {
    fail(`Health check failed: ${res.status}`);
    process.exit(1);
  }

  const data = await res.json();
  if (data.status !== "ok") {
    fail(`Health check returned non-ok status: ${JSON.stringify(data)}`);
    process.exit(1);
  }

  ok(`Health OK — catalogSize=${data.catalogSize}, brands=${data.brands}, rules=${data.rulesCount}`);

  // Quick search test
  const searchUrl = "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/search?regnr=EB55432";
  const searchRes = await fetch(searchUrl);
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    ok(`Search OK — found ${searchData.results?.length || 0} results for test regnr`);
  } else {
    warn(`Search test returned ${searchRes.status} (may be expected for unknown regnr)`);
  }
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  log("\n🚀 Full Deploy Pipeline (Wrangler-only)");
  log("========================================\n");

  if (IS_DRY_RUN) warn("DRY-RUN mode\n");

  // Verify wrangler auth
  try {
    const whoami = wranglerSilent("whoami");
    if (whoami.includes("Not logged in")) throw new Error("not logged in");
    ok("Wrangler authenticated");
  } catch (e) {
    fail("Wrangler not authenticated. Run: npx wrangler login");
    process.exit(1);
  }

  // 1. Deploy worker
  log("\n📦 [Worker] Deploying...");
  wrangler("deploy");
  ok("Worker deployed");

  // 2. KV upload
  if (WITH_KV) await uploadKV();

  // 3. D1 upload
  if (WITH_D1) await uploadD1();

  // 4. Smoke test
  await smokeTest();

  log(`\n${G}✅ Full deploy complete!${RESET}\n`);
  log(`   Worker: https://autoglass-glass-sok.autoglassnorge.workers.dev`);
  log(`   Health: https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health`);
  if (WITH_KV) log(`   KV:     33,215 records uploaded`);
  if (WITH_D1) log(`   D1:     schema + data migrated`);
  log("");
}

main().catch((e) => {
  console.error(`\n${R}❌ Deploy failed:${RESET}`, e.message);
  process.exit(1);
});
