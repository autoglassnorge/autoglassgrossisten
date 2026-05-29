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
 *   npx tsx api/scrapers/merge-catalogs.ts
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

function formatMem(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mergeRecords(sources: { catalog: CatalogFile; priority: number }[]): GlassRecord[] {
  // Pre-size Map heuristisk basert på total antall records
  const totalHint = sources.reduce((sum, s) => sum + s.catalog.records.length, 0);
  const byEurocode = new Map<string, GlassRecord>(/* no pre-size API in std Map */);
  const sourceStats: Record<string, { added: number; merged: number }> = {};

  // Sorter etter prioritet (høyest først)
  sources.sort((a, b) => b.priority - a.priority);

  for (const { catalog, priority } of sources) {
    let added = 0;
    let merged = 0;
    const records = catalog.records;
    const total = records.length;
    const mergeStart = Date.now();

    for (let i = 0; i < total; i++) {
      const record = records[i];
      if (i > 0 && i % 5000 === 0) {
        process.stdout.write(`\r   ${catalog.meta.source}: ${i.toLocaleString("nb-NO")}/${total.toLocaleString("nb-NO")} processed`);
      }

      const code = record.eurocode?.toUpperCase().trim();
      if (!code) continue;

      const existing = byEurocode.get(code);

      if (!existing) {
        byEurocode.set(code, { ...record, nagsCodes: record.nagsCodes || [] });
        added++;
      } else if (priority > 1) {
        // Merge OEMs — bruk Set kun når det finnes nye verdier å legge til
        let oemNumbers = existing.oemNumbers;
        if (record.oemNumbers.length > 0) {
          const oemSet = new Set(oemNumbers);
          let changed = false;
          for (const oem of record.oemNumbers) {
            if (!oemSet.has(oem)) { oemSet.add(oem); changed = true; }
          }
          if (changed) oemNumbers = Array.from(oemSet);
        }

        let nagsCodes = existing.nagsCodes || [];
        const incomingNags = record.nagsCodes || [];
        if (incomingNags.length > 0) {
          const nagsSet = new Set(nagsCodes);
          let changed = false;
          for (const nags of incomingNags) {
            if (!nagsSet.has(nags)) { nagsSet.add(nags); changed = true; }
          }
          if (changed) nagsCodes = Array.from(nagsSet);
        }

        let source = existing.source;
        if (!source.includes(record.source)) {
          source = `${source},${record.source}`;
        }

        const mergedRecord: GlassRecord = {
          ...existing,
          price: record.price ?? existing.price,
          stockStatus: record.stockStatus || existing.stockStatus,
          warehouseLocation: record.warehouseLocation || existing.warehouseLocation,
          oemNumbers,
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
          nagsCodes,
          source,
          lastUpdated: new Date().toISOString(),
        };
        byEurocode.set(code, mergedRecord);
        merged++;
      }
    }

    const mergeMs = Date.now() - mergeStart;
    process.stdout.write(`\r   ${catalog.meta.source}: ${total.toLocaleString("nb-NO")}/${total.toLocaleString("nb-NO")} processed (${mergeMs}ms)\n`);
    sourceStats[catalog.meta.source] = { added, merged };
    console.log(`      → ${added} nye, ${merged} oppdatert`);
  }

  return Array.from(byEurocode.values());
}

/* ── Main ──────────────────────────────────────────────────── */

function main() {
  const totalStart = Date.now();
  console.log("🔀 Merge Catalog Sources → catalog-prod.json");
  console.log("=============================================\n");

  const memBefore = process.memoryUsage();

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
  const start = Date.now();
  const merged = mergeRecords(sources);
  const mergeMs = Date.now() - start;

  // Kategori-fordeling
  const catCounts: Record<string, number> = {};
  for (const r of merged) {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  }

  const memAfter = process.memoryUsage();

  console.log(`\n📊 Resultat:`);
  console.log(`   Totalt unike eurokoder: ${merged.length.toLocaleString("nb-NO")}`);
  console.log(`   Merge-tid: ${(mergeMs / 1000).toFixed(2)}s`);
  console.log(`   Minne: heap ${formatMem(memBefore.heapUsed)} → ${formatMem(memAfter.heapUsed)} (+${formatMem(memAfter.heapUsed - memBefore.heapUsed)})`);
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count.toLocaleString("nb-NO")}`);
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

  const writeStart = Date.now();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  const totalMs = Date.now() - totalStart;
  console.log(`\n💾 Produksjons-katalog lagret til: ${OUTPUT_FILE}`);
  console.log(`   Write-tid: ${(Date.now() - writeStart).toFixed(0)}ms`);
  console.log(`   Total tid: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`   Version: ${now}`);
  console.log(`   Neste steg: npm run worker:upload`);
}

try {
  main();
} catch (e) {
  console.error("❌ Merge feilet:", (e as Error).message);
  process.exit(1);
}
