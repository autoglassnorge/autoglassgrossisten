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

// ─── Load catalog sources ───────────────────────────────────────
function loadCatalogs(): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  // Load mock catalog
  const mockPath = path.join(DATA_DIR, "mock-katalog.json");
  if (fs.existsSync(mockPath)) {
    const mock = JSON.parse(fs.readFileSync(mockPath, "utf-8"));
    const mockRecords = mock.records || [];
    for (const p of mockRecords) {
      products.push({
        eurocode: p.eurocode,
        brand: p.brand,
        model: p.model,
        yearFrom: p.yearFrom,
        yearTo: p.yearTo,
        flags: p.flags,
      });
    }
    console.log(`   📄 Mock: ${mockRecords.length} produkter`);
  }

  // Load Glavista
  const glavistaPath = path.join(DATA_DIR, "glavista-catalog.json");
  if (fs.existsSync(glavistaPath)) {
    const g = JSON.parse(fs.readFileSync(glavistaPath, "utf-8"));
    const glavistaRecords = g.records || [];
    for (const p of glavistaRecords) {
      products.push({
        eurocode: p.eurocode,
        brand: p.brand,
        model: p.model,
        yearFrom: p.yearFrom,
        yearTo: p.yearTo,
        flags: p.flags,
      });
    }
    console.log(`   📄 Glavista: ${glavistaRecords.length} produkter`);
  }

  // Load Pilkington
  const pilkPath = path.join(DATA_DIR, "scrapers", "pilkington-products.json");
  if (fs.existsSync(pilkPath)) {
    const p = JSON.parse(fs.readFileSync(pilkPath, "utf-8"));
    for (const prod of p) {
      products.push({
        eurocode: prod.eurocode,
        brand: prod.brand,
        model: prod.model,
        yearFrom: prod.yearFrom,
        yearTo: prod.yearTo,
        flags: prod.flags,
      });
    }
    console.log(`   📄 Pilkington: ${p.length} produkter`);
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

  for (const p of products) {
    if (!p.eurocode || p.eurocode.length < 4) continue;
    const prefix4 = p.eurocode.slice(0, 4);
    const brand = normalizeBrand(p.brand || "UNKNOWN");
    const model = (p.model || "").toUpperCase().trim();
    const yearFrom = p.yearFrom || 0;

    // Key: "BRAND:MODEL:YEARFROM" or "BRAND:MODEL" or "BRAND:YEARFROM"
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
      if (!map.has(key)) map.set(key, new Map());
      const prefixes = map.get(key)!;
      prefixes.set(prefix4, (prefixes.get(prefix4) || 0) + 1);
    }
  }

  return map;
}

// ─── Build cache entries ────────────────────────────────────────
function buildCache(statMap: Map<string, Map<string, number>>): Prefix4Cache {
  const entries: Record<string, Prefix4Entry[]> = {};

  for (const [key, prefixes] of Array.from(statMap.entries())) {
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

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    totalEntries: Object.keys(entries).length,
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
  // For now, just mark the concept
  console.log("   (krever kjente regnr for hver kType — implementeres senere)");
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("🔧 kType → prefix4 Auto-Cache Builder");
  console.log("=====================================\n");

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
  const statMap = buildStatisticalMap(products);

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
  const cache = buildCache(statMap);

  // Validate
  await validateWithApi(cache);

  // Save
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 1));

  // Stats
  console.log("\n📊 Cache-statistikk:");
  console.log(`   Totale nøkler: ${cache.totalEntries.toLocaleString("no")}`);
  console.log(`   Lagret: ${OUTPUT_PATH}`);
  console.log(`\n✅ Ferdig!`);
}

main().catch(e => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
