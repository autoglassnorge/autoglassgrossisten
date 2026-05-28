#!/usr/bin/env node
/**
 * vPIC TURBO — Dekoder VINs med max concurrency
 * vPIC single-VIN API fungerer, batch API støtter ikke multi-VIN.
 * Testet: 126ms/req, ingen rate limit.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended";
const WORKERS = 20;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function decodeVin(vin) {
  const url = `${VPIC_URL}/${encodeURIComponent(vin)}?format=json`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "AutoglassAS-OSINT/1.0" } });
    if (!res.ok) return { vin, status: "error", httpStatus: res.status };
    const text = await res.text();
    const data = JSON.parse(text);
    const r = data?.Results?.[0];
    if (!r) return { vin, status: "no_data" };
    return {
      vin,
      status: "ok",
      hasErrors: r.ErrorCode && !r.ErrorCode.startsWith("0"),
      errorCode: r.ErrorCode || null,
      make: r.Make || null,
      model: r.Model || null,
      year: r.ModelYear ? parseInt(r.ModelYear, 10) : null,
      body: r.BodyClass || r.BodyCabType || null,
      engine: r.EngineModel || r.DisplacementL || null,
      fuel: r.FuelTypePrimary || null,
      plant: r.PlantCity || null,
      series: r.Series || null,
      trim: r.Trim || null,
      doors: r.Doors || null,
      drive: r.DriveType || null,
      transmission: r.TransmissionStyle || null,
      raw: r,
    };
  } catch (e) {
    return { vin, status: "error", error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inFile = args[0] || "data/finn-no-regnr/regnr-with-vin.ndjson";
  const outFile = inFile.replace(/\.ndjson$/, "-vpic.ndjson");

  // Load VINs
  let vins = [];
  if (inFile.endsWith(".txt")) {
    vins = readFileSync(inFile, "utf-8").split("\n").map(l => l.trim()).filter(Boolean);
  } else {
    const lines = readFileSync(inFile, "utf-8").split("\n").filter(Boolean);
    const records = lines.map(l => JSON.parse(l));
    vins = [...new Set(records.map(r => r.vin).filter(Boolean))];
  }

  // Check existing output
  let existing = [];
  if (existsSync(outFile)) {
    const lines = readFileSync(outFile, "utf-8").split("\n").filter(Boolean);
    existing = lines.map(l => JSON.parse(l));
  }
  const doneVins = new Set(existing.map(r => r.vin));
  const toProcess = vins.filter(v => !doneVins.has(v));

  log(`🔥 vPIC TURBO 🔥`);
  log(`  VINs totalt: ${vins.length}`);
  log(`  Allerede dekodet: ${doneVins.size}`);
  log(`  Å dekode: ${toProcess.length}`);
  log(`  Workers: ${WORKERS}`);

  if (toProcess.length === 0) {
    log("Alt er allerede dekodet!");
    return;
  }

  let processed = 0;
  let ok = 0;
  let errors = 0;
  const results = [...existing];
  const startTime = Date.now();
  const queue = [...toProcess];

  async function worker() {
    while (queue.length > 0) {
      const vin = queue.shift();
      const result = await decodeVin(vin);
      processed++;
      if (result.status === "ok") ok++;
      else errors++;
      results.push(result);

      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        log(`  Progress: ${processed}/${toProcess.length} | OK=${ok} Errors=${errors} | ${rate.toFixed(1)} req/s | ETA ${Math.round((queue.length / rate))}s`);
        // Flush periodically
        writeFileSync(outFile, results.map(r => JSON.stringify(r)).join("\n") + "\n");
      }
    }
  }

  const workers = [];
  for (let i = 0; i < WORKERS; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const elapsed = (Date.now() - startTime) / 1000;
  writeFileSync(outFile, results.map(r => JSON.stringify(r)).join("\n") + "\n");

  log(`\n✅ vPIC TURBO FULLFØRT!`);
  log(`   Tid: ${elapsed.toFixed(1)}s`);
  log(`   Prosessert: ${processed}`);
  log(`   OK: ${ok}`);
  log(`   Errors: ${errors}`);
  log(`   Rate: ${(processed / elapsed).toFixed(1)} req/s`);
  log(`   Output: ${results.length} records → ${outFile}`);
}

main().catch(console.error);
