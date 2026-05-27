#!/usr/bin/env node
/**
 * validate-regnr-svv.mjs
 * ======================
 * Validerer registreringsnummer mot Statens Vegvesen (SVV) Enkeltoppslag API.
 *
 * Input:
 *   data/regnr-candidates.txt    — ett regnr per linje
 *   data/regnr-validated.json    — eksisterende resultater (resume-støtte)
 *
 * Output:
 *   data/regnr-validated.json    — alle validerte entries
 *   data/regnr-liste.txt         — kun gyldige regnr (ett per linje)
 *
 * Konfigurasjon:
 *   SVV_API_KEY fra process.env.SVV_API_KEY eller .env.local
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Konfigurasjon ──────────────────────────────────────────────────────────
const CANDIDATES_FILE = path.join(ROOT, "data", "regnr-candidates.txt");
const OUTPUT_JSON = path.join(ROOT, "data", "regnr-validated.json");
const OUTPUT_TXT = path.join(ROOT, "data", "regnr-liste.txt");
const CONCURRENCY = 5;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

// ── API-nøkkel ─────────────────────────────────────────────────────────────
function getApiKey() {
  if (process.env.SVV_API_KEY) return process.env.SVV_API_KEY;

  const envLocal = path.join(ROOT, ".env.local");
  if (fs.existsSync(envLocal)) {
    const content = fs.readFileSync(envLocal, "utf-8");
    const match = content.match(/^SVV_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  console.error("❌ SVV_API_KEY ikke funnet. Sett i .env.local eller miljøvariabel.");
  process.exit(1);
}

// ── Retry med eksponentiell backoff ────────────────────────────────────────
async function fetchWithRetry(url, options, attempt = 1) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);

    // Retry på 429 eller 5xx
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`  ⚠️  HTTP ${res.status} for ${url.split("kjennemerke=")[1]} — retry ${attempt}/${MAX_RETRIES} etter ${delay}ms`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }

    return res;
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`  ⚠️  Nettverksfeil for ${url.split("kjennemerke=")[1]} — retry ${attempt}/${MAX_RETRIES} etter ${delay}ms`);
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SVV API-oppslag ────────────────────────────────────────────────────────
async function lookupRegnr(regnr, apiKey) {
  const url = `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`;

  const res = await fetchWithRetry(url, {
    headers: {
      "Accept": "application/json",
      "SVV-Authorization": `Apikey ${apiKey}`,
      "User-Agent": "AutoglassAS-B2B/1.0",
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { valid: false, error: "auth_error", httpStatus: res.status };
  }
  if (res.status === 404) {
    return { valid: false, error: "not_found", httpStatus: 404 };
  }
  if (!res.ok) {
    return { valid: false, error: `upstream_error`, httpStatus: res.status };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { valid: false, error: "parse_error" };
  }

  const k = data.kjoretoydataListe?.[0];
  if (!k) {
    return { valid: false, error: "not_found" };
  }

  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;

  const vin = k.kjoretoyId?.understellsnummer || "";
  const brand = (generelt?.merke?.[0]?.merke || "").toUpperCase();
  const model = generelt?.handelsbetegnelse?.[0] || "";

  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;

  const fuel = td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";
  const length = td?.dimensjoner?.lengde || 0;
  const seats = td?.persontall?.sitteplasserTotalt || 0;
  const gvwr = td?.vekter?.tillattTotalvekt || 0;

  return {
    valid: true,
    vin,
    brand,
    model,
    year,
    fuel,
    length,
    seats,
    gvwr,
  };
}

// ── Hovedflyt ──────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Valider RegNr mot SVV Enkeltoppslag");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Les API-nøkkel
  const apiKey = getApiKey();
  console.log(`🔑 SVV_API_KEY: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  // Les kandidater
  if (!fs.existsSync(CANDIDATES_FILE)) {
    console.error(`❌ Fant ikke ${CANDIDATES_FILE}`);
    console.error("   Kjør først: node scripts/build-regnr-candidates.mjs");
    process.exit(1);
  }

  const candidates = fs
    .readFileSync(CANDIDATES_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l.length > 0);

  console.log(`📋 Kandidater: ${candidates.length}`);

  // Les eksisterende resultater (resume-støtte)
  let existing = { entries: [] };
  if (fs.existsSync(OUTPUT_JSON)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf-8"));
      console.log(`📦 Eksisterende: ${existing.entries?.length || 0} entries`);
    } catch {
      console.warn("⚠️  Kunne ikke parse eksisterende regnr-validated.json — starter på nytt");
      existing = { entries: [] };
    }
  }

  const processedSet = new Set((existing.entries || []).map((e) => e.regnr));
  const toProcess = candidates.filter((r) => !processedSet.has(r));

  console.log(`🔄 Gjenstår: ${toProcess.length}`);
  console.log("");

  if (toProcess.length === 0) {
    console.log("✅ Alle kandidater allerede validert.");
    await writeOutput(existing);
    return;
  }

  // Behold eksisterende entries
  const entries = [...(existing.entries || [])];
  let validCount = entries.filter((e) => e.valid).length;
  let invalidCount = entries.filter((e) => !e.valid).length;

  // Prosesser i batches med concurrency-limit
  const limit = pLimit(CONCURRENCY);
  let processed = entries.length;

  // Del opp i batches for rate-limiting
  const batchSize = CONCURRENCY;

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map((regnr) =>
        limit(async () => {
          try {
            const result = await lookupRegnr(regnr, apiKey);
            return { regnr, ...result };
          } catch (err) {
            return { regnr, valid: false, error: "network_fatal" };
          }
        })
      )
    );

    for (const r of results) {
      processed++;
      if (r.valid) {
        validCount++;
        entries.push({
          regnr: r.regnr,
          valid: true,
          vin: r.vin,
          brand: r.brand,
          model: r.model,
          year: r.year,
          fuel: r.fuel,
          length: r.length,
          seats: r.seats,
          gvwr: r.gvwr,
          validatedAt: new Date().toISOString(),
        });
      } else {
        invalidCount++;
        entries.push({
          regnr: r.regnr,
          valid: false,
          error: r.error,
          validatedAt: new Date().toISOString(),
        });
      }
    }

    // Progress-logging
    console.log(
      `[${processed}/${candidates.length}] processed — ${validCount} valid, ${invalidCount} not_found/invalid`
    );

    // Lagre progress etter hver batch (safe resume)
    await writeOutput({
      validatedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      totalValid: validCount,
      totalInvalid: invalidCount,
      entries,
    });

    // Rate limiting mellom batches
    if (i + batchSize < toProcess.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Ferdig!");
  console.log(`  Totalt: ${candidates.length}`);
  console.log(`  Gyldige: ${validCount}`);
  console.log(`  Ugyldige: ${invalidCount}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

async function writeOutput(data) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(data, null, 2), "utf-8");

  const validRegnrs = data.entries
    .filter((e) => e.valid)
    .map((e) => e.regnr);

  fs.writeFileSync(OUTPUT_TXT, validRegnrs.join("\n") + (validRegnrs.length > 0 ? "\n" : ""), "utf-8");
}

// ── Kjør ──────────────────────────────────────────────────────────────────
main().catch((e) => {
  console.error("💥 Fatal feil:", e);
  process.exit(1);
});
