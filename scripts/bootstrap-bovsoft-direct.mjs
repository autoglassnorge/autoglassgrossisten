#!/usr/bin/env node
/**
 * Bootstrap Bovsoft Direct — Robust Version
 * ==========================================
 * Calls Bovsoft REGNUM API directly. Writes results continuously.
 */

import * as fs from "fs";
import * as path from "path";

const OUTPUT_FILE = path.join(process.cwd(), "data", "bovsoft-bootstrap-results.json");
const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";

// Known-working regnr for testing + a few extras
const TEST_REGNR = [
  "SU18018",   // VW Caravelle — known working
  "UX71699",   // Peugeot 307 — known working
  "BS12345",   // Skoda Superb — known working
  "EL12345",   // THINK CITY — known working
  "PA12345",   // Volvo 240 — known working
];

function loadExisting() {
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    } catch { /* ignore */ }
  }
  return { meta: { startedAt: new Date().toISOString() }, results: [] };
}

function save(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

async function fetchBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return await res.json();
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

function parseYear(yyyymm) {
  if (!yyyymm || yyyymm.length < 4) return 0;
  return parseInt(yyyymm.slice(0, 4), 10);
}

async function main() {
  console.log("\n🔥 Bootstrap Bovsoft Direct (Robust)\n");

  const data = loadExisting();
  const existingRegnr = new Set(data.results.map((r) => r.regnr));
  let success = 0;
  let notFound = 0;
  let error = 0;

  for (const regnr of TEST_REGNR) {
    if (existingRegnr.has(regnr)) {
      console.log(`  ⏭ ${regnr} → already fetched`);
      continue;
    }

    const res = await fetchBovsoft(regnr);

    if (res.status === 200) {
      const car = res.data?.datacar?.[0];
      if (car) {
        const record = {
          regnr,
          ktype: car.ktype,
          vin: car.vin || null,
          brand: car.manufCar?.toUpperCase(),
          model: car.modelCar?.toUpperCase(),
          body: car.bodyCar,
          type: car.typeCar,
          yearFrom: parseYear(car.typeFromYearCar),
          yearTo: parseYear(car.typeToYearCar),
          fuel: car.fuelSystem,
          engineCode: car.listEngines,
          hp: car.hpCar,
          kw: car.kwCar,
          freeRequests: res.countFREERequests,
          fetchedAt: new Date().toISOString(),
        };
        data.results.push(record);
        console.log(`  ✅ ${regnr} → ktype=${record.ktype} ${record.brand} ${record.model?.slice(0, 25)} (${record.yearFrom}-${record.yearTo})`);
        success++;
      } else {
        console.log(`  ⚠ ${regnr} → status=200 but no car data`);
        error++;
      }
    } else if (res.status === 404) {
      console.log(`  🔍 ${regnr} → not found`);
      notFound++;
    } else {
      console.log(`  ❌ ${regnr} → status=${res.status} ${res.statusText || res.error || ""}`);
      error++;
    }

    save(data);
    await new Promise((r) => setTimeout(r, 500));
  }

  data.meta.updatedAt = new Date().toISOString();
  data.meta.total = data.results.length;
  save(data);

  console.log("\n" + "═".repeat(50));
  console.log(`📊 Results:`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   🔍 Not found: ${notFound}`);
  console.log(`   ❌ Error: ${error}`);
  console.log(`   📁 Total saved: ${data.results.length}`);
  console.log(`   💾 File: ${OUTPUT_FILE}`);
  console.log();
}

main().catch(console.error);
