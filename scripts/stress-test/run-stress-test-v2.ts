/**
 * Stress-test v2: Måler konvergens, ikke bare exact_match.
 * Konvergens = "innenfor topp N kandidater alle med samme kType og høyt score"
 */

import * as fs from "fs";
import * as path from "path";
import { matchGlass, lookupPrefix4, normalizeBrand, type CatalogRecord, type VehicleSpec } from "../../api/scoring/match-scorer";

const ROOT = path.resolve(__dirname, "../..");
const REGNR_PATH = path.join(ROOT, "data/bovsoft-discovered-regnr.json");
const CATALOG_PATH = process.env.CATALOG_PATH || path.join(ROOT, "data/catalog-prod-ktype-enriched-v2.json");
const PREFIX4_PATH = path.join(ROOT, "data/ktype-prefix4-cache.json");

interface RegnrEntry {
  regnr: string; ktype: number; brand: string; model: string;
  yearFrom: number; yearTo: number; body: string; engine: string;
  fuel: string; vin: string;
}

console.log("Laster data...");
const regnrDb: { results: RegnrEntry[] } = JSON.parse(fs.readFileSync(REGNR_PATH, "utf-8"));
const catalog: { records: CatalogRecord[] } = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
const prefix4Cache = JSON.parse(fs.readFileSync(PREFIX4_PATH, "utf-8"));
console.log(`✓ ${regnrDb.results.length} regnr`);
console.log(`✓ ${catalog.records.length} catalog records`);
const withKType = catalog.records.filter(r => r.kTypes && r.kTypes.length > 0).length;
console.log(`✓ ${withKType} records med kType (${(withKType/catalog.records.length*100).toFixed(1)}%)`);

interface TestResult {
  regnr: string; ktype: number; brand: string; model: string; year: number;
  totalCandidates: number;
  scoredCandidates: number;
  exact_match: boolean;
  // Nye metrikker
  topScore: number;
  topHasKType: boolean;             // top1 har kType=vehicle.kType
  candidatesWithKType: number;       // antall kandidater hvor record.kTypes inkluderer vehicle.kType
  topClusterSize: number;             // antall kandidater innen 5p av topp-score
  topClusterAllKType: boolean;        // alle i topp-cluster har riktig kType
  topEurocode: string | null;
}

const start = Date.now();
const results: TestResult[] = [];

for (const r of regnrDb.results) {
  const year = r.yearFrom;
  const coreModel = r.model.split(/[\s(]/)[0];
  const prefix4 = lookupPrefix4(prefix4Cache, normalizeBrand(r.brand), coreModel, year);

  const vehicle: VehicleSpec = {
    vin: r.vin, regnr: r.regnr, kType: r.ktype,
    brand: r.brand, model: r.model, year, yearFrom: r.yearFrom, yearTo: r.yearTo,
  };

  const match = matchGlass({
    vehicle, knownFlags: {}, prefix4Hint: prefix4,
    candidates: catalog.records, category: "frontrute",
  });

  // Nye metrikker
  const candidatesWithKType = match.alternatives.filter(c =>
    c.record.kTypes && c.record.kTypes.includes(r.ktype)
  ).length;
  const topScore = match.best_candidate?.score ?? 0;
  const topCluster = match.alternatives.filter(c => topScore - c.score <= 5);
  const topClusterAllKType = topCluster.length > 0 && topCluster.every(c =>
    c.record.kTypes && c.record.kTypes.includes(r.ktype)
  );
  const topHasKType = !!(match.best_candidate?.record.kTypes?.includes(r.ktype));

  results.push({
    regnr: r.regnr, ktype: r.ktype, brand: r.brand, model: r.model, year,
    totalCandidates: match.total_candidates,
    scoredCandidates: match.alternatives.length,
    exact_match: match.exact_match,
    topScore,
    topHasKType,
    candidatesWithKType,
    topClusterSize: topCluster.length,
    topClusterAllKType,
    topEurocode: match.best_candidate?.record.eurocode ?? null,
  });
}
const elapsed = Date.now() - start;

// ============================================================================
// RAPPORT
// ============================================================================

const N = results.length;
const exactMatches = results.filter(r => r.exact_match).length;
const topKTypeMatch = results.filter(r => r.topHasKType).length;
const topClusterAllKType = results.filter(r => r.topClusterAllKType).length;
const noKType = results.filter(r => r.candidatesWithKType === 0).length;
const noCandidates = results.filter(r => r.totalCandidates === 0).length;
const convergent = results.filter(r => r.topClusterAllKType && r.topClusterSize <= 5).length;

console.log("\n" + "═".repeat(72));
console.log("STRESS-TEST V2 (mot beriket katalog)");
console.log("═".repeat(72));
console.log(`Tid: ${elapsed}ms (${Math.round(elapsed/N)}ms/regnr)`);
console.log("");
console.log(`Total tester:                          ${N}`);
console.log(`Uten kandidater i katalog:             ${noCandidates}`);
console.log(`Med kandidater hvor kType matcher:     ${N - noKType} (${((N-noKType)/N*100).toFixed(1)}%)`);
console.log(`Topp-treff har riktig kType:           ${topKTypeMatch} (${(topKTypeMatch/N*100).toFixed(1)}%) ⭐`);
console.log(`Topp-cluster (≤5p) alle med kType:     ${topClusterAllKType} (${(topClusterAllKType/N*100).toFixed(1)}%)`);
console.log(`KONVERGENT (≤5 kand, alle riktig kT):  ${convergent} (${(convergent/N*100).toFixed(1)}%) 🎯`);
console.log(`Strikt exact_match:                    ${exactMatches} (${(exactMatches/N*100).toFixed(1)}%)`);

// Topp-cluster-fordeling
console.log("\nTopp-cluster-fordeling (kandidater innen 5p av topp):");
const buckets = [1, 2, 3, 5, 10, 20];
for (const b of buckets) {
  const n = results.filter(r => r.topClusterSize <= b).length;
  console.log(`  ≤ ${b}: ${n} (${(n/N*100).toFixed(0)}%)`);
}

// Per merke: topp har kType
console.log("\nPer merke (topp-treff har kType-match):");
const byBrand: Record<string, { total: number; topKType: number; convergent: number }> = {};
for (const r of results) {
  byBrand[r.brand] = byBrand[r.brand] ?? { total: 0, topKType: 0, convergent: 0 };
  byBrand[r.brand].total++;
  if (r.topHasKType) byBrand[r.brand].topKType++;
  if (r.topClusterAllKType && r.topClusterSize <= 5) byBrand[r.brand].convergent++;
}
for (const [brand, s] of Object.entries(byBrand).sort((a, b) => b[1].total - a[1].total).slice(0, 12)) {
  const ktPct = Math.round(s.topKType / s.total * 100);
  const cvPct = Math.round(s.convergent / s.total * 100);
  console.log(`  ${brand.padEnd(20)}: topKType ${s.topKType}/${s.total} (${ktPct}%), konvergent ${s.convergent}/${s.total} (${cvPct}%)`);
}

// Verstinger
console.log("\nVerstinger (mest kandidater, ingen kType-match):");
const worst = results.filter(r => !r.topHasKType).sort((a, b) => b.totalCandidates - a.totalCandidates).slice(0, 10);
for (const r of worst) {
  console.log(`  ${r.regnr} ${r.brand.padEnd(15)} ${r.model.substring(0,30).padEnd(30)} kand=${r.totalCandidates.toString().padStart(4)} top=${r.topScore.toFixed(0).padStart(3)} kT-match-i-kandidater=${r.candidatesWithKType}`);
}

// Lagre full rapport
const reportPath = path.join(ROOT, "logs", `stress-v2-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(reportPath, JSON.stringify({
  meta: { generatedAt: new Date().toISOString(), catalogPath: CATALOG_PATH, elapsedMs: elapsed },
  summary: {
    total: N, noCandidates, topKTypeMatch, topClusterAllKType, convergent, exactMatches,
    topKTypeMatchPct: topKTypeMatch/N*100, convergentPct: convergent/N*100,
  },
  byBrand, allResults: results,
}, null, 2));
console.log(`\nDetaljert rapport: ${reportPath}`);
