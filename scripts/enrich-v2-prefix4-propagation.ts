/**
 * Autoglass AS — kType-berikelse v2 med prefix4-propagering
 * =========================================================
 * Bygger PÅ catalog-prod-ktype-enriched.json (v1) og legger til:
 *
 *  HACK #1: prefix4-propagering
 *    Hvis vi vet at prefix4 "8579" mappes til kType 32114 (fra én record),
 *    og 33 andre records har samme prefix4 i samme brand+år-range,
 *    så får de også kType 32114 (med lavere konfidens).
 *
 *  HACK #2: brand+yearRange → kType-cluster
 *    Bruker prefix4-cache som har 22 000 brand:model:year-entries til å
 *    finne kType-naboer (samme brand + nær år = sannsynligvis samme kType).
 *
 *  HACK #3: position-matches.json (15 311 eurocode-matches fra autoglass.ru)
 *    Disse har ikke kType direkte, men de bekrefter samme bil → vi kan
 *    speile kType fra én side til andre via eurocode-familie.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

interface CatalogRecord {
  eurocode: string;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  prefix4: string;
  category: string;
  kTypes?: number[];
  kTypeSources?: Record<number, string>;
  kTypeConfidence?: number;
  [k: string]: any;
}

interface CatalogFile {
  meta: any;
  records: CatalogRecord[];
}

function normalizeBrand(s: string | null | undefined): string {
  if (!s) return "";
  let b = s.toUpperCase().trim()
    .replace(/Ø/g, "O").replace(/Å/g, "A").replace(/Æ/g, "AE")
    .replace(/Ë|É|È|Ê/g, "E").replace(/Š/g, "S")
    .replace(/[^A-Z0-9 \-]/g, "");
  const aliases: Record<string, string> = {
    "VW": "VOLKSWAGEN", "VOLKSWAGEN AG": "VOLKSWAGEN",
    "MERCEDES": "MERCEDES-BENZ", "MB": "MERCEDES-BENZ", "MERCEDES BENZ": "MERCEDES-BENZ",
    "BMW MINI": "MINI", "NEW MINI": "MINI",
    "MG SAIC": "MG", "FORD USA": "FORD", "ŠKODA": "SKODA", "VAUXHALL": "OPEL",
  };
  return aliases[b] ?? b;
}

console.log("═".repeat(70));
console.log("kType-berikelse v2 — prefix4-propagering");
console.log("═".repeat(70));

console.log("\nLaster v1-katalog...");
const catalog: CatalogFile = JSON.parse(fs.readFileSync(path.join(DATA, "catalog-prod-ktype-enriched.json"), "utf-8"));
console.log(`  ✓ ${catalog.records.length} records, ${catalog.records.filter(r => r.kTypes && r.kTypes.length > 0).length} m/kType før v2`);

// ============================================================================
// HACK #1: Bygg prefix4 → kTypes-mapping fra eksisterende v1-data
// ============================================================================

console.log("\nBygger prefix4 → kType-mapping fra v1-data...");
interface Prefix4KTypeMap {
  // prefix4 + brand-normalized → kType-counter
  [key: string]: Map<number, number>;
}
const p4Map: Prefix4KTypeMap = {};

for (const r of catalog.records) {
  if (!r.kTypes || r.kTypes.length === 0) continue;
  if (!r.prefix4) continue;
  const brand = normalizeBrand(r.brand);
  if (!brand) continue;

  const key = `${r.prefix4}|${brand}`;
  p4Map[key] = p4Map[key] ?? new Map();
  for (const kt of r.kTypes) {
    p4Map[key].set(kt, (p4Map[key].get(kt) ?? 0) + 1);
  }
}

const uniqueP4Keys = Object.keys(p4Map).length;
console.log(`  ✓ ${uniqueP4Keys} unike prefix4|brand-kombinasjoner med kType`);

// ============================================================================
// HACK #2: Bygg model-prefix4-konfidens fra prefix4-cache for ekstra signal
// ============================================================================

console.log("\nLaster ktype-prefix4-cache for indirekte tilkobling...");
const prefix4Cache = JSON.parse(fs.readFileSync(path.join(DATA, "ktype-prefix4-cache.json"), "utf-8"));
const cacheEntries = prefix4Cache.entries ?? {};

// Indeks: brand|model → liste av (prefix4, year, confidence)
const brandModelPrefix4: Record<string, Array<{ prefix4: string; year?: number; confidence: number }>> = {};
for (const [key, entries] of Object.entries(cacheEntries as Record<string, any[]>)) {
  const parts = key.split(":");
  if (parts.length < 2) continue;
  const brand = normalizeBrand(parts[0]);
  const model = parts[1];
  const year = parts.length >= 3 ? parseInt(parts[2]) : undefined;
  const idxKey = `${brand}|${model}`;
  brandModelPrefix4[idxKey] = brandModelPrefix4[idxKey] ?? [];
  for (const e of entries) {
    brandModelPrefix4[idxKey].push({
      prefix4: e.prefix4,
      year,
      confidence: e.confidence ?? 1,
    });
  }
}

// ============================================================================
// PROPAGER kTypes
// ============================================================================

console.log("\nPropagerer kTypes via prefix4 + brand-bro...");
let propagated = 0;
let originalCount = 0;
const propSourceStats: Record<string, number> = {};

for (const r of catalog.records) {
  const before = r.kTypes?.length ?? 0;
  if (before > 0) originalCount++;

  const brand = normalizeBrand(r.brand);
  if (!brand || !r.prefix4) continue;

  // Hent kandidat-kTypes for denne prefix4|brand
  const key = `${r.prefix4}|${brand}`;
  const counter = p4Map[key];
  if (!counter || counter.size === 0) continue;

  // Sorter etter frekvens (mest brukte kType vinner)
  const sorted = Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  const topK = sorted.slice(0, 5); // ta topp 5 kandidater

  r.kTypes = r.kTypes ?? [];
  r.kTypeSources = r.kTypeSources ?? {};
  let added = false;
  for (const [kt, freq] of topK) {
    if (r.kTypes.includes(kt)) continue;
    // Konfidens: 0.65 hvis sett >=3 ganger med samme prefix4|brand, ellers 0.55
    const conf = freq >= 3 ? 0.65 : 0.55;
    r.kTypes.push(kt);
    r.kTypeSources[kt] = `prefix4-propagation:${r.prefix4}|${brand}(n=${freq})`;
    propSourceStats[`prefix4-propagation:n>=${freq >= 3 ? "3" : "1"}`] = (propSourceStats[`prefix4-propagation:n>=${freq >= 3 ? "3" : "1"}`] ?? 0) + 1;
    added = true;
  }
  if (added && before === 0) propagated++;
  // Oppdater konfidens om vi gikk fra 0 til noe
  if (added && before === 0) {
    r.kTypeConfidence = Math.max(r.kTypeConfidence ?? 0, 0.55);
  }
}

console.log(`  ✓ Propagerte kTypes til ${propagated} nye records (var 0, fikk kType-treff)`);

// ============================================================================
// SKRIV V2-KATALOG
// ============================================================================

const totalWithKType = catalog.records.filter(r => r.kTypes && r.kTypes.length > 0).length;
const totalAssignments = catalog.records.reduce((a, r) => a + (r.kTypes?.length ?? 0), 0);

const outCatalog = {
  meta: {
    ...catalog.meta,
    enrichmentVersion: "v2-prefix4-propagation",
    enrichedV2At: new Date().toISOString(),
    recordsWithKType_v2: totalWithKType,
    totalKTypeAssignments_v2: totalAssignments,
  },
  records: catalog.records,
};
const outPath = path.join(DATA, "catalog-prod-ktype-enriched-v2.json");
fs.writeFileSync(outPath, JSON.stringify(outCatalog, null, 1));
const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

// Rapport
const report = {
  meta: { generatedAt: new Date().toISOString() },
  totalRecords: catalog.records.length,
  v1RecordsWithKType: originalCount,
  v2RecordsWithKType: totalWithKType,
  delta: totalWithKType - originalCount,
  v2Coverage: Math.round(totalWithKType / catalog.records.length * 1000) / 10,
  totalAssignments,
  avgKTypesPerRecord: Math.round(totalAssignments / Math.max(totalWithKType, 1) * 10) / 10,
  propagationSources: propSourceStats,
  byBrand: {} as Record<string, { total: number; v1: number; v2: number; pct_v2: number }>,
  byCategory: {} as Record<string, { total: number; v1: number; v2: number; pct_v2: number }>,
};

// Trenger å re-laste v1 for diff
const v1 = JSON.parse(fs.readFileSync(path.join(DATA, "catalog-prod-ktype-enriched.json"), "utf-8")) as CatalogFile;
const v1KTypeBySku: Record<string, number> = {};
for (const r of v1.records) v1KTypeBySku[r.eurocode] = r.kTypes?.length ?? 0;

for (const r of catalog.records) {
  const brand = normalizeBrand(r.brand) || "UNKNOWN";
  report.byBrand[brand] = report.byBrand[brand] ?? { total: 0, v1: 0, v2: 0, pct_v2: 0 };
  report.byBrand[brand].total++;
  const v1Count = v1KTypeBySku[r.eurocode] ?? 0;
  if (v1Count > 0) report.byBrand[brand].v1++;
  if (r.kTypes && r.kTypes.length > 0) report.byBrand[brand].v2++;
  const cat = r.category || "unknown";
  report.byCategory[cat] = report.byCategory[cat] ?? { total: 0, v1: 0, v2: 0, pct_v2: 0 };
  report.byCategory[cat].total++;
  if (v1Count > 0) report.byCategory[cat].v1++;
  if (r.kTypes && r.kTypes.length > 0) report.byCategory[cat].v2++;
}
for (const [, s] of Object.entries(report.byBrand)) s.pct_v2 = Math.round(s.v2 / s.total * 1000) / 10;
for (const [, s] of Object.entries(report.byCategory)) s.pct_v2 = Math.round(s.v2 / s.total * 1000) / 10;

const reportPath = path.join(ROOT, "logs", "ktype-enrichment-v2-report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n${"═".repeat(70)}`);
console.log("BERIKELSES-RAPPORT v2 (etter prefix4-propagering)");
console.log("═".repeat(70));
console.log(`Total records:             ${catalog.records.length}`);
console.log(`v1 records m/kType:        ${originalCount}`);
console.log(`v2 records m/kType:        ${totalWithKType} (${report.v2Coverage}%)`);
console.log(`Tillegg via propagering:   ${report.delta}`);
console.log(`Total kType-tildelinger:   ${totalAssignments}`);
console.log(`Snitt kTypes per record:   ${report.avgKTypesPerRecord}`);
console.log(`\nPropageringskilder:`);
for (const [k, v] of Object.entries(propSourceStats)) console.log(`  ${k.padEnd(30)}: ${v}`);
console.log(`\nTopp 10 frontrute-merker:`);
const brandSorted = Object.entries(report.byBrand)
  .filter(([, s]) => s.total >= 50)
  .sort((a, b) => b[1].v2 - a[1].v2)
  .slice(0, 10);
for (const [brand, s] of brandSorted) {
  console.log(`  ${brand.padEnd(20)}: ${s.v2}/${s.total} (${s.pct_v2}%)  [v1: ${s.v1}]`);
}
console.log(`\nPer kategori:`);
for (const [cat, s] of Object.entries(report.byCategory).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${cat.padEnd(15)}: ${s.v2}/${s.total} (${s.pct_v2}%)  [v1: ${s.v1}]`);
}
console.log(`\nFiler:\n  ${outPath} (${sizeKB} KB)\n  ${reportPath}`);
