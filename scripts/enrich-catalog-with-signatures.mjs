#!/usr/bin/env node
/**
 * Enrich Catalog with Equipment Signatures
 * =========================================
 * Uses learned equipment signatures to fill missing equipment flags
 * in the catalog. This improves matching for ALL searches.
 *
 * Usage:
 *   node scripts/enrich-catalog-with-signatures.mjs
 *   node scripts/enrich-catalog-with-signatures.mjs --apply  # write to catalog-prod.json
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const SIG_PATH = path.join(process.cwd(), "data", "equipment-signatures.json");
const APPLY = process.argv.includes("--apply");

function parseGenerationFromDescription(desc) {
  if (!desc) return null;
  const gens = [
    /\b(T[1-6])\b/i,
    /\b(E30|E36|E46|E90|F30|G20|E34|E39|E60|F10|G30)\b/i,
    /\b(W20[1-6]|W124|W210|W211|W212|W213)\b/i,
    /\b(B[5-9]|8[LPVY])\b/i,
    /\b(MK\s*[1234])\b/i,
    /\b(P[123]|SPA)\b/i,
    /\b(J1[012])\b/i,
    /\b(BK|BL|BM|BP|GJ|KE|KF)\b/i,
    /\b(1U|1Z|5E|NX|3V|3T|6Y|NJ)\b/i,
  ];
  for (const re of gens) {
    const m = desc.match(re);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function main() {
  console.log("🔬 Enriching catalog with equipment signatures...\n");
  console.log(`   Mode: ${APPLY ? "WRITE" : "DRY RUN (add --apply to save)"}\n`);

  const data = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = data.records || [];
  const signatures = JSON.parse(fs.readFileSync(SIG_PATH, "utf-8"));

  const equipFields = ["adas", "rainSensor", "heated", "acoustic", "antenna", "hud", "camera"];
  // Note: shade is excluded from auto-enrichment as it's a tint indicator, not distinguishing equipment
  const brandModelSigs = signatures.brandModel || {};
  const generationSigs = signatures.generation || {};

  let enriched = 0;
  let alreadySet = 0;
  let noSig = 0;
  const enrichmentLog = [];

  for (const r of records) {
    const brand = (r.brand || "").toUpperCase().trim();
    const model = (r.model || "").toUpperCase().trim();
    const gen = parseGenerationFromDescription(r.description);

    // Skip if already has any equipment
    const hasAny = equipFields.some((f) => r[f]);
    if (hasAny) {
      alreadySet++;
      continue;
    }

    // Try brand:model signature
    const key = `${brand}:${model}`;
    let sig = brandModelSigs[key];
    let source = "brandModel";

    // Fallback to generation
    if (!sig && gen) {
      sig = generationSigs[gen];
      source = "generation";
    }

    if (!sig) {
      noSig++;
      continue;
    }

    let changed = false;
    for (const f of equipFields) {
      const prob = sig[f];
      if (prob && prob >= 0.5) {
        r[f] = true;
        changed = true;
      }
    }

    if (changed) {
      enriched++;
      enrichmentLog.push({
        eurocode: r.eurocode,
        brand: r.brand,
        model: r.model,
        source,
        gen,
        set: equipFields.filter((f) => r[f]),
      });
    }
  }

  // Write if --apply
  if (APPLY) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
    console.log(`✅ Catalog enriched and saved to ${CATALOG_PATH}\n`);
  }

  // Stats
  console.log(`📊 Results:`);
  console.log(`   Total records: ${records.length.toLocaleString("nb-NO")}`);
  console.log(`   Already had equipment: ${alreadySet.toLocaleString("nb-NO")}`);
  console.log(`   No signature found: ${noSig.toLocaleString("nb-NO")}`);
  console.log(`   Enriched: ${enriched.toLocaleString("nb-NO")}`);
  console.log();

  // Show top enrichments
  if (enrichmentLog.length > 0) {
    console.log(`🏆 Top enriched records:`);
    for (const e of enrichmentLog.slice(0, 20)) {
      console.log(`   ${e.eurocode} | ${e.brand} ${e.model} | source=${e.source} | set=[${e.set.join(", ")}]`);
    }
    console.log();
  }

  // Generate SQL for D1 update
  if (enrichmentLog.length > 0 && APPLY) {
    const sqlPath = "/tmp/enrich-catalog.sql";
    let sql = "-- Enrich glass_catalog with equipment signatures\nBEGIN TRANSACTION;\n";
    for (const e of enrichmentLog) {
      const sets = [];
      for (const f of e.set) {
        const col = f === "rainSensor" ? "rain_sensor" : f;
        sets.push(`${col} = 1`);
      }
      sql += `UPDATE glass_catalog SET ${sets.join(", ")} WHERE eurocode = '${e.eurocode}';\n`;
    }
    sql += "COMMIT;\n";
    fs.writeFileSync(sqlPath, sql);
    console.log(`📄 D1 SQL generated: ${sqlPath}`);
    console.log(`   Run: npx wrangler d1 execute glass-catalog-db --remote --file=${sqlPath}`);
    console.log();
  }

  if (!APPLY) {
    console.log(`⚠ Dry run — no files were modified.`);
    console.log(`   Add --apply to save changes to catalog-prod.json`);
    console.log();
  }
}

main();
