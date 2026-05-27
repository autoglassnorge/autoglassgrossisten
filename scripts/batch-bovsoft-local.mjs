#!/usr/bin/env node
/**
 * batch-bovsoft-local.mjs
 * =======================
 * Kjør Bovsoft port 150 batch lokalt, generer SQL, importer til local D1.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const D1_SQLITE = path.join(ROOT, "api/cf-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c4de5f250d4177e68b0de3ab328e75dcf4c0e6fb762761fed1b2ae4fcb1d5dbf.sqlite");

const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

// ── Load data ────────────────────────────────────────────────────────────
const ordersData = JSON.parse(readFileSync(path.join(ROOT, "data", "orders-eurocode-mapping.json"), "utf-8"));
const regnrSet = new Set();
for (const o of ordersData) {
  if (Array.isArray(o.regnr)) {
    for (const r of o.regnr) regnrSet.add(r.toUpperCase());
  }
}
const regnrs = [...regnrSet].sort();

const prefix4Cache = JSON.parse(readFileSync(path.join(ROOT, "data", "ktype-prefix4-cache.json"), "utf-8")).entries || {};
const catalog = JSON.parse(readFileSync(path.join(ROOT, "data", "catalog-prod.json"), "utf-8")).records || [];

console.log(`═══════════════════════════════════════════════════════════════`);
console.log(`  Bovsoft Port 150 Batch → Local D1`);
console.log(`  Regnrs: ${regnrs.length}`);
console.log(`  Local D1: ${D1_SQLITE}`);
console.log(`═══════════════════════════════════════════════════════════════\n`);

// ── Bovsoft lookup ───────────────────────────────────────────────────────
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

// ── Match ktype to eurocodes via prefix4 cache ───────────────────────────
function matchKtypeToEurocodes(ktypeResult) {
  const { brand, model, yearFrom } = ktypeResult;
  if (!brand || !model) return [];
  const modelPrefix = model.split(/\s/)[0].toUpperCase();
  const cacheKey = `${brand.toUpperCase()}:${modelPrefix}:${yearFrom || ""}`;
  const cacheKeyNoYear = `${brand.toUpperCase()}:${modelPrefix}`;
  const cacheEntries = prefix4Cache[cacheKey] || prefix4Cache[cacheKeyNoYear];
  if (!cacheEntries || cacheEntries.length === 0) return [];
  const best = cacheEntries.sort((a, b) => b.confidence - a.confidence)[0];
  const prefix4 = best.prefix4;
  const matches = catalog.filter(p => p.prefix4 === prefix4 && p.brand?.toUpperCase() === brand.toUpperCase());
  return matches.map(p => ({
    eurocode: p.eurocode,
    catalogBrand: p.brand,
    catalogModel: p.model,
    catalogYearFrom: p.yearFrom,
    catalogYearTo: p.yearTo,
    catalogCategory: p.category,
    prefix4,
  }));
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const results = [];
  let freeRequests = "unknown";

  for (let i = 0; i < regnrs.length; i++) {
    const regnr = regnrs[i];
    process.stdout.write(`[${i + 1}/${regnrs.length}] ${regnr} ... `);
    const lookup = await lookupBovsoft(regnr);
    if (!lookup.ok) {
      console.log(`failed (${lookup.error || lookup.status})`);
      continue;
    }
    freeRequests = lookup.freeRequestsRemaining;
    const eurocodeMatches = matchKtypeToEurocodes(lookup);
    results.push({
      regnr, ktype: lookup.ktype, brand: lookup.brand, model: lookup.model,
      yearFrom: lookup.yearFrom, yearTo: lookup.yearTo, vin: lookup.vin,
      matches: eurocodeMatches,
    });
    console.log(`ktype=${lookup.ktype} brand=${lookup.brand} matches=${eurocodeMatches.length}`);
    if (i < regnrs.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 Results:`);
  console.log(`   Successful lookups: ${results.filter(r => r.ktype).length}/${regnrs.length}`);
  console.log(`   Total eurocode matches: ${results.reduce((sum, r) => sum + r.matches.length, 0)}`);
  console.log(`   Bovsoft free requests remaining: ${freeRequests}`);

  // Build unique ktype→eurocode mappings
  const seen = new Set();
  const mappings = [];
  for (const r of results) {
    for (const m of r.matches) {
      const key = `${r.ktype}:${m.eurocode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mappings.push({ ktype: r.ktype, eurocode: m.eurocode });
    }
  }

  console.log(`\n🔍 Unique ktype→eurocode mappings: ${mappings.length}`);

  if (mappings.length === 0) {
    console.log("⚠️  Ingen mappings. Avbryter.");
    return;
  }

  // Generate SQL
  const sqlLines = [
    "-- Auto-generert av batch-bovsoft-local.mjs",
    "BEGIN TRANSACTION;",
  ];

  for (const m of mappings) {
    sqlLines.push(
      `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen) ` +
      `VALUES (${m.ktype}, '${m.eurocode}', 1, datetime('now'), datetime('now')) ` +
      `ON CONFLICT(ktype, eurocode) DO UPDATE SET hit_count = hit_count + 1, last_seen = datetime('now');`
    );
  }

  // Update glass_catalog.ktype
  const cases = mappings.map(m => `WHEN '${m.eurocode}' COLLATE NOCASE THEN ${m.ktype}`).join(" ");
  const codes = mappings.map(m => `'${m.eurocode}'`).join(", ");
  sqlLines.push(
    `UPDATE glass_catalog SET ktype = CASE eurocode ${cases} END WHERE eurocode IN (${codes}) COLLATE NOCASE;`
  );

  sqlLines.push("COMMIT;");

  const sqlPath = path.join(ROOT, "data", "bovsoft-batch-import.sql");
  writeFileSync(sqlPath, sqlLines.join("\n"));
  console.log(`\n💾 SQL saved: ${sqlPath}`);

  // Import to local D1
  console.log(`\n📝 Importing to local D1 ...`);
  try {
    execSync(`sqlite3 "${D1_SQLITE}" < "${sqlPath}"`, { encoding: "utf-8", timeout: 30000 });
    console.log("✅ Import complete!");

    // Verify
    const verify = execSync(`sqlite3 "${D1_SQLITE}" "SELECT COUNT(*) FROM ktype_matches;"`, { encoding: "utf-8" }).trim();
    const verify2 = execSync(`sqlite3 "${D1_SQLITE}" "SELECT COUNT(*) FROM glass_catalog WHERE ktype IS NOT NULL;"`, { encoding: "utf-8" }).trim();
    console.log(`\n📊 Verify:`);
    console.log(`   ktype_matches rows: ${verify}`);
    console.log(`   glass_catalog with ktype: ${verify2} / 39458 (${(parseInt(verify2)/39458*100).toFixed(2)}%)`);
  } catch (e) {
    console.error("❌ Import failed:", e.message);
    process.exit(1);
  }
}

main().catch(e => { console.error("❌ Error:", e); process.exit(1); });
