#!/usr/bin/env node
/**
 * vPIC Bridge — Gratis VIN-dekoding via NHTSA vPIC API
 * Bruker VIN til å hente make, model, year, body, engine — data som
 * kan kryssrefereres mot TecDoc for kType-mapping.
 *
 * vPIC er gratis, ratelimit ~20 req/s, ingen API-nøkkel.
 * https://vpic.nhtsa.dot.gov/api/
 *
 * Usage:
 *   node scripts/ktype-recon/vpic-bridge.mjs <vin>
 *   node scripts/ktype-recon/vpic-bridge.mjs --file <vin-list.txt>
 *   node scripts/ktype-recon/vpic-bridge.mjs --batch <regnr.ndjson>
 */

const VPIC_DECODE = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended";
const VPIC_BATCH = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesbatch/";

async function decodeVin(vin) {
  const url = `${VPIC_DECODE}/${encodeURIComponent(vin)}?format=json`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "AutoglassAS-OSINT/1.0" } });
    if (!res.ok) return null;
    const text = await res.text();
    const data = JSON.parse(text);
    const r = data?.Results?.[0];
    if (!r) return null;
    const hasErrors = r.ErrorCode && !r.ErrorCode.startsWith("0");
    return {
      vin,
      hasErrors,
      errorCode: r.ErrorCode || null,
      errorText: r.ErrorText || null,
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
      // vPIC variable-list kan inneholde kType-lignende felt for noen produsenter
      raw: r,
    };
  } catch (e) {
    return { vin, error: e.message };
  }
}

async function decodeBatch(vins) {
  // vPIC batch: max 50 VINs per request
  const chunks = [];
  for (let i = 0; i < vins.length; i += 50) {
    chunks.push(vins.slice(i, i + 50));
  }
  const results = [];
  for (const chunk of chunks) {
    const body = new URLSearchParams();
    chunk.forEach((vin, i) => body.append(`DATA${i}`, vin));
    body.append("format", "json");
    try {
      const res = await fetch(VPIC_BATCH, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AutoglassAS-OSINT/1.0" },
        body: body.toString(),
      });
      const data = await res.json();
      for (const r of data?.Results || []) {
        results.push({
          vin: r.VIN,
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
        });
      }
    } catch (e) {
      chunk.forEach(vin => results.push({ vin, error: e.message }));
    }
    // Rate limit: 20 req/s = 50ms between batches
    await new Promise(r => setTimeout(r, 100));
  }
  return results;
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);
  const fs = await import("fs");

  if (args.length === 0) {
    console.log(`Usage:
  node vpic-bridge.mjs <VIN>                    # Enkelt VIN
  node vpic-bridge.mjs --file <vin-list.txt>    # Batch fra fil (ett VIN per linje)
  node vpic-bridge.mjs --batch <regnr.ndjson>   # Batch fra regnr-NDJSON (må ha .vin felt)
  node vpic-bridge.mjs --ndjson-in <file> --out <file>  # Input/Output NDJSON`);
    process.exit(1);
  }

  // Single VIN
  if (args.length === 1 && !args[0].startsWith("--")) {
    const vin = args[0].toUpperCase().trim();
    console.log(`🔍 Dekoder VIN: ${vin}`);
    const result = await decodeVin(vin);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // --file <vin-list.txt>
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    const vins = fs.readFileSync(file, "utf-8")
      .split("\n")
      .map(l => l.trim().toUpperCase())
      .filter(l => l.length >= 11);
    console.log(`🔍 Batch-dekoder ${vins.length} VINs fra ${file}`);
    const results = await decodeBatch(vins);
    const outFile = file.replace(/\.txt$/, "-vpic.ndjson");
    const out = results.map(r => JSON.stringify(r)).join("\n");
    fs.writeFileSync(outFile, out + "\n");
    console.log(`✅ Lagret ${results.length} resultater i ${outFile}`);
    const ok = results.filter(r => !r.error && r.make);
    console.log(`   ${ok.length}/${results.length} vellykket`);
    return;
  }

  // --batch <regnr.ndjson> (leser .vin felt)
  const batchIdx = args.indexOf("--batch");
  if (batchIdx >= 0) {
    const file = args[batchIdx + 1];
    const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    const records = lines.map(l => JSON.parse(l));
    const vins = [...new Set(records.map(r => r.vin).filter(Boolean))];
    console.log(`🔍 Batch-dekoder ${vins.length} unike VINs fra ${file}`);
    const results = await decodeBatch(vins);
    // Merge med original record
    const vinMap = new Map(results.map(r => [r.vin, r]));
    const merged = records.map(r => ({ ...r, vpic: vinMap.get(r.vin) || null }));
    const outFile = file.replace(/\.ndjson$/, "-vpic.ndjson");
    fs.writeFileSync(outFile, merged.map(r => JSON.stringify(r)).join("\n") + "\n");
    console.log(`✅ Lagret ${merged.length} merged records i ${outFile}`);
    return;
  }

  // --ndjson-in <file> --out <file>
  const inIdx = args.indexOf("--ndjson-in");
  const outIdx = args.indexOf("--out");
  if (inIdx >= 0 && outIdx >= 0) {
    const inFile = args[inIdx + 1];
    const outFile = args[outIdx + 1];
    const lines = fs.readFileSync(inFile, "utf-8").split("\n").filter(Boolean);
    const records = lines.map(l => JSON.parse(l));
    const vins = [...new Set(records.map(r => r.vin).filter(Boolean))];
    console.log(`🔍 Batch-dekoder ${vins.length} unike VINs`);
    const results = await decodeBatch(vins);
    const vinMap = new Map(results.map(r => [r.vin, r]));
    const merged = records.map(r => ({ ...r, vpic: vinMap.get(r.vin) || null }));
    fs.writeFileSync(outFile, merged.map(r => JSON.stringify(r)).join("\n") + "\n");
    console.log(`✅ Lagret ${merged.length} records i ${outFile}`);
    return;
  }

  console.error("Ukjent kommando. Bruk --file, --batch, eller --ndjson-in/--out");
  process.exit(1);
}

main().catch(console.error);
