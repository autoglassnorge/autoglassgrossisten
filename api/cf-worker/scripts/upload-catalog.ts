/**
 * Upload Production Catalog to Cloudflare KV
 * ============================================
 * Laster catalog-prod.json (kanonisk produksjonsfil) opp til Workers KV
 * med retry, timeout, parallell upload og progress-logging.
 *
 * Kjøring:
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx KV_NAMESPACE_ID=xxx \
 *     npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/upload-catalog.ts
 */

import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const CHUNK_SIZE = 500;
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

interface CatalogFile {
  meta: {
    version: string;
    mergedAt: string;
    totalRecords: number;
    sources: string[];
    categories: Record<string, number>;
  };
  records: unknown[];
}

/* ── Retry + Timeout upload ────────────────────────────────── */

async function uploadWithRetry(
  key: string,
  body: string,
  contentType: string,
  retries = MAX_RETRIES
): Promise<void> {
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
        return; // Success
      }

      // Retrybare statuser
      const isRetryable = response.status === 429 || response.status >= 500;
      const errorText = await response.text().catch(() => "unknown");

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`   ⚠️  ${key}: ${response.status} (retry ${attempt + 1}/${retries} om ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(`KV upload feilet for ${key}: ${response.status} ${errorText}`);
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof Error && err.name === "AbortError";

      if (isTimeout && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`   ⏱️  ${key}: Timeout (retry ${attempt + 1}/${retries} om ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (attempt >= retries) {
        throw new Error(`KV upload feilet for ${key} etter ${retries} retries: ${(err as Error).message}`);
      }
      throw err;
    }
  }
}

async function uploadJSON(key: string, value: unknown): Promise<{ key: string; size: number }> {
  const body = JSON.stringify(value);
  await uploadWithRetry(key, body, "application/json");
  return { key, size: body.length };
}

/* ── Main ──────────────────────────────────────────────────── */

async function main() {
  console.log("☁️  Upload produksjons-katalog til Cloudflare KV");
  console.log("=================================================\n");

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error("❌ Mangler miljøvariabler:");
    console.error("   CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID");
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Katalog ikke funnet: ${CATALOG_PATH}`);
    console.error("   Kjør først: npm run merge");
    process.exit(1);
  }

  const catalog: CatalogFile = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  console.log(`📂 ${catalog.meta.version || catalog.meta.mergedAt}`);
  console.log(`   ${catalog.meta.totalRecords.toLocaleString()} records fra ${catalog.meta.sources.join(", ")}`);
  console.log(`   Kategorier: ${Object.entries(catalog.meta.categories).map(([k, v]) => `${k}=${v}`).join(", ")}\n`);

  const limit = pLimit(CONCURRENCY);
  const tasks: Promise<{ key: string; size: number }>[] = [];
  const errors: { key: string; error: string }[] = [];

  // 1. Metadata
  console.log("📤 Laster opp metadata...");
  tasks.push(
    limit(() =>
      uploadJSON("catalog_meta", {
        version: catalog.meta.version,
        mergedAt: catalog.meta.mergedAt,
        totalRecords: catalog.meta.totalRecords,
        sources: catalog.meta.sources,
        categories: catalog.meta.categories,
      }).catch((e) => {
        errors.push({ key: "catalog_meta", error: (e as Error).message });
        return { key: "catalog_meta", size: 0 };
      })
    )
  );

  // 2. Prefix4-cache
  const cachePath = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
  if (fs.existsSync(cachePath)) {
    console.log("📤 Laster opp prefix4-cache...");
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    tasks.push(
      limit(() =>
        uploadJSON("prefix4_cache", cache).catch((e) => {
          errors.push({ key: "prefix4_cache", error: (e as Error).message });
          return { key: "prefix4_cache", size: 0 };
        })
      )
    );
  }

  // 3. Full catalog_records — SKIPPED (exceeds KV 27MiB limit, use D1 + chunks instead)
  console.log("📤 Hopper over catalog_records (bruker D1 + chunks istedenfor)...");
  // const recordsBody = JSON.stringify(catalog.records);
  // console.log(`   Størrelse: ${(recordsBody.length / 1024 / 1024).toFixed(2)} MB`);

  // 4. Chunked backup
  console.log("\n📤 Laster opp records i chunker...");
  const chunks: unknown[][] = [];
  for (let i = 0; i < catalog.records.length; i += CHUNK_SIZE) {
    chunks.push(catalog.records.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const idx = i;
    tasks.push(
      limit(() =>
        uploadJSON(`catalog_chunk_${idx}`, chunks[idx]).then((res) => {
          process.stdout.write(`\r   ${idx + 1}/${chunks.length} chunker opplastet`);
          return res;
        }).catch((e) => {
          errors.push({ key: `catalog_chunk_${idx}`, error: (e as Error).message });
          return { key: `catalog_chunk_${idx}`, size: 0 };
        })
      )
    );
  }

  // 5. Chunk count
  tasks.push(
    limit(() =>
      uploadJSON("catalog_chunks", { count: chunks.length }).catch((e) => {
        errors.push({ key: "catalog_chunks", error: (e as Error).message });
        return { key: "catalog_chunks", size: 0 };
      })
    )
  );

  // Kjør alle uploads
  const results = await Promise.all(tasks);
  console.log("\n");

  const totalBytes = results.reduce((sum, r) => sum + r.size, 0);
  console.log(`📊 Oppsummering:`);
  console.log(`   ${results.length} KV-nøkler lastet opp`);
  console.log(`   Totalt: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} feil:`);
    for (const { key, error } of errors) {
      console.error(`   ${key}: ${error}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Ferdig! Klar for produksjon.");
}

main().catch((e) => {
  console.error("❌ Uventet feil:", e.message);
  process.exit(1);
});
