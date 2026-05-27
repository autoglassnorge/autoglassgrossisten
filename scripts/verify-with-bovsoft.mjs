#!/usr/bin/env node
/**
 * Verify Finn.no regnr against Bovsoft API
 * =========================================
 *
 * Takes regnr from finn.no scraper and verifies each with Bovsoft.
 * Only keeps regnr that Bovsoft can resolve.
 *
 * Usage:
 *   node scripts/verify-with-bovsoft.mjs [--limit=333] [--input=PATH] [--output=PATH]
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve } from "path";

const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

const DEFAULT_CONFIG = {
  limit: 333,
  input: resolve(process.cwd(), "data", "finn-no-regnr", "targeted-regnr.ndjson"),
  output: resolve(process.cwd(), "data", "finn-no-regnr", "verified-bovsoft.ndjson"),
  listOutput: resolve(process.cwd(), "data", "finn-no-regnr", "verified-bovsoft-list.txt"),
  delayMs: 1500,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) opts.limit = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--input=")) opts.input = arg.split("=")[1];
    if (arg.startsWith("--output=")) opts.output = arg.split("=")[1];
    if (arg.startsWith("--delay=")) opts.delayMs = parseInt(arg.split("=")[1], 10);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function lookupBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    return { status: -1, error: e.message };
  }
}

async function main() {
  const config = parseArgs();

  if (!existsSync(config.input)) {
    console.error("❌ Input file not found:", config.input);
    process.exit(1);
  }

  // Load records
  const lines = readFileSync(config.input, "utf-8").split("\n");
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {}
  }

  // Deduplicate by regnr, prioritize by sensor count
  const byRegnr = new Map();
  for (const r of records) {
    const existing = byRegnr.get(r.regnr);
    if (!existing || r.sensors.length > existing.sensors.length) {
      byRegnr.set(r.regnr, r);
    }
  }

  // Sort by sensor count (most sensors first) then by brand diversity
  const unique = Array.from(byRegnr.values()).sort(
    (a, b) => b.sensors.length - a.sensors.length
  );

  const toCheck = unique.slice(0, config.limit);

  console.log("🔍 Bovsoft Regnr Verifier");
  console.log("=========================");
  console.log(`   Input records: ${records.length}`);
  console.log(`   Unique regnr: ${unique.length}`);
  console.log(`   To verify: ${toCheck.length} (limit: ${config.limit})`);
  console.log(`   Delay: ${config.delayMs}ms\n`);

  const verified = [];
  const failed = [];
  const startTime = Date.now();

  for (let i = 0; i < toCheck.length; i++) {
    const record = toCheck[i];
    const pct = ((i / toCheck.length) * 100).toFixed(0);

    process.stdout.write(`[${pct}%] ${i + 1}/${toCheck.length} ${record.regnr} ... `);

    const data = await lookupBovsoft(record.regnr);

    if (data.status === 200 && data.data?.datacar?.[0]) {
      const car = data.data.datacar[0];
      const result = {
        regnr: record.regnr,
        finnkode: record.finnkode,
        ktype: car.ktype,
        brand: car.manufCar,
        model: car.modelCar,
        yearFrom: car.typeFromYearCar,
        yearTo: car.typeToYearCar,
        body: car.bodyCar,
        vin: car.vin,
        shortName: car.shortNameCar,
        finnBrand: record.brand,
        finnModel: record.model,
        sensors: record.sensors,
        verifiedAt: new Date().toISOString(),
      };
      verified.push(result);
      appendFileSync(config.output, JSON.stringify(result) + "\n");
      console.log(`✅ ${car.manufCar} ${car.modelCar} (${car.typeFromYearCar})`);
    } else if (data.status === 404) {
      failed.push({ regnr: record.regnr, reason: "not_found" });
      console.log(`❌ Not found`);
    } else if (data.status === 403) {
      failed.push({ regnr: record.regnr, reason: "unauthorized" });
      console.log(`⛔ Unauthorized`);
    } else {
      failed.push({ regnr: record.regnr, reason: data.error || String(data.status) });
      console.log(`❌ ${data.error || data.status}`);
    }

    if (i < toCheck.length - 1) {
      await sleep(config.delayMs);
    }
  }

  // Write clean list
  const list = verified.map((r) => r.regnr).join("\n") + "\n";
  writeFileSync(config.listOutput, list);

  // Write report
  const byBrand = {};
  for (const r of verified) {
    byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
  }

  const report = {
    totalChecked: toCheck.length,
    verified: verified.length,
    failed: failed.length,
    successRate: ((verified.length / toCheck.length) * 100).toFixed(1) + "%",
    byBrand,
    elapsedMinutes: ((Date.now() - startTime) / 1000 / 60).toFixed(1),
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    resolve(process.cwd(), "data", "finn-no-regnr", "bovsoft-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log(`\n✅ Bovsoft verification complete!`);
  console.log(`   Checked: ${toCheck.length}`);
  console.log(`   ✅ Verified: ${verified.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   Success rate: ${report.successRate}`);
  console.log(`   Output: ${config.output}`);
  console.log(`   List: ${config.listOutput}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
