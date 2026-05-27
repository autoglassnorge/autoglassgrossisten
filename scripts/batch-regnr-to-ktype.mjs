#!/usr/bin/env node
/**
 * batch-regnr-to-ktype.mjs
 * ========================
 * Batch lookup Norwegian regnr via Bovsoft API → ktype → eurocode.
 *
 * Usage:
 *   node scripts/batch-regnr-to-ktype.mjs                    # Uses data/regnr-validated.json
 *   node scripts/batch-regnr-to-ktype.mjs --from-orders      # Uses data/orders-eurocode-mapping.json
 *   node scripts/batch-regnr-to-ktype.mjs --regnr-file=file.txt
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const FROM_ORDERS = process.argv.includes("--from-orders");
const REGNR_FILE = process.argv.find((a) => a.startsWith("--regnr-file="))?.split("=")[1];

// Bovsoft config
const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

// ── Load regnr list ───────────────────────────────────────────────────────
function loadRegnrs() {
  if (REGNR_FILE) {
    const text = readFileSync(path.resolve(REGNR_FILE), "utf-8");
    return text.split("\n").map((l) => l.trim().toUpperCase()).filter((r) => r.length >= 4);
  }

  if (FROM_ORDERS) {
    const file = path.join(ROOT, "data", "orders-eurocode-mapping.json");
    const orders = JSON.parse(readFileSync(file, "utf-8"));
    const regnrs = new Set();
    for (const o of orders) {
      if (Array.isArray(o.regnr)) {
        for (const r of o.regnr) regnrs.add(r.toUpperCase());
      }
    }
    return [...regnrs].sort();
  }

  // Default: validated regnrs
  const file = path.join(ROOT, "data", "regnr-validated.json");
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data.entries.map((e) => e.regnr.toUpperCase());
}

function loadPrefix4Cache() {
  const file = path.join(ROOT, "data", "ktype-prefix4-cache.json");
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data.entries || {};
}

function loadCatalog() {
  const file = path.join(ROOT, "data", "catalog-prod.json");
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data.records || [];
}

// ── Bovsoft lookup ────────────────────────────────────────────────────────
async function lookupBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    if (data.status !== 200 || !data.data?.datacar?.[0]) {
      return { ok: false, status: data.status, error: data.statusText || "no data" };
    }

    const car = data.data.datacar[0];
    return {
      ok: true,
      ktype: car.ktype,
      brand: car.manufCar,
      model: car.modelCar,
      yearFrom: car.typeFromYearCar ? parseInt(car.typeFromYearCar.toString().slice(0, 4), 10) : null,
      yearTo: car.typeToYearCar ? parseInt(car.typeToYearCar.toString().slice(0, 4), 10) : null,
      body: car.bodyCar,
      engine: car.typeCar,
      fuel: car.fuelSystem,
      vin: car.vin,
      freeRequestsRemaining: data.countFREERequests,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Match ktype to eurocodes via prefix4 cache ────────────────────────────
function matchKtypeToEurocodes(ktypeResult, prefix4Cache, catalog) {
  const { brand, model, yearFrom } = ktypeResult;
  if (!brand || !model) return [];

  const modelPrefix = model.split(/\s/)[0].toUpperCase();
  const cacheKey = `${brand.toUpperCase()}:${modelPrefix}:${yearFrom || ""}`;
  const cacheKeyNoYear = `${brand.toUpperCase()}:${modelPrefix}`;

  const cacheEntries = prefix4Cache[cacheKey] || prefix4Cache[cacheKeyNoYear];
  if (!cacheEntries || cacheEntries.length === 0) return [];

  const best = cacheEntries.sort((a, b) => b.confidence - a.confidence)[0];
  const prefix4 = best.prefix4;

  const matches = catalog.filter((p) => p.prefix4 === prefix4 && p.brand?.toUpperCase() === brand.toUpperCase());

  return matches.map((p) => ({
    eurocode: p.eurocode,
    catalogBrand: p.brand,
    catalogModel: p.model,
    catalogYearFrom: p.yearFrom,
    catalogYearTo: p.yearTo,
    catalogCategory: p.category,
    prefix4,
  }));
}

// ── D1 execute ────────────────────────────────────────────────────────────
function executeD1(sql) {
  const cmd = `cd ${path.join(ROOT, "api/cf-worker")} && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;

  if (DRY_RUN) {
    console.log(`   [DRY-RUN] ${sql.slice(0, 150)}...`);
    return { success: true };
  }

  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout: 60_000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Batch upsert ──────────────────────────────────────────────────────────
function batchUpsert(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const values = batch.map((m) =>
      `(${m.ktype}, '${m.eurocode}', 1, datetime('now'), datetime('now'))`
    ).join(",");

    const sql = `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
      VALUES ${values}
      ON CONFLICT(ktype, eurocode) DO UPDATE SET
        hit_count = hit_count + 1,
        last_seen = datetime('now');`;

    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write(".");
    } else {
      failed += batch.length;
      process.stdout.write("X");
    }
  }

  return { success, failed };
}

function batchUpdateCatalog(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const cases = batch.map((m) => `WHEN '${m.eurocode}' COLLATE NOCASE THEN ${m.ktype}`).join(" ");
    const codes = batch.map((m) => `'${m.eurocode}'`).join(", ");

    const sql = `UPDATE glass_catalog SET ktype = CASE eurocode ${cases} END WHERE eurocode IN (${codes}) COLLATE NOCASE;`;
    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write(".");
    } else {
      failed += batch.length;
      process.stdout.write("X");
    }
  }

  return { success, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Batch Regnr → kType → Eurocode via Bovsoft");
  console.log("  Source:", FROM_ORDERS ? "orders" : REGNR_FILE ? REGNR_FILE : "validated");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const regnrs = loadRegnrs();
  const prefix4Cache = loadPrefix4Cache();
  const catalog = loadCatalog();

  console.log(`📂 Regnrs to lookup: ${regnrs.length}`);
  console.log(`📂 Prefix4 cache keys: ${Object.keys(prefix4Cache).length}`);
  console.log(`📂 Catalog products: ${catalog.length}\n`);

  if (DRY_RUN) {
    console.log("🚫 DRY-RUN: Simulerer uten API-kall\n");
  }

  // 1. Batch lookup regnr
  const results = [];
  let freeRequests = "unknown";

  for (let i = 0; i < regnrs.length; i++) {
    const regnr = regnrs[i];
    process.stdout.write(`[${i + 1}/${regnrs.length}] ${regnr} ... `);

    if (DRY_RUN) {
      results.push({ regnr, ktype: 99999 + i, brand: "TEST", model: "TEST", yearFrom: 2020, matches: [] });
      console.log("DRY-RUN");
      continue;
    }

    const lookup = await lookupBovsoft(regnr);
    if (!lookup.ok) {
      console.log(`failed (${lookup.error || lookup.status})`);
      continue;
    }

    freeRequests = lookup.freeRequestsRemaining;
    const eurocodeMatches = matchKtypeToEurocodes(lookup, prefix4Cache, catalog);

    results.push({
      regnr,
      ktype: lookup.ktype,
      brand: lookup.brand,
      model: lookup.model,
      yearFrom: lookup.yearFrom,
      yearTo: lookup.yearTo,
      vin: lookup.vin,
      matches: eurocodeMatches,
    });

    console.log(`ktype=${lookup.ktype} brand=${lookup.brand} matches=${eurocodeMatches.length}`);

    if (i < regnrs.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n📊 Results:`);
  console.log(`   Successful lookups: ${results.filter((r) => r.ktype).length}/${regnrs.length}`);
  console.log(`   Total eurocode matches: ${results.reduce((sum, r) => sum + r.matches.length, 0)}`);
  console.log(`   Bovsoft free requests remaining: ${freeRequests}`);

  // 2. Build unique ktype→eurocode mappings
  const seen = new Set();
  const mappings = [];

  for (const r of results) {
    for (const m of r.matches) {
      const key = `${r.ktype}:${m.eurocode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mappings.push({ ktype: r.ktype, eurocode: m.eurocode, regnr: r.regnr });
    }
  }

  console.log(`\n🔍 Unique ktype→eurocode mappings to write: ${mappings.length}`);

  if (mappings.length === 0) {
    console.log("⚠️  Ingen nye mappings. Avbryter.");
    return;
  }

  // 3. Upsert into ktype_matches
  console.log(`\n📝 Upserting ${mappings.length} rows into ktype_matches ...`);
  const ktypeResult = batchUpsert(mappings);
  console.log(`\n   Success: ${ktypeResult.success}, Failed: ${ktypeResult.failed}`);

  // 4. Update glass_catalog.ktype
  console.log(`\n📝 Updating glass_catalog.ktype ...`);
  const catalogResult = batchUpdateCatalog(mappings);
  console.log(`\n   Success: ${catalogResult.success}, Failed: ${catalogResult.failed}`);

  // 5. Verify
  if (!DRY_RUN) {
    console.log(`\n🔍 Verifying ...`);
    const verifySql = `SELECT COUNT(*) as cnt FROM glass_catalog WHERE ktype IS NOT NULL;`;
    const verifyResult = executeD1(verifySql);
    if (verifyResult.success && verifyResult.output) {
      const match = verifyResult.output.match(/"cnt":\s*(\d+)/);
      if (match) {
        console.log(`   Products with ktype: ${match[1]} / 39458 (${(parseInt(match[1])/39458*100).toFixed(2)}%)`);
      }
    }
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
