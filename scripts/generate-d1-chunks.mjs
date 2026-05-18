#!/usr/bin/env node
/**
 * Generate D1 SQL chunks from catalog-prod-v2.json
 * Each chunk is a self-contained INSERT statement
 */
import { readFileSync, writeFileSync } from "fs";

const CATALOG = "/Users/taj/bilglass/data/catalog-prod-v2.json";
const OUT_DIR = "/tmp";
const CHUNK_SIZE = 500; // rows per INSERT statement

const data = JSON.parse(readFileSync(CATALOG, "utf-8"));
const records = data.records;

const COLUMNS = [
  "eurocode", "article_number", "scan_number", "category", "supplier", "brand",
  "model", "year_from", "year_to", "adas", "rain_sensor", "heated", "acoustic",
  "antenna", "hud", "shade", "camera", "lane_assist", "price", "stock_status",
  "warehouse_location", "oem_numbers", "cross_references", "weight", "dimensions",
  "description", "prefix4", "image_url", "pdf_url", "source", "nags_codes", "brand_original"
];

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "1" : "0";
  if (Array.isArray(val)) return escapeSql(JSON.stringify(val));
  if (typeof val === "object") return escapeSql(JSON.stringify(val));
  const s = String(val).replace(/'/g, "''").replace(/\0/g, "");
  return `'${s}'`;
}

function recordToValues(r) {
  const vals = COLUMNS.map((col) => {
    // Map JSON field names to potential variations
    const v = r[col] ?? r[col.replace(/_/g, "")] ?? r[col.replace(/_/g, "-")] ?? null;
    return escapeSql(v);
  });
  return `  (${vals.join(", ")})`;
}

const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
console.log(`Generating ${totalChunks} chunks for ${records.length} records...`);

const header = `INSERT INTO glass_catalog (${COLUMNS.join(", ")}) VALUES`;

for (let i = 0; i < totalChunks; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, records.length);
  const chunk = records.slice(start, end);

  const lines = chunk.map((r, idx) => {
    const suffix = idx === chunk.length - 1 ? ";" : ",";
    return recordToValues(r) + suffix;
  });

  const sql = `-- Chunk ${String(i).padStart(3, "0")}: rows ${start + 1}-${end}\n${header}\n${lines.join("\n")}\n`;
  const path = `${OUT_DIR}/d1-chunk-fixed-${String(i).padStart(3, "0")}.sql`;
  writeFileSync(path, sql);
  console.log(`  ${path}: ${chunk.length} rows`);
}

// Add meta insert as last file
const metaSql = `INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES ('total_records', '${records.length}', datetime('now'));`;
writeFileSync(`${OUT_DIR}/d1-chunk-fixed-meta.sql`, metaSql);
console.log(`  ${OUT_DIR}/d1-chunk-fixed-meta.sql: metadata`);
console.log("Done!");
