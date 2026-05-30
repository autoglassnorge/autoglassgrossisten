#!/usr/bin/env node
/**
 * Build master catalog from auto-glass.no CSV — 1:1 match
 * Each CSV row becomes a catalog record with supplier_sku as primary identifier.
 * Eurocodes are kept where available but are no longer the primary key.
 */
import { readFileSync, writeFileSync } from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';

const CSV_FILE = './data/autoglass-scrape/products-autoglass-no.csv';
const OUTPUT_JSON = './data/catalog-autoglass-master.json';
const OUTPUT_SQL = '/tmp/d1-autoglass-master.sql';

const skuRegex = /^\d{4}[A-Z]{2,}[A-Z0-9]*$/;

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function parseYear(str) {
  const m = String(str).match(/\d{4}/);
  return m ? parseInt(m[0]) : null;
}

function extractEurocodeFromSku(sku) {
  // If SKU is eurocode format, use it as eurocode
  if (skuRegex.test(sku)) return sku;
  // Otherwise no eurocode
  return null;
}

function mapGlassType(typeCodeDesc) {
  if (!typeCodeDesc) return 'annet';
  const t = typeCodeDesc.toLowerCase();
  if (t.includes('frontrute')) return 'frontrute';
  if (t.includes('bakrute')) return 'bakrute';
  if (t.includes('dørrute')) return 'dørglass';
  if (t.includes('siderute') || t.includes('ventil')) return 'sideglass';
  return 'annet';
}

function main() {
  console.log('🔨 Building auto-glass.no master catalog (1:1)...');

  const csvRecords = parseCsv(readFileSync(CSV_FILE, 'utf-8'), { columns: true, skip_empty_lines: true });
  console.log(`   CSV rows: ${csvRecords.length.toLocaleString()}`);

  const records = [];
  let id = 1;

  for (const row of csvRecords) {
    const sku = row.sku?.trim().toUpperCase();
    const title = row.title?.trim();
    const brand = row.brand?.trim().toUpperCase();
    const model = row.model?.trim().toUpperCase();
    const submodel = row.submodel?.trim() || null;
    const yearFrom = parseYear(row.year_start);
    const yearTo = parseYear(row.year_end);
    const typeCode = row.type_code?.trim() || null;
    const typeDesc = row.type_code_desc?.trim() || null;
    const price = parseFloat(row.price?.replace(/[\s,]/g, '').replace(',', '.')) || null;
    const sourceUrl = row.source_url?.trim() || null;
    const eurocode = extractEurocodeFromSku(sku);

    records.push({
      id,
      supplier_sku: sku,
      eurocode,
      article_number: sku,
      category: mapGlassType(typeDesc),
      supplier: 'auto-glass.no',
      brand,
      model,
      submodel,
      year_from: yearFrom,
      year_to: yearTo,
      type_code: typeCode,
      type_description: typeDesc,
      price,
      description: title,
      source_url: sourceUrl,
      source: 'auto-glass.no',
      created_at: new Date().toISOString(),
    });
    id++;
  }

  // Build JSON catalog
  const catalog = {
    meta: {
      name: 'Autoglass AS — auto-glass.no Master Catalog',
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      uniqueSkus: new Set(records.map(r => r.supplier_sku)).size,
      withEurocode: records.filter(r => r.eurocode).length,
      withoutEurocode: records.filter(r => !r.eurocode).length,
      sources: ['auto-glass.no'],
      categories: {},
    },
    records,
  };

  for (const r of records) {
    catalog.meta.categories[r.category] = (catalog.meta.categories[r.category] || 0) + 1;
  }

  writeFileSync(OUTPUT_JSON, JSON.stringify(catalog, null, 2));
  console.log(`   JSON saved: ${OUTPUT_JSON}`);
  console.log(`   Records: ${records.length.toLocaleString()}`);
  console.log(`   Unique SKUs: ${catalog.meta.uniqueSkus.toLocaleString()}`);
  console.log(`   With eurocode: ${catalog.meta.withEurocode.toLocaleString()}`);
  console.log(`   Without eurocode: ${catalog.meta.withoutEurocode.toLocaleString()}`);

  // Build SQL for D1
  let sql = `-- auto-glass.no master catalog migration
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS glass_catalog;

CREATE TABLE glass_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_sku TEXT NOT NULL,
  eurocode TEXT,
  article_number TEXT,
  category TEXT,
  supplier TEXT,
  brand TEXT,
  model TEXT,
  submodel TEXT,
  year_from INTEGER,
  year_to INTEGER,
  type_code TEXT,
  type_description TEXT,
  price REAL,
  stock_status INTEGER DEFAULT 1,
  description TEXT,
  prefix4 TEXT,
  source_url TEXT,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_brand ON glass_catalog(brand);
CREATE INDEX idx_category ON glass_catalog(category);
CREATE INDEX idx_supplier_sku ON glass_catalog(supplier_sku);
CREATE INDEX idx_eurocode ON glass_catalog(eurocode);
CREATE INDEX idx_year_from ON glass_catalog(year_from);
CREATE INDEX idx_year_to ON glass_catalog(year_to);

`;

  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    sql += `INSERT INTO glass_catalog (supplier_sku, eurocode, article_number, category, supplier, brand, model, submodel, year_from, year_to, type_code, type_description, price, description, source_url, source) VALUES\n`;
    const values = batch.map(r => {
      return `(${escapeSql(r.supplier_sku)}, ${escapeSql(r.eurocode)}, ${escapeSql(r.article_number)}, ${escapeSql(r.category)}, ${escapeSql(r.supplier)}, ${escapeSql(r.brand)}, ${escapeSql(r.model)}, ${escapeSql(r.submodel)}, ${r.year_from || 'NULL'}, ${r.year_to || 'NULL'}, ${escapeSql(r.type_code)}, ${escapeSql(r.type_description)}, ${r.price || 'NULL'}, ${escapeSql(r.description)}, ${escapeSql(r.source_url)}, ${escapeSql(r.source)})`;
    }).join(',\n');
    sql += values + ';\n';
  }

  writeFileSync(OUTPUT_SQL, sql);
  console.log(`   SQL saved: ${OUTPUT_SQL}`);
  console.log(`   SQL size: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);
}

main();
