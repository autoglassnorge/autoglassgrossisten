/**
 * kType → prefix4 Auto-Cache Builder
 *
 * Problem: No public API maps TecDoc kType → eurocode prefix4.
 * Solution: Build cache from real lookups + statistical inference.
 *
 * Strategy:
 *  1. Load master catalog (eurocodes with brand/model/year)
 *  2. For each brand+year+model combination, find most common prefix4
 *  3. Generate test regnr lookups via Biluppgifter to validate
 *  4. Build ktype-prefix4-cache.json
 *
 * Data sources:
 *  - Glavista products (brand/model/year → eurocode)
 *  - Pilkington products (brand/model/year → eurocode)
 *  - Mock catalog (brand/model/year → eurocode)
 *  - Biluppgifter API (regnr → kType) — used for validation only
 */

import * as fs from "fs";
import * as path from "path";

// ─── Configuration ──────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const OUTPUT_PATH = path.join(DATA_DIR, "ktype-prefix4-cache.json");

// Biluppgifter API key (optional - only needed for validation mode)
const BILUPPGIFTER_API_KEY = process.env.BILUPPGIFTER_API_KEY || "";

// ─── Interfaces ─────────────────────────────────────────────────
interface CatalogProduct {
  eurocode: string;
  brand?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  flags?: string[];
}

interface Prefix4Entry {
  prefix4: string;
  brand: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  confidence: number;  // 1-4: statistical only → validated with real lookup
  source: string[];
}

interface Prefix4Cache {
  version: string;
  generatedAt: string;
  totalEntries: number;
  entries: Record<string, Prefix4Entry[]>;  // key: "BRAND:MODEL:YEAR"
}

function formatMem(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Load catalog sources ───────────────────────────────────────
function loadCatalogs(): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  const sources = [
    { path: path.join(DATA_DIR, "mock-katalog.json"), name: "Mock" },
    { path: path.join(DATA_DIR, "glavista-catalog.json"), name: "Glavista" },
    { path: path.join(DATA_DIR, "scrapers", "pilkington-products.json"), name: "Pilkington" },
  ];

  for (const src of sources) {
    if (!fs.existsSync(src.path)) continue;
    const data = JSON.parse(fs.readFileSync(src.path, "utf-8"));
    const records = Array.isArray(data) ? data : (data.records || []);
    for (const p of records) {
      products.push({
        eurocode: p.eurocode,
        brand: p.brand,
        model: p.model,
        yearFrom: p.yearFrom,
        yearTo: p.yearTo,
        flags: p.flags,
      });
    }
    console.log(`   📄 ${src.name}: ${records.length.toLocaleString("no")} produkter`);
  }

  return products;
}

// ─── Normalize brand names ──────────────────────────────────────
function normalizeBrand(brand: string): string {
  const map: Record<string, string> = {
    "ALFA ROMEO": "ALFA", "ALFA-ROMEO": "ALFA",
    "LAND ROVER": "LANDROVER", "LAND-ROVER": "LANDROVER",
    "ROLLS ROYCE": "ROLLSROYCE", "ROLLS-ROYCE": "ROLLSROYCE",
    "MERCEDES BENZ": "MERCEDES", "MERCEDES-BENZ": "MERCEDES",
    "VW": "VOLKSWAGEN", "VOLKSWAGEN": "VOLKSWAGEN",
    "OPEL": "OPEL", "VAUXHALL": "OPEL",
  };
  const b = brand.toUpperCase().trim();
  return map[b] || b;
}

// ─── Build statistical prefix4 map ──────────────────────────────
function buildStatisticalMap(products: CatalogProduct[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  const total = products.length;

  for (let i = 0; i < total; i++) {
    const p = products[i];
    if (i > 0 && i % 5000 === 0) {
      process.stdout.write(`\r   Bygger mapping... ${i.toLocaleString("no")}/${total.toLocaleString("no")}`);
    }

    if (!p.eurocode || p.eurocode.length < 4) continue;
    const prefix4 = p.eurocode.slice(0, 4);
    const brand = normalizeBrand(p.brand || "UNKNOWN");
    const model = (p.model || "").toUpperCase().trim();
    const yearFrom = p.yearFrom || 0;

    const keys: string[] = [];
    if (brand && model && yearFrom) {
      keys.push(`${brand}:${model}:${yearFrom}`);
      keys.push(`${brand}:${model}`);
      keys.push(`${brand}:${yearFrom}`);
    } else if (brand && model) {
      keys.push(`${brand}:${model}`);
    } else if (brand && yearFrom) {
      keys.push(`${brand}:${yearFrom}`);
    }

    for (const key of keys) {
      let prefixes = map.get(key);
      if (!prefixes) {
        prefixes = new Map<string, number>();
        map.set(key, prefixes);
      }
      prefixes.set(prefix4, (prefixes.get(prefix4) || 0) + 1);
    }
  }

  process.stdout.write(`\r   Bygger mapping... ${total.toLocaleString("no")}/${total.toLocaleString("no")}\n`);
  return map;
}

// ─── Build cache entries ────────────────────────────────────────
function buildCache(statMap: Map<string, Map<string, number>>): Prefix4Cache {
  const entries: Record<string, Prefix4Entry[]> = {};
  const statEntries = Array.from(statMap.entries());
  const total = statEntries.length;

  for (let i = 0; i < total; i++) {
    const [key, prefixes] = statEntries[i];
    if (i > 0 && i % 1000 === 0) {
      process.stdout.write(`\r   Bygger cache... ${i.toLocaleString("no")}/${total.toLocaleString("no")}`);
    }

    const sorted = Array.from(prefixes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 prefix4 per key

    const parts = key.split(":");
    const brand = parts[0];
    const model = parts[1] || "";
    const yearStr = parts[2];

    entries[key] = sorted.map(([prefix4, count], idx) => ({
      prefix4,
      brand,
      model,
      yearFrom: yearStr ? parseInt(yearStr, 10) : undefined,
      confidence: idx === 0 ? 2 : 1, // 2 = most common, 1 = alternative
      source: ["statistical"],
    }));
  }

  process.stdout.write(`\r   Bygger cache... ${total.toLocaleString("no")}/${total.toLocaleString("no")}\n`);

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    totalEntries: statEntries.length,
    entries,
  };
}

// ─── Validation with Biluppgifter (optional) ────────────────────
async function validateWithApi(cache: Prefix4Cache): Promise<void> {
  if (!BILUPPGIFTER_API_KEY) {
    console.log("\n⚠️  Ingen BILUPPGIFTER_API_KEY satt — hopper over validering");
    return;
  }

  console.log("\n🔍 Validerer med Biluppgifter API (demo-modus)...");
  // TODO: Implement real validation using known test regnr
  console.log("   (krever kjente regnr for hver kType — implementeres senere)");
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const totalStart = Date.now();
  console.log("🔧 kType → prefix4 Auto-Cache Builder");
  console.log("=====================================\n");

  const memBefore = process.memoryUsage();

  // Load all catalog sources
  console.log("📂 Laster kataloger...");
  const products = loadCatalogs();
  console.log(`   Totalt: ${products.length.toLocaleString("no")} produkter\n`);

  if (products.length === 0) {
    console.log("❌ Ingen katalogdata funnet. Kjør scrapere først.");
    process.exit(1);
  }

  // Build statistical map
  console.log("📊 Bygger statistisk prefix4-mapping...");
  const buildStart = Date.now();
  const statMap = buildStatisticalMap(products);
  const buildMs = Date.now() - buildStart;
  console.log(`   Ferdig på ${(buildMs / 1000).toFixed(2)}s — ${statMap.size.toLocaleString("no")} unike nøkler\n`);

  // Show top mappings
  console.log("   Topp mappings:");
  let shown = 0;
  for (const [key, prefixes] of Array.from(statMap.entries())) {
    if (shown >= 10) break;
    const top = Array.from(prefixes.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      console.log(`      ${key} → ${top[0]} (${top[1]} forekomster)`);
      shown++;
    }
  }

  // Build cache
  console.log("\n💾 Bygger cache...");
  const cacheStart = Date.now();
  const cache = buildCache(statMap);
  const cacheMs = Date.now() - cacheStart;
  console.log(`   Ferdig på ${(cacheMs / 1000).toFixed(2)}s`);

  // Validate
  await validateWithApi(cache);

  // Save
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const writeStart = Date.now();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 1));
  const writeMs = Date.now() - writeStart;
  const totalMs = Date.now() - totalStart;
  const memAfter = process.memoryUsage();

  console.log(`\n📊 Cache-statistikk:`);
  console.log(`   Totale nøkler: ${cache.totalEntries.toLocaleString("no")}`);
  console.log(`   Lagret: ${OUTPUT_PATH}`);
  console.log(`   Write-tid: ${writeMs}ms`);
  console.log(`   Total tid: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`   Minne: heap ${formatMem(memBefore.heapUsed)} → ${formatMem(memAfter.heapUsed)} (+${formatMem(memAfter.heapUsed - memBefore.heapUsed)})`);
  console.log(`\n✅ Ferdig!`);
}

main().catch(e => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
