#!/usr/bin/env node
/**
 * Katalog-kvalitets-gate
 * ======================
 * Validerer catalog-prod.json før KV-upload.
 * Returnerer exit 0 ved PASS, exit 1 ved BLOCK.
 *
 * Kjøring:
 *   node scripts/validate-catalog.mjs [path/to/catalog.json]
 *   node scripts/validate-catalog.mjs --threshold 0.15  # 15% avvik-grense
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : path.join(process.cwd(), "data", "catalog-prod.json");

const THRESHOLD_ARG = process.argv.find((a) => a.startsWith("--threshold="));
const DEVIATION_THRESHOLD = THRESHOLD_ARG
  ? parseFloat(THRESHOLD_ARG.split("=")[1])
  : 0.20; // 20% default

const MIN_RECORDS = 30000;
const MIN_PREFIX4_COVERAGE = 0.90;
const MAX_DUPLICATE_RATIO = 0.01;

/* ── Farger ────────────────────────────────────────────────── */

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const RESET = "\x1b[0m";

function ok(msg) { console.log(`  ${G}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${Y}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`  ${C}ℹ${RESET} ${msg}`); }

/* ── Hovedlogikk ───────────────────────────────────────────── */

function validate() {
  console.log(`\n🔍 Katalog-kvalitets-gate`);
  console.log(`   Fil: ${CATALOG_PATH}${RESET}`);
  console.log(`   Avvik-grense: ${(DEVIATION_THRESHOLD * 100).toFixed(0)}%\n`);

  // 1. Fil eksisterer
  if (!fs.existsSync(CATALOG_PATH)) {
    fail("Katalog-fil finnes ikke");
    return { pass: false, blocks: 1, warnings: 0 };
  }
  ok("Katalog-fil finnes");

  // 2. Parse JSON
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  } catch (e) {
    fail(`Ugyldig JSON: ${e.message}`);
    return { pass: false, blocks: 1, warnings: 0 };
  }
  ok("Gyldig JSON");

  const records = catalog.records || [];
  const meta = catalog.meta || {};

  let blocks = 0;
  let warnings = 0;

  // 3. Total poster
  console.log("\n📊 Poster:");
  info(`Totalt: ${records.length.toLocaleString("nb-NO")}`);
  if (records.length < MIN_RECORDS) {
    fail(`For få poster: ${records.length} < ${MIN_RECORDS}`);
    blocks++;
  } else {
    ok(`≥ ${MIN_RECORDS.toLocaleString("nb-NO")}`);
  }

  // 4. Avvik fra forrige
  console.log("\n📈 Avvik fra forrige versjon:");
  const previousPath = path.join(process.cwd(), "data", ".catalog-prev-size.json");
  let prevSize = null;
  if (fs.existsSync(previousPath)) {
    try {
      prevSize = JSON.parse(fs.readFileSync(previousPath, "utf-8")).size;
    } catch { /* ignore */ }
  }

  if (prevSize !== null) {
    const diff = records.length - prevSize;
    const pct = prevSize > 0 ? Math.abs(diff) / prevSize : 0;
    info(`Forrige: ${prevSize.toLocaleString("nb-NO")}, Nå: ${records.length.toLocaleString("nb-NO")}, Avvik: ${(pct * 100).toFixed(1)}%`);
    if (pct > DEVIATION_THRESHOLD) {
      fail(`Avvik > ${(DEVIATION_THRESHOLD * 100).toFixed(0)}% — krever manuell review`);
      blocks++;
    } else {
      ok(`Avvik innenfor grense`);
    }
  } else {
    warn("Ingen forrige størrelse registrert — lagrer nåværende");
    fs.writeFileSync(previousPath, JSON.stringify({ size: records.length, date: new Date().toISOString() }));
  }

  // 5. Eurocode-dekning
  console.log("\n🏷️  Eurocode:");
  const eurocodeRegex = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/;
  const missingEurocode = records.filter((r) => !r.eurocode || !eurocodeRegex.test(r.eurocode));
  if (missingEurocode.length > 0) {
    fail(`Manglende/ugyldig eurocode: ${missingEurocode.length} poster`);
    blocks++;
  } else {
    ok("100% dekning");
  }

  // 6. Brand-dekning
  console.log("\n🏭 Brand:");
  const missingBrand = records.filter((r) => !r.brand || r.brand.trim() === "");
  if (missingBrand.length > 0) {
    fail(`Manglende brand: ${missingBrand.length} poster`);
    blocks++;
  } else {
    ok("100% dekning");
  }

  // 7. Prefix4-dekning
  console.log("\n🔢 Prefix4:");
  const validPrefix4 = records.filter((r) => /^\d{4}$/.test(r.prefix4));
  const prefix4Coverage = validPrefix4.length / records.length;
  info(`Dekning: ${(prefix4Coverage * 100).toFixed(1)}%`);
  if (prefix4Coverage < MIN_PREFIX4_COVERAGE) {
    fail(`Prefix4-dekning < ${(MIN_PREFIX4_COVERAGE * 100).toFixed(0)}%`);
    blocks++;
  } else {
    ok(`≥ ${(MIN_PREFIX4_COVERAGE * 100).toFixed(0)}%`);
  }

  // 8. Duplikater
  console.log("\n🔁 Duplikater:");
  const seen = new Set();
  const duplicates = [];
  for (const r of records) {
    const key = r.eurocode?.toUpperCase().trim();
    if (key && seen.has(key)) duplicates.push(key);
    else seen.add(key);
  }
  const dupRatio = duplicates.length / records.length;
  info(`${duplicates.length} duplikater (${(dupRatio * 100).toFixed(2)}%)`);
  if (dupRatio > MAX_DUPLICATE_RATIO) {
    fail(`Duplikat-ratio > ${(MAX_DUPLICATE_RATIO * 100).toFixed(1)}%`);
    blocks++;
  } else if (duplicates.length > 0) {
    warn(`${duplicates.length} duplikater funnet — akseptabelt`);
    warnings++;
  } else {
    ok("Ingen duplikater");
  }

  // 9. Kilder
  console.log("\n📦 Kilder:");
  const sourceCounts = {};
  for (const r of records) {
    const src = r.source || "unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
  for (const [src, count] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    info(`${src}: ${count.toLocaleString("nb-NO")}`);
  }

  // 10. Kategorier
  console.log("\n📂 Kategorier:");
  const catCounts = {};
  for (const r of records) {
    catCounts[r.category || "unknown"] = (catCounts[r.category || "unknown"] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    info(`${cat}: ${count.toLocaleString("nb-NO")}`);
  }

  // 11. Nye kilder (Euroglass.ru / Autoglass.ru)
  console.log("\n🌐 Nye kilder (validering):");
  const newSources = ["euroglass-ru", "autoglass-ru"];
  for (const src of newSources) {
    const srcRecords = records.filter((r) => r.source?.includes(src));
    if (srcRecords.length > 0) {
      info(`${src}: ${srcRecords.length} poster`);
      // Sjekk sample på 100
      const sample = srcRecords.slice(0, 100);
      const badEurocodes = sample.filter((r) => !eurocodeRegex.test(r.eurocode));
      if (badEurocodes.length > 5) {
        warn(`${src}: ${badEurocodes.length}/100 ugyldige eurokoder i sample`);
        warnings++;
      }
    }
  }

  // Oppsummering
  console.log("\n" + "═".repeat(50));
  if (blocks > 0) {
    console.log(`${R}❌ BLOCK: ${blocks} gate(s) feilet${RESET}`);
    console.log(`${Y}⚠️  Warnings: ${warnings}${RESET}`);
    console.log(`${R}→ Katalog skal IKKE lastes opp til KV${RESET}\n`);
    return { pass: false, blocks, warnings };
  } else if (warnings > 0) {
    console.log(`${Y}⚠️  PASS med ${warnings} warning(s)${RESET}`);
    console.log(`${G}→ Katalog kan lastes opp til KV${RESET}\n`);
    return { pass: true, blocks, warnings };
  } else {
    console.log(`${G}✅ PASS: Alle gates OK${RESET}`);
    console.log(`${G}→ Katalog kan lastes opp til KV${RESET}\n`);
    return { pass: true, blocks, warnings };
  }
}

const result = validate();
process.exit(result.pass ? 0 : 1);
