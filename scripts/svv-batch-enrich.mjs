#!/usr/bin/env node
/**
 * SVV Batch Enrichment Script
 * ===========================
 * Slår opp regnr i SVV API og beriker D1 ground_truth + ktype_registry.
 *
 * Usage:
 *   node scripts/svv-batch-enrich.mjs [options]
 *
 * Options:
 *   --max=N          Max regnr to process (default: all)
 *   --delay=MS       Delay between requests (default: 200ms)
 *   --dry-run        Don't write to D1
 *   --resume         Resume from checkpoint
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_BASE_URL = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

const DATA_DIR = "data/finn-no-regnr";
const CHECKPOINT_FILE = path.join(DATA_DIR, "svv-batch-checkpoint.json");
const RESULTS_FILE = path.join(DATA_DIR, "svv-batch-results.ndjson");
const LOG_FILE = path.join(DATA_DIR, "svv-batch-log.ndjson");

// Parse args
const args = process.argv.slice(2);
const maxRegnr = parseInt(args.find(a => a.startsWith("--max="))?.split("=")[1] || "0", 10) || Infinity;
const delayMs = parseInt(args.find(a => a.startsWith("--delay="))?.split("=")[1] || "200", 10);
const dryRun = args.includes("--dry-run");
const resume = args.includes("--resume");

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function hashRegnr(regnr) {
  return crypto.createHash("sha256").update(regnr.toUpperCase().replace(/\s/g, "")).digest("hex").slice(0, 16);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchSvv(regnr) {
  const url = `${SVV_BASE_URL}?kjennemerke=${encodeURIComponent(regnr)}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "SVV-Authorization": `Apikey ${SVV_API_KEY}`,
      "User-Agent": "AutoglassAS-B2B/1.0",
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { status: "auth_error", httpStatus: res.status };
  }
  if (res.status === 204) {
    return { status: "not_found", httpStatus: 204 };
  }
  if (res.status === 404) {
    return { status: "not_found", httpStatus: 404 };
  }
  if (!res.ok) {
    return { status: "error", httpStatus: res.status };
  }

  try {
    const data = await res.json();
    return { status: "ok", data };
  } catch {
    return { status: "parse_error" };
  }
}

function parseSvvVehicle(data) {
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;

  const teknisk = k.godkjenning?.tekniskGodkjenning;
  const klassifisering = teknisk?.kjoretoyklassifisering;
  const generelt = teknisk?.tekniskeData?.generelt;
  const karosseri = teknisk?.tekniskeData?.karosseriOgLasteplan;
  const motor = teknisk?.tekniskeData?.motorOgDrivverk?.motor?.[0];

  const merker = generelt?.merke || [];
  const make = merker[0]?.merke || klassifisering?.kjoretoyAvgiftsKode?.kodeNavn || "";

  const handelsbetegnelser = generelt?.handelsbetegnelse || [];
  const model = handelsbetegnelser[0] || generelt?.typebetegnelse || "";

  // Extract year from first registration
  const forstegangsreg = k.forstegangsregistrering?.registrertForstegangNorgeDato;
  const year = forstegangsreg ? parseInt(forstegangsreg.split("-")[0], 10) : null;

  // VIN / understellsnummer
  const vin = k.kjoretoyId?.understellsnummer || "";

  // Body type from karosseritype
  const bodyCode = karosseri?.karosseritype?.kodeVerdi || "";
  const bodyDesc = karosseri?.karosseritype?.kodeBeskrivelse || "";

  // Fuel
  const fuel = motor?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";

  // Doors
  const doors = karosseri?.antallDorer?.[0] || null;

  // Seats
  const seats = teknisk?.tekniskeData?.persontall?.[0]?.tall || null;

  // Length
  const length = teknisk?.tekniskeData?.dimensjoner?.lengde || null;

  // GVWR
  const gvwr = teknisk?.tekniskeData?.vekter?.tillattTotalvekt || null;

  // Typegodkjenning info
  const typegodkjenning = klassifisering?.efTypegodkjenning;
  const variant = typegodkjenning?.variant || "";
  const versjon = typegodkjenning?.versjon || "";
  const typegodkjenningNr = typegodkjenning?.typegodkjenningnummer?.serie || "";

  return {
    make: make.toUpperCase(),
    model: model,
    year,
    vin,
    bodyCode,
    bodyDesc,
    fuel,
    doors,
    seats,
    length,
    gvwr,
    variant,
    versjon,
    typegodkjenningNr,
  };
}

async function findKtypeInD1(make, model, year) {
  // Use wrangler to query D1
  // Simple brand model match
  const safeMake = make.replace(/'/g, "''");
  const safeModel = model.replace(/'/g, "''");

  const query = `SELECT ktype, tecdoc_brand, tecdoc_model FROM tecdoc_ktype_registry WHERE tecdoc_brand LIKE '${safeMake}' AND (tecdoc_model LIKE '%${safeModel}%' OR '${safeModel}' LIKE '%' || tecdoc_model || '%') LIMIT 5`;

  try {
    // We can't easily query D1 from node without the binding, so we'll output SQL for later
    return null;
  } catch {
    return null;
  }
}

async function main() {
  if (!SVV_API_KEY) {
    console.error("Error: SVV_API_KEY env var required");
    console.error("Set: export SVV_API_KEY=<your-key>");
    process.exit(1);
  }

  log(`Starting SVV batch enrichment`);
  log(`Dry run: ${dryRun}, Resume: ${resume}, Delay: ${delayMs}ms, Max: ${maxRegnr === Infinity ? "all" : maxRegnr}`);

  // Load checkpoint
  let checkpoint = { processed: [], failed: [], notFound: [] };
  if (resume && fs.existsSync(CHECKPOINT_FILE)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    log(`Resumed: ${checkpoint.processed.length} done, ${checkpoint.failed.length} failed, ${checkpoint.notFound.length} not found`);
  }

  // Collect all regnr from all sources
  const regnrSet = new Set();
  const sources = [
    "targeted-regnr.ndjson",
    "targeted-regnr-v1.ndjson",
    "targeted-regnr-v1-remaining.ndjson",
    "regnr.ndjson",
  ];

  for (const fn of sources) {
    const fp = path.join(DATA_DIR, fn);
    if (!fs.existsSync(fp)) continue;
    for (const line of fs.readFileSync(fp, "utf-8").trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const r = (d.regnr || "").toUpperCase().replace(/\s/g, "");
        if (r && /^[A-Z]{2}\d{4,5}$/.test(r)) regnrSet.add(r);
      } catch {}
    }
  }

  // Also add from broad-scrape results (newest file)
  const broadFiles = fs.readdirSync(DATA_DIR)
    .filter(f => /^broad-scrape-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f))
    .sort()
    .reverse();
  for (const fn of broadFiles.slice(0, 1)) {
    const fp = path.join(DATA_DIR, fn);
    log(`Loading broad-scrape source: ${fn}`);
    for (const line of fs.readFileSync(fp, "utf-8").trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const r = (d.regnr || "").toUpperCase().replace(/\s/g, "");
        if (r && /^[A-Z]{2}\d{4,5}$/.test(r)) regnrSet.add(r);
      } catch {}
    }
  }

  // Also add from finnkodes if they have regnr
  const finnkodesPath = path.join(DATA_DIR, "finnkodes.ndjson");
  if (fs.existsSync(finnkodesPath)) {
    for (const line of fs.readFileSync(finnkodesPath, "utf-8").trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        const r = (d.regnr || "").toUpperCase().replace(/\s/g, "");
        if (r && /^[A-Z]{2}\d{4,5}$/.test(r)) regnrSet.add(r);
      } catch {}
    }
  }

  log(`Total candidate regnr: ${regnrSet.size}`);

  // Filter out already processed
  const allProcessed = new Set([...checkpoint.processed, ...checkpoint.failed, ...checkpoint.notFound]);
  const toProcess = [...regnrSet].filter(r => !allProcessed.has(r)).slice(0, maxRegnr);
  log(`To process: ${toProcess.length}`);

  let successCount = 0;
  let failCount = 0;
  let notFoundCount = 0;
  let authErrorCount = 0;

  // Open results file for append
  const resultsFd = fs.openSync(RESULTS_FILE, "a");
  const logFd = fs.openSync(LOG_FILE, "a");

  for (let i = 0; i < toProcess.length; i++) {
    const regnr = toProcess[i];
    const progress = `${i + 1}/${toProcess.length}`;

    try {
      const result = await fetchSvv(regnr);

      if (result.status === "auth_error") {
        authErrorCount++;
        log(`${progress} ${regnr}: AUTH ERROR ${result.httpStatus} — stopping batch`);
        checkpoint.failed.push(regnr);
        break;
      }

      if (result.status === "not_found") {
        notFoundCount++;
        checkpoint.notFound.push(regnr);
        fs.writeSync(logFd, JSON.stringify({ regnr, status: "not_found", at: new Date().toISOString() }) + "\n");
      } else if (result.status === "ok") {
        const vehicle = parseSvvVehicle(result.data);
        if (vehicle) {
          successCount++;
          checkpoint.processed.push(regnr);

          const record = {
            regnr,
            regnrHash: hashRegnr(regnr),
            ...vehicle,
            rawSvv: result.data,
            fetchedAt: new Date().toISOString(),
          };

          fs.writeSync(resultsFd, JSON.stringify(record) + "\n");
          log(`${progress} ${regnr}: OK → ${vehicle.make} ${vehicle.model} ${vehicle.year}`);
        } else {
          failCount++;
          checkpoint.failed.push(regnr);
          log(`${progress} ${regnr}: PARSE ERROR`);
        }
      } else {
        failCount++;
        checkpoint.failed.push(regnr);
        log(`${progress} ${regnr}: ERROR ${result.httpStatus || result.status}`);
      }

      // Save checkpoint every 10
      if ((i + 1) % 10 === 0) {
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
      }

    } catch (err) {
      failCount++;
      checkpoint.failed.push(regnr);
      log(`${progress} ${regnr}: EXCEPTION — ${err.message}`);
    }

    await sleep(delayMs);
  }

  fs.closeSync(resultsFd);
  fs.closeSync(logFd);

  // Final checkpoint
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));

  log("=".repeat(50));
  log(`Batch complete!`);
  log(`Success: ${successCount} | Not found: ${notFoundCount} | Failed: ${failCount} | Auth errors: ${authErrorCount}`);
  log(`Total processed: ${checkpoint.processed.length}`);
  log(`Results: ${RESULTS_FILE}`);
  log(`Log: ${LOG_FILE}`);
  log(`Checkpoint: ${CHECKPOINT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
