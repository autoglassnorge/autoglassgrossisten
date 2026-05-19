#!/usr/bin/env node
/**
 * Build Equipment Signatures from Catalog Data
 * ==============================================
 * Creates statistical equipment signatures per (brand, model, year_bucket)
 * that can be used to GUESS equipment when no API is available.
 *
 * Signatures are probability-based:
 *   BMW 5-Series 2010-2015: { rainSensor: 0.45, heated: 0.30, camera: 0.25, hud: 0.15 }
 *
 * These signatures are stored as JSON for the Worker to load.
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "equipment-signatures.json");

function parseYearRangeFromDescription(desc) {
  if (!desc) return { from: null, to: null };
  const m1 = desc.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*(\d{4})\s*[;\)\s]/);
  if (m1) return { from: parseInt(m1[1], 10), to: parseInt(m1[2], 10) };
  const m2 = desc.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*[;\)\s]/);
  if (m2) return { from: parseInt(m2[1], 10), to: null };
  const m3 = desc.match(/(?:^|\s|\()(19\d{2}|20\d{2})(?:\s*[;\)\s]|$)/);
  if (m3) return { from: parseInt(m3[1], 10), to: null };
  return { from: null, to: null };
}

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
  console.log("🔬 Building equipment signatures...\n");

  const data = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = data.records || [];

  const equipFields = ["adas", "rainSensor", "heated", "acoustic", "antenna", "hud", "shade", "camera"];

  // 1. Build signatures by brand:model:year_bucket
  const brandModelYearSig = {};
  // 2. Build signatures by brand:model
  const brandModelSig = {};
  // 3. Build signatures by generation
  const generationSig = {};
  // 4. Build signatures by brand only
  const brandSig = {};

  for (const r of records) {
    const brand = (r.brand || "").toUpperCase().trim();
    const model = (r.model || "").toUpperCase().trim();
    const yr = parseYearRangeFromDescription(r.description);
    const gen = parseGenerationFromDescription(r.description);
    const yearBucket = yr.from ? `${Math.floor(yr.from / 5) * 5}` : null;

    // Skip records with no equipment data at all
    const hasAnyEquip = equipFields.some((f) => r[f]);
    if (!hasAnyEquip) continue;

    // Brand:model:year
    if (brand && model && yearBucket) {
      const key = `${brand}:${model}:${yearBucket}`;
      if (!brandModelYearSig[key]) {
        brandModelYearSig[key] = { count: 0, equip: {} };
        for (const f of equipFields) brandModelYearSig[key].equip[f] = 0;
      }
      brandModelYearSig[key].count++;
      for (const f of equipFields) {
        if (r[f]) brandModelYearSig[key].equip[f]++;
      }
    }

    // Brand:model
    if (brand && model) {
      const key = `${brand}:${model}`;
      if (!brandModelSig[key]) {
        brandModelSig[key] = { count: 0, equip: {} };
        for (const f of equipFields) brandModelSig[key].equip[f] = 0;
      }
      brandModelSig[key].count++;
      for (const f of equipFields) {
        if (r[f]) brandModelSig[key].equip[f]++;
      }
    }

    // Generation
    if (gen) {
      if (!generationSig[gen]) {
        generationSig[gen] = { count: 0, equip: {} };
        for (const f of equipFields) generationSig[gen].equip[f] = 0;
      }
      generationSig[gen].count++;
      for (const f of equipFields) {
        if (r[f]) generationSig[gen].equip[f]++;
      }
    }

    // Brand only
    if (brand) {
      if (!brandSig[brand]) {
        brandSig[brand] = { count: 0, equip: {} };
        for (const f of equipFields) brandSig[brand].equip[f] = 0;
      }
      brandSig[brand].count++;
      for (const f of equipFields) {
        if (r[f]) brandSig[brand].equip[f]++;
      }
    }
  }

  // Convert counts to probabilities (only include if count >= 5 for statistical significance)
  function toProbabilities(sig, minCount = 5) {
    const result = {};
    for (const [key, data] of Object.entries(sig)) {
      if (data.count < minCount) continue;
      result[key] = { count: data.count };
      for (const f of equipFields) {
        const p = data.equip[f] / data.count;
        if (p > 0) {
          result[key][f] = Math.round(p * 100) / 100;
        }
      }
    }
    return result;
  }

  const signatures = {
    meta: {
      builtAt: new Date().toISOString(),
      totalRecords: records.length,
      recordsWithEquipment: Object.values(brandModelSig).reduce((s, d) => s + d.count, 0),
    },
    brandModelYear: toProbabilities(brandModelYearSig, 3),
    brandModel: toProbabilities(brandModelSig, 5),
    generation: toProbabilities(generationSig, 10),
    brand: toProbabilities(brandSig, 10),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(signatures, null, 2));

  console.log(`📊 Built ${Object.keys(signatures.brandModelYear).length} brand:model:year signatures`);
  console.log(`📊 Built ${Object.keys(signatures.brandModel).length} brand:model signatures`);
  console.log(`📊 Built ${Object.keys(signatures.generation).length} generation signatures`);
  console.log(`📊 Built ${Object.keys(signatures.brand).length} brand signatures`);

  // Show top 10 most confident signatures
  console.log("\n🏆 Top 10 most confident equipment signatures:");
  const allSigs = [];
  for (const [key, data] of Object.entries(signatures.brandModel)) {
    for (const f of equipFields) {
      if (data[f] && data[f] >= 0.5) {
        allSigs.push({ key, field: f, prob: data[f], count: data.count });
      }
    }
  }
  allSigs.sort((a, b) => b.prob - a.prob);
  for (const s of allSigs.slice(0, 10)) {
    console.log(`   ${s.key} → ${s.field} = ${(s.prob * 100).toFixed(0)}% (${s.count} samples)`);
  }

  console.log(`\n✅ Signatures saved to ${OUTPUT_PATH}`);
}

main();
