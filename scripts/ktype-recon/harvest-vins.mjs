#!/usr/bin/env node
/**
 * Fase 1: SVV VIN-høsting
 * ========================
 * Henter VIN + kjøretøydata fra SVV Enkeltoppslag for alle regnr
 * i data/finn-no-regnr/regnr.ndjson.
 *
 * Features:
 * - Resumable: sjekker cache før hvert oppslag
 * - Rate limiting: max 1 req/min med eksponentiell backoff
 * - Håndterer "For mange forespørsler" automatisk
 * - Lagrer kontinuerlig (appen til cache-fil)
 * - NDJSON-output (linje = 1 record)
 *
 * Usage:
 *   node harvest-vins.mjs
 *   node harvest-vins.mjs --limit 100          # Bare første 100
 *   node harvest-vins.mjs --regnr SU18018      # Enkelt regnr
 *   node harvest-vins.mjs --batch-size 50      # Justér batch-størrelse
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_URL = "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata";
const CACHE_FILE = "data/finn-no-regnr/svv-cache.ndjson";
const INPUT_FILE = "data/finn-no-regnr/regnr.ndjson";
const OUTPUT_FILE = "data/finn-no-regnr/regnr-with-vin.ndjson";
const ERROR_FILE = "data/finn-no-regnr/svv-errors.ndjson";

const DELAY_MS = 65_000;        // 65s mellom hvert kall (SVV rate limit ~1/min)
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 120_000; // 2 minutter base backoff

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
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

    if (res.status === 401 || res.status === 403) {
      return { status: "auth_error", httpStatus: res.status, regnr };
    }
    if (res.status === 404) {
      return { status: "not_found", httpStatus: 404, regnr };
    }
    if (res.status === 429 || (await res.text()).includes("For mange forespørsler")) {
      return { status: "rate_limited", httpStatus: res.status || 429, regnr };
    }
    if (!res.ok) {
      return { status: "upstream_error", httpStatus: res.status, regnr };
    }

    // Re-fetch for å parse JSON (vi konsumerte body med text-check ovenfor)
    const res2 = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "SVV-Authorization": `Apikey ${SVV_API_KEY}`,
        "User-Agent": "AutoglassAS-B2B/1.0",
      },
    });
    const data = await res2.json();
    return parseSvvResponse(data, regnr);
  } catch (e) {
    return { status: "network_error", error: e.message, regnr };
  }
}

function parseSvvResponse(data, regnr) {
  const k = data?.kjoretoydataListe?.[0];
  if (!k) {
    return { status: "not_found", regnr };
  }

  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;
  const merke = generelt?.merke?.[0]?.merke || "";
  const model = generelt?.handelsbetegnelse?.[0] || "";
  const typeCode = generelt?.typebetegnelse || "";
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;
  const vin = k.kjoretoyId?.understellsnummer || "";
  const length = td?.dimensjoner?.lengde || 0;
  const fuelCode = td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";
  const engineCode = td?.motorOgDrivverk?.motor?.[0]?.motorKode || "";
  const seats = td?.persontall?.sitteplasserTotalt || 0;
  const gvwr = td?.vekter?.tillattTotalvekt || 0;

  return {
    status: "ok",
    regnr,
    vin,
    make: merke.toUpperCase(),
    model: model.toUpperCase(),
    year,
    typeCode,
    length,
    fuelCode,
    engineCode,
    seats,
    gvwr,
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

function appendCache(record) {
  appendFileSync(CACHE_FILE, JSON.stringify(record) + "\n");
}

function appendError(record) {
  appendFileSync(ERROR_FILE, JSON.stringify(record) + "\n");
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const regnrArg = args.indexOf("--regnr") >= 0 ? args[args.indexOf("--regnr") + 1] : null;

  if (!SVV_API_KEY) {
    console.error("❌ SVV_API_KEY ikke satt. Bruk: export SVV_API_KEY=...");
    process.exit(1);
  }

  // Single regnr mode
  if (regnrArg) {
    log(`Enkelt-oppslag: ${regnrArg}`);
    const result = await fetchSvv(regnrArg.toUpperCase());
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Load input
  const lines = readFileSync(INPUT_FILE, "utf-8").split("\n").filter(Boolean);
  const records = lines.map(l => JSON.parse(l));
  const regnrs = records.map(r => r.regnr).filter(Boolean);
  const targetRegnrs = limit < Infinity ? regnrs.slice(0, limit) : regnrs;

  log(`Starter VIN-høsting for ${targetRegnrs.length} regnr`);
  log(`Input: ${INPUT_FILE}`);
  log(`Cache: ${CACHE_FILE}`);
  log(`Delay: ${DELAY_MS / 1000}s mellom kall`);

  // Load cache
  const cache = loadCache();
  log(`Cache inneholder ${cache.size} regnr`);

  // Filter already cached
  const toProcess = targetRegnrs.filter(r => !cache.has(r.toUpperCase()));
  log(`Mangler cache for ${toProcess.length} regnr`);

  if (toProcess.length === 0) {
    log("Alle regnr er allerede i cache!");
    // Generate output from cache
    const cachedRecords = targetRegnrs.map(r => cache.get(r.toUpperCase())).filter(Boolean);
    writeFileSync(OUTPUT_FILE, cachedRecords.map(r => JSON.stringify(r)).join("\n") + "\n");
    log(`Output skrevet til ${OUTPUT_FILE}: ${cachedRecords.length} records`);
    return;
  }

  let processed = 0;
  let success = 0;
  let notFound = 0;
  let errors = 0;
  let rateLimited = 0;

  for (const regnr of toProcess) {
    processed++;
    log(`[${processed}/${toProcess.length}] ${regnr}`);

    let result = null;
    let retries = 0;
    let delay = DELAY_MS;

    while (retries <= MAX_RETRIES) {
      result = await fetchSvv(regnr);

      if (result.status === "ok") {
        success++;
        appendCache(result);
        break;
      }

      if (result.status === "not_found") {
        notFound++;
        appendCache(result);
        break;
      }

      if (result.status === "rate_limited") {
        rateLimited++;
        retries++;
        if (retries > MAX_RETRIES) {
          log(`  ⚠️ Rate limit etter ${MAX_RETRIES} retries, skipper ${regnr}`);
          appendError(result);
          errors++;
          break;
        }
        const backoff = BACKOFF_BASE_MS * Math.pow(2, retries - 1);
        log(`  ⏳ Rate limit! Venter ${backoff / 1000}s (retry ${retries}/${MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }

      // Other errors
      errors++;
      appendError(result);
      log(`  ❌ ${result.status}: ${result.httpStatus || result.error || ""}`);
      break;
    }

    // Progress every 10
    if (processed % 10 === 0) {
      log(`  Progress: ${processed}/${toProcess.length} | OK=${success} NotFound=${notFound} RateLimited=${rateLimited} Errors=${errors}`);
    }

    // Delay between requests
    if (processed < toProcess.length) {
      await sleep(delay);
    }
  }

  // Generate final output from cache
  const allCached = loadCache();
  const cachedRecords = targetRegnrs
    .map(r => allCached.get(r.toUpperCase()))
    .filter(Boolean)
    .filter(r => r.status === "ok");

  writeFileSync(OUTPUT_FILE, cachedRecords.map(r => JSON.stringify(r)).join("\n") + "\n");

  log("\n✅ VIN-høsting fullført!");
  log(`   Prosessert: ${processed}`);
  log(`   OK:         ${success}`);
  log(`   Not found:  ${notFound}`);
  log(`   Rate limit: ${rateLimited}`);
  log(`   Errors:     ${errors}`);
  log(`   Cache:      ${allCached.size} total`);
  log(`   Output:     ${cachedRecords.length} records med VIN → ${OUTPUT_FILE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
