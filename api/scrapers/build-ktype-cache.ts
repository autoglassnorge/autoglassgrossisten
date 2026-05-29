/**
 * Build kType → prefix4 Cache via Biluppgitter API
 * =================================================
 * Bruker kjente regnr til å bygge en direkte kType→prefix4 mapping.
 *
 * Strategi:
 *   1. Ta en liste med kjente regnr (hardkodet eller fra fil)
 *   2. For hvert regnr: Biluppgitter TecDoc → kType, brand, model, year
 *   3. Slå opp i vår katalog: brand + year + model → prefix4
 *   4. Lagre: kTypeCache[kType] = { prefix4, brand, model, year, confidence }
 *
 * Kjøring:
 *   BILUPPGIFTER_API_KEY=xxx npx tsx api/scrapers/build-ktype-cache.ts
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ─────────────────────────────────────────────────────
const BILUPPGIFTER_API_KEY = process.env.BILUPPGIFTER_API_KEY || "";
const BILUPPGIFTER_BASE = "https://api.biluppgifter.se/api/v1";
const CATALOG_PATH = path.join(process.cwd(), "data", "master-catalog.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");

// Rate limiting: max 5 requests per second (Biluppgitter limit)
const RATE_LIMIT_MS = 200;

// ─── Types ──────────────────────────────────────────────────────
interface CatalogData {
  meta: { totalRecords: number };
  records: Array<{
    eurocode: string;
    prefix4: string;
    brand: string | null;
    model: string | null;
    yearFrom: number | null;
    yearTo: number | null;
    category: string;
    description: string;
  }>;
}

interface KTypeEntry {
  kType: number;
  prefix4: string;
  brand: string;
  model: string;
  year: number;
  confidence: number; // 1-4: 4=direct lookup, 3=year+brand+model, 2=brand+model, 1=brand only
  regnr: string;
  source: string;
}

interface KTypeCache {
  version: string;
  generatedAt: string;
  totalEntries: number;
  entries: Record<number, KTypeEntry>;
}

// ─── Known test regnr (Norwegian patterns by brand/model/year) ──
// These are example patterns — in production, use a real dataset
// Format: { regnr: string, expectedBrand?: string, expectedModel?: string, expectedYear?: number }
const KNOWN_REGNR: Array<{ regnr: string; note?: string }> = [
  // BMW
  { regnr: "AB12345", note: "Example BMW" },
  { regnr: "BT12345", note: "Example BMW" },
  // VW
  { regnr: "CV12345", note: "Example VW" },
  { regnr: "DH12345", note: "Example VW" },
  // Mercedes
  { regnr: "EL12345", note: "Example Mercedes" },
  { regnr: "FS12345", note: "Example Mercedes" },
  // Audi
  { regnr: "HJ12345", note: "Example Audi" },
  { regnr: "KE12345", note: "Example Audi" },
  // Volvo
  { regnr: "KR12345", note: "Example Volvo" },
  { regnr: "LD12345", note: "Example Volvo" },
  // Toyota
  { regnr: "NF12345", note: "Example Toyota" },
  { regnr: "PD12345", note: "Example Toyota" },
  // Ford
  { regnr: "RH12345", note: "Example Ford" },
  { regnr: "SJ12345", note: "Example Ford" },
  // Nissan
  { regnr: "TD12345", note: "Example Nissan" },
  // Hyundai
  { regnr: "UL12345", note: "Example Hyundai" },
  // Kia
  { regnr: "VF12345", note: "Example Kia" },
  // Renault
  { regnr: "XP12345", note: "Example Renault" },
  // Peugeot
  { regnr: "YH12345", note: "Example Peugeot" },
  // Skoda
  { regnr: "ZS12345", note: "Example Skoda" },
  // Opel
  { regnr: "AE12345", note: "Example Opel" },
  // Mazda
  { regnr: "BR12345", note: "Example Mazda" },
  // Subaru
  { regnr: "CJ12345", note: "Example Subaru" },
  // Honda
  { regnr: "DK12345", note: "Example Honda" },
  // Lexus
  { regnr: "EV12345", note: "Example Lexus" },
  // Jaguar
  { regnr: "FN12345", note: "Example Jaguar" },
  // Land Rover
  { regnr: "GU12345", note: "Example Land Rover" },
  // Porsche
  { regnr: "HF12345", note: "Example Porsche" },
  // Tesla
  { regnr: "JH12345", note: "Example Tesla" },
];

// ─── API ────────────────────────────────────────────────────────
interface TecdocVehicle {
  regno: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  k_type: number;
}

async function fetchTecdoc(regnr: string): Promise<TecdocVehicle | null> {
  const url = `${BILUPPGIFTER_BASE}/tecdoc/regno/${encodeURIComponent(regnr)}?country_code=NO`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BILUPPGIFTER_API_KEY}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      if (response.status === 404) return null; // Vehicle not found
      console.warn(`   API error ${response.status} for ${regnr}`);
      return null;
    }
    const data = (await response.json()) as { data: { vehicle: TecdocVehicle } };
    return data.data?.vehicle ?? null;
  } catch (e) {
    console.warn(`   Network error for ${regnr}:`, (e as Error).message);
    return null;
  }
}

// ─── Catalog lookup ─────────────────────────────────────────────
function loadCatalog(): CatalogData {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  return JSON.parse(raw) as CatalogData;
}

function findPrefix4(catalog: CatalogData, vehicle: TecdocVehicle): { prefix4: string; confidence: number } | null {
  const records = catalog.records;

  // Try exact: brand + model + year
  const exact = records.filter((r) => {
    if (!r.brand || !r.model || !r.yearFrom) return false;
    const brandMatch = r.brand.toLowerCase() === vehicle.make.toLowerCase();
    const modelMatch = r.model.toLowerCase().includes(vehicle.model.toLowerCase()) ||
                       vehicle.model.toLowerCase().includes(r.model.toLowerCase());
    const yearMatch = r.yearFrom <= vehicle.year && (r.yearTo === null || r.yearTo >= vehicle.year);
    return brandMatch && modelMatch && yearMatch;
  });

  if (exact.length > 0) {
    const freq: Record<string, number> = {};
    for (const r of exact) freq[r.prefix4] = (freq[r.prefix4] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top) return { prefix4: top[0], confidence: 4 };
  }

  // Try brand + year (any model)
  const yearMatch = records.filter((r) => {
    if (!r.brand || !r.yearFrom) return false;
    const brandMatch = r.brand.toLowerCase() === vehicle.make.toLowerCase();
    const yearOk = r.yearFrom <= vehicle.year && (r.yearTo === null || r.yearTo >= vehicle.year);
    return brandMatch && yearOk;
  });

  if (yearMatch.length > 0) {
    const freq: Record<string, number> = {};
    for (const r of yearMatch) freq[r.prefix4] = (freq[r.prefix4] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top) return { prefix4: top[0], confidence: 2 };
  }

  // Try brand only
  const brandMatch = records.filter((r) =>
    r.brand?.toLowerCase() === vehicle.make.toLowerCase()
  );

  if (brandMatch.length > 0) {
    const freq: Record<string, number> = {};
    for (const r of brandMatch) freq[r.prefix4] = (freq[r.prefix4] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top) return { prefix4: top[0], confidence: 1 };
  }

  return null;
}

// ─── Sleep helper ───────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("🔧 Build kType → prefix4 Cache");
  console.log("===============================\n");

  if (!BILUPPGIFTER_API_KEY) {
    console.error("❌ Sett BILUPPGIFTER_API_KEY miljøvariabel");
    console.error("   export BILUPPGIFTER_API_KEY=your_key_here");
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Katalog ikke funnet: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = loadCatalog();
  console.log(`📄 Katalog: ${catalog.meta.totalRecords} records`);
  console.log(`🔍 Tester ${KNOWN_REGNR.length} kjente regnr...\n`);

  const entries: Record<number, KTypeEntry> = {};
  let success = 0;
  let notFound = 0;
  let noPrefix = 0;

  for (let i = 0; i < KNOWN_REGNR.length; i++) {
    const { regnr, note } = KNOWN_REGNR[i];
    process.stdout.write(`   [${i + 1}/${KNOWN_REGNR.length}] ${regnr} ... `);

    const vehicle = await fetchTecdoc(regnr);
    if (!vehicle) {
      notFound++;
      console.log("not found");
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const result = findPrefix4(catalog, vehicle);
    if (!result) {
      noPrefix++;
      console.log(`found ${vehicle.make} ${vehicle.model} ${vehicle.year} (kType=${vehicle.k_type}) → no prefix4`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    success++;
    console.log(`found ${vehicle.make} ${vehicle.model} ${vehicle.year} (kType=${vehicle.k_type}) → prefix4=${result.prefix4} (conf=${result.confidence})`);

    // Store by kType (overwrite only if higher confidence)
    const existing = entries[vehicle.k_type];
    if (!existing || result.confidence > existing.confidence) {
      entries[vehicle.k_type] = {
        kType: vehicle.k_type,
        prefix4: result.prefix4,
        brand: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        confidence: result.confidence,
        regnr,
        source: "biluppgitter.tecdoc",
      };
    }

    await sleep(RATE_LIMIT_MS);
  }

  const cache: KTypeCache = {
    version: "2.0",
    generatedAt: new Date().toISOString(),
    totalEntries: Object.keys(entries).length,
    entries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2));

  console.log("\n📊 Resultat:");
  console.log(`   Regnr slått opp:      ${KNOWN_REGNR.length}`);
  console.log(`   Kjøretøy funnet:      ${success + notFound + noPrefix - notFound} (${success + noPrefix})`);
  console.log(`   Kjøretøy ikke funnet: ${notFound}`);
  console.log(`   Ingen prefix4-match:  ${noPrefix}`);
  console.log(`   Unike kType entries:  ${cache.totalEntries}`);
  console.log(`\n💾 Lagret til: ${OUTPUT_PATH}`);

  // Show entries
  if (cache.totalEntries > 0) {
    console.log("\n📋 kType → prefix4 mapping:");
    Object.values(entries)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15)
      .forEach((e) => {
        console.log(`   kType=${e.kType} → ${e.prefix4} | ${e.brand} ${e.model} ${e.year} (conf=${e.confidence})`);
      });
  }
}

main().catch((e) => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
