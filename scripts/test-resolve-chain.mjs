#!/usr/bin/env node
/**
 * test-resolve-chain.mjs
 * Test den komplette resolver-kjeden for norske regnr
 *
 * Bruk:
 *   node scripts/test-resolve-chain.mjs UX71699
 *   node scripts/test-resolve-chain.mjs SU18018
 */

const SVV_API_KEY = process.env.SVV_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const TEST_REGNRS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['UX71699', 'SU18018'];

// ---------------------------------------------------------------------------
// SVV-oppslag
// ---------------------------------------------------------------------------
async function fetchSvv(regnr) {
  const res = await fetch(
    `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
    {
      headers: {
        Accept: 'application/json',
        'SVV-Authorization': `Apikey ${SVV_API_KEY}`,
        'User-Agent': 'AutoglassAS-B2B/1.0',
      },
    }
  );

  if (!res.ok) {
    return { status: 'error', httpStatus: res.status, error: await res.text() };
  }

  const data = await res.json();
  const k = data.kjoretoydataListe?.[0];
  if (!k) {
    return { status: 'not_found' };
  }

  const make = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke ?? '';
  const model = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] ?? '';
  const typebetegnelse = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.typebetegnelse ?? '';
  const vin = k.kjoretoyId?.understellsnummer ?? '';
  const firstReg = k.forstegangsregistrering?.registrertForstegangNorgeDato ?? '';

  // Parse year from first registration date
  let year = null;
  if (firstReg) {
    const match = firstReg.match(/(\d{4})/);
    if (match) year = parseInt(match[1]);
  }

  return {
    status: 'ok',
    regnr,
    make,
    model,
    typebetegnelse,
    vin,
    year,
  };
}

// ---------------------------------------------------------------------------
// vPIC VIN-dekoding (gratis)
// ---------------------------------------------------------------------------
async function fetchVpic(vin) {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const v = data.Results?.[0] ?? {};

  return {
    make: v.Make || null,
    model: v.Model || null,
    year: v.ModelYear ? parseInt(v.ModelYear) : null,
    bodyStyle: v.BodyClass || null,
    fuelType: v.FuelTypePrimary || null,
  };
}

// ---------------------------------------------------------------------------
// RapidAPI K-Type Finder (hvis nøkkel finnes)
// ---------------------------------------------------------------------------
async function fetchKTypeFinder(vin, regnr) {
  if (!RAPIDAPI_KEY) return { status: 'no_key' };

  const searchParam = regnr ? `plate=${encodeURIComponent(regnr)}` : `vin=${encodeURIComponent(vin)}`;
  const endpoint = regnr ? '/find-by-plate' : '/find-by-vin';

  try {
    const res = await fetch(`https://ktype-finder-tecdoc.p.rapidapi.com${endpoint}?${searchParam}`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'ktype-finder-tecdoc.p.rapidapi.com',
        Accept: 'application/json',
      },
    });

    if (!res.ok) return { status: 'error', httpStatus: res.status };

    const data = await res.json();
    const ktype = data.ktype ?? data.kType ?? data.vehicleType ?? null;

    return {
      status: 'ok',
      ktype: ktype ? parseInt(String(ktype)) : null,
      raw: data,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// RapidAPI VIN Decoder TECDOC (hvis nøkkel finnes)
// ---------------------------------------------------------------------------
async function fetchVinDecoderTecdoc(vin) {
  if (!RAPIDAPI_KEY) return { status: 'no_key' };

  try {
    const res = await fetch(`https://vin-decoder-support-tecdoc-catalog.p.rapidapi.com/decode/${encodeURIComponent(vin)}`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'vin-decoder-support-tecdoc-catalog.p.rapidapi.com',
        Accept: 'application/json',
      },
    });

    if (!res.ok) return { status: 'error', httpStatus: res.status };

    const data = await res.json();
    const ktype = data.ktype ?? data.kType ?? data.tecDocKType ?? null;

    return {
      status: 'ok',
      ktype: ktype ? parseInt(String(ktype)) : null,
      raw: data,
    };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Hoved-test
// ---------------------------------------------------------------------------
async function main() {
  if (!SVV_API_KEY) {
    console.error('❌ SVV_API_KEY mangler');
    process.exit(1);
  }

  console.log('🧪 Tester resolver-kjeden');
  console.log(`   RapidAPI: ${RAPIDAPI_KEY ? '✅ Satt' : '❌ Ikke satt (hopper over Lag 3-4)'}`);
  console.log('');

  for (const regnr of TEST_REGNRS) {
    console.log(`═══════════════════════════════════════════════`);
    console.log(`🚗 Testing: ${regnr}`);
    console.log(`═══════════════════════════════════════════════`);

    // --- Lag 0: SVV ---
    console.log(`\n📡 Lag 0: SVV Enkeltoppslag`);
    const svvResult = await fetchSvv(regnr);

    if (svvResult.status !== 'ok') {
      console.log(`   ❌ SVV feilet: ${svvResult.status} ${svvResult.httpStatus ?? ''}`);
      continue;
    }

    console.log(`   ✅ SVV OK`);
    console.log(`      Merke: ${svvResult.make}`);
    console.log(`      Modell: ${svvResult.model}`);
    console.log(`      Typebetegnelse: ${svvResult.typebetegnelse}`);
    console.log(`      År: ${svvResult.year}`);
    console.log(`      VIN: ${svvResult.vin || 'IKKE TILGJENGELIG'}`);

    if (!svvResult.vin) {
      console.log(`   ⚠️  Ingen VIN fra SVV - kan ikke fortsette VIN-basert oppslag`);
      continue;
    }

    // --- Lag 1: vPIC ---
    console.log(`\n📡 Lag 1: NHTSA vPIC (gratis)`);
    const vpicResult = await fetchVpic(svvResult.vin);
    if (vpicResult) {
      console.log(`   ✅ vPIC OK`);
      console.log(`      Make: ${vpicResult.make}`);
      console.log(`      Model: ${vpicResult.model}`);
      console.log(`      Year: ${vpicResult.year}`);
      console.log(`      Body: ${vpicResult.bodyStyle}`);
      console.log(`      Fuel: ${vpicResult.fuelType}`);
    } else {
      console.log(`   ⚠️  vPIC returnerte ingen data`);
    }

    // --- Lag 3: K-Type Finder ---
    console.log(`\n📡 Lag 3: RapidAPI K-Type Finder`);
    const ktfResult = await fetchKTypeFinder(svvResult.vin, regnr);
    if (ktfResult.status === 'no_key') {
      console.log(`   ⏭️  Hopper over (RAPIDAPI_KEY mangler)`);
    } else if (ktfResult.status === 'ok' && ktfResult.ktype) {
      console.log(`   ✅ K-Type Finder OK`);
      console.log(`      kType: ${ktfResult.ktype}`);
    } else {
      console.log(`   ❌ K-Type Finder: ${ktfResult.status}`);
      if (ktfResult.raw) console.log(`      Raw:`, JSON.stringify(ktfResult.raw, null, 2).slice(0, 500));
    }

    // --- Lag 4: VIN Decoder TECDOC ---
    console.log(`\n📡 Lag 4: RapidAPI VIN Decoder TECDOC`);
    const vdtResult = await fetchVinDecoderTecdoc(svvResult.vin);
    if (vdtResult.status === 'no_key') {
      console.log(`   ⏭️  Hopper over (RAPIDAPI_KEY mangler)`);
    } else if (vdtResult.status === 'ok' && vdtResult.ktype) {
      console.log(`   ✅ VIN Decoder TECDOC OK`);
      console.log(`      kType: ${vdtResult.ktype}`);
    } else {
      console.log(`   ❌ VIN Decoder TECDOC: ${vdtResult.status}`);
      if (vdtResult.raw) console.log(`      Raw:`, JSON.stringify(vdtResult.raw, null, 2).slice(0, 500));
    }

    console.log('');
  }

  console.log('═══════════════════════════════════════════════');
  console.log('✅ Test fullført');
}

main().catch(e => {
  console.error('💥 Fatal feil:', e);
  process.exit(1);
});
