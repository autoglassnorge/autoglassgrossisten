/**
 * Last opp katalog til Cloudflare KV
 * ==================================
 * Kjøring:
 *   cd api/cf-worker
 *   npx ts-node scripts/upload-catalog-to-kv.ts ../../data/mock-katalog.json
 */

import * as fs from "fs";

const CATALOG_PATH = process.argv[2] || "../../data/mock-katalog.json";
const NAMESPACE_ID = process.env.GLASS_KV_NAMESPACE_ID || "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";

if (!NAMESPACE_ID || !CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error("Sett miljøvariabler:");
  console.error("  GLASS_KV_NAMESPACE_ID=xxx");
  console.error("  CLOUDFLARE_ACCOUNT_ID=xxx");
  console.error("  CLOUDFLARE_API_TOKEN=xxx");
  process.exit(1);
}

interface CatalogFile {
  meta: { totalRecords: number; exportedAt: string };
  records: unknown[];
}

async function upload() {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const catalog: CatalogFile = JSON.parse(raw);

  console.log(`📦 Laster opp ${catalog.records.length} records til KV...`);

  // KV har grense på 25MB per verdi, så chunk hvis nødvendig
  const CHUNK_SIZE = 5000;
  const chunks: unknown[][] = [];
  for (let i = 0; i < catalog.records.length; i += CHUNK_SIZE) {
    chunks.push(catalog.records.slice(i, i + CHUNK_SIZE));
  }

  // Last opp metadata
  const metaRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/catalog_meta`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(catalog.meta),
    }
  );
  if (!metaRes.ok) console.error("Meta upload feil:", await metaRes.text());
  else console.log("✅ Metadata lastet opp");

  // Last opp chunker
  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/catalog_chunk_${i}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunks[i]),
      }
    );
    if (res.ok) {
      console.log(`✅ Chunk ${i}: ${chunks[i].length} records`);
    } else {
      console.error(`❌ Chunk ${i} feil:`, await res.text());
    }
  }

  // Lag også flat liste for rask lookup
  const allRecords = chunks.flat();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/catalog_records`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(allRecords),
    }
  );
  if (res.ok) console.log("✅ Full catalog_records lastet opp");
  else console.error("Records upload feil:", await res.text());

  console.log("\n🚀 Ferdig! Kjør 'wrangler deploy' for å deploye workeren.");
}

upload().catch(console.error);
