#!/usr/bin/env node
/**
 * SVV Turbo Rate Limit Test
 * Kjører requests med synkende delay for å finne den faktiske grensen.
 * Starter aggressivt og stopper når rate limit treffes.
 */

const SVV_API_KEY = process.env.SVV_API_KEY;
const SVV_URL = "https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata";

const TEST_REGNRS = [
  "SU18018", "CV65230", "DT10555", "AB12345", "EL19848",
  "OM668", "UF76407", "KJ36935", "NV73108", "SV11595",
  "JV11386", "AS62416", "RL59537", "VJ19969", "BH98201",
  "DR11342", "RK46229", "KJ35654", "EJ22108", "BX30300"
];

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
      ok: res.ok && !isRateLimit,
    };
  } catch (e) {
    return { regnr, status: -1, error: e.message, duration: Date.now() - start, ok: false };
  }
}

async function testTurbo(label, concurrency, delayMs) {
  console.log(`\n🏎️  TURBO TEST: ${label} (concurrency=${concurrency}, delay=${delayMs}ms)`);
  console.log(`   Start: ${new Date().toISOString()}`);

  const results = [];
  const queue = [...TEST_REGNRS];
  let rateLimitHit = false;
  let active = 0;

  async function worker() {
    while (queue.length > 0 && !rateLimitHit) {
      const regnr = queue.shift();
      active++;
      const result = await fetchSvv(regnr);
      results.push(result);
      active--;

      if (result.isRateLimit) {
        rateLimitHit = true;
        console.log(`   💥 RATE LIMIT ved request #${results.length} (${regnr})`);
      }

      if (delayMs > 0 && queue.length > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // Spawn workers
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const ok = results.filter(r => r.ok).length;
  const rateLimited = results.filter(r => r.isRateLimit).length;
  const errors = results.filter(r => !r.ok && !r.isRateLimit).length;
  const avgDuration = results.reduce((a, r) => a + r.duration, 0) / results.length;

  console.log(`   Ferdig: ${results.length} requests`);
  console.log(`   OK: ${ok} | RateLimited: ${rateLimited} | Errors: ${errors}`);
  console.log(`   Avg duration: ${Math.round(avgDuration)}ms`);
  console.log(`   Slutt: ${new Date().toISOString()}`);

  return { results, rateLimitHit, ok, rateLimited };
}

async function main() {
  if (!SVV_API_KEY) {
    console.error("SVV_API_KEY ikke satt");
    process.exit(1);
  }

  console.log("🔥 SVV TURBO RATE LIMIT TEST 🔥");
  console.log("Tester 20 regnr med økende aggressivitet\n");

  // Test 1: Max speed (0 delay, 5 concurrent)
  const t1 = await testTurbo("MAX SPEED (0ms, 5 concurrent)", 5, 0);
  if (!t1.rateLimitHit) {
    console.log("\n🤯 SVV tåler MAX SPEED! Fortsetter...");
  }

  // Test 2: Hvis rate limit, vent 2 min og test 100ms delay
  if (t1.rateLimitHit) {
    console.log("\n⏳ Venter 2 minutter for reset...");
    await new Promise(r => setTimeout(r, 120_000));

    const t2 = await testTurbo("100ms delay, 3 concurrent", 3, 100);

    if (t2.rateLimitHit) {
      console.log("\n⏳ Venter 2 minutter for reset...");
      await new Promise(r => setTimeout(r, 120_000));

      const t3 = await testTurbo("500ms delay, 2 concurrent", 2, 500);

      if (t3.rateLimitHit) {
        console.log("\n⏳ Venter 2 minutter for reset...");
        await new Promise(r => setTimeout(r, 120_000));

        const t4 = await testTurbo("1000ms delay, 1 concurrent", 1, 1000);
      }
    }
  }

  console.log("\n✅ TURBO TEST FULLFØRT");
  console.log("Se resultatene over for å velge optimal delay.");
}

main().catch(console.error);
