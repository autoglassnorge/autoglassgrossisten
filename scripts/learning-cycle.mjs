#!/usr/bin/env node
/**
 * Learning Cycle — Self-Improving Equipment Signatures
 * ====================================================
 * Reads search_history from D1 (or exported JSON) and compares learned
 * equipment frequencies with current catalog signatures.
 *
 * Outputs:
 *   - Updated signatures for Worker
 *   - Discrepancy report (where learned data differs from signatures)
 *   - New brand:model combinations not in current signatures
 *
 * Usage:
 *   # With D1 access:
 *   npx wrangler d1 execute glass-catalog-db --remote --command="SELECT * FROM search_history" > /tmp/history.json
 *   node scripts/learning-cycle.mjs --input=/tmp/history.json
 *
 *   # With exported data:
 *   node scripts/learning-cycle.mjs --input=data/search-history-export.json
 */

import * as fs from "fs";
import * as path from "path";

const SIG_PATH = path.join(process.cwd(), "data", "equipment-signatures.json");
const OUTPUT_SIG_PATH = path.join(process.cwd(), "data", "equipment-signatures-v2.json");
const DISCREPANCY_PATH = path.join(process.cwd(), "data", "learning-discrepancies.json");

const inputFile = process.argv.find((a) => a.startsWith("--input="))?.split("=")[1];

function loadSearchHistory() {
  if (!inputFile) {
    console.log("⚠ No input file provided. Use: --input=path/to/search_history.json");
    console.log("   To export from D1: npx wrangler d1 execute glass-catalog-db --remote --command=\"SELECT * FROM search_history\" > /tmp/history.json");
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
    // Handle D1 result format: { results: [...] }
    return data.results || data;
  } catch (e) {
    console.error(`❌ Failed to load ${inputFile}: ${e.message}`);
    return [];
  }
}

function loadCurrentSignatures() {
  try {
    return JSON.parse(fs.readFileSync(SIG_PATH, "utf-8"));
  } catch {
    return { brandModel: {}, generation: {} };
  }
}

function main() {
  console.log("\n🧠 Learning Cycle — v2.2");
  console.log("   Analyzing search_history to improve equipment signatures\n");

  const history = loadSearchHistory();
  if (history.length === 0) {
    console.log("   No search history available yet.");
    console.log("   Run bootstrap first: node scripts/bootstrap-learning-engine.mjs\n");
    return;
  }

  const currentSigs = loadCurrentSignatures();

  // Aggregate learned equipment per brand:model
  const learnedByBrandModel = {};
  const learnedByGeneration = {};

  for (const row of history) {
    const key = `${row.make || "UNKNOWN"}:${row.model || "UNKNOWN"}`;
    const gen = row.generation;

    // Brand:model aggregation
    if (!learnedByBrandModel[key]) {
      learnedByBrandModel[key] = {
        count: 0,
        adas: 0, rainSensor: 0, heated: 0, acoustic: 0,
        antenna: 0, hud: 0, camera: 0, shade: 0,
      };
    }
    learnedByBrandModel[key].count++;
    if (row.equipment_adas) learnedByBrandModel[key].adas++;
    if (row.equipment_rain_sensor) learnedByBrandModel[key].rainSensor++;
    if (row.equipment_heated) learnedByBrandModel[key].heated++;
    if (row.equipment_acoustic) learnedByBrandModel[key].acoustic++;
    if (row.equipment_antenna) learnedByBrandModel[key].antenna++;
    if (row.equipment_hud) learnedByBrandModel[key].hud++;
    if (row.equipment_camera) learnedByBrandModel[key].camera++;
    if (row.equipment_shade) learnedByBrandModel[key].shade++;

    // Generation aggregation
    if (gen) {
      if (!learnedByGeneration[gen]) {
        learnedByGeneration[gen] = {
          count: 0,
          adas: 0, rainSensor: 0, heated: 0, acoustic: 0,
          antenna: 0, hud: 0, camera: 0, shade: 0,
        };
      }
      learnedByGeneration[gen].count++;
      if (row.equipment_adas) learnedByGeneration[gen].adas++;
      if (row.equipment_rain_sensor) learnedByGeneration[gen].rainSensor++;
      if (row.equipment_heated) learnedByGeneration[gen].heated++;
      if (row.equipment_acoustic) learnedByGeneration[gen].acoustic++;
      if (row.equipment_antenna) learnedByGeneration[gen].antenna++;
      if (row.equipment_hud) learnedByGeneration[gen].hud++;
      if (row.equipment_camera) learnedByGeneration[gen].camera++;
      if (row.equipment_shade) learnedByGeneration[gen].shade++;
    }
  }

  // Convert to probabilities
  function toProb(agg) {
    const result = { count: agg.count };
    for (const f of ["adas", "rainSensor", "heated", "acoustic", "antenna", "hud", "camera", "shade"]) {
      const p = agg[f] / agg.count;
      if (p > 0) result[f] = Math.round(p * 100) / 100;
    }
    return result;
  }

  const newBrandModelSigs = {};
  const newGenerationSigs = {};
  const discrepancies = [];
  const newDiscoveries = [];

  // Compare brand:model signatures
  for (const [key, agg] of Object.entries(learnedByBrandModel)) {
    if (agg.count < 3) continue; // Need at least 3 samples
    const learned = toProb(agg);
    const current = currentSigs.brandModel?.[key];

    if (!current) {
      // New discovery!
      newDiscoveries.push({ key, ...learned });
      newBrandModelSigs[key] = learned;
    } else {
      // Compare and find discrepancies
      newBrandModelSigs[key] = learned;
      for (const f of ["adas", "rainSensor", "heated", "acoustic", "antenna", "hud", "camera"]) {
        const currProb = current[f] || 0;
        const learnedProb = learned[f] || 0;
        const diff = Math.abs(learnedProb - currProb);
        if (diff >= 0.2) {
          discrepancies.push({
            key,
            field: f,
            current: currProb,
            learned: learnedProb,
            diff,
            samples: agg.count,
          });
        }
      }
    }
  }

  // Compare generation signatures
  for (const [gen, agg] of Object.entries(learnedByGeneration)) {
    if (agg.count < 5) continue;
    const learned = toProb(agg);
    const current = currentSigs.generation?.[gen];
    newGenerationSigs[gen] = learned;

    if (current) {
      for (const f of ["adas", "rainSensor", "heated", "acoustic", "antenna", "hud", "camera"]) {
        const currProb = current[f] || 0;
        const learnedProb = learned[f] || 0;
        const diff = Math.abs(learnedProb - currProb);
        if (diff >= 0.2) {
          discrepancies.push({
            key: `gen:${gen}`,
            field: f,
            current: currProb,
            learned: learnedProb,
            diff,
            samples: agg.count,
          });
        }
      }
    }
  }

  // Stats
  console.log(`📊 Analysis Results:`);
  console.log(`   Search history records: ${history.length}`);
  console.log(`   Unique brand:model: ${Object.keys(learnedByBrandModel).length}`);
  console.log(`   Unique generations: ${Object.keys(learnedByGeneration).length}`);
  console.log(`   New discoveries: ${newDiscoveries.length}`);
  console.log(`   Discrepancies: ${discrepancies.length}`);
  console.log();

  // Show top discrepancies
  if (discrepancies.length > 0) {
    console.log(`⚠ Top discrepancies (learned vs current signatures):`);
    discrepancies
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10)
      .forEach((d) => {
        console.log(`   ${d.key} → ${d.field}: current=${(d.current * 100).toFixed(0)}% learned=${(d.learned * 100).toFixed(0)}% (diff=${(d.diff * 100).toFixed(0)}%, n=${d.samples})`);
      });
    console.log();
  }

  // Show new discoveries
  if (newDiscoveries.length > 0) {
    console.log(`🌟 New brand:model signatures discovered:`);
    newDiscoveries
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .forEach((d) => {
        const fields = Object.entries(d)
          .filter(([k]) => k !== "count" && k !== "key")
          .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
          .join(", ");
        console.log(`   ${d.key} (${d.count} samples): ${fields}`);
      });
    console.log();
  }

  // Write updated signatures
  const updatedSigs = {
    meta: {
      builtAt: new Date().toISOString(),
      recordsProcessed: history.length,
      brandModelSignatures: Object.keys(newBrandModelSigs).length,
      generationSignatures: Object.keys(newGenerationSigs).length,
    },
    brandModel: newBrandModelSigs,
    generation: newGenerationSigs,
  };

  fs.writeFileSync(OUTPUT_SIG_PATH, JSON.stringify(updatedSigs, null, 2));
  console.log(`✅ Updated signatures written to ${OUTPUT_SIG_PATH}`);

  // Write discrepancies
  if (discrepancies.length > 0) {
    fs.writeFileSync(DISCREPANCY_PATH, JSON.stringify(discrepancies, null, 2));
    console.log(`⚠ Discrepancies written to ${DISCREPANCY_PATH}`);
  }

  console.log();
  console.log(`📝 Next steps:`);
  console.log(`   1. Review ${OUTPUT_SIG_PATH}`);
  console.log(`   2. Update CATALOG_EQUIPMENT_SIGNATURES in Worker`);
  console.log(`   3. Rebuild and deploy Worker`);
  console.log();
}

main();
