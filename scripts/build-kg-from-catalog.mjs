#!/usr/bin/env node
/**
 * Build MemPalace KG facts from catalog data
 * ===========================================
 * Extracts statistical patterns and stores them in the knowledge graph
 * for the Worker to query/learn from over time.
 *
 * Patterns learned:
 *   1. brand:model:year → equipment probability (e.g. BMW 5-Series 2016+ often has HUD)
 *   2. brand:model:generation → equipment signature
 *   3. VIN-prefix patterns (already in code, but we store known good mappings)
 *   4. Equipment co-occurrence (e.g. CAMERA usually comes with ADAS)
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");

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
  const vw = desc.match(/\b(T[1-6])\b/i);
  if (vw) return vw[1].toUpperCase();
  const bmw = desc.match(/\b(E30|E36|E46|E90|F30|G20|E34|E39|E60|F10|G30)\b/i);
  if (bmw) return bmw[1].toUpperCase();
  const merc = desc.match(/\b(W20[1-6]|W124|W210|W211|W212|W213)\b/i);
  if (merc) return merc[1].toUpperCase();
  const audi = desc.match(/\b(B[5-9]|8[LPVY])\b/i);
  if (audi) return audi[1].toUpperCase();
  const ford = desc.match(/\b(MK\s*[1234])\b/i);
  if (ford) return ford[1].toUpperCase();
  const volvo = desc.match(/\b(P[123]|SPA)\b/i);
  if (volvo) return volvo[1].toUpperCase();
  const nissan = desc.match(/\b(J1[012])\b/i);
  if (nissan) return nissan[1].toUpperCase();
  const mazda = desc.match(/\b(BK|BL|BM|BP|GJ|KE|KF)\b/i);
  if (mazda) return mazda[1].toUpperCase();
  const skoda = desc.match(/\b(1U|1Z|5E|NX|3V|3T|6Y|NJ)\b/i);
  if (skoda) return skoda[1].toUpperCase();
  return null;
}

function main() {
  console.log("📚 Building KG from catalog...\n");
  
  const data = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = data.records || [];
  
  // 1. Equipment co-occurrence matrix
  const equipFields = ['adas', 'rainSensor', 'heated', 'acoustic', 'antenna', 'hud', 'shade', 'camera'];
  const coOccur = {};
  for (const f1 of equipFields) {
    coOccur[f1] = {};
    for (const f2 of equipFields) {
      coOccur[f1][f2] = { both: 0, onlyF1: 0, total: 0 };
    }
  }
  
  // 2. Brand:model:year → equipment signature
  const brandModelYearEquip = {};
  
  // 3. Generation → equipment signature
  const genEquip = {};
  
  // 4. Brand → most common equipment by year bucket
  const brandYearEquip = {};
  
  for (const r of records) {
    const brand = (r.brand || "").toUpperCase().trim();
    const model = (r.model || "").toUpperCase().trim();
    const yr = parseYearRangeFromDescription(r.description);
    const gen = parseGenerationFromDescription(r.description);
    const yearBucket = yr.from ? Math.floor(yr.from / 5) * 5 : null;
    
    // Co-occurrence
    for (let i = 0; i < equipFields.length; i++) {
      for (let j = 0; j < equipFields.length; j++) {
        const f1 = equipFields[i];
        const f2 = equipFields[j];
        const hasF1 = !!r[f1];
        const hasF2 = !!r[f2];
        coOccur[f1][f2].total++;
        if (hasF1 && hasF2) coOccur[f1][f2].both++;
        if (hasF1 && !hasF2) coOccur[f1][f2].onlyF1++;
      }
    }
    
    // Generation signature
    if (gen) {
      if (!genEquip[gen]) {
        genEquip[gen] = { count: 0, equip: {} };
        for (const f of equipFields) genEquip[gen].equip[f] = 0;
      }
      genEquip[gen].count++;
      for (const f of equipFields) {
        if (r[f]) genEquip[gen].equip[f]++;
      }
    }
    
    // Brand:model:year bucket signature
    if (brand && model && yearBucket) {
      const key = `${brand}:${model}:${yearBucket}`;
      if (!brandModelYearEquip[key]) {
        brandModelYearEquip[key] = { count: 0, equip: {} };
        for (const f of equipFields) brandModelYearEquip[key].equip[f] = 0;
      }
      brandModelYearEquip[key].count++;
      for (const f of equipFields) {
        if (r[f]) brandModelYearEquip[key].equip[f]++;
      }
    }
    
    // Brand year bucket
    if (brand && yearBucket) {
      const key = `${brand}:${yearBucket}`;
      if (!brandYearEquip[key]) {
        brandYearEquip[key] = { count: 0, equip: {} };
        for (const f of equipFields) brandYearEquip[key].equip[f] = 0;
      }
      brandYearEquip[key].count++;
      for (const f of equipFields) {
        if (r[f]) brandYearEquip[key].equip[f]++;
      }
    }
  }
  
  // Print insights
  console.log("📊 Equipment Co-occurrence (when X is present, how often is Y also present):");
  console.log("   Format: X→Y = (both / X-total)%\n");
  for (const f1 of equipFields) {
    const row = [];
    for (const f2 of equipFields) {
      const { both, total } = coOccur[f1][f2];
      const pct = total > 0 ? Math.round((both / total) * 100) : 0;
      if (f1 !== f2 && both > 10) {
        row.push(`${f1}→${f2}=${pct}%`);
      }
    }
    if (row.length > 0) {
      console.log(`   ${row.join(", ")}`);
    }
  }
  
  console.log("\n🏷️  Generation Equipment Signatures (top generations):");
  const sortedGen = Object.entries(genEquip)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  for (const [gen, data] of sortedGen) {
    const sig = equipFields
      .map(f => ({ f, pct: data.count > 0 ? Math.round((data.equip[f] / data.count) * 100) : 0 }))
      .filter(x => x.pct > 0)
      .map(x => `${x.f}=${x.pct}%`)
      .join(", ");
    if (sig) {
      console.log(`   ${gen} (${data.count} records): ${sig}`);
    }
  }
  
  console.log("\n🏭 Brand:Year Equipment Signatures (high-confidence patterns):");
  const sortedBrandYear = Object.entries(brandYearEquip)
    .filter(([, d]) => d.count >= 20)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  for (const [key, data] of sortedBrandYear) {
    const sig = equipFields
      .map(f => ({ f, pct: data.count > 0 ? Math.round((data.equip[f] / data.count) * 100) : 0 }))
      .filter(x => x.pct >= 30)  // Only high-confidence patterns
      .map(x => `${x.f}=${x.pct}%`)
      .join(", ");
    if (sig) {
      console.log(`   ${key} (${data.count} records): ${sig}`);
    }
  }
  
  // Generate KG facts for strong patterns
  console.log("\n🧠 KG Facts to add:");
  const kgFacts = [];
  
  // Strong co-occurrence patterns
  for (const f1 of equipFields) {
    for (const f2 of equipFields) {
      if (f1 >= f2) continue;
      const { both, total } = coOccur[f1][f2];
      const pct = total > 0 ? (both / total) * 100 : 0;
      if (both >= 20 && pct >= 70) {
        kgFacts.push({ subject: `equipment-${f1}`, predicate: "co-occurs-with", object: `equipment-${f2}(${Math.round(pct)}%)` });
      }
    }
  }
  
  // Generation → equipment patterns (>50% of that generation has it)
  for (const [gen, data] of sortedGen) {
    for (const f of equipFields) {
      const pct = data.count > 0 ? (data.equip[f] / data.count) * 100 : 0;
      if (pct >= 50 && data.count >= 10) {
        kgFacts.push({ subject: `generation-${gen}`, predicate: "typically-has", object: `equipment-${f}(${Math.round(pct)}%)` });
      }
    }
  }
  
  // Brand:year → equipment patterns (>60%)
  for (const [key, data] of sortedBrandYear) {
    for (const f of equipFields) {
      const pct = data.count > 0 ? (data.equip[f] / data.count) * 100 : 0;
      if (pct >= 60 && data.count >= 20) {
        kgFacts.push({ subject: `brand-year-${key}`, predicate: "typically-has", object: `equipment-${f}(${Math.round(pct)}%)` });
      }
    }
  }
  
  for (const fact of kgFacts) {
    console.log(`   kg_add("${fact.subject}", "${fact.predicate}", "${fact.object}")`);
  }
  
  // Save to file for later batch insertion
  const KG_OUTPUT = path.join(process.cwd(), "data", "kg-facts-catalog.json");
  fs.writeFileSync(KG_OUTPUT, JSON.stringify(kgFacts, null, 2));
  console.log(`\n✅ ${kgFacts.length} KG facts saved to ${KG_OUTPUT}`);
}

main();
