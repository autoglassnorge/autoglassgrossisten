#!/usr/bin/env node
/**
 * apify-tecdoc-scraper.mjs
 * ========================
 * Scrape kType + OE numbers via Apify "Auto Parts Catalog - Tecdoc API alternative".
 *
 * Strategy:
 *   1. Query Apify TecDoc actor for popular vehicles in catalog
 *   2. Extract vehicleId (kType), OE numbers, article numbers
 *   3. Match against catalog by make/model/year
 *   4. Store in scrape_results (source='apify_tecdoc')
 *
 * Apify costs: ~$0.002-0.01 per actor call (depends on compute units)
 *   Free tier: $5/month credit
 *   Sign up: https://console.apify.com/sign-up
 *
 * Usage:
 *   APIFY_TOKEN=xxx node scripts/apify-tecdoc-scraper.mjs [--dry-run] [--limit=50]
 */

import { ApifyClient } from "apify-client";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = "making-data-meaningful/tecdoc";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "30", 10);

const OUTPUT_JSON = path.join(ROOT, "data", "apify-tecdoc-results.json");
const OUTPUT_SQL = path.join(ROOT, "api", "cf-worker", "generated-apify-scrape-inserts.sql");

// TecDoc API parameters (Norway/EU focused)
const LANG_ID = 4;       // English
const COUNTRY_ID = 161;  // Norway (or 62 for Germany)
const VEHICLE_TYPE = 1;  // Passenger cars

// Popular brands to query (from catalog frequency)
const TARGET_BRANDS = [
  "VOLKSWAGEN", "BMW", "MERCEDES", "AUDI", "VOLVO",
  "TOYOTA", "FORD", "SKODA", "SEAT", "PEUGEOT",
  "RENAULT", "OPEL", "CITROEN", "HYUNDAI", "KIA",
  "NISSAN", "MAZDA", "HONDA", "JAGUAR", "LAND ROVER",
];

// ── Helpers ───────────────────────────────────────────────────────────────
function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

async function callActor(client, endpoint, params) {
  const input = {
    ...params,
    [`${endpoint.split("/")[1]}_typeId`]: VEHICLE_TYPE,
    [`${endpoint.split("/")[1]}_langId`]: LANG_ID,
    [`${endpoint.split("/")[1]}_countryFilterId`]: COUNTRY_ID,
  };

  try {
    const run = await client.actor(ACTOR_ID).call({ endpoint, ...input });
    const dataset = await client.dataset(run.defaultDatasetId).listItems();
    return dataset.items || [];
  } catch (e) {
    console.error(`   ❌ Apify error: ${e.message}`);
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Apify TecDoc Scraper — kType + OE Harvester");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("  Limit:", LIMIT, "vehicles");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    console.log("🚫 DRY-RUN: Simulerer uten API-kall\n");
  } else if (!APIFY_TOKEN) {
    console.error("❌ APIFY_TOKEN mangler.");
    console.error("   1. Gå til https://console.apify.com/sign-up");
    console.error("   2. Kopier API token fra Settings → Integrations");
    console.error("   3. Sett: export APIFY_TOKEN=din_token");
    console.error("   4. (Valgfritt) Kjøp compute credits ($5/mnd gratis)");
    process.exit(1);
  }

  const client = new ApifyClient({ token: APIFY_TOKEN });

  // 1. Get manufacturers
  console.log("🔍 Henter manufacturers ...");
  let manufacturers = [];
  if (!DRY_RUN) {
    const result = await callActor(client, "/getManufacturers", {
      manufacturer_typeId: VEHICLE_TYPE,
      manufacturer_langId: LANG_ID,
      manufacturer_countryFilterId: COUNTRY_ID,
    });
    manufacturers = result;
  } else {
    manufacturers = [
      { manufacturerId: 2, manufacturerName: "VOLKSWAGEN" },
      { manufacturerId: 5, manufacturerName: "BMW" },
      { manufacturerId: 3, manufacturerName: "MERCEDES" },
    ];
  }
  console.log(`   Found ${manufacturers.length} manufacturers`);

  // Filter to target brands
  const targetManufacturers = manufacturers.filter((m) =>
    TARGET_BRANDS.includes(m.manufacturerName?.toUpperCase())
  );
  console.log(`   Target brands: ${targetManufacturers.length}`);

  // 2. Get models for each manufacturer
  const allVehicles = [];
  let vehicleCount = 0;

  for (const mfr of targetManufacturers) {
    if (vehicleCount >= LIMIT) break;

    process.stdout.write(`   📖 ${mfr.manufacturerName} ... `);

    let models = [];
    if (!DRY_RUN) {
      const result = await callActor(client, "/getModels", {
        models_manufacturerId: mfr.manufacturerId,
        models_typeId: VEHICLE_TYPE,
        models_langId: LANG_ID,
        models_countryFilterId: COUNTRY_ID,
      });
      models = result.slice(0, 5); // Limit models per brand
    } else {
      models = [{ modelId: 1234, modelName: "GOLF" }];
    }

    // 3. Get vehicle engine types for each model
    for (const model of models) {
      if (vehicleCount >= LIMIT) break;

      let vehicles = [];
      if (!DRY_RUN) {
        const result = await callActor(client, "/getVehicleEngineTypes", {
          vehicle_manufacturerId: mfr.manufacturerId,
          vehicle_modelId: model.modelId,
          vehicle_typeId: VEHICLE_TYPE,
          vehicle_langId: LANG_ID,
          vehicle_countryFilterId: COUNTRY_ID,
        });
        vehicles = result.slice(0, 3); // Limit vehicles per model
      } else {
        vehicles = [{
          vehicleId: 12345,
          vehicleName: "GOLF VII 1.6 TDI",
          yearOfConstrFrom: 2012,
          yearOfConstrTo: 2020,
        }];
      }

      for (const vehicle of vehicles) {
        allVehicles.push({
          manufacturerId: mfr.manufacturerId,
          manufacturerName: mfr.manufacturerName,
          modelId: model.modelId,
          modelName: model.modelName,
          vehicleId: vehicle.vehicleId, // THIS IS kType!
          vehicleName: vehicle.vehicleName,
          yearFrom: vehicle.yearOfConstrFrom,
          yearTo: vehicle.yearOfConstrTo,
        });
        vehicleCount++;
      }
    }

    console.log(`${models.length} models, ${vehicleCount - (allVehicles.length - models.length * 3)} vehicles`);
  }

  console.log(`\n📊 Total vehicles (kType candidates): ${allVehicles.length}`);

  // 4. Load catalog and match
  const catalog = JSON.parse(readFileSync(path.join(ROOT, "data", "catalog-prod.json"), "utf-8"));
  const records = catalog.records || [];

  // Build index: brand + modelPrefix → products
  const byBrandModel = new Map();
  for (const r of records) {
    if (!r.brand || !r.model) continue;
    const key = `${r.brand.toUpperCase()}:${r.model.split(/\s/)[0].toUpperCase()}`;
    if (!byBrandModel.has(key)) byBrandModel.set(key, []);
    byBrandModel.get(key).push(r);
  }

  const matched = [];
  for (const v of allVehicles) {
    const key = `${v.manufacturerName}:${v.modelName?.split(/\s/)[0].toUpperCase()}`;
    const candidates = byBrandModel.get(key) || [];

    for (const c of candidates) {
      // Year overlap check
      const cf = c.yearFrom || 0;
      const ct = c.yearTo || 9999;
      const vf = v.yearFrom || 0;
      const vt = v.yearTo || 9999;
      const overlap = Math.max(0, Math.min(ct, vt) - Math.max(cf, vf));

      if (overlap > 0) {
        matched.push({
          ktype: v.vehicleId,
          make: v.manufacturerName,
          model: v.modelName,
          vehicleName: v.vehicleName,
          yearFrom: v.yearFrom,
          yearTo: v.yearTo,
          eurocode: c.eurocode,
          catalogBrand: c.brand,
          catalogModel: c.model,
          catalogYearFrom: c.yearFrom,
          catalogYearTo: c.yearTo,
          catalogCategory: c.category,
        });
      }
    }
  }

  console.log(`   Matched: ${matched.length}`);

  // 5. Save results
  writeFileSync(OUTPUT_JSON, JSON.stringify({
    meta: {
      scrapedAt: new Date().toISOString(),
      actorId: ACTOR_ID,
      totalVehicles: allVehicles.length,
      matchedEntries: matched.length,
    },
    vehicles: allVehicles,
    matched,
  }, null, 2));
  console.log(`\n💾 JSON saved: ${OUTPUT_JSON}`);

  // 6. Generate SQL for scrape_results
  if (matched.length > 0 && !DRY_RUN) {
    const lines = [];
    lines.push("-- Auto-generert av apify-tecdoc-scraper.mjs");
    lines.push("");

    for (const m of matched) {
      const raw = JSON.stringify({
        vehicleName: m.vehicleName,
        catalogModel: m.catalogModel,
        catalogCategory: m.catalogCategory,
      });

      lines.push(
        `INSERT INTO scrape_results (source, ktype, make, model, year, eurocode, glass_part_type, raw_payload, confidence, status) ` +
        `VALUES ('apify_tecdoc', ${m.ktype}, ${escapeSql(m.make)}, ${escapeSql(m.model)}, ${m.yearFrom || "NULL"}, ${escapeSql(m.eurocode)}, ${escapeSql(m.catalogCategory)}, ${escapeSql(raw)}, 0.85, 'raw');`
      );
    }

    writeFileSync(OUTPUT_SQL, lines.join("\n"));
    console.log(`💾 SQL saved: ${OUTPUT_SQL}`);
    console.log(`\n🚀 Neste steg: cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=generated-apify-scrape-inserts.sql`);
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
