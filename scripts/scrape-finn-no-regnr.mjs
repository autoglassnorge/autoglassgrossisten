#!/usr/bin/env node
/**
 * scrape-finn-no-regnr.mjs
 * =========================
 * Scraper finn.no for norske registreringsnummer fra bilannonser.
 *
 * Strategi:
 *   1. Søk per merke på finn.no
 *   2. Hent alle annonse-lenker fra søkeresultatet
 *   3. For hver annonse: åpne detaljsiden og ekstraher "Registreringsnummer"
 *   4. Dedupliser og lagre PROGRESSIVT (etter hvert merke)
 *
 * Output: data/finn-no-regnr-raw.json
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Konfigurasjon ──────────────────────────────────────────────────────────

const BRANDS = [
  { name: "Toyota",        urlName: "Toyota" },
  { name: "Volkswagen",    urlName: "Volkswagen" },
  { name: "Ford",          urlName: "Ford" },
  { name: "Mercedes-Benz", urlName: "Mercedes-Benz" },
  { name: "BMW",           urlName: "BMW" },
  { name: "Hyundai",       urlName: "Hyundai" },
  { name: "Audi",          urlName: "Audi" },
  { name: "Kia",           urlName: "Kia" },
  { name: "Renault",       urlName: "Renault" },
  { name: "Mazda",         urlName: "Mazda" },
  { name: "Nissan",        urlName: "Nissan" },
  { name: "Peugeot",       urlName: "Peugeot" },
  { name: "Honda",         urlName: "Honda" },
  { name: "Volvo",         urlName: "Volvo" },
  { name: "Lexus",         urlName: "Lexus" },
  { name: "Citroën",       urlName: "Citro%C3%ABn" },
  { name: "Skoda",         urlName: "Skoda" },
  { name: "Fiat",          urlName: "Fiat" },
  { name: "Porsche",       urlName: "Porsche" },
  { name: "Seat",          urlName: "Seat" },
];

const MAX_ADS_PER_BRAND = 25;
const CONCURRENT_ADS = 5;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const HEADLESS = true;

// CLI: node scripts/scrape-finn-no-regnr.mjs [startIndex] [endIndex]
const START_INDEX = parseInt(process.argv[2] || "0", 10);
const END_INDEX = parseInt(process.argv[3] || String(BRANDS.length), 10);

const OUTPUT_SUFFIX = START_INDEX === 0 && END_INDEX === BRANDS.length ? "" : `-${START_INDEX}-${END_INDEX}`;
const OUTPUT = path.join(ROOT, "data", `finn-no-regnr-raw${OUTPUT_SUFFIX}.json`);

// ── Resume-støtte ──────────────────────────────────────────────────────────

function loadExisting() {
  if (!fs.existsSync(OUTPUT)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));
    // Sjekk om data ser gyldig ut (har reelle counts)
    const hasRealData = Object.values(data.brands || {}).some((b) => (b.count || 0) > 0);
    if (hasRealData) return data;
    return null;
  } catch {
    return null;
  }
}

function saveOutput(brands, total) {
  const output = {
    scrapedAt: new Date().toISOString(),
    totalFound: total,
    brands,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
}

// ── Hovedflyt ──────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  finn.no RegNr Scraper (Playwright)");
  console.log(`  Merker: ${BRANDS.length}, Maks annonser/merke: ${MAX_ADS_PER_BRAND}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Resume: hopp over merker som allerede er ferdige
  const existing = loadExisting();
  const completedBrands = new Set();
  const allResults = {};
  let totalUnique = 0;

  if (existing) {
    console.log("📦 Resumer fra eksisterende data:");
    for (const [name, data] of Object.entries(existing.brands)) {
      if (data.count > 0) {
        allResults[name] = data;
        totalUnique += data.count;
        completedBrands.add(name);
        console.log(`   ✅ ${name}: ${data.count} regnr (hoppes over)`);
      }
    }
    console.log(`   Total allerede: ${totalUnique} regnr\n`);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    for (let bi = START_INDEX; bi < Math.min(END_INDEX, BRANDS.length); bi++) {
      const brand = BRANDS[bi];

      if (completedBrands.has(brand.name)) {
        console.log(`[${bi + 1}/${BRANDS.length}] ⏭️  ${brand.name} — allerede ferdig`);
        continue;
      }

      console.log(`[${bi + 1}/${BRANDS.length}] 🔍 ${brand.name}`);

      const brandRegnrs = new Set();

      // 1. Hent annonse-lenker fra søkesiden
      const adUrls = await fetchAdUrls(context, brand.urlName, MAX_ADS_PER_BRAND);
      console.log(`    📄 ${adUrls.length} annonser funnet`);

      if (adUrls.length === 0) {
        allResults[brand.name] = { count: 0, regnrs: [] };
        saveOutput(allResults, totalUnique);
        continue;
      }

      // 2. Prosesser annonser i batches
      for (let i = 0; i < adUrls.length; i += CONCURRENT_ADS) {
        const batch = adUrls.slice(i, i + CONCURRENT_ADS);
        const batchResults = await Promise.all(
          batch.map((url) => extractRegnrFromAd(context, url))
        );

        for (const regnr of batchResults) {
          if (regnr && !brandRegnrs.has(regnr)) {
            brandRegnrs.add(regnr);
          }
        }

        const progress = Math.min(i + CONCURRENT_ADS, adUrls.length);
        console.log(
          `    [${progress}/${adUrls.length}] +${batchResults.filter(Boolean).length} regnr (total: ${brandRegnrs.size})`
        );

        if (i + CONCURRENT_ADS < adUrls.length) {
          await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
      }

      allResults[brand.name] = {
        count: brandRegnrs.size,
        regnrs: [...brandRegnrs].sort(),
      };
      totalUnique += brandRegnrs.size;

      console.log(`  ✅ ${brand.name}: ${brandRegnrs.size} unike regnr\n`);

      // LAGRE PROGRESSIVT etter hvert merke
      saveOutput(allResults, totalUnique);
    }

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Oppsummering");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`📊 Totalt funnet: ${totalUnique} unike regnr`);
    console.log(`💾 Lagret til: ${OUTPUT}`);
    for (const [name, data] of Object.entries(allResults)) {
      console.log(`   ${name.padEnd(15)} ${data.count}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Hjelpefunksjoner ───────────────────────────────────────────────────────

async function fetchAdUrls(context, brandEncoded, maxAds) {
  const page = await context.newPage();
  try {
    const url = `https://www.finn.no/mobility/search/car?last_search=false&registration_class=1&make=${brandEncoded}&sort=PUBLISHED_DESC`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Accept cookies
    try {
      const acceptBtn = await page.locator('button:has-text("Godta alle")').first();
      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    // Hent alle annonse-lenker
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href*='mobility/item/']"))
        .map((a) => a.getAttribute("href"))
        .filter((h, i, arr) => arr.indexOf(h) === i);
    });

    return links.slice(0, maxAds).map((href) =>
      href.startsWith("http") ? href : `https://www.finn.no${href}`
    );
  } catch (e) {
    console.warn(`    ⚠️  Feil ved henting av lenker: ${e.message}`);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function extractRegnrFromAd(context, adUrl) {
  const page = await context.newPage();
  try {
    await page.goto(adUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);

    // Accept cookies
    try {
      const acceptBtn = await page.locator('button:has-text("Godta alle")').first();
      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click();
        await page.waitForTimeout(500);
      }
    } catch {}

    // Søk etter "Registreringsnummer" i definisjonslister (dl/dt/dd)
    const regnr = await page.evaluate(() => {
      // Metode 1: dl/dt/dd-struktur
      const dts = document.querySelectorAll("dl dt, dl dd");
      for (let i = 0; i < dts.length - 1; i++) {
        const text = dts[i].innerText?.trim().toLowerCase();
        if (text && text.includes("registreringsnummer")) {
          const value = dts[i + 1]?.innerText?.trim();
          if (value) return value;
        }
      }

      // Metode 2: Generell tekstsøk
      const allText = document.body.innerText;
      const match = allText.match(/Registreringsnummer\s*[:\n]\s*([A-Z]{2}\d{4,5})/i);
      if (match) return match[1];

      // Metode 3: Søk i hele siden etter norsk regnr-pattern
      const allMatches = allText.match(/[A-HJ-NPR-Z]{2}\d{4,5}/g);
      if (allMatches) {
        const noise = new Set(["FINN", "NRK", "NAV", "DNB", "DHL"]);
        for (const m of allMatches) {
          if (!noise.has(m)) return m;
        }
      }

      return null;
    });

    return regnr;
  } catch (e) {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Kjør ──────────────────────────────────────────────────────────────────
main().catch((e) => {
  console.error("💥 Fatal feil:", e);
  process.exit(1);
});
