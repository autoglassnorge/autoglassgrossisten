/**
 * Merge Multiple Catalog Sources
 * ==============================
 * Kombinerer Glavista + UNI Micro + mock-katalog til én master-katalog.
 * Prioriterer: UNI Micro > Glavista > mock
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
}

interface CatalogFile {
  meta: { totalRecords: number; source: string };
  records: GlassRecord[];
}

const SOURCES = [
  { path: "data/unimicro-catalog.json", priority: 4 },    // Høyest - our actual stock
  { path: "data/pilkington-products.json", priority: 3 }, // Pilkington IRL
  { path: "data/glavista-catalog.json", priority: 2 },    // Glavista
  { path: "data/mock-katalog.json", priority: 1 },        // Lavest - dev data
];

const OUTPUT = "data/master-catalog.json";

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
  const sourceStats: Record<string, number> = {};

  // Sorter etter prioritet (høyest først)
  sources.sort((a, b) => b.priority - a.priority);

  for (const { catalog, priority } of sources) {
    let added = 0;
    let merged = 0;

    for (const record of catalog.records) {
      const code = record.eurocode.toUpperCase();
      const existing = byEurocode.get(code);

      if (!existing) {
        // Ny record
        byEurocode.set(code, record);
        added++;
      } else if (priority > 1) {
        // Høyere prioritet — overskriv med bedre data
        const mergedRecord: GlassRecord = {
          ...existing,
          // Behold pris/lager fra høyest prioritet som har det
          price: record.price ?? existing.price,
          stockStatus: record.stockStatus || existing.stockStatus,
          warehouseLocation: record.warehouseLocation || existing.warehouseLocation,
          // Kombiner OEM-numre
          oemNumbers: [...new Set([...existing.oemNumbers, ...record.oemNumbers])],
          // Behold rikest beskrivelse
          description: record.description.length > existing.description.length
            ? record.description : existing.description,
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
          // Track multiple sources
          source: existing.source + "," + record.source,
          lastUpdated: new Date().toISOString(),
        };
        byEurocode.set(code, mergedRecord);
        merged++;
      }
    }

    sourceStats[catalog.meta.source] = added + merged;
    console.log(`   ${catalog.meta.source}: ${added} nye, ${merged} oppdatert`);
  }

  return Array.from(byEurocode.values());
}

function main() {
  console.log("🔀 Merge Catalog Sources");
  console.log("========================\n");

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
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log(`   ${cat}: ${count}`);
  }

  // Lagre
  const outputPath = path.join(__dirname, "../../", OUTPUT);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        meta: {
          mergedAt: new Date().toISOString(),
          totalRecords: merged.length,
          sources: sources.map((s) => s.catalog.meta.source),
          categories: catCounts,
        },
        records: merged,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Master-katalog lagret til: ${OUTPUT}`);
  console.log("   Klar for upload-catalog-to-kv.ts");
}

main();
