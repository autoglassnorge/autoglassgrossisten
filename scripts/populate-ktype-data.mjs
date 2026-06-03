#!/usr/bin/env node
/**
 * Populerer ktype_registry og oppdaterer glass_catalog med ktype data
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "catalog-prod.json");
const KTYPE_MAPPING_PATH = path.join(process.cwd(), "data", "tecdoc-import", "tecdoc-ktype-mapping.json");

function normalizeBrand(brand) {
  if (!brand) return "";
  return brand.toUpperCase().trim();
}

function normalizeModel(model) {
  if (!model) return "";
  // Fjern parenteser og alt innhold
  return model.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
}

function main() {
  console.log("🔄 Populerer ktype data...\n");

  // Les katalog
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = catalogData.records || [];
  
  // Les ktype mapping
  const ktypeMappings = JSON.parse(fs.readFileSync(KTYPE_MAPPING_PATH, "utf-8"));
  console.log(`📊 Katalog: ${records.length} produkter`);
  console.log(`📊 kType mappings: ${ktypeMappings.length} entries`);

  // Bygg lookup-tabell: brand -> model -> year -> ktype
  const lookup = {};
  for (const km of ktypeMappings) {
    const brand = normalizeBrand(km.brand);
    const model = normalizeModel(km.model);
    const yearFrom = km.year_from || 0;
    const yearTo = km.year_to || 9999;
    
    if (!lookup[brand]) lookup[brand] = {};
    if (!lookup[brand][model]) lookup[brand][model] = [];
    
    lookup[brand][model].push({
      ktype: km.ktype,
      yearFrom,
      yearTo,
      originalModel: km.model
    });
  }
  console.log(`✅ Lookup-tabell bygget\n`);

  // Match produkter
  let matched = 0;
  let unmatched = 0;
  const updates = [];

  for (const record of records) {
    const brand = normalizeBrand(record.brand);
    const model = normalizeModel(record.model);
    const yearFrom = record.yearFrom || 0;
    const yearTo = record.yearTo || 9999;
    
    let bestKtype = null;
    let bestScore = 0;
    
    // Sjekk eksakt match
    if (lookup[brand] && lookup[brand][model]) {
      for (const entry of lookup[brand][model]) {
        // Sjekk årsoverlapp
        const yearOverlap = Math.max(0, Math.min(yearTo, entry.yearTo) - Math.max(yearFrom, entry.yearFrom));
        if (yearOverlap > bestScore) {
          bestScore = yearOverlap;
          bestKtype = entry.ktype;
        }
      }
    }
    
    // Prøv fuzzy match på model
    if (!bestKtype && lookup[brand]) {
      for (const [lookupModel, entries] of Object.entries(lookup[brand])) {
        // Sjekk om lookupModel inneholder model eller vice versa
        if (lookupModel.includes(model) || model.includes(lookupModel)) {
          for (const entry of entries) {
            const yearOverlap = Math.max(0, Math.min(yearTo, entry.yearTo) - Math.max(yearFrom, entry.yearFrom));
            if (yearOverlap > bestScore) {
              bestScore = yearOverlap;
              bestKtype = entry.ktype;
            }
          }
        }
      }
    }
    
    if (bestKtype) {
      matched++;
      updates.push({
        eurocode: record.eurocode,
        ktype: bestKtype
      });
    } else {
      unmatched++;
    }
  }

  console.log(`✅ Matched: ${matched} produkter`);
  console.log(`❌ Unmatched: ${unmatched} produkter`);
  console.log(`📈 Match rate: ${(matched / records.length * 100).toFixed(1)}%\n`);

  // Generer SQL for oppdatering
  let sql = "-- Oppdater glass_catalog med ktype verdier\n";
  sql += "PRAGMA foreign_keys=OFF;\n\n";
  
  for (const update of updates) {
    if (!update.eurocode) continue;
    sql += `UPDATE glass_catalog SET ktype = ${update.ktype} WHERE eurocode = '${update.eurocode.replace(/'/g, "''")}';\n`;
  }
  
  sql += "\nPRAGMA foreign_keys=ON;\n";
  
  const outputPath = "/tmp/update-ktypes.sql";
  fs.writeFileSync(outputPath, sql);
  console.log(`✅ SQL lagret til: ${outputPath}`);
  console.log(`   Rader: ${updates.length}`);
  console.log(`   Størrelse: ${(sql.length / 1024).toFixed(2)} KB`);
}

main();
