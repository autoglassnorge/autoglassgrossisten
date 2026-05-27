#!/usr/bin/env node
/**
 * bootstrap-ktype-rapidapi.mjs
 * ==========================================
 * ⚠️  DEPRECATED: RapidAPI Autoways er fjernet fra RapidAPI (HTTP 404, 2026-05-21)
 *
 * Denne filen beholdes som historikk og referanse.
 * Autoways K-Type Finder, VIN Decoder TECDOC, og Car Selector er ikke lenger
 * tilgjengelig på RapidAPI.
 *
 * Alternativer:
 *   - Bruk glass_rules med Bovsoft-seed (se scripts/test-resolve-e2e.mjs)
 *   - Kontakt Autoways direkte: auto-ways.net/demo (49€/mnd)
 *   - Vurder Vincario: vincario.com (20 gratis testers, $0.22/VIN)
 *
 * Original strategi (ikke lenger funksjonell):
 *   1. Les D1 for unike brand+model+year
 *   2. Slå opp via SVV → VIN → RapidAPI K-Type Finder
 *   3. Lagre kType → brand:model:year mapping i glass_rules
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SVV_API_KEY = process.env.SVV_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// RapidAPI hosts
const KTYPE_FINDER_HOST = 'ktype-finder-tecdoc.p.rapidapi.com';
const VIN_DECODER_TECDOC_HOST = 'vin-decoder-support-tecdoc-catalog.p.rapidapi.com';

// Trottling
const DELAY_MS = 1200; // 1.2s mellom hver request (under 1 req/sec for å være snill)
const MAX_BATCH_SIZE = 100; // Maks antall oppslag per kjøring

// ---------------------------------------------------------------------------
// Hoved-funksjon
// ---------------------------------------------------------------------------
async function main() {
  if (!RAPIDAPI_KEY) {
    console.error('❌ RAPIDAPI_KEY mangler. Sett miljøvariabel: export RAPIDAPI_KEY=xxx');
    console.error('   Skaff nøkkel på: https://rapidapi.com/autowaysnet/api/ktype-finder-tecdoc');
    process.exit(1);
  }

  if (!SVV_API_KEY) {
    console.warn('⚠️  SVV_API_KEY mangler. Kan ikke slå opp regnr → VIN.');
    console.warn('   Fortsetter med VIN-only oppslag (hvis VIN-liste finnes).');
  }

  console.log('🚀 Bootstrap kType via RapidAPI');
  console.log(`   RapidAPI: ${RAPIDAPI_KEY.slice(0, 8)}...`);
  console.log(`   SVV: ${SVV_API_KEY ? SVV_API_KEY.slice(0, 8) + '...' : 'ikke satt'}`);

  // Les VIN-liste fra fil hvis finnes
  const vins = await loadVinList();
  if (vins.length > 0) {
    console.log(`📋 Lest ${vins.length} VIN-er fra scripts/data/sample-vins.txt`);
    await processVinList(vins);
    return;
  }

  // Eller: les brand+model+year fra D1
  console.log('📊 Ingen VIN-liste funnet. Henter unike brand+model+year fra D1...');

  // For nå, bruk en hardkodet liste med populære norske regnr
  const sampleRegnrs = [
    'SU18018', 'EL12345', 'BT54321', 'DN98765', 'KH45678',
    'NF11223', 'PD33445', 'RE55667', 'TV77889', 'XE99001',
    'AB10000', 'CD20000', 'EF30000', 'GH40000', 'IJ50000',
    // Legg til flere etter behov
  ];

  console.log(`🚗 Tester ${sampleRegnrs.length} sample regnr...`);
  await processRegnrList(sampleRegnrs);
}

// ---------------------------------------------------------------------------
// Prosesser VIN-liste direkte
// ---------------------------------------------------------------------------
async function processVinList(vins) {
  let success = 0;
  let fail = 0;
  let cached = 0;

  for (let i = 0; i < Math.min(vins.length, MAX_BATCH_SIZE); i++) {
    const vin = vins[i].trim().toUpperCase();
    if (vin.length !== 17) continue;

    process.stdout.write(`[${i + 1}/${vins.length}] ${vin} ... `);

    try {
      // Sjekk om vi allerede har denne VIN i cache
      // (For nå, vi logger bare resultatet)

      // Prøv RapidAPI K-Type Finder
      const result = await fetchKTypeByVin(vin);
      if (result) {
        console.log(`✅ kType=${result.ktype} (source=${result.source})`);
        success++;
      } else {
        console.log('❌ ingen kType funnet');
        fail++;
      }
    } catch (e) {
      console.log(`💥 feil: ${e.message}`);
      fail++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n📊 Oppsummering: ${success} suksess, ${fail} feil, ${cached} cached`);
}

// ---------------------------------------------------------------------------
// Prosesser regnr-liste (regnr → SVV → VIN → RapidAPI)
// ---------------------------------------------------------------------------
async function processRegnrList(regnrs) {
  let success = 0;
  let fail = 0;
  let svvFail = 0;

  for (let i = 0; i < Math.min(regnrs.length, MAX_BATCH_SIZE); i++) {
    const regnr = regnrs[i].trim().toUpperCase();
    process.stdout.write(`[${i + 1}/${regnrs.length}] ${regnr} ... `);

    try {
      // 1. Slå opp i SVV
      if (!SVV_API_KEY) {
        console.log('⏭️  hopper over (ingen SVV-nøkkel)');
        continue;
      }

      const vehicle = await fetchSvv(regnr);
      if (!vehicle || !vehicle.vin) {
        console.log('⚠️  SVV fant ikke VIN');
        svvFail++;
        continue;
      }

      // 2. Slå opp kType via RapidAPI
      const result = await fetchKTypeByVin(vehicle.vin);
      if (result) {
        console.log(`✅ kType=${result.ktype} (VIN=${vehicle.vin.slice(0, 8)}...)`);
        success++;
      } else {
        console.log('❌ ingen kType funnet');
        fail++;
      }
    } catch (e) {
      console.log(`💥 feil: ${e.message}`);
      fail++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n📊 Oppsummering: ${success} suksess, ${fail} feil, ${svvFail} SVV-miss`);
}

// ---------------------------------------------------------------------------
// API-kall
// ---------------------------------------------------------------------------
async function fetchSvv(regnr) {
  const res = await fetch(
    `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
    {
      headers: {
        'Accept': 'application/json',
        'SVV-Authorization': `Apikey ${SVV_API_KEY}`,
        'User-Agent': 'AutoglassAS-B2B/1.0',
      },
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;

  const make = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke ?? '';
  const model = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] ?? '';
  const vin = k.kjoretoyId?.understellsnummer ?? '';

  return { make, model, vin };
}

async function fetchKTypeByVin(vin) {
  // Prøv K-Type Finder først
  try {
    const res = await fetch(`https://${KTYPE_FINDER_HOST}/find-by-vin/${encodeURIComponent(vin)}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': KTYPE_FINDER_HOST,
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const ktype = data.ktype ?? data.kType ?? data.vehicleType ?? null;
      if (ktype) {
        return { ktype: parseInt(String(ktype)), source: 'ktype_finder' };
      }
    }
  } catch (e) {
    // Silently try next API
  }

  // Fallback: VIN Decoder TECDOC
  try {
    const res = await fetch(`https://${VIN_DECODER_TECDOC_HOST}/decode/${encodeURIComponent(vin)}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': VIN_DECODER_TECDOC_HOST,
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const ktype = data.ktype ?? data.kType ?? data.tecDocKType ?? null;
      if (ktype) {
        return { ktype: parseInt(String(ktype)), source: 'vin_decoder_tecdoc' };
      }
    }
  } catch (e) {
    // No more fallbacks
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hjelpefunksjoner
// ---------------------------------------------------------------------------
async function loadVinList() {
  try {
    const fs = await import('fs/promises');
    const text = await fs.readFile('scripts/data/sample-vins.txt', 'utf-8');
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Kjør
// ---------------------------------------------------------------------------
main().catch(e => {
  console.error('💥 Fatal feil:', e);
  process.exit(1);
});
