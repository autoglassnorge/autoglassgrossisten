#!/usr/bin/env node
/**
 * KV-konsistens-sjekk
 * ===================
 * Verifiserer at alle chunks finnes og er gyldige.
 *
 * Kjøring:
 *   CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx KV_NAMESPACE_ID=xxx node scripts/verify-kv.mjs
 */

const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID;

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const RESET = "\x1b[0m";

async function main() {
  console.log("\n🔍 KV-konsistens-sjekk\n");

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !KV_NAMESPACE_ID) {
    console.error(`${R}✗${RESET} Mangler miljøvariabler: CF_API_TOKEN, CF_ACCOUNT_ID, KV_NAMESPACE_ID`);
    process.exit(1);
  }

  // 1. Hent metadata
  const metaRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/catalog_records`,
    { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
  );

  if (!metaRes.ok) {
    console.error(`${R}✗${RESET} Kunne ikke hente catalog_records: HTTP ${metaRes.status}`);
    process.exit(1);
  }

  const meta = await metaRes.json();
  console.log(`  ${G}✓${RESET} Metadata: ${meta.total} poster, ${meta.chunkCount} chunks`);

  // 2. Sjekk hver chunk
  let okChunks = 0;
  let failChunks = 0;

  for (let i = 0; i < meta.chunkCount; i++) {
    const key = `catalog_chunk_${i}`;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}`,
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
    );

    if (!res.ok) {
      console.log(`  ${R}✗${RESET} ${key}: HTTP ${res.status}`);
      failChunks++;
      continue;
    }

    try {
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.log(`  ${R}✗${RESET} ${key}: Ikke et array`);
        failChunks++;
        continue;
      }
      okChunks++;
    } catch (e) {
      console.log(`  ${R}✗${RESET} ${key}: Ugyldig JSON — ${e.message}`);
      failChunks++;
    }
  }

  // 3. Oppsummering
  console.log("\n" + "═".repeat(40));
  console.log(`Chunks: ${G}${okChunks}${RESET} OK, ${R}${failChunks}${RESET} feil`);

  if (failChunks > 0) {
    console.log(`${R}❌ KV er IKKE konsistent${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`${G}✅ KV er konsistent${RESET}\n`);
    process.exit(0);
  }
}

main();
