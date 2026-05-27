/**
 * Migrate catalog-prod.json → Cloudflare D1 SQL
 * ==============================================
 * Genererer en SQL-fil med INSERTs som kan kjøres via wrangler CLI.
 *
 * Steg 1: Generer SQL
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-to-d1.ts
 *
 * Steg 2: Opprett D1-database (hvis ikke eksisterer)
 *   npx wrangler d1 create glass-catalog-db
 *
 * Steg 3: Kjør schema
 *   cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --file=schema.sql
 *
 * Steg 4: Kjør inserts
 *   cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --file=generated-inserts.sql
 *
 * Steg 5: Verifiser
 *   npx wrangler d1 execute glass-catalog-db --command="SELECT COUNT(*) FROM glass_catalog"
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const CACHE_PATH = path.join(process.cwd(), "data", "ktype-prefix4-cache.json");
const OUTPUT_SQL = path.join(__dirname, "../generated-inserts.sql");

const BATCH_SIZE = 100; // D1 limit ~100 parametre per query

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
  adasFeatures?: string[];
  price: number | null;
  stockStatus: number;
  warehouseLocation: string | null;
  oemNumbers: string[];
  crossReferences: string[];
  nagsCodes: string[];
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
}

function escapeSql(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function recordToValues(r: GlassRecord): string {
  const d = r.dimensions || {};
  return [
    escapeSql(r.eurocode),
    escapeSql(r.articleNumber),
    escapeSql(r.scanNumber),
    escapeSql(r.category),
    escapeSql(r.supplier),
    escapeSql(r.brand),
    escapeSql(r.model),
    escapeSql(r.yearFrom),
    escapeSql(r.yearTo),
    escapeSql(r.adas),
    escapeSql(r.rainSensor),
    escapeSql(r.heated),
    escapeSql(r.acoustic),
    escapeSql(r.antenna),
    escapeSql(r.hud),
    escapeSql(r.shade),
    escapeSql(r.camera),
    escapeSql(r.laneAssist),
    escapeSql(r.adasFeatures ? JSON.stringify(r.adasFeatures) : null),
    escapeSql(r.price),
    escapeSql(r.stockStatus),
    escapeSql(JSON.stringify(r.oemNumbers || [])),
    escapeSql(JSON.stringify(r.crossReferences || [])),
    escapeSql(JSON.stringify(r.nagsCodes || [])),
    escapeSql(r.weight),
    escapeSql(d.width),
    escapeSql(d.height),
    escapeSql(d.thickness),
    escapeSql(r.description),
    escapeSql(r.prefix4),
    escapeSql(r.imageUrl),
    escapeSql(r.pdfUrl),
    escapeSql(r.source),
    escapeSql(r.lastUpdated),
  ].join(", ");
}

function main() {
  console.log("🔀 Migrate catalog-prod.json → D1 SQL");
  console.log("=====================================\n");

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Katalog ikke funnet: ${CATALOG_PATH}`);
    console.error("   Kjør først: npm run merge");
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records: GlassRecord[] = catalog.records;
  console.log(`📂 ${records.length.toLocaleString()} records å migrere`);

  const lines: string[] = [];
  lines.push("-- Auto-generert av migrate-to-d1.ts");
  lines.push(`-- Kildedata: ${catalog.meta.version || catalog.meta.mergedAt}`);
  lines.push("--");
  lines.push("BEGIN TRANSACTION;");
  lines.push("");

  // Insert glass_catalog i batcher
  const columns = [
    "eurocode", "article_number", "scan_number", "category", "supplier",
    "brand", "model", "year_from", "year_to", "adas", "rain_sensor",
    "heated", "acoustic", "antenna", "hud", "shade", "camera", "lane_assist",
    "price", "stock_status", "warehouse_location", "adas_features", "oem_numbers",
    "cross_references", "nags_codes", "weight", "width", "height",
    "thickness", "description", "prefix4", "image_url", "pdf_url",
    "source", "last_updated",
  ].join(", ");

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const values = batch.map(recordToValues).join("),\n(");
    lines.push(`INSERT INTO glass_catalog (${columns}) VALUES`);
    lines.push(`(${values});`);
    lines.push("");
    process.stdout.write(`\r   SQL generert: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
  }
  console.log();

  // Insert prefix4-cache hvis den finnes
  if (fs.existsSync(CACHE_PATH)) {
    console.log("\n📂 Migrerer prefix4-cache...");
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    const entries = cache.entries || {};
    let cacheCount = 0;

    for (const [key, items] of Object.entries(entries) as [string, Array<{ prefix4: string; confidence: number }>][]) {
      for (const item of items) {
        lines.push(`INSERT OR IGNORE INTO prefix4_cache (cache_key, prefix4, confidence) VALUES (${escapeSql(key)}, ${escapeSql(item.prefix4)}, ${escapeSql(item.confidence)});`);
        cacheCount++;
      }
    }
    console.log(`   ${cacheCount} cache-entries`);
  }

  lines.push("");
  lines.push("COMMIT;");

  fs.writeFileSync(OUTPUT_SQL, lines.join("\n"));

  const sizeMB = (fs.statSync(OUTPUT_SQL).size / 1024 / 1024).toFixed(2);
  console.log(`\n💾 SQL-fil lagret: ${OUTPUT_SQL}`);
  console.log(`   Størrelse: ${sizeMB} MB`);
  console.log(`   Batcher: ${Math.ceil(records.length / BATCH_SIZE)}`);
  console.log("\n🚀 Neste steg:");
  console.log("   1. npx wrangler d1 create glass-catalog-db");
  console.log("   2. cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --file=schema.sql");
  console.log("   3. cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --file=generated-inserts.sql");
}

main();
