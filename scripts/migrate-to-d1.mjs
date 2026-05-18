#!/usr/bin/env node
/**
 * Migrerer catalog-prod-v2.json til D1 database
 * Kjøres med: node scripts/migrate-to-d1.mjs
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod-v2.json");
const BATCH_SIZE = 100; // D1 limit is around 100 params per query
const OUTPUT_SQL = "/tmp/d1-insert.sql";

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function main() {
  console.log("🔌 Migrerer katalog til D1...\n");
  
  const data = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = data.records || [];
  console.log(`Totalt: ${records.length.toLocaleString("nb-NO")} poster`);
  
  let sql = "-- D1 Migration: glass_catalog\n";
  sql += "PRAGMA foreign_keys=OFF;\n";
  sql += "BEGIN TRANSACTION;\n\n";
  
  let batchCount = 0;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    sql += `INSERT INTO glass_catalog (eurocode, article_number, scan_number, category, supplier, brand, model, year_from, year_to, adas, rain_sensor, heated, acoustic, antenna, hud, shade, camera, lane_assist, price, stock_status, warehouse_location, oem_numbers, cross_references, weight, dimensions, description, prefix4, image_url, pdf_url, source, nags_codes, brand_original) VALUES\n`;
    
    const values = batch.map((r, idx) => {
      const dims = r.dimensions ? JSON.stringify(r.dimensions) : null;
      const oem = Array.isArray(r.oemNumbers) ? JSON.stringify(r.oemNumbers) : null;
      const cross = Array.isArray(r.crossReferences) ? JSON.stringify(r.crossReferences) : null;
      const nags = Array.isArray(r.nagsCodes) ? JSON.stringify(r.nagsCodes) : null;
      
      return `  (${escapeSql(r.eurocode)}, ${escapeSql(r.articleNumber)}, ${escapeSql(r.scanNumber)}, ${escapeSql(r.category)}, ${escapeSql(r.supplier)}, ${escapeSql(r.brand)}, ${escapeSql(r.model)}, ${r.yearFrom || "NULL"}, ${r.yearTo || "NULL"}, ${r.adas ? 1 : 0}, ${r.rainSensor ? 1 : 0}, ${r.heated ? 1 : 0}, ${r.acoustic ? 1 : 0}, ${r.antenna ? 1 : 0}, ${r.hud ? 1 : 0}, ${r.shade ? 1 : 0}, ${r.camera ? 1 : 0}, ${r.laneAssist ? 1 : 0}, ${r.price || "NULL"}, ${r.stockStatus || 0}, ${escapeSql(r.warehouseLocation)}, ${escapeSql(oem)}, ${escapeSql(cross)}, ${r.weight || "NULL"}, ${escapeSql(dims)}, ${escapeSql(r.description)}, ${escapeSql(r.prefix4)}, ${escapeSql(r.imageUrl)}, ${escapeSql(r.pdfUrl)}, ${escapeSql(r.source)}, ${escapeSql(nags)}, ${escapeSql(r.brandOriginal || r.brand)})`;
    }).join(",\n");
    
    sql += values + ";\n\n";
    batchCount++;
    
    if (batchCount % 10 === 0) {
      console.log(`  Batch ${batchCount}: ${Math.min((batchCount * BATCH_SIZE), records.length).toLocaleString("nb-NO")} / ${records.length.toLocaleString("nb-NO")}`);
    }
  }
  
  sql += "COMMIT;\n";
  sql += `INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES ('total_records', '${records.length}', datetime('now'));\n`;
  
  fs.writeFileSync(OUTPUT_SQL, sql);
  console.log(`\n✅ SQL lagret til ${OUTPUT_SQL}`);
  console.log(`   Batcher: ${batchCount}`);
  console.log(`   SQL-størrelse: ${(fs.statSync(OUTPUT_SQL).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\n   Neste steg: npx wrangler d1 execute glass-catalog-db --file=${OUTPUT_SQL}`);
}

main();
