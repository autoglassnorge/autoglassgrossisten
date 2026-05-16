/**
 * Upload Master Catalog to Cloudflare KV
 * =======================================
 * Splitter katalog i chunker og laster opp til Workers KV.
 *
 * Kjøring:
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx npx ts-node scripts/upload-catalog.ts
 */

import * as fs from "fs";
import * as path from "path";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "";

const CATALOG_PATH = path.join(process.cwd(), "data", "master-catalog.json");
const CHUNK_SIZE = 500; // KV har 25MB limit per verdi, men vi chunker for sikkerhet

interface CatalogFile {
  meta: {
    mergedAt: string;
    totalRecords: number;
    sources: string[];
    categories: Record<string, number>;
  };
  records: unknown[];
}

async function uploadToKV(key: string, value: unknown): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`KV upload feilet for ${key}: ${error}`);
  }

  console.log(`   ✅ ${key} (${JSON.stringify(value).length} bytes)`);
}

async function main() {
  console.log("☁️  Upload til Cloudflare KV");
  console.log("============================\n");

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error("❌ Mangler miljøvariabler:");
    console.error("   CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID");
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Katalog ikke funnet: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog: CatalogFile = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  console.log(`📂 Laster ${catalog.meta.totalRecords} records fra ${CATALOG_PATH}`);
  console.log(`   Kilder: ${catalog.meta.sources.join(", ")}`);

  // 1. Last opp metadata
  console.log("\n📤 Laster opp metadata...");
  await uploadToKV("catalog_meta", {
    mergedAt: catalog.meta.mergedAt,
    totalRecords: catalog.meta.totalRecords,
    sources: catalog.meta.sources,
    categories: catalog.meta.categories,
  });

  // 2. Last opp prefix4-cache hvis den finnes
  const cachePath = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
  if (fs.existsSync(cachePath)) {
    console.log("\n📤 Laster opp prefix4-cache...");
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    await uploadToKV("prefix4_cache", cache);
  }

  // 3. Chunk og last opp records
  console.log("\n📤 Laster opp records i chunker...");
  const chunks: unknown[][] = [];
  for (let i = 0; i < catalog.records.length; i += CHUNK_SIZE) {
    chunks.push(catalog.records.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    await uploadToKV(`catalog_chunk_${i}`, chunks[i]);
  }

  // 4. Lagre total chunk count
  await uploadToKV("catalog_chunks", { count: chunks.length });

  console.log(`\n✅ Ferdig! ${chunks.length} chunker lastet opp.`);
  console.log(`   Total størrelse: ~${(JSON.stringify(catalog).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
