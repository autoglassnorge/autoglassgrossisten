#!/usr/bin/env node
/**
 * Smart SVV VIN-høsting — grupperer regnr etter brand+model og høster
 * bare N per gruppe. Maksimerer dekningsgrad per request.
 *
 * Usage:
 *   node harvest-vins-smart.mjs --per-group 2 --delay 15000
 *   node harvest-vins-smart.mjs --resume  # fortsett fra cache
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_URL = "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata";
const INPUT_FILE = "data/finn-no-regnr/regnr.ndjson";
const CACHE_FILE = "data/finn-no-regnr/svv-cache.ndjson";
const OUTPUT_FILE = "data/finn-no-regnr/regnr-with-vin.ndjson";

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? parseInt(args[idx + 1], 10) : undefined;
  };
  const perGroup = getArg("--per-group") || 2;
  const delayMs = getArg("--delay") || 15_000;
  const resume = args.includes("--resume");

  if (!SVV_API_KEY) {
    console.error("❌ SVV_API_KEY ikke satt");
    process.exit(1);
  }

  // Load regnr
  const lines = readFileSync(INPUT_FILE, "utf-8").split("\n").filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  // Group by brand+model
  const groups = new Map();
  for (const r of records) {
    const key = `${r.brand || "UNKNOWN"}|${r.model || "UNKNOWN"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.regnr);
  }

  // Load cache
  const cache = loadCache();

  // Select regnr to process: perGroup per group, prefer uncached
  const toProcess = [];
  for (const [key, regs] of groups) {
    const uncached = regs.filter(r => !cache.has(r.toUpperCase()));
    const cached = regs.filter(r => cache.has(r.toUpperCase()));
    const needed = perGroup - cached.length;
    if (needed > 0) {
      toProcess.push(...uncached.slice(0, needed));
    }
  }

  log(`Smart VIN-høsting:`);
  log(`  Grupper: ${groups.size}`);
  log(`  Per gruppe: ${perGroup}`);
  log(`  Delay: ${delayMs}ms`);
  log(`  Cache: ${cache.size}`);
  log(`  Å høste: ${toProcess.length}`);
  log(`  Est. tid: ${Math.round(toProcess.length * delayMs / 1000 / 60)} minutter`);

  if (toProcess.length === 0) {
    log("Alt er i cache!");
    return;
  }

  let processed = 0;
  let success = 0;
  let rateLimited = 0;

  for (const regnr of toProcess) {
    processed++;
    const result = await fetchSvv(regnr);

    if (result.status === "ok") {
      success++;
      appendFileSync(CACHE_FILE, JSON.stringify(result) + "\n");
      log(`✅ [${processed}/${toProcess.length}] ${regnr} → ${result.make} ${result.model} ${result.year} ${result.vin}`);
    } else if (result.status === "rate_limited") {
      rateLimited++;
      log(`⏳ [${processed}/${toProcess.length}] ${regnr} → RATE LIMIT (venter 2min)`);
      await sleep(120_000);
      // Retry once
      const retry = await fetchSvv(regnr);
      if (retry.status === "ok") {
        success++;
        appendFileSync(CACHE_FILE, JSON.stringify(retry) + "\n");
        log(`   ✅ Retry OK`);
      } else {
        log(`   ❌ Retry failed: ${retry.status}`);
      }
    } else if (result.status === "not_found") {
      appendFileSync(CACHE_FILE, JSON.stringify(result) + "\n");
    } else {
      log(`❌ [${processed}/${toProcess.length}] ${regnr} → ${result.status}`);
    }

    if (processed % 10 === 0) {
      log(`  Progress: ${processed}/${toProcess.length} | OK=${success} RateLimit=${rateLimited}`);
    }

    if (processed < toProcess.length) {
      await sleep(delayMs);
    }
  }

  // Generate output
  const allCached = loadCache();
  const okRecords = [...allCached.values()].filter(r => r.status === "ok");
  writeFileSync(OUTPUT_FILE, okRecords.map(r => JSON.stringify(r)).join("\n") + "\n");

  log(`\n✅ Ferdig!`);
  log(`   Prosessert: ${processed}`);
  log(`   OK: ${success}`);
  log(`   Rate limit: ${rateLimited}`);
  log(`   Cache total: ${allCached.size}`);
  log(`   Output: ${okRecords.length} records → ${OUTPUT_FILE}`);
}

main().catch(console.error);
