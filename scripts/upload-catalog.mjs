#!/usr/bin/env node
/**
 * Upload Production Catalog to Cloudflare KV
 * ============================================
 * Modern ESM upload script with retry, timeout, chunked upload,
 * progress logging, and .env.local auto-loading.
 *
 * Kjøring:
 *   node scripts/upload-catalog.mjs
 *   node scripts/upload-catalog.mjs --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";

/* ── Load .env.local ───────────────────────────────────────── */
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
loadEnvLocal();

/* ── Config ────────────────────────────────────────────────── */
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || process.env.GLASS_KV_NAMESPACE_ID || "";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const CACHE_PATH = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
const CHUNK_SIZE = 500;
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

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

/* ── Retry + Timeout upload ────────────────────────────────── */
async function uploadWithRetry(key, body, contentType, retries = MAX_RETRIES) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": contentType,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        return;
      }

      const isRetryable = response.status === 429 || response.status >= 500;
      const errorText = await response.text().catch(() => "unknown");

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        warn(`${key}: ${response.status} (retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(`KV upload failed for ${key}: ${response.status} ${errorText}`);
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof Error && err.name === "AbortError";

      if (isTimeout && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        warn(`${key}: timeout (retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (attempt >= retries) {
        throw new Error(`KV upload failed for ${key} after ${retries} retries: ${err.message}`);
      }
      throw err;
    }
  }
}

async function uploadJSON(key, value) {
  const body = JSON.stringify(value);
  if (IS_DRY_RUN) {
    return { key, size: body.length };
  }
  await uploadWithRetry(key, body, "application/json");
  return { key, size: body.length };
}

/* ── Progress bar ──────────────────────────────────────────── */
function drawProgress(current, total, label = "Progress") {
  const width = 30;
  const pct = Math.min(1, current / total);
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  process.stdout.write(`\r   ${label} [${bar}] ${current}/${total} (${(pct * 100).toFixed(0)}%)`);
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  log("\n☁️  Upload production catalog to Cloudflare KV");
  log("=================================================\n");

  if (IS_DRY_RUN) {
    warn("DRY-RUN mode — no actual uploads\n");
  }

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    fail("Missing environment variables:");
    console.error("   CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID)");
    console.error("   CF_API_TOKEN (or CLOUDFLARE_API_TOKEN)");
    console.error("   KV_NAMESPACE_ID (or GLASS_KV_NAMESPACE_ID)");
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

  const limit = pLimit(CONCURRENCY);
  const tasks = [];
  const errors = [];

  // 1. Metadata
  log("📤 Uploading metadata...");
  tasks.push(
    limit(() =>
      uploadJSON("catalog_meta", {
        version: catalog.meta?.version,
        mergedAt: catalog.meta?.mergedAt,
        totalRecords: catalog.meta?.totalRecords,
        sources: catalog.meta?.sources,
        categories: catalog.meta?.categories,
      }).catch((e) => {
        errors.push({ key: "catalog_meta", error: e.message });
        return { key: "catalog_meta", size: 0 };
      })
    )
  );

  // 2. Prefix4-cache
  if (fs.existsSync(CACHE_PATH)) {
    log("📤 Uploading prefix4-cache...");
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    tasks.push(
      limit(() =>
        uploadJSON("prefix4_cache", cache).catch((e) => {
          errors.push({ key: "prefix4_cache", error: e.message });
          return { key: "prefix4_cache", size: 0 };
        })
      )
    );
  }

  // 3. Chunked records
  log("\n📤 Uploading records in chunks...");
  const records = catalog.records || [];
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const idx = i;
    tasks.push(
      limit(() =>
        uploadJSON(`catalog_chunk_${idx}`, chunks[idx]).then((res) => {
          drawProgress(idx + 1, chunks.length, "Chunks");
          return res;
        }).catch((e) => {
          errors.push({ key: `catalog_chunk_${idx}`, error: e.message });
          return { key: `catalog_chunk_${idx}`, size: 0 };
        })
      )
    );
  }

  // 4. Chunk count
  tasks.push(
    limit(() =>
      uploadJSON("catalog_chunks", { count: chunks.length }).catch((e) => {
        errors.push({ key: "catalog_chunks", error: e.message });
        return { key: "catalog_chunks", size: 0 };
      })
    )
  );

  const results = await Promise.all(tasks);
  process.stdout.write("\n\n");

  const totalBytes = results.reduce((sum, r) => sum + r.size, 0);
  log(`📊 Summary:`);
  log(`   ${results.length} KV keys uploaded`);
  log(`   Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (errors.length > 0) {
    console.error(`\n${R}❌ ${errors.length} errors:${RESET}`);
    for (const { key, error } of errors) {
      console.error(`   ${key}: ${error}`);
    }
    process.exit(1);
  }

  log(`\n${G}✅ Done! Ready for production.${RESET}\n`);
}

main().catch((e) => {
  console.error(`\n${R}❌ Unexpected error:${RESET}`, e.message);
  process.exit(1);
});
