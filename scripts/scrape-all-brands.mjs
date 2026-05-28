#!/usr/bin/env node
/**
 * Multi-Brand Finn.no Regnr Batch Scraper
 * =========================================
 *
 * Reads the top brands from the Hella Gutmann CSC list and runs
 * scrape-finn-by-brand for each, then deduplicates across brands
 * into a combined list.
 *
 * Usage:
 *   node scripts/scrape-all-brands.mjs [--brands=N] [--pages=5] [--delay=300]
 *
 * Output:
 *   data/finn-no-regnr/by-brand/multi-brand-regnr-list.txt
 *   data/finn-no-regnr/by-brand/multi-brand-report.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";

const OUTPUT_DIR = resolve(process.cwd(), "data", "finn-no-regnr", "by-brand");
const QUERIES_FILE = resolve(process.cwd(), "data", "csc-parsed", "finn-search-queries.json");
const SCRAPER_SCRIPT = resolve(process.cwd(), "scripts", "scrape-finn-by-brand.mjs");

const DEFAULT_CONFIG = {
  brands: 10,
  pages: 5,
  delay: 300,
  timeout: 30000,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG };
  for (const arg of args) {
    if (arg.startsWith("--brands=")) opts.brands = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--pages=")) opts.pages = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--delay=")) opts.delay = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--timeout=")) opts.timeout = parseInt(arg.split("=")[1], 10);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getTopBrands(queries, limit) {
  const brandStats = new Map();

  for (const q of queries) {
    const brand = q.brand;
    if (!brand) continue;
    if (!brandStats.has(brand)) {
      brandStats.set(brand, { brand, models: 0, sensors: 0 });
    }
    const s = brandStats.get(brand);
    s.models++;
    s.sensors += (q.sensors?.length || 0);
  }

  const sorted = Array.from(brandStats.values()).sort((a, b) => b.sensors - a.sensors);
  return sorted.slice(0, limit);
}

function runScraper(brand, config) {
  return new Promise((resolve, reject) => {
    const args = [
      SCRAPER_SCRIPT,
      brand,
      `--pages=${config.pages}`,
      `--delay=${config.delay}`,
      `--timeout=${config.timeout}`,
    ];

    console.log(`\n▶️  Starting scraper for "${brand}"...`);
    const proc = spawn(process.execPath, args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        console.warn(`⚠️  Scraper for "${brand}" exited with code ${code}`);
        resolve(); // Continue with next brand
      }
    });

    proc.on("error", (err) => {
      console.warn(`⚠️  Failed to spawn scraper for "${brand}": ${err.message}`);
      resolve();
    });
  });
}

function safeBrandFilename(brand) {
  return brand.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

function readNdjson(file) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf-8").split("\n");
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return out;
}

async function main() {
  const config = parseArgs();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!existsSync(QUERIES_FILE)) {
    console.error("❌ Queries file not found:", QUERIES_FILE);
    process.exit(1);
  }

  const queries = JSON.parse(readFileSync(QUERIES_FILE, "utf-8"));
  const topBrands = getTopBrands(queries, config.brands);

  console.log("🏭 Multi-Brand Finn.no Scraper");
  console.log("==============================");
  console.log(`   Top ${topBrands.length} brands by Hella Gutmann calibration count:\n`);
  for (const b of topBrands) {
    console.log(`   • ${b.brand.padEnd(20)} — ${b.sensors} calibrations (${b.models} models)`);
  }
  console.log("");

  // Run scraper for each brand sequentially
  for (const brandInfo of topBrands) {
    await runScraper(brandInfo.brand, config);
    await sleep(2000); // Brief pause between brands
  }

  // Deduplicate across all brand outputs
  console.log("\n🔄 Deduplicating across brands...");
  const allRecords = [];
  const seenRegnr = new Set();
  const byBrand = {};

  for (const brandInfo of topBrands) {
    const brandFile = resolve(OUTPUT_DIR, `${safeBrandFilename(brandInfo.brand)}-regnr.ndjson`);
    const records = readNdjson(brandFile);
    let brandUnique = 0;

    for (const r of records) {
      if (!r.regnr) continue;
      if (seenRegnr.has(r.regnr)) continue;
      seenRegnr.add(r.regnr);
      allRecords.push(r);
      brandUnique++;
    }

    byBrand[brandInfo.brand] = {
      totalScraped: records.length,
      uniqueAcrossBrands: brandUnique,
    };
  }

  // Write combined outputs
  const combinedTxt = resolve(OUTPUT_DIR, "multi-brand-regnr-list.txt");
  const combinedNdjson = resolve(OUTPUT_DIR, "multi-brand-regnr.ndjson");
  const reportFile = resolve(OUTPUT_DIR, "multi-brand-report.json");

  writeFileSync(combinedTxt, Array.from(seenRegnr).sort().join("\n") + "\n");
  writeFileSync(
    combinedNdjson,
    allRecords.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );

  const report = {
    totalBrands: topBrands.length,
    totalUniqueRegnr: allRecords.length,
    byBrand,
    brandOrder: topBrands.map((b) => b.brand),
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log("\n✅ Multi-brand scrape complete!");
  console.log(`   Total unique regnr: ${allRecords.length}`);
  console.log(`   Combined text list: ${combinedTxt}`);
  console.log(`   Combined NDJSON:    ${combinedNdjson}`);
  console.log(`   Report:             ${reportFile}`);
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e.message);
  process.exit(1);
});
