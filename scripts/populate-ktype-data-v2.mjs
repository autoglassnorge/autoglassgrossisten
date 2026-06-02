#!/usr/bin/env node
/**
 * Populerer ktype_registry og oppdaterer glass_catalog med ktype data
 * V2: Strengere matching med årsvalidering
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
  return model.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
}

function extractYearFromDescription(desc) {
  // Prøv å finne år fra beskrivelse (f.eks. "88-95" eller "2008-2012")
  if (!desc) return { from: 0, to: 9999 };
  
  // Mønster: 88-95, 2008-2012, 08-12
  const match = desc.match(/(\d{2,4})\s*-\s*(\d{2,4})/);
  if (match) {
    let from = parseInt(match[1]);
    let to = parseInt(match[2]);
    
    // Konverter 2-sifret til 4-sifret år
    if (from < 50) from += 2000;
    else if (from < 100) from += 1900;
    
    if (to < 50) to += 2000;
    else if (to < 100) to += 1900;
    
    return { from, to };
  }
  
  // Mønster: bare ett år
  const singleMatch = desc.match(/\b(19\d{2}|20\d{2})\b/);
  if (singleMatch) {
    const year = parseInt(singleMatch[1]);
    return { from: year, to: year + 5 };
  }
  
  return { from: 0, to: 9999 };
}

function hasYearOverlap(prodYears, ktypeYears) {
  // Krever minst 1 års overlapp
  const overlap = Math.max(0, 
    Math.min(prodYears.to, ktypeYears.to) - Math.max(prodYears.from, ktypeYears.from)
  );
  return overlap >= 1;
}

function main() {
  console.log("🔄 Populerer ktype data (V2 - streng årsvalidering)...\n");

  // Les katalog
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = catalogData.records || [];
  
  // Les ktype mapping
  const ktypeMappings = JSON.parse(fs.readFileSync(KTYPE_MAPPING_PATH, "utf-8"));
  console.log(`📊 Katalog: ${records.length} produkter`);
  console.log(`📊 kType mappings: ${ktypeMappings.length} entries`);

  // Bygg lookup-tabell
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

  // Match produkter med streng årsvalidering
  let matched = 0;
  let unmatched = 0;
  let yearMismatch = 0;
  const updates = [];

  for (const record of records) {
    const brand = normalizeBrand(record.brand);
    const model = normalizeModel(record.model);
    
    // Hent år fra produkt
    let prodYearFrom = record.yearFrom || 0;
    let prodYearTo = record.yearTo || 9999;
    
    // Hvis ikke definert, prøv å hente fra beskrivelse
    if (prodYearFrom === 0 && prodYearTo === 9999) {
      const extracted = extractYearFromDescription(record.description);
      prodYearFrom = extracted.from;
      prodYearTo = extracted.to;
    }
    
    let bestKtype = null;
    let bestOverlap = 0;
    let matchDetails = null;
    
    // Sjekk eksakt match på brand + model
    if (lookup[brand] && lookup[brand][model]) {
      for (const entry of lookup[brand][model]) {
        const ktypeYears = { from: entry.yearFrom, to: entry.yearTo };
        const prodYears = { from: prodYearFrom, to: prodYearTo };
        
        if (hasYearOverlap(prodYears, ktypeYears)) {
          const overlap = Math.min(prodYears.to, ktypeYears.to) - Math.max(prodYears.from, ktypeYears.from);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestKtype = entry.ktype;
            matchDetails = { ktypeYears, prodYears, overlap };
          }
        }
      }
    }
    
    // Prøv fuzzy match på model hvis ingen eksakt match
    if (!bestKtype && lookup[brand]) {
      for (const [lookupModel, entries] of Object.entries(lookup[brand])) {
        if (lookupModel.includes(model) || model.includes(lookupModel)) {
          for (const entry of entries) {
            const ktypeYears = { from: entry.yearFrom, to: entry.yearTo };
            const prodYears = { from: prodYearFrom, to: prodYearTo };
            
            if (hasYearOverlap(prodYears, ktypeYears)) {
              const overlap = Math.min(prodYears.to, ktypeYears.to) - Math.max(prodYears.from, ktypeYears.from);
              if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestKtype = entry.ktype;
                matchDetails = { ktypeYears, prodYears, overlap, fuzzy: true };
              }
            }
          }
        }
      }
    }
    
    if (bestKtype) {
      matched++;
      updates.push({
        eurocode: record.eurocode,
        ktype: bestKtype,
        details: matchDetails
      });
    } else {
      // Sjekk om det var brand/model match men år feil
      let foundBrandModel = false;
      if (lookup[brand] && lookup[brand][model]) {
        foundBrandModel = true;
      }
      if (foundBrandModel) {
        yearMismatch++;
      }
      unmatched++;
    }
  }

  console.log(`✅ Matched (med årsoverlapp): ${matched} produkter`);
  console.log(`⚠️  Brand/model match men feil år: ${yearMismatch} produkter`);
  console.log(`❌ Ingen match: ${unmatched} produkter`);
  console.log(`📈 Match rate: ${(matched / records.length * 100).toFixed(1)}%\n`);

  // Vis noen eksempler
  console.log("📋 Eksempel på korrekte matches:");
  for (let i = 0; i < Math.min(5, updates.length); i++) {
    const u = updates[i];
    const prod = records.find(r => r.eurocode === u.eurocode);
    console.log(`  ${u.eurocode}: kType ${u.ktype} (${u.details?.overlap} år overlapp)`);
    console.log(`    "${prod?.description?.substring(0, 50)}..."`);
  }

  // Generer SQL for oppdatering
  let sql = "-- Oppdater glass_catalog med ktype verdier (V2 - streng årsvalidering)\n";
  sql += "PRAGMA foreign_keys=OFF;\n\n";
  sql += "-- Først nullstill eksisterende ktype\n";
  sql += "UPDATE glass_catalog SET ktype = NULL;\n\n";
  
  for (const update of updates) {
    if (!update.eurocode) continue;
    sql += `UPDATE glass_catalog SET ktype = ${update.ktype} WHERE eurocode = '${update.eurocode.replace(/'/g, "''")}';\n`;
  }
  
  sql += "\nPRAGMA foreign_keys=ON;\n";
  
  const outputPath = "/tmp/update-ktypes-v2.sql";
  fs.writeFileSync(outputPath, sql);
  console.log(`\n✅ SQL lagret til: ${outputPath}`);
  console.log(`   Rader: ${updates.length}`);
  console.log(`   Størrelse: ${(sql.length / 1024).toFixed(2)} KB`);
}

main();
