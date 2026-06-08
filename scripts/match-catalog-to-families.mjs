#!/usr/bin/env node
/**
 * match-catalog-to-families.mjs
 * ==============================
 * Matcher glass_catalog-produkter (uten kType) mot ktype_families.
 * Bruker token-basert Jaccard-similarity + års-overlapp for scoring.
 *
 * Output:
 *   /tmp/match-high.sql      — HIGH confidence: auto-UPDATE + ktype_matches
 *   /tmp/match-medium.sql    — MEDIUM confidence: pending review
 *   /tmp/match-review.jsonl  — Review-rapport for manuell sjekk
 *   /tmp/match-stats.json    — Samlet statistikk
 *
 * Usage: node scripts/match-catalog-to-families.mjs
 */

import { execSync } from "child_process";
import * as fs from "fs";

// ── Brand normalization (duplicated from brand.ts) ───────────
const BRAND_MAP = {
  VOLKSWAGEN: "VW", "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER", CITROËN: "CITROEN", DS: "CITROEN",
  ALFA: "ALFA ROMEO", ABARTH: "FIAT", "LAMBORGH.": "LAMBORGHINI",
  "MITS.": "MITSUBISHI", MITS: "MITSUBISHI", NISS: "NISSAN", NISSA: "NISSAN",
  HON: "HONDA", TOY: "TOYOTA", TOYOT: "TOYOTA", REN: "RENAULT",
  "REN.": "RENAULT", RENAU: "RENAULT", HYUNADI: "HYUNDAI", "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT", PEUGE: "PEUGEOT", CHEV: "CHEVROLET", CHEVR: "CHEVROLET",
  "CHEVR.": "CHEVROLET", CHEVROLET: "CHEVROLET", DAEWOO: "DAEWOO (CHEVROLET)",
  SUZ: "SUZUKI", FOR: "FORD", "FORD,": "FORD", FORDA: "FORD",
  "KIA.": "KIA", "SUB.": "SUBARU", "MAZ.": "MAZDA", "MAZDA.": "MAZDA",
  "LEX.": "LEXUS", JAG: "JAGUAR", POR: "PORSCHE", PORSCH: "PORSCHE",
  "AUDI.": "AUDI", "BMW.": "BMW", "MERC.": "MERCEDES", MERC: "MERCEDES",
  MERCE: "MERCEDES", "VOLVO.": "VOLVO", "SEAT.": "SEAT", "SKODA.": "SKODA",
  "MINI.": "MINI", "SAAB.": "SAAB", "DODGE.": "DODGE", CHRY: "CHRYSLER",
  CHRSYLER: "CHRYSLER", HUM: "HUMMER", PONT: "PONTIAC", "JEEP.": "JEEP",
  CAD: "CADILLAC", "LINCOLN.": "LINCOLN", "BUICK.": "BUICK", "GMC,": "GMC",
  GMC: "GMC", "HOLDEN.": "HOLDEN", HOLDE: "HOLDEN", "ISUZU.": "ISUZU",
  "DAIHATSU.": "DAIHATSU", LADA: "LADA / TOGLIATTI", ZASTAVA: "LADA / TOGLIATTI",
  "DACIA.": "DACIA", SSANYONG: "SSANGYONG", "SSAN.": "SSANGYONG",
  "SMART.": "SMART", "TESLA.": "TESLA", "FERRARI.": "FERRARI",
  "MASERATI.": "MASERATI", "LAMBORGHINI.": "LAMBORGHINI", "BENTLEY.": "BENTLEY",
  ASTON: "ASTON MARTIN", "LOTUS.": "LOTUS", "MG.": "MG", "ROVER.": "ROVER",
  "MC LAREN": "McLAREN", MCLAREN: "McLAREN", "INEOS.": "INEOS",
  "MAXUS.": "MAXUS", "POLESTAR.": "POLESTAR", "CUPRA.": "CUPRA",
  "HONGQI.": "HONGQI", "VOYAH.": "VOYAH", "XPENG.": "XPENG",
  "ZEEKR.": "ZEEKR", "BYD.": "BYD", "ORA.": "ORA", "NIO.": "NIO",
  "THINK.": "THINK", "FISKER.": "FISKER", RIVIAN: "USA CARS", LUCID: "USA CARS",
  "TVR.": "TVR", TVR: "TVR", KEWET: "KEWET", AIXAM: "AIXAM",
  AIWAYS: "AIWAYS", "DFSK (SERES)": "DFSK (SERES)", DONGFENG: "DONGFENG",
  EXLANTIX: "EXLANTIX", "JAC (CH)": "JAC (CH)", "LYNK & CO": "LYNK & CO",
  MAN: "MAN", SCANIA: "SCANIA TRUCKS", DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS", HINO: "HINO TRUCKS", "ISUZU TRUCKS": "ISUZU",
};

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

// ── Tokenization ─────────────────────────────────────────────
function tokenize(text) {
  return (text || "").toUpperCase()
    .replace(/[^A-Z0-9\s\-\/\+]/g, "")
    .split(/[\s\-\/\+]+/)
    .filter((t) => t.length >= 2);
}

function jaccard(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection = new Set([...aSet].filter((x) => bSet.has(x)));
  const union = new Set([...aSet, ...bSet]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function yearOverlap(yf1, yt1, yf2, yt2) {
  const a1 = yf1 ?? 1900;
  const a2 = yt1 ?? 2100;
  const b1 = yf2 ?? 1900;
  const b2 = yt2 ?? 2100;
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1) + 1);
  return overlap;
}

// ── D1 fetch helper ───────────────────────────────────────────
function d1Query(sql) {
  const cmd = `cd /Users/taj/bilglass/api/cf-worker && wrangler d1 execute glass-catalog-db --local --command="${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

// ── Parse wrangler D1 output ──────────────────────────────────
function parseRows(regex, out, keys) {
  const rows = [];
  const matches = out.matchAll(regex);
  for (const m of matches) {
    const obj = {};
    for (let i = 0; i < keys.length; i++) {
      const val = m[i + 1];
      if (val === "null") obj[keys[i]] = null;
      else if (keys[i] === "id" || keys[i] === "year_from" || keys[i] === "year_to" || keys[i] === "family_id" || keys[i] === "ktype") obj[keys[i]] = parseInt(val, 10);
      else obj[keys[i]] = val;
    }
    rows.push(obj);
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────
console.error("🔍 match-catalog-to-families.mjs — fuzzy-matcher glass_catalog → families\n");

// Step 1: Fetch all families
console.error("📥 Henter families fra D1...");
const familyRegex = /"id":\s*(\d+).*?"canonical_brand":\s*"([^"]*)".*?"canonical_model":\s*"([^"]*)".*?"year_from":\s*(\d+|null).*?"year_to":\s*(\d+|null)/gs;
const familiesOut = d1Query("SELECT id, canonical_brand, canonical_model, year_from, year_to FROM ktype_families ORDER BY id");
const families = parseRows(familyRegex, familiesOut, ["id", "canonical_brand", "canonical_model", "year_from", "year_to"]);
console.error(`✅ ${families.length} families hentet`);

// Group families by brand
const familiesByBrand = new Map();
for (const f of families) {
  const list = familiesByBrand.get(f.canonical_brand);
  if (list) list.push(f);
  else familiesByBrand.set(f.canonical_brand, [f]);
}
console.error(`   ${familiesByBrand.size} unike brands`);

// Step 2: Fetch products without kType
console.error("\n📥 Henter glass_catalog-produkter uten kType...");
const productRegex = /"id":\s*(\d+).*?"brand":\s*"([^"]*)".*?"model":\s*"([^"]*)".*?"year_from":\s*(\d+|null).*?"year_to":\s*(\d+|null).*?"eurocode":\s*"([^"]*)"/gs;
let allProducts = [];
let offset = 0;
const CHUNK = 2000;

while (true) {
  const sql = `SELECT id, brand, model, year_from, year_to, eurocode FROM glass_catalog WHERE (ktype IS NULL OR ktype = '') AND model != '' AND model IS NOT NULL ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}`;
  const out = d1Query(sql);
  const chunk = parseRows(productRegex, out, ["id", "brand", "model", "year_from", "year_to", "eurocode"]);
  if (chunk.length === 0) break;
  allProducts.push(...chunk);
  offset += CHUNK;
  process.stderr.write(`  ${allProducts.length} produkter...\r`);
}
console.error(`\n✅ ${allProducts.length} produkter uten kType`);

// Step 3: Match
console.error("\n🎯 Matcher produkter mot families...");
const highMatches = [];    // { productId, familyId, score, ktypes[], eurocode }
const mediumMatches = [];  // { productId, familyId, score, reason }
const lowMatches = [];     // { productId, reason }
const stats = { processed: 0, high: 0, medium: 0, low: 0, noFamilyBrand: 0 };

for (let i = 0; i < allProducts.length; i++) {
  const p = allProducts[i];
  stats.processed++;
  process.stderr.write(`  ${i + 1}/${allProducts.length} (${stats.high}H/${stats.medium}M/${stats.low}L)\r`);

  const canonicalBrand = normalizeBrand(p.brand);
  const productTokens = tokenize(p.model);

  if (productTokens.length === 0) {
    stats.low++;
    lowMatches.push({ productId: p.id, reason: "empty_tokens_after_tokenization" });
    continue;
  }

  const brandFamilies = familiesByBrand.get(canonicalBrand);
  if (!brandFamilies || brandFamilies.length === 0) {
    stats.noFamilyBrand++;
    stats.low++;
    lowMatches.push({ productId: p.id, brand: p.brand, canonicalBrand, reason: "no_families_for_brand" });
    continue;
  }

  let bestScore = -1;
  let bestFamily = null;
  let secondBestScore = -1;

  for (const f of brandFamilies) {
    const familyTokens = tokenize(f.canonical_model);
    if (familyTokens.length === 0) continue;

    const sim = jaccard(productTokens, familyTokens);
    const overlap = yearOverlap(p.year_from, p.year_to, f.year_from, f.year_to);
    const yearBonus = overlap > 0 ? 0.2 : (p.year_from && f.year_from ? -0.1 : 0);

    // Extra bonus for exact token matches (not just Jaccard)
    const exactBonus = productTokens.some((t) => familyTokens.includes(t)) ? 0.05 : 0;

    const score = Math.min(1.0, sim + yearBonus + exactBonus);

    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestFamily = f;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!bestFamily || bestScore < 0.3) {
    stats.low++;
    lowMatches.push({ productId: p.id, brand: p.brand, model: p.model, bestScore: bestScore ?? 0, reason: "no_good_match" });
    continue;
  }

  // Confidence classification
  const scoreGap = bestScore - secondBestScore;
  const hasYearOverlap = yearOverlap(p.year_from, p.year_to, bestFamily.year_from, bestFamily.year_to) > 0;

  if (bestScore >= 0.8 && hasYearOverlap && scoreGap > 0.15) {
    stats.high++;
    highMatches.push({
      productId: p.id,
      familyId: bestFamily.id,
      score: bestScore,
      brand: p.brand,
      model: p.model,
      familyModel: bestFamily.canonical_model,
      eurocode: p.eurocode,
      yearFrom: p.year_from,
      yearTo: p.year_to,
      familyYearFrom: bestFamily.year_from,
      familyYearTo: bestFamily.year_to,
    });
  } else if (bestScore >= 0.5 && hasYearOverlap) {
    stats.medium++;
    mediumMatches.push({
      productId: p.id,
      familyId: bestFamily.id,
      score: bestScore,
      gap: scoreGap,
      brand: p.brand,
      model: p.model,
      familyModel: bestFamily.canonical_model,
      eurocode: p.eurocode,
      yearFrom: p.year_from,
      yearTo: p.year_to,
      familyYearFrom: bestFamily.year_from,
      familyYearTo: bestFamily.year_to,
    });
  } else {
    stats.low++;
    lowMatches.push({
      productId: p.id,
      brand: p.brand,
      model: p.model,
      bestScore,
      bestFamilyModel: bestFamily?.canonical_model,
      reason: bestScore < 0.5 ? "score_too_low" : "no_year_overlap",
    });
  }
}

console.error(`\n\n📊 MATCHING RESULTAT:`);
console.error(`   HIGH (auto):   ${stats.high} produkter`);
console.error(`   MEDIUM (review): ${stats.medium} produkter`);
console.error(`   LOW (skip):    ${stats.low} produkter`);
console.error(`   No brand families: ${stats.noFamilyBrand}`);

// Step 4: Generate SQL for HIGH confidence
console.error("\n📝 Genererer SQL...");

const highSql = [];
const highKtypeMatches = [];

// We need to fetch ktypes for each matched family
console.error("   Henter ktypes for matchede families...");
const matchedFamilyIds = [...new Set(highMatches.map((m) => m.familyId))];
const familyKtypes = new Map(); // familyId → [ktype, ...]

for (let i = 0; i < matchedFamilyIds.length; i += 100) {
  const batch = matchedFamilyIds.slice(i, i + 100);
  const placeholders = batch.map(() => "?").join(",");
  const sql = `SELECT family_id, ktype FROM ktype_family_members WHERE family_id IN (${placeholders})`;
  const cmd = `cd /Users/taj/bilglass/api/cf-worker && wrangler d1 execute glass-catalog-db --remote --command="${sql}" --json`;
  // Use a simpler approach: direct query
  const out = d1Query(sql.replace(/\?/g, (() => {
    let idx = 0;
    return () => batch[idx++];
  })()));

  const ktRegex = /"family_id":\s*(\d+).*?"ktype":\s*(\d+)/gs;
  const matches = out.matchAll(ktRegex);
  for (const m of matches) {
    const fid = parseInt(m[1], 10);
    const kt = parseInt(m[2], 10);
    const list = familyKtypes.get(fid);
    if (list) list.push(kt);
    else familyKtypes.set(fid, [kt]);
  }
  process.stderr.write(`  ${Math.min(i + 100, matchedFamilyIds.length)}/${matchedFamilyIds.length} families...\r`);
}
console.error(`\n   ✅ ${familyKtypes.size} families med ktypes hentet`);

// Build SQL
for (const m of highMatches) {
  // Pick the first (best) ktype for glass_catalog.ktype
  const ktypes = familyKtypes.get(m.familyId);
  if (!ktypes || ktypes.length === 0) continue;
  const bestKtype = ktypes[0];

  highSql.push(`UPDATE glass_catalog SET ktype = ${bestKtype} WHERE id = ${m.productId} AND (ktype IS NULL OR ktype = '');`);

  // Insert ALL ktypes into ktype_matches
  for (const kt of ktypes) {
    highKtypeMatches.push(`INSERT OR IGNORE INTO ktype_matches (ktype, eurocode, hit_count) VALUES (${kt}, '${(m.eurocode || "").replace(/'/g, "''")}', 1);`);
  }
}

// Write SQL files
fs.writeFileSync("/tmp/match-high.sql", highSql.join("\n") + "\n" + highKtypeMatches.join("\n"));
console.error(`   📝 /tmp/match-high.sql: ${highSql.length} UPDATEs + ${highKtypeMatches.length} ktype_matches`);

// Write review file for MEDIUM
const reviewLines = mediumMatches.map((m) => JSON.stringify({
  product_id: m.productId,
  family_id: m.familyId,
  score: m.score,
  score_gap: m.gap,
  brand: m.brand,
  model: m.model,
  family_model: m.familyModel,
  eurocode: m.eurocode,
  product_year: [m.yearFrom, m.yearTo],
  family_year: [m.familyYearFrom, m.familyYearTo],
}));
fs.writeFileSync("/tmp/match-review.jsonl", reviewLines.join("\n") + "\n");
console.error(`   📝 /tmp/match-review.jsonl: ${mediumMatches.length} MEDIUM matches for review`);

// Write stats
fs.writeFileSync("/tmp/match-stats.json", JSON.stringify({
  total_products: allProducts.length,
  high_confidence: stats.high,
  medium_confidence: stats.medium,
  low_confidence: stats.low,
  no_brand_families: stats.noFamilyBrand,
  high_pct: ((stats.high / allProducts.length) * 100).toFixed(1),
  medium_pct: ((stats.medium / allProducts.length) * 100).toFixed(1),
  matched_families: matchedFamilyIds.length,
  total_ktype_matches: highKtypeMatches.length,
}, null, 2));
console.error(`   📝 /tmp/match-stats.json`);

console.error(`\n🎉 FERDIG!`);
console.error(`   HIGH-confidence: ${stats.high} produkter klar for deploy`);
console.error(`   MEDIUM-confidence: ${stats.medium} produkter trenger review`);
console.error(`   Deploy med: cd api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file=/tmp/match-high.sql`);
