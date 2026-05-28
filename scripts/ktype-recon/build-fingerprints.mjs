#!/usr/bin/env node
/**
 * Build Vehicle Fingerprint Database from SVV data
 * =================================================
 * Analyserer SVV-cache for å bygge en fingerprint-database
 * som mapper brand+model+year → typiske vehicle specs.
 *
 * Output: data/ktype-recon/vehicle-fingerprints.json
 *         data/ktype-recon/typecode-to-generation.json
 */

import { readFileSync, writeFileSync } from "fs";

const CACHE_FILE = "data/finn-no-regnr/svv-cache.ndjson";
const OUTPUT_DIR = "data/ktype-recon";

function loadSvvData() {
  const lines = readFileSync(CACHE_FILE, "utf-8").split("\n").filter(Boolean);
  return lines.map(l => JSON.parse(l)).filter(r => r.status === "ok");
}

function majorityVote(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

function buildFingerprints(records) {
  // Group by brand+model+year
  const byKey = new Map();
  for (const r of records) {
    const key = `${r.make}|${r.model}|${r.year}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        make: r.make,
        model: r.model,
        year: r.year,
        samples: [],
      });
    }
    byKey.get(key).samples.push(r);
  }

  const fingerprints = [];
  for (const [, group] of byKey) {
    const typeCodes = {};
    const lengths = {};
    const engines = {};
    const fuels = {};
    const gvws = {};
    const seats = {};

    for (const s of group.samples) {
      typeCodes[s.typeCode || "UNKNOWN"] = (typeCodes[s.typeCode || "UNKNOWN"] || 0) + 1;
      if (s.length) lengths[s.length] = (lengths[s.length] || 0) + 1;
      engines[s.engineCode || "UNKNOWN"] = (engines[s.engineCode || "UNKNOWN"] || 0) + 1;
      fuels[s.fuelCode || "UNKNOWN"] = (fuels[s.fuelCode || "UNKNOWN"] || 0) + 1;
      if (s.gvwr) gvws[s.gvwr] = (gvws[s.gvwr] || 0) + 1;
      if (s.seats) seats[s.seats] = (seats[s.seats] || 0) + 1;
    }

    const dominantTypeCode = majorityVote(typeCodes);
    const dominantLength = majorityVote(lengths);
    const dominantEngine = majorityVote(engines);
    const dominantFuel = majorityVote(fuels);
    const dominantGvwr = majorityVote(gvws);
    const dominantSeats = majorityVote(seats);

    // Determine confidence based on consensus
    const total = group.samples.length;
    const typeCodeConfidence = dominantTypeCode ? (typeCodes[dominantTypeCode] / total) : 0;

    fingerprints.push({
      make: group.make,
      model: group.model,
      year: group.year,
      sampleCount: total,
      fingerprint: {
        typeCode: dominantTypeCode,
        typeCodeConfidence: Math.round(typeCodeConfidence * 100) / 100,
        length: dominantLength ? parseInt(dominantLength, 10) : null,
        engineCode: dominantEngine !== "UNKNOWN" ? dominantEngine : null,
        fuelCode: dominantFuel !== "UNKNOWN" ? dominantFuel : null,
        gvwr: dominantGvwr ? parseInt(dominantGvwr, 10) : null,
        seats: dominantSeats ? parseInt(dominantSeats, 10) : null,
      },
      // All observed values for debugging
      observed: {
        typeCodes: Object.keys(typeCodes),
        engines: Object.keys(engines).filter(e => e !== "UNKNOWN"),
        fuels: Object.keys(fuels).filter(f => f !== "UNKNOWN"),
      },
    });
  }

  return fingerprints;
}

function buildTypeCodeMap(fingerprints) {
  // Map typeCode → generation hints
  const map = new Map();
  for (const fp of fingerprints) {
    const tc = fp.fingerprint.typeCode;
    if (!tc || tc === "UNKNOWN") continue;
    const key = `${fp.make}|${tc}`;
    if (!map.has(key)) {
      map.set(key, { make: fp.make, typeCode: tc, years: [], models: [] });
    }
    const entry = map.get(key);
    entry.years.push(fp.year);
    if (!entry.models.includes(fp.model)) entry.models.push(fp.model);
  }

  const result = [];
  for (const [, entry] of map) {
    const minYear = Math.min(...entry.years);
    const maxYear = Math.max(...entry.years);
    result.push({
      make: entry.make,
      typeCode: entry.typeCode,
      yearFrom: minYear,
      yearTo: maxYear,
      models: entry.models,
      modelHint: entry.models.length === 1 ? entry.models[0] : null,
    });
  }

  return result.sort((a, b) => a.make.localeCompare(b.make) || a.typeCode.localeCompare(b.typeCode));
}

function buildBrandModelMap(fingerprints) {
  // Group by brand+model → all years and typeCodes
  const map = new Map();
  for (const fp of fingerprints) {
    const key = `${fp.make}|${fp.model}`;
    if (!map.has(key)) {
      map.set(key, { make: fp.make, model: fp.model, years: [], typeCodes: [] });
    }
    const entry = map.get(key);
    entry.years.push(fp.year);
    if (fp.fingerprint.typeCode && !entry.typeCodes.includes(fp.fingerprint.typeCode)) {
      entry.typeCodes.push(fp.fingerprint.typeCode);
    }
  }

  const result = [];
  for (const [, entry] of map) {
    result.push({
      make: entry.make,
      model: entry.model,
      yearFrom: Math.min(...entry.years),
      yearTo: Math.max(...entry.years),
      typeCodes: entry.typeCodes,
    });
  }

  return result.sort((a, b) => a.make.localeCompare(b.make));
}

async function main() {
  console.log("🔨 Bygger vehicle fingerprint-database...");
  const records = loadSvvData();
  console.log(`  Lastet ${records.length} SVV-records`);

  const fingerprints = buildFingerprints(records);
  console.log(`  Fingerprints: ${fingerprints.length}`);

  const typeCodeMap = buildTypeCodeMap(fingerprints);
  console.log(`  TypeCode mappings: ${typeCodeMap.length}`);

  const brandModelMap = buildBrandModelMap(fingerprints);
  console.log(`  Brand+Model mappings: ${brandModelMap.length}`);

  // Write outputs
  const output = {
    generatedAt: new Date().toISOString(),
    sourceRecords: records.length,
    fingerprints: fingerprints.length,
    data: fingerprints,
  };

  writeFileSync(`${OUTPUT_DIR}/vehicle-fingerprints.json`, JSON.stringify(output, null, 2));

  writeFileSync(`${OUTPUT_DIR}/typecode-to-generation.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mappings: typeCodeMap,
  }, null, 2));

  writeFileSync(`${OUTPUT_DIR}/brand-model-years.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mappings: brandModelMap,
  }, null, 2));

  console.log(`\n✅ Ferdig!`);
  console.log(`  vehicle-fingerprints.json: ${fingerprints.length} fingerprints`);
  console.log(`  typecode-to-generation.json: ${typeCodeMap.length} typeCode mappings`);
  console.log(`  brand-model-years.json: ${brandModelMap.length} brand+model mappings`);

  // Show some examples
  console.log(`\n📊 Eksempler:`);
  for (const fp of fingerprints.slice(0, 5)) {
    console.log(`  ${fp.make} ${fp.model} (${fp.year}): typeCode=${fp.fingerprint.typeCode}, engine=${fp.fingerprint.engineCode}, fuel=${fp.fingerprint.fuelCode}, n=${fp.sampleCount}`);
  }
}

main().catch(console.error);
