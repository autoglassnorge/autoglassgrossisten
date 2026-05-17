/**
 * Merge Multiple Catalog Sources → catalog-prod.json
 * =====================================================
 * Kombinerer Glavista + Pilkington + UNI Micro + mock-katalog til
 * ÉN kanonisk produksjonsfil: data/catalog-prod.json
 *
 * Hver kjøring legger til "version" (ISO-timestamp) i meta,
 * slik at upload-scriptet alltid vet hvilken fil som er gjeldende.
 *
 * Kjøring:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' api/scrapers/merge-catalogs.ts
 */

import * as fs from "fs";
import * as path from "path";

interface GlassRecord {
  eurocode: string;
  articleNumber: string;
  scanNumber: string | null;
  category: string;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null;
  stockStatus: number;
  warehouseLocation: string | null;
  oemNumbers: string[];
  crossReferences: string[];
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
  nagsCodes?: string[];
}

interface CatalogFile {
  meta: { totalRecords: number; source: string };
  records: GlassRecord[];
}

interface MergedMeta {
  version: string;          // ISO timestamp — unik per kjøring
  mergedAt: string;
  totalRecords: number;
  sources: string[];
  categories: Record<string, number>;
}

/* ── Konfigurasjon ─────────────────────────────────────────── */

const SOURCES = [
  { path: "data/unimicro-catalog.json", priority: 4 },      // Høyest — faktisk lager
  { path: "data/pilkington-products.json", priority: 3 },   // Pilkington IRL
  { path: "data/glavista-catalog.json", priority: 2 },      // Glavista
  { path: "data/mock-katalog.json", priority: 1 },          // Dev-data
];

const OUTPUT_DIR = path.join(__dirname, "../../data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "catalog-prod.json");

/* ── Hjelpefunksjoner ──────────────────────────────────────── */

function loadCatalog(filePath: string): CatalogFile | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CatalogFile;
  } catch {
    return null;
  }
}

function mergeRecords(sources: { catalog: CatalogFile; priority: number }[]): GlassRecord[] {
  const byEurocode = new Map<string, GlassRecord>();
  const sourceStats: Record<string, { added: number; merged: number }> = {};

  // Sorter etter prioritet (høyest først)
  sources.sort((a, b) => b.priority - a.priority);

  for (const { catalog, priority } of sources) {
    let added = 0;
    let merged = 0;

    for (const record of catalog.records) {
      const code = record.eurocode.toUpperCase().trim();
      if (!code) continue;

      const existing = byEurocode.get(code);

      if (!existing) {
        byEurocode.set(code, { ...record, nagsCodes: record.nagsCodes || [] });
        added++;
      } else if (priority > 1) {
        // Høyere prioritet — slå sammen felter
        const mergedRecord: GlassRecord = {
          ...existing,
          price: record.price ?? existing.price,
          stockStatus: record.stockStatus || existing.stockStatus,
          warehouseLocation: record.warehouseLocation || existing.warehouseLocation,
          oemNumbers: Array.from(new Set([...existing.oemNumbers, ...record.oemNumbers])),
          description:
            (record.description || "").length > (existing.description || "").length
              ? record.description
              : existing.description,
          // Flag: true vinner
          adas: existing.adas || record.adas,
          rainSensor: existing.rainSensor || record.rainSensor,
          heated: existing.heated || record.heated,
          acoustic: existing.acoustic || record.acoustic,
          antenna: existing.antenna || record.antenna,
          hud: existing.hud || record.hud,
          shade: existing.shade || record.shade,
          camera: existing.camera || record.camera,
          laneAssist: existing.laneAssist || record.laneAssist,
          // Kombiner NAGS-koder
          nagsCodes: Array.from(new Set([...(existing.nagsCodes || []), ...(record.nagsCodes || [])])),
          source: Array.from(new Set([...existing.source.split(","), record.source])).join(","),
          lastUpdated: new Date().toISOString(),
        };
        byEurocode.set(code, mergedRecord);
        merged++;
      }
    }

    sourceStats[catalog.meta.source] = { added, merged };
    console.log(`   ${catalog.meta.source}: ${added} nye, ${merged} oppdatert`);
  }

  return Array.from(byEurocode.values());
}

/* ── Main ──────────────────────────────────────────────────── */

function main() {
  console.log("🔀 Merge Catalog Sources → catalog-prod.json");
  console.log("=============================================\n");

  const sources: { catalog: CatalogFile; priority: number }[] = [];

  for (const src of SOURCES) {
    const catalog = loadCatalog(src.path);
    if (catalog) {
      console.log(`✅ ${src.path} — ${catalog.records.length} records (prio ${src.priority})`);
      sources.push({ catalog, priority: src.priority });
    } else {
      console.log(`⚠️  ${src.path} — ikke funnet`);
    }
  }

  if (sources.length === 0) {
    console.error("❌ Ingen kataloger å merge.");
    process.exit(1);
  }

  console.log("\n🔄 Merging...");
  const merged = mergeRecords(sources);

  // Kategori-fordeling
  const catCounts = merged.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\n📊 Resultat:`);
  console.log(`   Totalt unike eurokoder: ${merged.length}`);
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count}`);
  }

  // Sørg for at output-mappe finnes
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const now = new Date().toISOString();
  const output = {
    meta: {
      version: now,              // Unik versjon per kjøring
      mergedAt: now,
      totalRecords: merged.length,
      sources: sources.map((s) => s.catalog.meta.source),
      categories: catCounts,
    } as MergedMeta,
    records: merged,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n💾 Produksjons-katalog lagret til: ${OUTPUT_FILE}`);
  console.log(`   Version: ${now}`);
  console.log(`   Neste steg: npm run worker:upload`);
}

main();
