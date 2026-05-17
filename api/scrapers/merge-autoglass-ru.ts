/**
 * Merge Autoglass.ru products into catalog-prod.json
 */
import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const AUTOGLASS_PATH = path.join(process.cwd(), "data", "scrapers", "autoglass-ru-products.json");

interface CatalogRecord {
  eurocode: string;
  brand: string;
  model: string;
  year_from?: number;
  year_to?: number;
  type: string;
  manufacturer?: string;
  features?: string[];
  oem?: string;
  [key: string]: any;
}

interface AutoglassProduct {
  eurocode: string;
  oem: string | null;
  glassType: string;
  manufacturer: string | null;
  features: string | null;
  make: string;
  model: string;
}

function normalizeMake(make: string): string {
  return make
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanManufacturer(mfr: string | null): string | undefined {
  if (!mfr) return undefined;
  // Remove Russian prefix "Производитель" and whitespace
  return mfr
    .replace(/Производитель/gi, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}

function main() {
  console.log("📖 Loading catalog...");
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const existingCodes = new Set(catalog.records.map((r: CatalogRecord) => r.eurocode));

  console.log("📥 Loading Autoglass.ru products...");
  const autoglass = JSON.parse(fs.readFileSync(AUTOGLASS_PATH, "utf-8"));
  const products: AutoglassProduct[] = autoglass.products;

  let added = 0;
  let skipped = 0;
  let updated = 0;

  for (const p of products) {
    if (existingCodes.has(p.eurocode)) {
      // Update existing record with manufacturer/OEM if missing
      const existing = catalog.records.find((r: CatalogRecord) => r.eurocode === p.eurocode);
      if (existing) {
        let changed = false;
        const cleanMfr = cleanManufacturer(p.manufacturer);
        if (!existing.manufacturer && cleanMfr) {
          existing.manufacturer = cleanMfr;
          changed = true;
        }
        if (!existing.oem && p.oem) {
          existing.oem = p.oem;
          changed = true;
        }
        if (changed) updated++;
      }
      skipped++;
      continue;
    }

    const record: CatalogRecord = {
      eurocode: p.eurocode,
      brand: normalizeMake(p.make),
      model: p.model || "",
      type: p.glassType,
      manufacturer: cleanManufacturer(p.manufacturer),
      oem: p.oem || undefined,
      features: p.features ? [p.features] : undefined,
      source: "autoglass.ru",
    };

    catalog.records.push(record);
    existingCodes.add(p.eurocode);
    added++;
  }

  catalog.meta.version = new Date().toISOString();
  catalog.meta.totalRecords = catalog.records.length;
  catalog.meta.sources = [...new Set([...(catalog.meta.sources || []), "Autoglass.ru"])];

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));

  console.log(`\n✅ Merge complete:`);
  console.log(`   Added: ${added} new records`);
  console.log(`   Skipped (duplicates): ${skipped}`);
  console.log(`   Updated (manufacturer/OEM): ${updated}`);
  console.log(`   Total catalog: ${catalog.records.length} records`);
}

main();
