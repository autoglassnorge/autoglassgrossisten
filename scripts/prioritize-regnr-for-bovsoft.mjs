#!/usr/bin/env node
/**
 * prioritize-regnr-for-bovsoft.mjs
 * ==================================
 * Scorer og rangerer validerte regnr for Bovsoft batch-oppslag.
 *
 * Input:
 *   data/regnr-validated.json
 *
 * Output:
 *   data/regnr-top-333.txt          — topp 333 regnr (ett per linje)
 *   data/regnr-top-1000-ranked.json — rangert liste med score + begrunnelse
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Konfigurasjon ──────────────────────────────────────────────────────────
const INPUT_JSON = path.join(ROOT, "data", "regnr-validated.json");
const OUTPUT_TXT = path.join(ROOT, "data", "regnr-top-333.txt");
const OUTPUT_JSON = path.join(ROOT, "data", "regnr-top-1000-ranked.json");

const GAP_TOP8 = new Set([
  "TOYOTA", "VW", "VOLKSWAGEN", "FORD", "MERCEDES", "MERCEDES-BENZ",
  "BMW", "HYUNDAI", "AUDI", "KIA",
]);

const GAP_TOP20 = new Set([
  "TOYOTA", "VW", "VOLKSWAGEN", "FORD", "MERCEDES", "MERCEDES-BENZ",
  "BMW", "HYUNDAI", "AUDI", "KIA", "RENAULT", "MAZDA", "NISSAN",
  "PEUGEOT", "HONDA", "VOLVO", "LEXUS", "CITROEN", "CITROËN",
  "SKODA", "VAUXHALL", "PORSCHE", "FIAT",
]);

// ── Scoring ────────────────────────────────────────────────────────────────
function scoreEntry(entry) {
  let score = 0;
  const reasons = [];
  const brand = (entry.brand || "").toUpperCase();

  // Brand
  if (GAP_TOP8.has(brand)) {
    score += 40;
    reasons.push("top8_brand(+40)");
  } else if (GAP_TOP20.has(brand)) {
    score += 20;
    reasons.push("top20_brand(+20)");
  } else {
    reasons.push("other_brand(0)");
  }

  // Vehicle type fra seats/gvwr
  if (entry.seats >= 4 && entry.seats <= 7 && entry.gvwr <= 3500) {
    score += 10;
    reasons.push("passenger_car(+10)");
  } else if (entry.gvwr > 3500 || entry.seats <= 3) {
    score += 5;
    reasons.push("heavy_or_small(+5)");
  } else {
    score -= 20;
    reasons.push("unusual_vehicle(-20)");
  }

  // Year
  if (entry.year >= 2005 && entry.year <= 2022) {
    score += 10;
    reasons.push("modern_year(+10)");
  } else if (entry.year < 1990 || entry.year > 2024) {
    score -= 5;
    reasons.push("very_old_or_future(-5)");
  } else {
    reasons.push("older_year(0)");
  }

  return { score, reason: `${reasons.join(" + ")} = ${score}` };
}

// ── Hovedflyt ──────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Prioriter RegNr for Bovsoft batch-oppslag");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (!fs.existsSync(INPUT_JSON)) {
    console.error(`❌ Fant ikke ${INPUT_JSON}`);
    console.error("   Kjør først: node scripts/validate-regnr-svv.mjs");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_JSON, "utf-8"));
  const validEntries = (data.entries || []).filter((e) => e.valid);

  console.log(`📦 Validerte entries: ${data.entries?.length || 0}`);
  console.log(`✅ Gyldige entries:   ${validEntries.length}`);

  if (validEntries.length === 0) {
    console.error("❌ Ingen gyldige regnr å prioritere.");
    process.exit(1);
  }

  // Score alle
  const scored = validEntries.map((entry) => {
    const { score, reason } = scoreEntry(entry);
    return {
      regnr: entry.regnr,
      brand: entry.brand,
      model: entry.model,
      year: entry.year,
      seats: entry.seats,
      gvwr: entry.gvwr,
      fuel: entry.fuel,
      score,
      reason,
    };
  });

  // Sorter synkende etter score
  scored.sort((a, b) => b.score - a.score);

  // Ranger
  const ranked = scored.map((s, idx) => ({
    rank: idx + 1,
    ...s,
  }));

  // Topp 333
  const top333 = ranked.slice(0, 333);

  // Tell unike top20-merker i topp 333
  const top20BrandsInTop333 = new Set(
    top333
      .map((e) => e.brand?.toUpperCase())
      .filter((b) => GAP_TOP20.has(b))
  ).size;

  console.log(`\n🏆 Topp 333: ${top333.length} regnr`);
  console.log(`📊 Top20-merker dekket: ${top20BrandsInTop333}/22`);

  // Skriv TXT
  const top333Regnrs = top333.map((e) => e.regnr);
  fs.writeFileSync(
    OUTPUT_TXT,
    top333Regnrs.join("\n") + (top333Regnrs.length > 0 ? "\n" : ""),
    "utf-8"
  );
  console.log(`📝 ${OUTPUT_TXT}: ${top333.length} regnr`);

  // Skriv JSON
  const output = {
    generatedAt: new Date().toISOString(),
    totalValid: validEntries.length,
    top333Count: top333.length,
    top20BrandsCovered: top20BrandsInTop333,
    entries: ranked.slice(0, 1000),
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), "utf-8");
  console.log(`📝 ${OUTPUT_JSON}: ${output.entries.length} entries`);

  // Score-distribusjon
  const distribution = {};
  for (const e of scored) {
    distribution[e.score] = (distribution[e.score] || 0) + 1;
  }

  console.log("\n📈 Score-distribusjon:");
  for (const [score, count] of Object.entries(distribution).sort((a, b) => parseInt(b[0]) - parseInt(a[0]))) {
    console.log(`   Score ${score}: ${count} regnr`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Ferdig!");
  console.log("═══════════════════════════════════════════════════════════════");
}

// ── Kjør ──────────────────────────────────────────────────────────────────
main().catch((e) => {
  console.error("💥 Fatal feil:", e);
  process.exit(1);
});
