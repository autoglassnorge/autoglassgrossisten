#!/usr/bin/env node
/**
 * TecDoc Format-Aware Parser v2
 * ===============================
 * Parses selectively-synced TecDoc CSVs and outputs structured glass data.
 *
 * Kjøring:
 *   node scripts/parse-tecdoc-v2.mjs
 *   node scripts/parse-tecdoc-v2.mjs --glass-only  # filter to glass product groups only
 */

import * as fs from "fs";
import * as path from "path";

/* ── Config ────────────────────────────────────────────────── */
const DATA_DIR = path.join(process.cwd(), "data", "tecdoc-import");
const OUTPUT_DIR = path.join(process.cwd(), "data", "tecdoc-import");

// TecDoc generic article numbers for glass (from articles_linkages column 4)
const GLASS_GEN_ART_NOS = new Set([901, 903, 904, 905, 906]);

const GLASS_ONLY = process.argv.includes("--glass-only");

/* ── Logger ────────────────────────────────────────────────── */
const G = "\x1b[32m";
const Y = "\x1b[33m";
const R = "\x1b[31m";
const RESET = "\x1b[0m";

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`  ${G}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${Y}⚠${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${RESET} ${msg}`); }

/* ── CSV helpers ───────────────────────────────────────────── */
function parseTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.map((line) => line.split("\t"));
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.map((line) => line.split(","));
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  log("\n📖 TecDoc Format-Aware Parser v2");
  log("==================================\n");

  // ── 1. Load manufacturers ─────────────────────────────────
  log("🏭 Loading manufacturers...");
  const manufacturers = new Map();
  if (fs.existsSync(path.join(DATA_DIR, "manufacturers.csv"))) {
    const rows = parseTsv(path.join(DATA_DIR, "manufacturers.csv"));
    for (const row of rows) {
      const mfaId = parseInt(row[0], 10);
      const brand = row[3] || row[1];
      if (mfaId && brand) {
        manufacturers.set(mfaId, brand.trim());
      }
    }
  }
  ok(`${manufacturers.size} manufacturers loaded`);

  // ── 2. Load models ────────────────────────────────────────
  log("🚗 Loading models...");
  const models = new Map();
  if (fs.existsSync(path.join(DATA_DIR, "models.csv"))) {
    const rows = parseTsv(path.join(DATA_DIR, "models.csv"));
    for (const row of rows) {
      const modId = parseInt(row[0], 10);
      const mfaId = parseInt(row[1], 10);
      const yearFrom = row[2] === "0000-00-00" ? null : parseInt(row[2]?.slice(0, 4), 10) || null;
      const yearTo = row[3] === "0000-00-00" ? null : parseInt(row[3]?.slice(0, 4), 10) || null;
      const modelName = row[4];
      if (modId && mfaId && modelName) {
        models.set(modId, { mfaId, modelName: modelName.trim(), yearFrom, yearTo });
      }
    }
  }
  ok(`${models.size} models loaded`);

  // ── 3. Load vehicle types (passengercars + commercial + motorbikes) ──
  log("🚙 Loading vehicle types...");
  const vehicleTypes = new Map();

  const vehicleFiles = [
    "passengercars.csv",
    "commercialvehicles.csv",
    "motorbikes.csv",
  ];

  for (const vf of vehicleFiles) {
    const fp = path.join(DATA_DIR, vf);
    if (!fs.existsSync(fp)) {
      warn(`${vf} not found, skipping`);
      continue;
    }
    const rows = parseTsv(fp);
    let skipped = 0;
    for (const row of rows) {
      // Columns: [0]=typ_id, [1]=mod_id, [2]=?, [3]=brand_name, [4]=mfa_id, [5]=start, [6]=end, ...
      const typId = parseInt(row[1], 10);
      const modId = parseInt(row[2], 10);
      const yearFrom = row[5] === "0000-00-00" ? null : parseInt(row[5]?.slice(0, 4), 10) || null;
      const yearTo = row[6] === "0000-00-00" ? null : parseInt(row[6]?.slice(0, 4), 10) || null;

      const modelInfo = models.get(modId);
      if (!modelInfo) {
        skipped++;
        continue;
      }

      const brand = manufacturers.get(modelInfo.mfaId) || row[3]?.trim() || "UNKNOWN";

      vehicleTypes.set(typId, {
        typId,
        brand,
        model: modelInfo.modelName,
        yearFrom,
        yearTo,
        modId,
        mfaId: modelInfo.mfaId,
        source: vf.replace(".csv", ""),
      });
    }
    ok(`${vf}: ${rows.length} rows, ${skipped} skipped`);
  }
  log(`   Total vehicle types: ${vehicleTypes.size}\n`);

  // ── 4. Load articles linkages ─────────────────────────────
  log("🔗 Loading articles linkages...");
  const linkagePath = path.join(DATA_DIR, "articles_linkages.csv");
  if (!fs.existsSync(linkagePath)) {
    fail("articles_linkages.csv not found. Run: node scripts/sync-tecdoc-repo.mjs");
    process.exit(1);
  }

  const linkRows = parseTsv(linkagePath);
  const linkages = [];
  let glassCount = 0;

  for (const row of linkRows) {
    // Columns observed: [0]=?, [1]=typ_id, [2]=?, [3]=GenArtNo, [4]=art_id/eurocode, [5]=?
    const typId = parseInt(row[1], 10);
    const genArtNo = parseInt(row[3], 10);
    const articleRef = row[4]?.trim();

    if (!typId || !articleRef) continue;

    const isGlass = GLASS_GEN_ART_NOS.has(genArtNo);
    if (GLASS_ONLY && !isGlass) continue;

    const vehicle = vehicleTypes.get(typId);
    if (!vehicle) continue;

    linkages.push({
      typId,
      genArtNo,
      articleRef,
      brand: vehicle.brand,
      model: vehicle.model,
      yearFrom: vehicle.yearFrom,
      yearTo: vehicle.yearTo,
      modId: vehicle.modId,
      mfaId: vehicle.mfaId,
      source: vehicle.source,
    });

    if (isGlass) glassCount++;
  }

  ok(`${linkages.length} total linkages${GLASS_ONLY ? "" : ` (${glassCount} glass-related)`}`);

  // ── 5. Aggregate by articleRef + brand + model ────────────
  log("\n📊 Aggregating by article reference...");
  const byArticle = new Map();

  for (const link of linkages) {
    const key = `${link.articleRef}|${link.brand}|${link.model}`;
    if (!byArticle.has(key)) {
      byArticle.set(key, {
        articleRef: link.articleRef,
        brand: link.brand,
        model: link.model,
        genArtNos: new Set(),
        yearFrom: link.yearFrom,
        yearTo: link.yearTo,
        ktypes: new Set(),
      });
    }
    const entry = byArticle.get(key);
    entry.genArtNos.add(link.genArtNo);
    entry.ktypes.add(link.typId);
    if (link.yearFrom && (!entry.yearFrom || link.yearFrom < entry.yearFrom)) {
      entry.yearFrom = link.yearFrom;
    }
    if (link.yearTo && (!entry.yearTo || link.yearTo > entry.yearTo)) {
      entry.yearTo = link.yearTo;
    }
  }

  // ── 6. Build output ───────────────────────────────────────
  const output = [];
  for (const entry of byArticle.values()) {
    const genArts = Array.from(entry.genArtNos);
    const category = inferCategory(genArts);

    output.push({
      eurocode: entry.articleRef,
      brand: entry.brand,
      model: entry.model,
      yearFrom: entry.yearFrom,
      yearTo: entry.yearTo,
      category,
      genArtNos: genArts,
      ktypes: Array.from(entry.ktypes),
      ktypeCount: entry.ktypes.size,
    });
  }

  // Sort by collision (fewer ktypes = more specific = better)
  output.sort((a, b) => a.ktypeCount - b.ktypeCount);

  // ── 7. Save ───────────────────────────────────────────────
  const outputPath = path.join(OUTPUT_DIR, "tecdoc-parsed-v2.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  log(`\n💾 Saved ${output.length} unique article mappings to ${outputPath}`);

  // Summary
  const byCategory = {};
  const byBrand = {};
  for (const o of output) {
    byCategory[o.category] = (byCategory[o.category] || 0) + 1;
    byBrand[o.brand] = (byBrand[o.brand] || 0) + 1;
  }

  log(`\n📊 Category breakdown:`);
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    log(`   ${cat}: ${count}`);
  }

  log(`\n📊 Top 10 brands:`);
  const sortedBrands = Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [brand, count] of sortedBrands) {
    log(`   ${brand}: ${count}`);
  }

  // Collision analysis
  const uniqueKtypes = output.filter((o) => o.ktypeCount === 1).length;
  const lowCollision = output.filter((o) => o.ktypeCount <= 5).length;
  log(`\n📊 Collision analysis:`);
  log(`   Unique kType (1): ${uniqueKtypes} (${((uniqueKtypes / output.length) * 100).toFixed(1)}%)`);
  log(`   Low collision (≤5): ${lowCollision} (${((lowCollision / output.length) * 100).toFixed(1)}%)`);

  log(`\n${G}✅ Parsing complete.${RESET}\n`);
}

function inferCategory(genArtNos) {
  if (genArtNos.includes(903)) return "frontrute";
  if (genArtNos.includes(904)) return "bakrute";
  if (genArtNos.includes(905)) return "dørglass";
  if (genArtNos.includes(906)) return "sideglass";
  if (genArtNos.includes(901)) return "frontrute"; // 901 is also windscreen-related
  return "annet";
}

main().catch((e) => {
  console.error(`\n${R}❌ Parse failed:${RESET}`, e.message);
  process.exit(1);
});
