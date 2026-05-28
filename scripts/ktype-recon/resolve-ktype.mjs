#!/usr/bin/env node
/**
 * Fase 3: kType Resolver
 * ========================
 * Prøver flere gratis kilder for å finne TecDoc kType for et kjøretøy.
 *
 * Kilder (i prioritert rekkefølge):
 * 1. Biluppgifter API — vehicle/regno/{regno} (hvis API-nøkkel tilgjengelig)
 * 2. CarQuery API — gratis, returnerer model_id
 * 3. vPIC — verifiserer make/model/year (allerede dekodet)
 * 4. Autodoc scraping — eurocode → produktside → kType i fitment
 *
 * Usage:
 *   node resolve-ktype.mjs --regnr SU18018 --vin WV1ZZZ7HZ5H060934 --brand VW --model Transporter --year 2005
 *   node resolve-ktype.mjs --file <vehicle-fingerprints.ndjson>
 *   node resolve-ktype.mjs --eurocode 2525CSGYA --brand VW --model Transporter --year 2005
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";

const BILUPPGIFTER_API_KEY = process.env.BILUPPGIFTER_API_KEY;
const DELAY_MS = 500; // mellom eksterne kall

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// === 1. Biluppgitter (hvis nøkkel tilgjengelig) ===
async function resolveBiluppgitterRegno(regnr) {
  if (!BILUPPGIFTER_API_KEY || BILUPPGIFTER_API_KEY.includes("din_") || BILUPPGIFTER_API_KEY.includes("your_")) {
    return { source: "biluppgitter", status: "no_key" };
  }
  try {
    const res = await fetch(
      `https://api.biluppgifter.se/api/v1/vehicle/regno/${encodeURIComponent(regnr)}?country_code=NO`,
      {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${BILUPPGIFTER_API_KEY}`,
        },
      }
    );
    if (!res.ok) return { source: "biluppgitter", status: "error", httpStatus: res.status };
    const data = await res.json();
    // Sjekk om responsen inneholder kType-relaterte felt
    const vehicle = data?.data;
    const ktype = vehicle?.tecdoc_ktype || vehicle?.ktype || vehicle?.vehicle_id || null;
    return {
      source: "biluppgitter",
      status: ktype ? "ok" : "no_ktype",
      ktype,
      raw: vehicle,
    };
  } catch (e) {
    return { source: "biluppgitter", status: "error", error: e.message };
  }
}

// === 2. CarQuery API (gratis) ===
async function resolveCarQuery(make, model, year) {
  try {
    const url = `https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${encodeURIComponent(make.toLowerCase())}&model=${encodeURIComponent(model.toLowerCase())}&year=${year}&full_results=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AutoglassAS-OSINT/1.0" },
    });
    if (!res.ok) return { source: "carquery", status: "error", httpStatus: res.status };
    const text = await res.text();
    // CarQuery returnerer JSONP, vi må strippe callback
    const jsonMatch = text.match(/\((.*)\)/s);
    const json = jsonMatch ? jsonMatch[1] : text;
    const data = JSON.parse(json);
    const trims = data?.Trims || [];
    if (trims.length === 0) {
      return { source: "carquery", status: "no_results" };
    }
    // CarQuery model_id kan mappes til TecDoc kType via kjente tabeller
    // For nå, returnerer vi model_id som en "lead"
    return {
      source: "carquery",
      status: "ok",
      modelId: trims[0].model_id,
      trimCount: trims.length,
      trims: trims.slice(0, 3).map(t => ({
        model_id: t.model_id,
        model_name: t.model_name,
        make: t.make_display,
        year: t.model_year,
        body: t.model_body,
      })),
    };
  } catch (e) {
    return { source: "carquery", status: "error", error: e.message };
  }
}

// === 3. vPIC (allerede dekodet, brukes som verifier) ===
async function resolveVpic(vin) {
  // Hent fra cache hvis finnes
  const cacheFile = "data/ktype-recon/vehicle-fingerprints.ndjson";
  if (existsSync(cacheFile)) {
    const lines = readFileSync(cacheFile, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const r = JSON.parse(line);
        if (r.vin === vin && r.vpic) {
          return {
            source: "vpic",
            status: "ok",
            make: r.vpic.make,
            model: r.vpic.model,
            year: r.vpic.year,
            body: r.vpic.body,
            series: r.vpic.series,
          };
        }
      } catch { /* skip */ }
    }
  }
  return { source: "vpic", status: "not_cached" };
}

// === 4. Autodoc scraping (fallback) ===
async function resolveAutodoc(eurocode) {
  if (!eurocode) return { source: "autodoc", status: "no_eurocode" };
  try {
    // Autodoc søk: https://www.autodoc.de/suche?keyword=<eurocode>
    const searchUrl = `https://www.autodoc.de/suche?keyword=${encodeURIComponent(eurocode)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
    });
    if (!res.ok) return { source: "autodoc", status: "error", httpStatus: res.status };
    const html = await res.text();
    // Søk etter kType i HTML
    const ktypeMatch = html.match(/ktype["\s:=]+(\d{3,6})/i);
    const tecdocMatch = html.match(/tecdoc[^\d]*(\d{3,6})/i);
    const ktype = ktypeMatch ? parseInt(ktypeMatch[1], 10) : (tecdocMatch ? parseInt(tecdocMatch[1], 10) : null);
    return {
      source: "autodoc",
      status: ktype ? "ok" : "no_ktype",
      ktype,
      searchUrl,
    };
  } catch (e) {
    return { source: "autodoc", status: "error", error: e.message };
  }
}

// === Master resolver ===
async function resolveKtype({ regnr, vin, make, model, year, eurocode }) {
  const results = [];

  // 1. Biluppgitter (raskest hvis det fungerer)
  if (regnr) {
    const bil = await resolveBiluppgitterRegno(regnr);
    results.push(bil);
    if (bil.status === "ok" && bil.ktype) {
      return { resolved: true, ktype: bil.ktype, source: "biluppgitter", confidence: "high", results };
    }
  }

  // 2. CarQuery
  if (make && model && year) {
    await sleep(DELAY_MS);
    const cq = await resolveCarQuery(make, model, year);
    results.push(cq);
    // CarQuery gir ikke direkte kType, men model_id som lead
  }

  // 3. vPIC verifier
  if (vin) {
    const vpic = await resolveVpic(vin);
    results.push(vpic);
  }

  // 4. Autodoc scraping (hvis vi har eurocode)
  if (eurocode) {
    await sleep(DELAY_MS);
    const ad = await resolveAutodoc(eurocode);
    results.push(ad);
    if (ad.status === "ok" && ad.ktype) {
      return { resolved: true, ktype: ad.ktype, source: "autodoc", confidence: "medium", results };
    }
  }

  // Ingen direkte kType funnet — returner leads for manuell verifisering
  const leads = results.filter(r => r.status === "ok" || r.modelId);
  return {
    resolved: false,
    ktype: null,
    source: "unresolved",
    confidence: "none",
    leads,
    results,
  };
}

// === CLI ===
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const regnr = getArg("--regnr");
  const vin = getArg("--vin");
  const make = getArg("--brand") || getArg("--make");
  const model = getArg("--model");
  const year = getArg("--year") ? parseInt(getArg("--year"), 10) : undefined;
  const eurocode = getArg("--eurocode");

  // Single mode
  if (regnr || vin || make) {
    log(`Resolver kType for ${regnr || vin || make + " " + model}`);
    const result = await resolveKtype({ regnr, vin, make, model, year, eurocode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Batch mode
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    const outIdx = args.indexOf("--out");
    const outFile = outIdx >= 0 ? args[outIdx + 1] : file.replace(/\.ndjson$/, "-resolved.ndjson");

    const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
    const records = lines.map(l => JSON.parse(l));

    log(`Batch-resolver kType for ${records.length} kjøretøy`);
    const resolved = [];
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      log(`[${i + 1}/${records.length}] ${r.regnr || r.vin || "?"}`);
      const result = await resolveKtype({
        regnr: r.regnr,
        vin: r.vin,
        make: r.make || r.vpic?.make,
        model: r.model || r.vpic?.model,
        year: r.year || r.vpic?.year,
        eurocode: r.eurocode,
      });
      resolved.push({ ...r, ktypeResolution: result });
      if (result.resolved) ok++; else fail++;

      // Lagre kontinuerlig
      if (i % 10 === 0) {
        writeFileSync(outFile, resolved.map(r => JSON.stringify(r)).join("\n") + "\n");
      }
    }

    writeFileSync(outFile, resolved.map(r => JSON.stringify(r)).join("\n") + "\n");
    log(`✅ Ferdig: ${ok} resolved, ${fail} unresolved → ${outFile}`);
    return;
  }

  console.log(`Usage:
  node resolve-ktype.mjs --regnr SU18018 --brand VW --model Transporter --year 2005
  node resolve-ktype.mjs --vin WV1ZZZ7HZ5H060934 --brand VW --model Transporter --year 2005
  node resolve-ktype.mjs --eurocode 2525CSGYA --brand VW --model Transporter --year 2005
  node resolve-ktype.mjs --file <vehicle-fingerprints.ndjson> --out <resolved.ndjson>`);
  process.exit(1);
}

main().catch(console.error);
