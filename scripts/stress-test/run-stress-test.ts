/**
 * Stress-test: match-scorer mot alle 147 oppdagede norske regnr.
 *
 * Bruker bovsoft-discovered-regnr.json som ground truth (kType + bil-data
 * allerede oppgitt, ingen Biluppgifter-kall nødvendig).
 *
 * Kjøring:
 *   npx ts-node scripts/stress-test/run-stress-test.ts
 *
 * Output:
 *   logs/stress-test-{timestamp}.json
 */

import * as fs from "fs";
import * as path from "path";
import { matchGlass, lookupPrefix4, normalizeBrand, type CatalogRecord, type VehicleSpec } from "../../api/scoring/match-scorer";

// ============================================================================
// LASTING
// ============================================================================

const ROOT = path.resolve(__dirname, "../..");
const REGNR_PATH = path.join(ROOT, "data/bovsoft-discovered-regnr.json");
const CATALOG_PATH = process.env.CATALOG_PATH || path.join(ROOT, "data/catalog-prod.json");
const PREFIX4_PATH = path.join(ROOT, "data/ktype-prefix4-cache.json");
const EQUIP_SIG_PATH = path.join(ROOT, "data/equipment-signatures.json");

interface RegnrEntry {
  regnr: string;
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  body: string;
  engine: string;
  fuel: string;
  vin: string;
}

interface RegnrDb {
  meta: any;
  results: RegnrEntry[];
}

interface EquipSignatures {
  brandModelYear: Record<string, {
    count: number;
    adas?: number;
    rainSensor?: number;
    heated?: number;
    acoustic?: number;
    antenna?: number;
    hud?: number;
    shade?: number;
    camera?: number;
    laneAssist?: number;
  }>;
}

console.log("Laster data...");
const regnrDb: RegnrDb = JSON.parse(fs.readFileSync(REGNR_PATH, "utf-8"));
const catalog: { records: CatalogRecord[] } = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
const prefix4Cache = JSON.parse(fs.readFileSync(PREFIX4_PATH, "utf-8"));
const equipSig: EquipSignatures = JSON.parse(fs.readFileSync(EQUIP_SIG_PATH, "utf-8"));

console.log(`✓ ${regnrDb.results.length} regnr`);
console.log(`✓ ${catalog.records.length} catalog records`);
console.log(`✓ ${Object.keys(prefix4Cache.entries ?? {}).length} prefix4-entries`);
console.log(`✓ ${Object.keys(equipSig.brandModelYear ?? {}).length} equipment signatures`);

// ============================================================================
// UTSTYRSDEDUKSJON FRA STATISTISK SIGNATUR
// ============================================================================

function deduceFlagsFromSignature(brand: string, model: string, year: number): {
  knownFlags: Record<string, boolean>;
  source: string;
} {
  const b = normalizeBrand(brand);
  // Tilbakemap til signature-formatets brand (VW i sig, VOLKSWAGEN i normalisert)
  const sigBrand = b === "VOLKSWAGEN" ? "VW" : b;
  const m = model.toUpperCase();
  const coreModel = m.split(/[\s(]/)[0]; // "X1 (E84)" → "X1"

  // Prøv flere nøkkelvarianter
  const candidateKeys = [
    `${sigBrand}:${m}:${year}`,
    `${sigBrand}:${m}`,
    `${sigBrand}:${coreModel}:${year}`,
    `${sigBrand}:${coreModel}`,
  ];

  // Fuzzy: finn signature-nøkler som starter med brand: og inneholder kjernemodellnavn
  const sigKeys = Object.keys(equipSig.brandModelYear ?? {});
  for (const key of candidateKeys) {
    if (equipSig.brandModelYear[key]) {
      return formatSignature(equipSig.brandModelYear[key], `exact:${key}`);
    }
  }
  // Fuzzy match: brand + core model + nearest year
  const candidates = sigKeys.filter(k => {
    const parts = k.split(":");
    return parts[0] === sigBrand && parts[1] && parts[1].split(/[\s(]/)[0] === coreModel;
  });
  if (candidates.length > 0) {
    // Velg år-nærmest
    const withYearDiff = candidates.map(k => {
      const parts = k.split(":");
      const ky = parseInt(parts[2] || "0");
      return { k, diff: Math.abs(ky - year) };
    }).sort((a, b) => a.diff - b.diff);
    return formatSignature(equipSig.brandModelYear[withYearDiff[0].k], `fuzzy:${withYearDiff[0].k}`);
  }
  return { knownFlags: {}, source: "none" };
}

function formatSignature(sig: any, source: string): { knownFlags: Record<string, boolean>; source: string } {
  const knownFlags: Record<string, boolean> = {};
  for (const [flag, prob] of Object.entries(sig)) {
    if (flag === "count" || typeof prob !== "number") continue;
    if (prob >= 0.8) knownFlags[flag] = true;
    else if (prob <= 0.1) knownFlags[flag] = false;
  }
  return { knownFlags, source };
}

// ============================================================================
// HOVEDLØKKE
// ============================================================================

interface TestResult {
  regnr: string;
  vin: string;
  brand: string;
  model: string;
  ktype: number;
  prefix4Found: string | undefined;
  signatureSource: string;
  knownFlagCount: number;
  totalCandidates: number;
  scoredCandidates: number;
  exact_match: boolean;
  topScore: number;
  topEurocode: string | null;
  margin: number | undefined;
  needs_user_input: string[];
}

const results: TestResult[] = [];

const start = Date.now();
for (const r of regnrDb.results) {
  const year = r.yearFrom;
  const coreModel = r.model.split(/[\s(]/)[0];
  const prefix4 = lookupPrefix4(prefix4Cache, normalizeBrand(r.brand), coreModel, year)
              ?? lookupPrefix4(prefix4Cache, r.brand, coreModel, year);
  const { knownFlags, source } = deduceFlagsFromSignature(r.brand, r.model, year);

  const vehicle: VehicleSpec = {
    vin: r.vin,
    regnr: r.regnr,
    kType: r.ktype,
    brand: r.brand,
    model: r.model,
    year,
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    bodyType: r.body,
  };

  const match = matchGlass({
    vehicle,
    knownFlags: knownFlags as any,
    prefix4Hint: prefix4,
    candidates: catalog.records,
    category: "frontrute",
  });

  results.push({
    regnr: r.regnr,
    vin: r.vin,
    brand: r.brand,
    model: r.model,
    ktype: r.ktype,
    prefix4Found: prefix4,
    signatureSource: source,
    knownFlagCount: Object.keys(knownFlags).length,
    totalCandidates: match.total_candidates,
    scoredCandidates: match.alternatives.length,
    exact_match: match.exact_match,
    topScore: match.best_candidate?.score ?? 0,
    topEurocode: match.best_candidate?.record.eurocode ?? null,
    margin: match.diagnostics.margin,
    needs_user_input: match.needs_user_input,
  });
}
const elapsed = Date.now() - start;

// ============================================================================
// RAPPORT
// ============================================================================

const totalTests = results.length;
const exactMatches = results.filter(r => r.exact_match).length;
const noMatches = results.filter(r => r.totalCandidates === 0).length;
const withCandidates = results.filter(r => r.totalCandidates > 0).length;
const exactRate = exactMatches / totalTests;
const exactRateOfWithCandidates = withCandidates > 0 ? exactMatches / withCandidates : 0;

const byBrand: Record<string, { total: number; exact: number; noCandidates: number }> = {};
for (const r of results) {
  byBrand[r.brand] = byBrand[r.brand] ?? { total: 0, exact: 0, noCandidates: 0 };
  byBrand[r.brand].total++;
  if (r.exact_match) byBrand[r.brand].exact++;
  if (r.totalCandidates === 0) byBrand[r.brand].noCandidates++;
}

const report = {
  meta: {
    runAt: new Date().toISOString(),
    elapsedMs: elapsed,
    totalRegnr: totalTests,
    catalogRecords: catalog.records.length,
  },
  summary: {
    totalTests,
    exactMatches,
    exactRate: Math.round(exactRate * 1000) / 10,
    exactRateOfWithCandidates: Math.round(exactRateOfWithCandidates * 1000) / 10,
    noMatches,
    withCandidates,
    avgCandidates: Math.round(
      results.reduce((a, r) => a + r.totalCandidates, 0) / totalTests * 10
    ) / 10,
    avgKnownFlags: Math.round(
      results.reduce((a, r) => a + r.knownFlagCount, 0) / totalTests * 10
    ) / 10,
  },
  byBrand,
  topMisses: results
    .filter(r => !r.exact_match && r.totalCandidates > 0)
    .sort((a, b) => b.totalCandidates - a.totalCandidates)
    .slice(0, 20),
  noCandidatesSample: results.filter(r => r.totalCandidates === 0).slice(0, 20),
  allResults: results,
};

// Skriv detaljert rapport
const outDir = path.join(ROOT, "logs");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.join(outDir, `stress-test-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

// Print sammendrag til konsoll
console.log("\n" + "=".repeat(70));
console.log("STRESS-TEST RAPPORT");
console.log("=".repeat(70));
console.log(`Tid: ${elapsed}ms (${Math.round(elapsed / totalTests)}ms/regnr)`);
console.log(`Total regnr testet:           ${totalTests}`);
console.log(`Med kandidater i katalog:     ${withCandidates} (${Math.round(withCandidates/totalTests*100)}%)`);
console.log(`Uten kandidater:              ${noMatches} (${Math.round(noMatches/totalTests*100)}%)`);
console.log(`Exact match:                  ${exactMatches} (${Math.round(exactRate*100)}%)`);
console.log(`Exact match av med-kandidat:  ${Math.round(exactRateOfWithCandidates*100)}%`);
console.log(`Snitt kandidater per bil:     ${report.summary.avgCandidates}`);
console.log(`Snitt kjente flagg per bil:   ${report.summary.avgKnownFlags}`);
console.log("\nPer merke:");
for (const [brand, stats] of Object.entries(byBrand).sort((a, b) => b[1].total - a[1].total).slice(0, 10)) {
  const rate = stats.total > 0 ? Math.round(stats.exact / stats.total * 100) : 0;
  console.log(`  ${brand.padEnd(20)} ${stats.exact}/${stats.total} eksakt (${rate}%) — ${stats.noCandidates} uten kandidater`);
}
console.log(`\nDetaljert rapport: ${outPath}`);
