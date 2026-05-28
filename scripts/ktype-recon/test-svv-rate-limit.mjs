#!/usr/bin/env node
/**
 * Test SVV rate limit med forskjellige delays
 * Kjører 10 requests med økende hastighet for å finne grensen.
 */

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_URL = "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata";

const TEST_REGNRS = ["SU18018", "CV65230", "DT10555", "AB12345", "EL19848", "OM668", "UF76407", "KJ36935", "NV73108", "SV11595"];

async function fetchSvv(regnr) {
  const url = `${SVV_URL}?kjennemerke=${encodeURIComponent(regnr)}`;
  const start = Date.now();
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
    return {
      regnr,
      status: res.status,
      isRateLimit,
      duration: Date.now() - start,
      hasData: text.includes("kjoretoydataListe"),
    };
  } catch (e) {
    return { regnr, status: -1, error: e.message, duration: Date.now() - start };
  }
}

async function testDelay(label, delayMs) {
  console.log(`\n=== Test: ${label} (delay=${delayMs}ms) ===`);
  const results = [];
  for (let i = 0; i < TEST_REGNRS.length; i++) {
    const r = TEST_REGNRS[i];
    const result = await fetchSvv(r);
    results.push(result);
    console.log(`  ${i+1}. ${r} → status=${result.status} rateLimit=${result.isRateLimit} duration=${result.duration}ms`);
    if (result.isRateLimit) {
      console.log(`  ⚠️ RATE LIMIT etter ${i+1} requests!`);
      break;
    }
    if (i < TEST_REGNRS.length - 1) {
      await new Promise(x => setTimeout(x, delayMs));
    }
  }
  return results;
}

async function main() {
  if (!SVV_API_KEY) {
    console.error("SVV_API_KEY ikke satt");
    process.exit(1);
  }

  // Test 1: 60s delay (known working)
  await testDelay("60s delay (baseline)", 60_000);

  // Test 2: 30s delay
  await testDelay("30s delay", 30_000);

  // Test 3: 15s delay
  await testDelay("15s delay", 15_000);

  // Test 4: 5s delay
  await testDelay("5s delay", 5_000);

  console.log("\n=== Oppsummering ===");
  console.log("Se resultatene over for å finne optimal delay.");
}

main().catch(console.error);
