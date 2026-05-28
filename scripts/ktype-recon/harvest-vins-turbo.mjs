#!/usr/bin/env node
/**
 * SVV TURBO VIN-høsting
 * ======================
 * Kjører MAX SPEED med concurrency. Testet: 20 req på 650ms med 5 concurrent.
 * 12,534 regnr burde ta ~5 minutter ved full fart.
 *
 * Features:
 * - Concurrency: 10 parallelle workers
 * - Resume fra cache
 * - NDJSON-output
 * - Progress logging
 *
 * Usage:
 *   node harvest-vins-turbo.mjs
 *   node harvest-vins-turbo.mjs --limit 100
 *   node harvest-vins-turbo.mjs --workers 20
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_URL = "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata";
const INPUT_FILE = "data/finn-no-regnr/regnr.ndjson";
const CACHE_FILE = "data/finn-no-regnr/svv-cache.ndjson";
const OUTPUT_FILE = "data/finn-no-regnr/regnr-with-vin.ndjson";
const MAX_CONCURRENT = 10;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fetchSvv(regnr) {
  const url = `${SVV_URL}?kjennemerke=${encodeURIComponent(regnr)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "SVV-Authorization": `Apikey ${SVV_API_KEY}`,
        "User-Agent": "AutoglassAS-B2B/1.0",
      },
    });
    const text = await res.text();
    const isRateLimit = text.includes("For mange forespørsler");
    if (isRateLimit) {
      return { status: "rate_limited", httpStatus: 429, regnr };
    }
    if (res.status === 404) {
      return { status: "not_found", httpStatus: 404, regnr };
    }
    if (!res.ok) {
      return { status: "error", httpStatus: res.status, regnr };
    }
    const data = JSON.parse(text);
    return parseSvvResponse(data, regnr);
  } catch (e) {
    return { status: "network_error", error: e.message, regnr };
  }
}

function parseSvvResponse(data, regnr) {
  const k = data?.kjoretoydataListe?.[0];
  if (!k) return { status: "not_found", regnr };
  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  return {
    status: "ok",
    regnr,
    vin: k.kjoretoyId?.understellsnummer || "",
    make: (generelt?.merke?.[0]?.merke || "").toUpperCase(),
    model: (generelt?.handelsbetegnelse?.[0] || "").toUpperCase(),
    year: regDate ? parseInt(regDate.split("-")[0], 10) : 0,
    typeCode: generelt?.typebetegnelse || "",
    fetchedAt: new Date().toISOString(),
  };
}

function loadCache() {
  if (!existsSync(CACHE_FILE)) return new Map();
  const lines = readFileSync(CACHE_FILE, "utf-8").split("\n").filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.regnr) map.set(r.regnr.toUpperCase(), r);
    } catch { /* skip */ }
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const workers = args.indexOf("--workers") >= 0
    ? parseInt(args[args.indexOf("--workers") + 1], 10)
    : MAX_CONCURRENT;

  if (!SVV_API_KEY) {
    console.error("❌ SVV_API_KEY ikke satt");
    process.exit(1);
  }

  // Load regnr
  const lines = readFileSync(INPUT_FILE, "utf-8").split("\n").filter(Boolean);
  const records = lines.map(l => JSON.parse(l));
  const allRegnrs = records.map(r => r.regnr).filter(Boolean);
  const targetRegnrs = limit < Infinity ? allRegnrs.slice(0, limit) : allRegnrs;

  // Load cache
  const cache = loadCache();
  const toProcess = targetRegnrs.filter(r => !cache.has(r.toUpperCase()));

  log(`🔥 TURBO VIN-høsting 🔥`);
  log(`  Regnr totalt: ${targetRegnrs.length}`);
  log(`  Cache: ${cache.size}`);
  log(`  Å høste: ${toProcess.length}`);
  log(`  Workers: ${workers}`);
  log(`  Est. tid: ~${Math.round(toProcess.length / 40)} sekunder (basert på 40 req/s)`);

  if (toProcess.length === 0) {
    log("Alt er i cache!");
    return;
  }

  let processed = 0;
  let success = 0;
  let notFound = 0;
  let rateLimited = 0;
  let errors = 0;
  let rateLimitActive = false;
  let rateLimitResetTime = 0;

  const queue = [...toProcess];
  const startTime = Date.now();

  async function worker() {
    while (queue.length > 0) {
      // If rate limit is active, wait
      if (rateLimitActive) {
        const wait = rateLimitResetTime - Date.now();
        if (wait > 0) {
          await new Promise(r => setTimeout(r, wait));
        }
        rateLimitActive = false;
      }

      const regnr = queue.shift();
      const result = await fetchSvv(regnr);
      processed++;

      if (result.status === "ok") {
        success++;
        appendFileSync(CACHE_FILE, JSON.stringify(result) + "\n");
      } else if (result.status === "not_found") {
        notFound++;
        appendFileSync(CACHE_FILE, JSON.stringify(result) + "\n");
      } else if (result.status === "rate_limited") {
        rateLimited++;
        rateLimitActive = true;
        rateLimitResetTime = Date.now() + 60_000; // wait 60s
        log(`  ⏳ Rate limit! Venter 60s...`);
        queue.unshift(regnr); // put back in queue
        continue;
      } else {
        errors++;
      }

      // Progress every 100
      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = queue.length;
        const eta = remaining / rate;
        log(`  Progress: ${processed}/${toProcess.length} | OK=${success} NotFound=${notFound} RateLimited=${rateLimited} Errors=${errors} | ${rate.toFixed(1)} req/s | ETA ${Math.round(eta)}s`);
      }
    }
  }

  // Spawn workers
  const workerPromises = [];
  for (let i = 0; i < workers; i++) {
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);

  const elapsed = (Date.now() - startTime) / 1000;

  // Generate output
  const allCached = loadCache();
  const okRecords = [...allCached.values()].filter(r => r.status === "ok");
  writeFileSync(OUTPUT_FILE, okRecords.map(r => JSON.stringify(r)).join("\n") + "\n");

  log(`\n✅ TURBO FULLFØRT!`);
  log(`   Tid: ${elapsed.toFixed(1)}s`);
  log(`   Prosessert: ${processed}`);
  log(`   OK: ${success}`);
  log(`   Not found: ${notFound}`);
  log(`   Rate limit: ${rateLimited}`);
  log(`   Errors: ${errors}`);
  log(`   Rate: ${(processed / elapsed).toFixed(1)} req/s`);
  log(`   Cache total: ${allCached.size}`);
  log(`   Output: ${okRecords.length} records → ${OUTPUT_FILE}`);
}

main().catch(console.error);
