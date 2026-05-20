#!/usr/bin/env node
/**
 * Upload Bovsoft Bootstrap Data to Cloudflare KV
 * ================================================
 * Laster bovsoft-bootstrap-results.json opp til KV som `bovsoft:<regnr>` keys.
 * Worker leser disse direkte uten å kalle Bovsoft API (HTTP/port 150 blokkeres
 * av Cloudflare Workers i produksjon).
 *
 * Kjøring:
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx KV_NAMESPACE_ID=xxx \
 *     node scripts/upload-bovsoft-to-kv.mjs
 */

import * as fs from "fs";
import * as path from "path";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "";

const INPUT_FILE = path.join(process.cwd(), "data", "bovsoft-bootstrap-results.json");
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

async function uploadToKv(key, value, retries = MAX_RETRIES) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}`;
  const body = JSON.stringify(value);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        return true;
      }
      const err = await res.text();
      console.warn(`  ⚠️ KV upload ${key} attempt ${attempt + 1}/${retries + 1} failed: ${res.status} ${err.slice(0, 100)}`);
    } catch (e) {
      clearTimeout(timeout);
      console.warn(`  ⚠️ KV upload ${key} attempt ${attempt + 1}/${retries + 1} error: ${e.message}`);
    }
  }
  return false;
}

async function main() {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error("❌ Missing env: CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const records = data.results || [];

  console.log(`🔥 Uploading ${records.length} Bovsoft records to KV\n`);

  let success = 0;
  let fail = 0;

  for (const record of records) {
    const key = `bovsoft:${record.regnr.toUpperCase()}`;
    const kvValue = {
      ktype: record.ktype,
      vin: record.vin || "",
      brand: record.brand || "",
      model: record.model || "",
      type: record.type || "",
      yearFrom: record.yearFrom || 0,
      yearTo: record.yearTo || 0,
      body: record.body || "",
      source: "bovsoft",
    };

    process.stdout.write(`  ${record.regnr} (ktype=${record.ktype}) ... `);
    const ok = await uploadToKv(key, kvValue);
    if (ok) {
      console.log("✅");
      success++;
    } else {
      console.log("❌");
      fail++;
    }
  }

  console.log(`\n📊 Results: ${success} uploaded, ${fail} failed`);
}

main().catch(console.error);
