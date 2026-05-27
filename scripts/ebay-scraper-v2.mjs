#!/usr/bin/env node
/**
 * ebay-scraper-v2.mjs
 * ===================
 * Scrape OE numbers + kType from eBay listings for bilglass.
 *
 * Supports two modes:
 *   1. OE-only mode (EBAY_APP_ID only): Finds listings by eurocode/keyword,
 *      extracts OE numbers from titles and product.MPNs via Browse API.
 *   2. Full mode (EBAY_APP_ID + EBAY_AUTH_TOKEN): Also fetches kType from
 *      ItemCompatibilityList via Trading API GetItem.
 *
 * eBay Developer Program (FREE):
 *   https://developer.ebay.com/join/
 *   - App ID: 5,000 calls/day Finding + Browse
 *   - Trading API: 1,500 calls/day (requires OAuth user token)
 *
 * Usage:
 *   EBAY_APP_ID=xxx [EBAY_CERT_ID=yyy] [EBAY_AUTH_TOKEN=zzz] \
 *     node scripts/ebay-scraper-v2.mjs [--oe-only] [--limit=N]
 */

import { writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const EBAY_AUTH_TOKEN = process.env.EBAY_AUTH_TOKEN;

const OE_ONLY = process.argv.includes("--oe-only") || !EBAY_AUTH_TOKEN;
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "50", 10);

const OUTPUT_JSON = path.join(ROOT, "data", "ebay-scrape-results.json");
const OUTPUT_SQL = path.join(ROOT, "api", "cf-worker", "generated-ebay-scrape-inserts.sql");

// Marketplaces to search
const MARKETPLACES = [
  { id: "EBAY_DE", name: "Germany", siteId: 77, domain: "de" },
  { id: "EBAY_GB", name: "UK", siteId: 3, domain: "co.uk" },
  { id: "EBAY_FR", name: "France", siteId: 71, domain: "fr" },
  { id: "EBAY_IT", name: "Italy", siteId: 101, domain: "it" },
];

// Search queries: eurocode + glass type keywords
const SEARCH_QUERIES = [
  // We will generate these dynamically from the catalog
];

// ── OAuth: Client Credentials Flow ────────────────────────────────────────
async function getOAuthToken() {
  if (!EBAY_CERT_ID) {
    console.error("❌ EBAY_CERT_ID mangler. Trengs for Browse API.");
    console.error("   Skaff på: https://developer.ebay.com/my/keys");
    return null;
  }

  const credentials = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString("base64");

  try {
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    const data = await res.json();
    if (data.access_token) {
      console.log(`🔑 OAuth token mottatt (expires in ${data.expires_in}s)`);
      return data.access_token;
    }
    console.error("❌ OAuth feil:", data.error_description || data.error);
    return null;
  } catch (e) {
    console.error("❌ OAuth request feil:", e.message);
    return null;
  }
}

// ── Finding API: Search items by keyword ──────────────────────────────────
async function findItems(marketplace, keyword, oauthToken) {
  const endpoint = "https://svcs.ebay.com/services/search/FindingService/v1";
  const params = new URLSearchParams({
    "OPERATION-NAME": "findItemsByKeywords",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": EBAY_APP_ID,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "true",
    "GLOBAL-ID": marketplace.id,
    "keywords": keyword,
    "paginationInput.entriesPerPage": "25",
  });

  try {
    const res = await fetch(`${endpoint}?${params}`);
    if (!res.ok) throw new Error(`Finding API: ${res.status}`);

    const data = await res.json();
    const items = data.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

    return items.map((item) => ({
      itemId: item.itemId?.[0],
      title: item.title?.[0],
      galleryURL: item.galleryURL?.[0],
      viewItemURL: item.viewItemURL?.[0],
      category: item.primaryCategory?.[0]?.categoryName?.[0],
    })).filter((i) => i.itemId);
  } catch (e) {
    console.error(`   ❌ Finding API feil: ${e.message}`);
    return [];
  }
}

// ── Browse API: Get item details including product.MPNs ───────────────────
async function getItemBrowse(itemId, oauthToken) {
  try {
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|0`, {
      headers: {
        "Authorization": `Bearer ${oauthToken}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
      },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Browse API: ${res.status}`);
    }

    return await res.json();
  } catch (e) {
    console.error(`   ❌ Browse API feil: ${e.message}`);
    return null;
  }
}

// ── Trading API: GetItem with ItemCompatibilityList ───────────────────────
async function getItemCompatibility(itemId, marketplace, authToken) {
  const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${authToken}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Version>1155</Version>
  <ItemID>${itemId}</ItemID>
  <IncludeItemCompatibilityList>true</IncludeItemCompatibilityList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

  try {
    const res = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "GetItem",
        "X-EBAY-API-SITEID": marketplace.siteId.toString(),
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
        "X-EBAY-API-IAF-TOKEN": authToken,
        "Content-Type": "text/xml",
      },
      body: xmlPayload,
    });

    if (!res.ok) throw new Error(`Trading API: ${res.status}`);

    const xml = await res.text();
    // Parse kType from ItemCompatibilityList
    const ktypes = [];
    const compatMatches = xml.matchAll(/<NameValueList>\s*<Name>KType<\/Name>\s*<Value>(\d+)<\/Value>/g);
    for (const m of compatMatches) {
      ktypes.push(parseInt(m[1], 10));
    }

    // Parse MPNs from ItemSpecifics
    const mpns = [];
    const mpnMatches = xml.matchAll(/<Name>Herstellernummer<\/Name>\s*<Value>([^<]+)<\/Value>/g);
    for (const m of mpnMatches) {
      mpns.push(m[1].trim());
    }

    return { ktypes, mpns };
  } catch (e) {
    console.error(`   ❌ Trading API feil: ${e.message}`);
    return { ktypes: [], mpns: [] };
  }
}

// ── Extract OE numbers from text ──────────────────────────────────────────
function extractOENumbers(text) {
  if (!text) return [];
  const matches = [];

  // Common OE patterns: A1234567890, 1K0907651A, 4F0857535F, etc.
  const oePatterns = [
    /\b[A-Z]\d{3,4}[A-Z]?\d{3,4}[A-Z]?\b/g,
    /\b\d[A-Z]\d[A-Z]\d{6,10}\b/g,
    /\b\d{3}[A-Z]\d{6,9}[A-Z]?\b/g,
    /\bOE[\s#:]+([A-Z0-9\-]{5,20})\b/gi,
  ];

  for (const pattern of oePatterns) {
    const found = text.matchAll(pattern);
    for (const m of found) {
      const clean = m[1] || m[0];
      if (clean.length >= 8 && clean.length <= 20) {
        matches.push(clean.replace(/\s/g, "").toUpperCase());
      }
    }
  }

  return [...new Set(matches)];
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  eBay Scraper v2 — OE Numbers + kType");
  console.log("  Mode:", OE_ONLY ? "OE-ONLY (no kType)" : "FULL (OE + kType)");
  console.log("  Limit:", LIMIT, "queries");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (!EBAY_APP_ID) {
    console.error("❌ EBAY_APP_ID mangler.");
    console.error("   1. Gå til https://developer.ebay.com/join/");
    console.error("   2. Lag en app (Sandbox eller Production)");
    console.error("   3. Kopier App ID fra https://developer.ebay.com/my/keys");
    console.error("   4. Sett: export EBAY_APP_ID=din_app_id");
    if (!OE_ONLY) {
      console.error("   5. (Valgfritt) Generer User Token for Trading API");
      console.error("   6. Sett: export EBAY_AUTH_TOKEN=din_token");
    }
    process.exit(1);
  }

  // Get OAuth token for Browse API
  let oauthToken = null;
  if (!OE_ONLY || EBAY_CERT_ID) {
    oauthToken = await getOAuthToken();
  }

  // Load catalog for search queries
  const catalogPath = path.join(ROOT, "data", "catalog-prod.json");
  if (!existsSync(catalogPath)) {
    console.error("❌ Katalog ikke funnet:", catalogPath);
    process.exit(1);
  }

  const catalog = JSON.parse(require("fs").readFileSync(catalogPath, "utf-8"));
  const records = catalog.records || [];

  // Pick diverse products to search: newest models with ADAS features
  const candidates = records
    .filter((r) => r.yearFrom >= 2018 && r.adas === true)
    .slice(0, LIMIT);

  if (candidates.length === 0) {
    console.error("❌ Ingen kandidater funnet. Prøv med lavere year-filter.");
    process.exit(1);
  }

  console.log(`🔍 Søker etter ${candidates.length} produkter på eBay\n`);

  const results = [];
  let totalItems = 0;
  let totalOEs = 0;
  let totalKTypes = 0;

  for (let i = 0; i < candidates.length; i++) {
    const product = candidates[i];
    const keyword = `${product.brand} ${product.model?.split(/\s/)[0]} windshield`;

    process.stdout.write(`[${i + 1}/${candidates.length}] ${product.eurocode} — ${keyword} ... `);

    for (const mp of MARKETPLACES) {
      const items = await findItems(mp, keyword, oauthToken);
      if (items.length === 0) continue;

      for (const item of items.slice(0, 3)) {
        const oesFromTitle = extractOENumbers(item.title);
        let mpns = [];
        let ktypes = [];

        if (oauthToken) {
          const browseData = await getItemBrowse(item.itemId, oauthToken);
          if (browseData?.product?.mpns) {
            mpns = browseData.product.mpns;
          }
        }

        if (!OE_ONLY && EBAY_AUTH_TOKEN) {
          const compat = await getItemCompatibility(item.itemId, mp, EBAY_AUTH_TOKEN);
          ktypes = compat.ktypes;
          if (compat.mpns.length > 0) mpns = [...new Set([...mpns, ...compat.mpns])];
        }

        const allOEs = [...new Set([...oesFromTitle, ...mpns])];

        if (allOEs.length > 0 || ktypes.length > 0) {
          results.push({
            eurocode: product.eurocode,
            brand: product.brand,
            model: product.model,
            yearFrom: product.yearFrom,
            yearTo: product.yearTo,
            eBayItemId: item.itemId,
            eBayTitle: item.title,
            eBayURL: item.viewItemURL,
            marketplace: mp.domain,
            oeNumbers: allOEs,
            ktypes,
          });
          totalOEs += allOEs.length;
          totalKTypes += ktypes.length;
        }
      }
    }

    totalItems += results.length;
    process.stdout.write(`${results.length - totalItems + results.length} hits\n`);

    // Rate limiting
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n📊 Results:`);
  console.log(`   Items analyzed: ${totalItems}`);
  console.log(`   Unique results: ${results.length}`);
  console.log(`   OE numbers found: ${totalOEs}`);
  console.log(`   kTypes found: ${totalKTypes}`);

  // Save JSON
  writeFileSync(OUTPUT_JSON, JSON.stringify({
    meta: {
      scrapedAt: new Date().toISOString(),
      mode: OE_ONLY ? "oe-only" : "full",
      totalQueries: candidates.length,
      totalResults: results.length,
    },
    results,
  }, null, 2));
  console.log(`\n💾 JSON saved: ${OUTPUT_JSON}`);

  // Generate SQL for scrape_results
  if (results.length > 0) {
    const lines = [];
    lines.push("-- Auto-generert av ebay-scraper-v2.mjs");
    lines.push("");

    for (const r of results) {
      const raw = JSON.stringify({
        eBayItemId: r.eBayItemId,
        eBayTitle: r.eBayTitle,
        eBayURL: r.eBayURL,
        marketplace: r.marketplace,
        oeNumbers: r.oeNumbers,
        ktypes: r.ktypes,
      });

      for (const oe of r.oeNumbers) {
        lines.push(
          `INSERT INTO scrape_results (source, make, model, year, eurocode, oem_number, glass_part_type, raw_payload, confidence, status) ` +
          `VALUES ('ebay', ${escapeSql(r.brand)}, ${escapeSql(r.model)}, ${r.yearFrom || "NULL"}, ${escapeSql(r.eurocode)}, ${escapeSql(oe)}, 'frontrute', ${escapeSql(raw)}, 0.75, 'raw');`
        );
      }

      for (const kt of r.ktypes) {
        lines.push(
          `INSERT INTO scrape_results (source, make, model, year, eurocode, ktype, glass_part_type, raw_payload, confidence, status) ` +
          `VALUES ('ebay', ${escapeSql(r.brand)}, ${escapeSql(r.model)}, ${r.yearFrom || "NULL"}, ${escapeSql(r.eurocode)}, ${kt}, 'frontrute', ${escapeSql(raw)}, 0.75, 'raw');`
        );
      }
    }

    writeFileSync(OUTPUT_SQL, lines.join("\n"));
    console.log(`💾 SQL saved: ${OUTPUT_SQL}`);
  }

  console.log("\n✅ Done!");
}

function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
