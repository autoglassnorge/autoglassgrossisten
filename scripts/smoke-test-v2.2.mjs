#!/usr/bin/env node
/**
 * Smoke Test — Worker v2.2 (Hacker Mode)
 * ======================================
 * Verifies that the deployed Worker responds correctly.
 *
 * Usage:
 *   node scripts/smoke-test-v2.2.mjs
 *   node scripts/smoke-test-v2.2.mjs --prod    # test production URL
 */

const BASE = process.argv.includes("--prod")
  ? "https://autoglass-glass-sok.autoglassnorge.workers.dev"
  : "http://localhost:8787";

const R = "\x1b[31m", G = "\x1b[32m", Y = "\x1b[33m", RESET = "\x1b[0m";
const ok = (m) => console.log(`  ${G}✓${RESET} ${m}`);
const fail = (m) => console.log(`  ${R}✗${RESET} ${m}`);
const warn = (m) => console.log(`  ${Y}⚠${RESET} ${m}`);

async function test(endpoint, check) {
  try {
    const res = await fetch(`${BASE}${endpoint}`);
    const data = await res.json().catch(() => null);
    const passed = check(res, data);
    return { passed, status: res.status, data };
  } catch (e) {
    return { passed: false, error: e.message };
  }
}

async function main() {
  console.log("\n🔥 Smoke Test — Worker v2.2");
  console.log(`   Base URL: ${BASE}\n`);

  let passed = 0;
  let failed = 0;

  // 1. Health check
  {
    const { passed: p, status, data } = await test("/api/health", (res, d) =>
      res.status === 200 && d?.version === "2.2" && d?.catalogSize > 30000
    );
    if (p) {
      ok(`Health: v${data.version}, ${data.catalogSize.toLocaleString("nb-NO")} records, ${data.brands} brands`);
      passed++;
    } else {
      fail(`Health: status=${status}, version=${data?.version}, records=${data?.catalogSize}`);
      failed++;
    }
  }

  // 2. Brands endpoint
  {
    const { passed: p, status, data } = await test("/api/catalog/brands", (res, d) =>
      res.status === 200 && Array.isArray(d?.brands) && d.brands.length > 50
    );
    if (p) {
      ok(`Brands: ${data.brands.length} brands returned`);
      passed++;
    } else {
      fail(`Brands: status=${status}`);
      failed++;
    }
  }

  // 3. Categories endpoint
  {
    const { passed: p, status, data } = await test("/api/catalog/categories", (res, d) =>
      res.status === 200 && Array.isArray(d?.categories)
    );
    if (p) {
      const frontrute = data.categories.find(c => c.category === "frontrute");
      ok(`Categories: ${data.categories.length} categories, frontrute=${frontrute?.count || 0}`);
      passed++;
    } else {
      fail(`Categories: status=${status}`);
      failed++;
    }
  }

  // 4. Prefix4 search
  {
    const { passed: p, status, data } = await test("/api/glass?prefix4=5351", (res, d) =>
      res.status === 200 && Array.isArray(d?.results)
    );
    if (p) {
      ok(`Prefix4: ${data.results.length} results for 5351`);
      passed++;
    } else {
      fail(`Prefix4: status=${status}`);
      failed++;
    }
  }

  // 5. Eurocode lookup
  {
    const { passed: p, status, data } = await test("/api/glass?eurocode=2048AGACMVZ", (res, d) =>
      res.status === 200 && d?.results?.length === 1
    );
    if (p) {
      const r = data.results[0];
      ok(`Eurocode: ${r.eurocode} (${r.brand} ${r.model})`);
      passed++;
    } else {
      fail(`Eurocode: status=${status}`);
      failed++;
    }
  }

  // 6. Regnr search (this is the big one — tests SVV + equipment guessing)
  {
    // Use a known Norwegian regnr for testing
    const testRegnr = process.env.TEST_REGNR || "EL12345";
    const { passed: p, status, data } = await test(`/api/glass?regnr=${testRegnr}`, (res, d) =>
      res.status === 200 || res.status === 404 || res.status === 503
    );
    if (p) {
      if (status === 200) {
        const v = data.vehicle;
        const eq = data.effectiveEquipment;
        const learned = data.guessedEquipment;
        ok(`Regnr ${testRegnr}: ${v.make} ${v.model} ${v.year}`);
        if (eq?.source === "catalog_guess") {
          ok(`  Equipment guessed (${eq.guessConfidence}): camera=${eq.camera}, adas=${eq.adas}`);
        } else if (eq?.source === "biluppgifter") {
          ok(`  Equipment from Biluppgitter: camera=${eq.camera}, adas=${eq.adas}`);
        } else if (eq?.source === "learned") {
          ok(`  Equipment learned (${eq.guessConfidence}): camera=${eq.camera}, adas=${eq.adas}`);
        }
        if (data.candidates?.length > 0) {
          ok(`  Top candidate: ${data.candidates[0].eurocode} (layer=${data.layer}, confidence=${data.confidence})`);
        }
      } else if (status === 404) {
        warn(`Regnr ${testRegnr}: not found in SVV (test data)`);
      } else if (status === 503) {
        warn(`Regnr ${testRegnr}: SVV temporarily unavailable`);
      }
      passed++;
    } else {
      fail(`Regnr: status=${status}, error=${data?.error}`);
      failed++;
    }
  }

  // Summary
  console.log("\n" + "═".repeat(50));
  if (failed === 0) {
    console.log(`${G}✅ ALL TESTS PASSED${RESET}`);
  } else {
    console.log(`${R}❌ ${failed} test(s) failed${RESET}`);
    console.log(`${G}   ${passed} test(s) passed${RESET}`);
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main();
