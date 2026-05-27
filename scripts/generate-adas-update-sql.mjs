#!/usr/bin/env node
/**
 * generate-adas-update-sql.mjs
 * ============================
 * Generate UPDATE SQL for products that have adas_features from PDF enrichment.
 * This is much smaller than a full re-insert of all 39,458 products.
 */

import { readFileSync, writeFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CATALOG_PATH = path.join(ROOT, "data", "catalog-prod.json");
const OUTPUT_SQL = path.join(ROOT, "api", "cf-worker", "generated-adas-updates.sql");

function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  const records = catalog.records;

  const enriched = records.filter((r) => r.adasFeatures && r.adasFeatures.length > 0);
  console.log(`📊 ${enriched.length} products with adas_features to update`);

  const lines = [];
  lines.push("-- Auto-generert av generate-adas-update-sql.mjs");
  lines.push("-- Oppdaterer adas_features for produkter beriket fra Mygrant PDFs");
  lines.push("");
  lines.push("BEGIN TRANSACTION;");
  lines.push("");

  for (const r of enriched) {
    lines.push(
      `UPDATE glass_catalog SET adas_features = ${escapeSql(JSON.stringify(r.adasFeatures))}, ` +
      `adas = 1, ` +
      `rain_sensor = ${r.rainSensor ? 1 : 0}, ` +
      `heated = ${r.heated ? 1 : 0}, ` +
      `acoustic = ${r.acoustic ? 1 : 0}, ` +
      `lane_assist = ${r.laneAssist ? 1 : 0}, ` +
      `hud = ${r.hud ? 1 : 0}, ` +
      `camera = ${r.camera ? 1 : 0} ` +
      `WHERE eurocode = ${escapeSql(r.eurocode)};`
    );
  }

  lines.push("");
  lines.push("COMMIT;");

  writeFileSync(OUTPUT_SQL, lines.join("\n"));

  const stats = statSync(OUTPUT_SQL);
  console.log(`💾 SQL-fil lagret: ${OUTPUT_SQL}`);
  console.log(`   Størrelse: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Oppdateringer: ${enriched.length}`);
  console.log("\n🚀 Neste steg:");
  console.log("   cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=generated-adas-updates.sql");
}

main();
