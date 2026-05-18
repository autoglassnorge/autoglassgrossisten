#!/usr/bin/env node
/**
 * API Smoke-test Suite
 * ====================
 * Post-deploy verifisering av alle API-endepunkter.
 *
 * Kjøring:
 *   node scripts/smoke-test.mjs
 *   node scripts/smoke-test.mjs --base=https://autoglass-glass-sok.autoglassnorge.workers.dev
 */

const BASE_ARG = process.argv.find((a) => a.startsWith("--base="));
const BASE_URL = BASE_ARG ? BASE_ARG.split("=")[1] : "https://autoglass-glass-sok.autoglassnorge.workers.dev";

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const RESET = "\x1b[0m";

const TEST_REGNRS = [
  { regnr: "SU18018", expectedMake: "VOLKSWAGEN" },
];

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ${G}✓${RESET} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${R}✗${RESET} ${name}: ${e.message}`);
    failed++;
  }
}

async function main() {
  console.log(`\n🧪 Smoke-test Suite`);
  console.log(`   Base: ${BASE_URL}\n`);

  // 1. Health
  await test("Health check", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(`status=${data.status}`);
    if (data.catalogSize < 30000) throw new Error(`catalogSize=${data.catalogSize}`);
  });

  // 2. Regnr-oppslag
  for (const { regnr, expectedMake } of TEST_REGNRS.slice(0, 2)) {
    await test(`Regnr ${regnr}`, async () => {
      const res = await fetch(`${BASE_URL}/api/glass?regnr=${regnr}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(`error=${data.error}`);
      if (!data.vehicle?.regnr) throw new Error("Mangler vehicle");
      if (expectedMake && data.vehicle.make !== expectedMake) {
        throw new Error(`make=${data.vehicle.make}, expected=${expectedMake}`);
      }
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Ingen kandidater");
      }
    });
  }

  // 3. Prefix4-oppslag (merk: kan være tregt pga full katalog-lasting)
  await test("Prefix4 5351", async () => {
    const res = await fetch(`${BASE_URL}/api/glass?prefix4=5351`);
    if (res.status === 503) {
      throw new Error("HTTP 503 (CPU limit — kjent issue med stor katalog)");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.count === 0) throw new Error("Ingen treff");
  });

  // 4. Eurocode-oppslag (merk: kan være tregt pga full katalog-lasting)
  await test("Eurocode 5351AGNMV", async () => {
    const res = await fetch(`${BASE_URL}/api/glass?eurocode=5351AGNMV`);
    if (res.status === 503) {
      throw new Error("HTTP 503 (CPU limit — kjent issue med stor katalog)");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.count === 0) throw new Error("Ingen treff");
  });

  // 5. Feilhåndtering
  await test("Ukjent endepunkt → 404", async () => {
    const res = await fetch(`${BASE_URL}/api/ukjent`);
    if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
  });

  // 6. CORS-headers
  await test("CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      method: "OPTIONS",
      headers: { Origin: "https://auto-glass.no" },
    });
    if (!res.headers.get("access-control-allow-origin")) {
      throw new Error("Mangler CORS-header");
    }
  });

  // Oppsummering
  console.log("\n" + "═".repeat(40));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`${G}✅ ALL OK: ${passed}/${total} tester passert${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${R}❌ FAIL: ${failed}/${total} tester feilet${RESET}\n`);
    process.exit(1);
  }
}

main();
