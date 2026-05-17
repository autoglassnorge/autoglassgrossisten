/**
 * Merge Euroglass.ru products into catalog-prod.json
 */
import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const EUROGLASS_PATH = path.join(process.cwd(), "data", "scrapers", "euroglass-ru-products-filtered.json");

interface CatalogRecord {
  eurocode: string;
  brand: string;
  model: string;
  year_from?: number;
  year_to?: number;
  type: string;
  manufacturer?: string;
  features?: string[];
  [key: string]: any;
}

interface EuroglassProduct {
  eurocode: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  glassType: string;
  brand: string;
  features: Record<string, string>;
  name: string;
}

function normalizeMake(make: string): string {
  return make
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  console.log("📖 Loading catalog...");
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const existingCodes = new Set(catalog.records.map((r: CatalogRecord) => r.eurocode));

  console.log("📥 Loading Euroglass.ru products...");
  const euroglass = JSON.parse(fs.readFileSync(EUROGLASS_PATH, "utf-8"));
  const products: EuroglassProduct[] = euroglass.products;

  let added = 0;
  let skipped = 0;
  let updated = 0;

  for (const p of products) {
    if (existingCodes.has(p.eurocode)) {
      // Update existing record with manufacturer if missing
      const existing = catalog.records.find((r: CatalogRecord) => r.eurocode === p.eurocode);
      if (existing && !existing.manufacturer && p.brand) {
        existing.manufacturer = p.brand;
        updated++;
      }
      skipped++;
      continue;
    }

    const record: CatalogRecord = {
      eurocode: p.eurocode,
      brand: normalizeMake(p.make),
      model: p.model,
      year_from: p.yearFrom || undefined,
      year_to: p.yearTo || undefined,
      type: p.glassType,
      manufacturer: p.brand || undefined,
      features: Object.entries(p.features)
        .filter(([k]) => k !== "Eurocode")
        .map(([k, v]) => `${k}: ${v}`),
      name: p.name,
      source: "euroglass.ru",
    };

    catalog.records.push(record);
    existingCodes.add(p.eurocode);
    added++;
  }

  catalog.meta.version = new Date().toISOString();
  catalog.meta.totalRecords = catalog.records.length;
  catalog.meta.sources = [...new Set([...(catalog.meta.sources || []), "Euroglass.ru"])];

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

  console.log(`\n✅ Merge complete:`);
  console.log(`   Added: ${added} new records`);
  console.log(`   Skipped (duplicates): ${skipped}`);
  console.log(`   Updated (manufacturer): ${updated}`);
  console.log(`   Total catalog: ${catalog.records.length} records`);
}

main();
