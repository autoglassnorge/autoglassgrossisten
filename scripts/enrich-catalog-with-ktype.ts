/**
 * Autoglass AS — kType-berikelse av catalog-prod
 * ================================================
 * Kobler alle eurocodes i catalog-prod.json til en liste av kType-IDer
 * basert på multi-kilde merge med konfidens-vekting.
 *
 * KILDER (prioritert):
 *   1. bovsoft-eurocode-ktype-map.json     — direkte eurocode→kType (HARD MATCH, conf 1.0)
 *   2. glass-variants-d1-ready.json         — Pilkington eurocode→kType (conf 0.95)
 *   3. brand-model-ktype-map.json           — brand:model:year→kType (conf 0.85)
 *   4. bovsoft-discovered-regnr.json        — regnr→kType (via brand:model:year, conf 0.85)
 *   5. bovsoft-bootstrap-results.json       — kjente regnr→kType (conf 0.90)
 *
 * Output: catalog-prod-ktype-enriched.json med kTypes-array per record
 *         + ktype-coverage-report.json
 *
 * Kjøring:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     scripts/enrich-catalog-with-ktype.ts
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
  [k: string]: any;
}

interface CatalogFile {
  meta: any;
  records: CatalogRecord[];
}

// Konfidens per kilde
type Confidence = 1.0 | 0.95 | 0.90 | 0.85 | 0.70 | 0.50;
interface KTypeMatch {
  kType: number;
  confidence: Confidence;
  source: string;
}

// ============================================================================
// HJELPERE
// ============================================================================

function normalizeBrand(s: string | null | undefined): string {
  if (!s) return "";
  let b = s.toUpperCase().trim()
    .replace(/Ø/g, "O").replace(/Å/g, "A").replace(/Æ/g, "AE")
    .replace(/Ë|É|È|Ê/g, "E")
    .replace(/Š/g, "S")
    .replace(/[^A-Z0-9 \-]/g, "");
  const aliases: Record<string, string> = {
    "VW": "VOLKSWAGEN", "VOLKSWAGEN AG": "VOLKSWAGEN",
    "MERCEDES": "MERCEDES-BENZ", "MB": "MERCEDES-BENZ", "MERCEDES BENZ": "MERCEDES-BENZ",
    "BMW MINI": "MINI", "NEW MINI": "MINI",
    "MG SAIC": "MG", "FORD USA": "FORD",
    "ŠKODA": "SKODA", "VAUXHALL": "OPEL",
  };
  return aliases[b] ?? b;
}

function coreModel(model: string | null | undefined): string {
  if (!model) return "";
  return model.toUpperCase().split(/[\s(]/)[0].trim();
}

// ============================================================================
// KILDE 1: Bovsoft eurocode→kType (HARD)
// ============================================================================

function loadBovsoftEurocodeMap(): Map<string, number[]> {
  const p = path.join(DATA, "bovsoft-eurocode-ktype-map.json");
  if (!fs.existsSync(p)) {
    console.warn("  ⚠ bovsoft-eurocode-ktype-map.json mangler — kjør analyze_ktype.py først");
    return new Map();
  }
  const data = JSON.parse(fs.readFileSync(p, "utf-8"));
  const map = new Map<string, number[]>();
  for (const [eu, kts] of Object.entries(data.map ?? {})) {
    map.set(eu.toUpperCase(), kts as number[]);
  }
  return map;
}

// ============================================================================
// KILDE 2: Pilkington glass-variants-d1-ready (eurocode→kType)
// ============================================================================

function loadPilkingtonEurocodeMap(): Map<string, number[]> {
  const p = path.join(DATA, "glass-variants-d1-ready.json");
  if (!fs.existsSync(p)) return new Map();
  const records = JSON.parse(fs.readFileSync(p, "utf-8")) as Array<{ eurocode: string; ktype: number }>;
  const map = new Map<string, number[]>();
  for (const r of records) {
    if (!r.eurocode || !r.ktype) continue;
    const key = r.eurocode.toUpperCase();
    const list = map.get(key) ?? [];
    if (!list.includes(r.ktype)) list.push(r.ktype);
    map.set(key, list);
  }
  return map;
}

// ============================================================================
// KILDE 3+4: brand:model:year → kType (multikilde)
// ============================================================================

interface BMYIndex {
  // Nøkler: "BRAND|MODEL|YEAR", "BRAND|MODEL", "BRAND|YEAR"
  exact: Map<string, KTypeMatch[]>;
}

function loadBrandModelYearIndex(): BMYIndex {
  const exact = new Map<string, KTypeMatch[]>();
  function add(key: string, kType: number, confidence: Confidence, source: string) {
    if (!kType || !key) return;
    const list = exact.get(key) ?? [];
    if (!list.some(m => m.kType === kType)) {
      list.push({ kType, confidence, source });
    }
    exact.set(key, list);
  }

  // Kilde 3: brand-model-ktype-map.json
  const p3 = path.join(DATA, "brand-model-ktype-map.json");
  if (fs.existsSync(p3)) {
    const d = JSON.parse(fs.readFileSync(p3, "utf-8"));
    // exact_map: "BRAND|MODEL|YEAR" eller "BRAND|MODEL" → ktype
    for (const [key, kt] of Object.entries(d.exact_map ?? {})) {
      const parts = key.split("|");
      const brand = normalizeBrand(parts[0]);
      const model = coreModel(parts[1]);
      const year = parts[2];
      // Lag flere varianter for å maks koblings-rate
      add(`${brand}|${model}|${year}`, kt as number, 0.85, "brand-model-ktype-map:exact");
      add(`${brand}|${model}`, kt as number, 0.70, "brand-model-ktype-map:no-year");
      if (year) add(`${brand}|${year}`, kt as number, 0.50, "brand-model-ktype-map:no-model");
    }
    // aliases array
    for (const alias of d.aliases ?? []) {
      const parts = (alias.key as string).split("|");
      const brand = normalizeBrand(parts[0]);
      const model = coreModel(parts[1]);
      const year = parts[2];
      add(`${brand}|${model}|${year}`, alias.ktype, 0.85, "brand-model-ktype-map:alias");
      add(`${brand}|${model}`, alias.ktype, 0.70, "brand-model-ktype-map:alias-no-year");
    }
  }

  // Kilde 4: bovsoft-discovered-regnr.json
  const p4 = path.join(DATA, "bovsoft-discovered-regnr.json");
  if (fs.existsSync(p4)) {
    const d = JSON.parse(fs.readFileSync(p4, "utf-8"));
    for (const r of d.results ?? []) {
      if (!r.ktype || !r.brand) continue;
      const brand = normalizeBrand(r.brand);
      const model = coreModel(r.model);
      // For HVERT år i year-range
      const yFrom = r.yearFrom;
      const yTo = r.yearTo || r.yearFrom + 5;
      for (let y = yFrom; y <= yTo; y++) {
        add(`${brand}|${model}|${y}`, r.ktype, 0.85, "bovsoft-discovered-regnr");
      }
      add(`${brand}|${model}`, r.ktype, 0.70, "bovsoft-discovered-regnr:no-year");
    }
  }

  // Kilde 5: bovsoft-bootstrap-results.json
  const p5 = path.join(DATA, "bovsoft-bootstrap-results.json");
  if (fs.existsSync(p5)) {
    const d = JSON.parse(fs.readFileSync(p5, "utf-8"));
    for (const r of d.results ?? []) {
      if (!r.ktype || !r.brand) continue;
      const brand = normalizeBrand(r.brand);
      const model = coreModel(r.model);
      const yFrom = r.yearFrom;
      const yTo = r.yearTo || r.yearFrom + 5;
      for (let y = yFrom; y <= yTo; y++) {
        add(`${brand}|${model}|${y}`, r.ktype, 0.90, "bovsoft-bootstrap");
      }
      add(`${brand}|${model}`, r.ktype, 0.70, "bovsoft-bootstrap:no-year");
    }
  }

  return { exact };
}

// ============================================================================
// HOVEDFUNKSJON
// ============================================================================

function enrichRecord(
  record: CatalogRecord,
  euMap1: Map<string, number[]>,
  euMap2: Map<string, number[]>,
  bmy: BMYIndex
): { kTypes: number[]; kTypeSources: Record<number, string>; confidence: number } {
  const ktypes = new Map<number, KTypeMatch>();

  function addKType(kt: number, confidence: Confidence, source: string) {
    if (!kt) return;
    const existing = ktypes.get(kt);
    if (!existing || existing.confidence < confidence) {
      ktypes.set(kt, { kType: kt, confidence, source });
    }
  }

  // 1) Direkte eurocode-treff (HARDEST)
  const eu = record.eurocode?.toUpperCase();
  if (eu) {
    const m1 = euMap1.get(eu);
    if (m1) m1.forEach(kt => addKType(kt, 1.0, "bovsoft-eurocode"));
    const m2 = euMap2.get(eu);
    if (m2) m2.forEach(kt => addKType(kt, 0.95, "pilkington-eurocode"));
  }

  // 2) Brand+Model+Year-treff
  const brand = normalizeBrand(record.brand);
  const model = coreModel(record.model);
  if (brand && model) {
    const yFrom = record.yearFrom;
    const yTo = record.yearTo;
    if (yFrom && yTo) {
      // Test alle år i range
      for (let y = yFrom; y <= Math.min(yTo, yFrom + 25); y++) {
        const matches = bmy.exact.get(`${brand}|${model}|${y}`);
        if (matches) matches.forEach(m => addKType(m.kType, m.confidence, m.source));
      }
    } else if (yFrom) {
      const matches = bmy.exact.get(`${brand}|${model}|${yFrom}`);
      if (matches) matches.forEach(m => addKType(m.kType, m.confidence, m.source));
    }
    // Fallback brand+model uten år
    if (ktypes.size === 0) {
      const matches = bmy.exact.get(`${brand}|${model}`);
      if (matches) matches.forEach(m => addKType(m.kType, m.confidence, m.source));
    }
  }

  const sorted = Array.from(ktypes.values()).sort((a, b) => b.confidence - a.confidence);
  return {
    kTypes: sorted.map(m => m.kType),
    kTypeSources: Object.fromEntries(sorted.map(m => [m.kType, m.source])),
    confidence: sorted[0]?.confidence ?? 0,
  };
}

// ============================================================================
// MAIN
// ============================================================================

console.log("═".repeat(70));
console.log("kType-berikelse av catalog-prod");
console.log("═".repeat(70));

console.log("\nLaster katalog...");
const catalog: CatalogFile = JSON.parse(fs.readFileSync(path.join(DATA, "catalog-prod.json"), "utf-8"));
console.log(`  ✓ ${catalog.records.length} records`);

console.log("\nLaster kType-kilder...");
const euMap1 = loadBovsoftEurocodeMap();
console.log(`  ✓ Bovsoft eurocode-map: ${euMap1.size} eurocodes`);
const euMap2 = loadPilkingtonEurocodeMap();
console.log(`  ✓ Pilkington eurocode-map: ${euMap2.size} eurocodes`);
const bmy = loadBrandModelYearIndex();
console.log(`  ✓ brand:model:year-index: ${bmy.exact.size} nøkler`);

console.log("\nBeriker records...");
const start = Date.now();
let withKType = 0;
let totalKTypeAssignments = 0;
const confidenceHistogram: Record<string, number> = {};
const sourceStats: Record<string, number> = {};
const enriched = catalog.records.map(r => {
  const enrichment = enrichRecord(r, euMap1, euMap2, bmy);
  if (enrichment.kTypes.length > 0) {
    withKType++;
    totalKTypeAssignments += enrichment.kTypes.length;
    const confKey = enrichment.confidence.toFixed(2);
    confidenceHistogram[confKey] = (confidenceHistogram[confKey] ?? 0) + 1;
    for (const src of Object.values(enrichment.kTypeSources)) {
      sourceStats[src] = (sourceStats[src] ?? 0) + 1;
    }
  }
  return {
    ...r,
    kTypes: enrichment.kTypes,
    kTypeSources: enrichment.kTypeSources,
    kTypeConfidence: enrichment.confidence,
  };
});
const elapsed = Date.now() - start;

console.log(`\n  ✓ Prosessert ${enriched.length} records på ${elapsed}ms`);

// Skriv beriket katalog
const outCatalog = {
  meta: {
    ...catalog.meta,
    enrichedAt: new Date().toISOString(),
    enrichmentSources: ["bovsoft-eurocode", "pilkington-eurocode", "brand-model-ktype-map", "bovsoft-discovered-regnr", "bovsoft-bootstrap"],
    recordsWithKType: withKType,
    totalKTypeAssignments,
  },
  records: enriched,
};
const outPath = path.join(DATA, "catalog-prod-ktype-enriched.json");
fs.writeFileSync(outPath, JSON.stringify(outCatalog, null, 1));
const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
console.log(`  ✓ Skrev catalog-prod-ktype-enriched.json (${sizeKB} KB)`);

// Skriv rapport
const report = {
  meta: { generatedAt: new Date().toISOString(), elapsedMs: elapsed },
  totalRecords: enriched.length,
  recordsWithKType: withKType,
  coverage: Math.round(withKType / enriched.length * 1000) / 10,
  totalKTypeAssignments,
  avgKTypesPerRecord: Math.round(totalKTypeAssignments / Math.max(withKType, 1) * 10) / 10,
  confidenceHistogram,
  sourceStats,
  // Per-merke coverage
  byBrand: {} as Record<string, { total: number; withKType: number; pct: number }>,
  // Per-kategori
  byCategory: {} as Record<string, { total: number; withKType: number; pct: number }>,
};

for (const r of enriched) {
  const brand = normalizeBrand(r.brand) || "UNKNOWN";
  report.byBrand[brand] = report.byBrand[brand] ?? { total: 0, withKType: 0, pct: 0 };
  report.byBrand[brand].total++;
  if (r.kTypes.length > 0) report.byBrand[brand].withKType++;

  const cat = r.category || "unknown";
  report.byCategory[cat] = report.byCategory[cat] ?? { total: 0, withKType: 0, pct: 0 };
  report.byCategory[cat].total++;
  if (r.kTypes.length > 0) report.byCategory[cat].withKType++;
}
for (const [, s] of Object.entries(report.byBrand)) s.pct = Math.round(s.withKType / s.total * 1000) / 10;
for (const [, s] of Object.entries(report.byCategory)) s.pct = Math.round(s.withKType / s.total * 1000) / 10;

const reportPath = path.join(ROOT, "logs", "ktype-enrichment-report.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

// Print sammendrag
console.log(`\n${"═".repeat(70)}`);
console.log("BERIKELSES-RAPPORT");
console.log("═".repeat(70));
console.log(`Total records:             ${enriched.length}`);
console.log(`Records med kType:         ${withKType} (${report.coverage}%)`);
console.log(`Total kType-tildelinger:   ${totalKTypeAssignments}`);
console.log(`Snitt kTypes per record:   ${report.avgKTypesPerRecord}`);
console.log(`\nKonfidens-histogram:`);
for (const [conf, count] of Object.entries(confidenceHistogram).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))) {
  console.log(`  ${conf}: ${count}`);
}
console.log(`\nKilder (antall record-tildelinger):`);
for (const [src, count] of Object.entries(sourceStats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${src.padEnd(45)}: ${count}`);
}
console.log(`\nTopp 10 merker (coverage):`);
const brandSorted = Object.entries(report.byBrand)
  .filter(([, s]) => s.total >= 50)
  .sort((a, b) => b[1].withKType - a[1].withKType)
  .slice(0, 10);
for (const [brand, s] of brandSorted) {
  console.log(`  ${brand.padEnd(20)}: ${s.withKType}/${s.total} (${s.pct}%)`);
}
console.log(`\nPer kategori:`);
for (const [cat, s] of Object.entries(report.byCategory).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${cat.padEnd(15)}: ${s.withKType}/${s.total} (${s.pct}%)`);
}
console.log(`\nFiler skrevet:`);
console.log(`  ${outPath}`);
console.log(`  ${reportPath}`);
