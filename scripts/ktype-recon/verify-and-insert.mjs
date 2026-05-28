#!/usr/bin/env node
/**
 * Fase 4: Verifisering + D1 Auto-Insert
 * =======================================
 * Kryssjekker kType-funn mot glass_catalog og genererer SQL for D1-insert.
 *
 * Scoring:
 *   exact (≥80)   → auto-generer INSERT
 *   probable (≥50) → generer INSERT med confidence=medium
 *   weak (<50)     → forkast
 *
 * Usage:
 *   node verify-and-insert.mjs --ktype 17370 --brand VW --model Transporter --year 2005
 *   node verify-and-insert.mjs --file <findings.ndjson> --out <inserts.sql>
 *   node verify-and-insert.mjs --file <findings.ndjson> --execute  # Kjør direkte mot D1
 */

import { readFileSync, writeFileSync } from "fs";

function loadCatalog(path) {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data) ? data : data.records || [];
}

function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const map = {
    VOLKSWAGEN: "VW", "VW TRUCKS": "VW", "VW": "VW",
    "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
    "LAND ROVER": "LANDROVER",
  };
  return map[b] || b;
}

function verifyFinding(finding, catalog) {
  const { ktype, brand, model, yearFrom, yearTo, body, source } = finding;
  const normBrand = normalizeBrand(brand);

  // Find catalog matches
  const matches = [];
  for (const r of catalog) {
    const rBrand = normalizeBrand(r.brand);
    const brandMatch = rBrand === normBrand;
    const modelMatch = model && r.model && (
      r.model.toLowerCase().includes(model.toLowerCase()) ||
      model.toLowerCase().includes(r.model.toLowerCase()) ||
      r.model.toLowerCase().replace(/[^a-z0-9]/g, "").includes(model.toLowerCase().replace(/[^a-z0-9]/g, ""))
    );
    const yearMatch = yearFrom && r.year_from && r.year_to &&
      yearFrom >= r.year_from && (yearTo ? yearTo <= r.year_to : true);

    if (brandMatch || modelMatch) {
      matches.push({ eurocode: r.eurocode, brand: r.brand, model: r.model, yearFrom: r.year_from, yearTo: r.year_to, category: r.category, brandMatch, modelMatch, yearMatch });
    }
  }

  // Score
  let score = 0;
  const reasons = [];
  const best = matches[0];

  if (best) {
    if (best.brandMatch) { score += 25; reasons.push("Brand matcher katalog"); }
    if (best.modelMatch) { score += 25; reasons.push("Modell matcher katalog"); }
    if (best.yearMatch) { score += 25; reasons.push("Årsmodell matcher katalog"); }
  }

  if (ktype) {
    const ktypeMatches = catalog.filter(r => r.ktype === ktype);
    if (ktypeMatches.length > 0) {
      score += 10;
      reasons.push(`kType ${ktype} finnes i ${ktypeMatches.length} produkter`);
    }
  }

  // Additional signals
  if (body) { score += 5; reasons.push("Body-type spesifisert"); }
  if (source === "biluppgitter" || source === "bovsoft") { score += 10; reasons.push("Kilde er autoritativ"); }

  let confidence;
  if (score >= 80) confidence = "exact";
  else if (score >= 50) confidence = "probable";
  else if (score >= 25) confidence = "possible";
  else confidence = "weak";

  return {
    finding,
    verification: {
      score,
      confidence,
      reasons,
      catalogMatches: matches.slice(0, 5),
      shouldInsert: confidence === "exact" || confidence === "probable",
    },
  };
}

function generateSql(verified) {
  const { ktype, brand, model, yearFrom, yearTo, body, source } = verified.finding;
  const { confidence } = verified.verification;
  return `INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, confidence, created_at) VALUES (${ktype}, '${(brand || "").replace(/'/g, "''")}', '${(model || "").replace(/'/g, "''")}', ${yearFrom || "NULL"}, ${yearTo || "NULL"}, '${(body || "").replace(/'/g, "''")}', '${source || "osint"}', '${confidence}', datetime('now')) ON CONFLICT DO NOTHING;`;
}

// === CLI ===
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const catalogPath = getArg("--catalog") || "data/catalog-prod.json";
  const catalog = loadCatalog(catalogPath);

  const ktype = getArg("--ktype");
  const brand = getArg("--brand");
  const model = getArg("--model");
  const yearFrom = getArg("--year-from") ? parseInt(getArg("--year-from"), 10) : (getArg("--year") ? parseInt(getArg("--year"), 10) : undefined);
  const yearTo = getArg("--year-to") ? parseInt(getArg("--year-to"), 10) : undefined;
  const body = getArg("--body");
  const source = getArg("--source") || "osint";

  // Single finding
  if (ktype) {
    const finding = { ktype: parseInt(ktype, 10), brand, model, yearFrom, yearTo, body, source };
    const result = verifyFinding(finding, catalog);
    console.log(JSON.stringify(result, null, 2));
    if (result.verification.shouldInsert) {
      console.log("\n-- SQL INSERT --");
      console.log(generateSql(result));
    }
    return;
  }

  // Batch mode
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    const outIdx = args.indexOf("--out");
    const outFile = outIdx >= 0 ? args[outIdx + 1] : file.replace(/\.ndjson$/, "-verified.ndjson");
    const sqlFile = outFile.replace(/\.ndjson$/, "-inserts.sql");

    const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
    const findings = lines.map(l => JSON.parse(l));

    console.log(`🔍 Verifiserer ${findings.length} kType-funn mot katalog...`);
    const verified = [];
    const inserts = [];
    let exact = 0, probable = 0, possible = 0, weak = 0;

    for (const f of findings) {
      const result = verifyFinding(f, catalog);
      verified.push(result);
      if (result.verification.confidence === "exact") exact++;
      else if (result.verification.confidence === "probable") probable++;
      else if (result.verification.confidence === "possible") possible++;
      else weak++;

      if (result.verification.shouldInsert) {
        inserts.push(generateSql(result));
      }
    }

    // Write verified NDJSON
    writeFileSync(outFile, verified.map(r => JSON.stringify(r)).join("\n") + "\n");

    // Write SQL
    const sqlHeader = `-- Auto-generated kType inserts\n-- Source: ${file}\n-- Generated: ${new Date().toISOString()}\n-- Total: ${findings.length} | Exact: ${exact} | Probable: ${probable} | Possible: ${possible} | Weak: ${weak}\n-- Inserts: ${inserts.length}\n\n`;
    writeFileSync(sqlFile, sqlHeader + inserts.join("\n") + "\n");

    console.log(`✅ Verifisering fullført!`);
    console.log(`   Exact:    ${exact}`);
    console.log(`   Probable: ${probable}`);
    console.log(`   Possible: ${possible}`);
    console.log(`   Weak:     ${weak}`);
    console.log(`   SQL:      ${inserts.length} inserts → ${sqlFile}`);
    console.log(`   NDJSON:   ${verified.length} records → ${outFile}`);

    // Execute if requested
    if (args.includes("--execute")) {
      console.log("\n⚠️  --execute krever 'wrangler d1 execute'. Kjør manuelt:");
      console.log(`   wrangler d1 execute glass-catalog-db --file ${sqlFile}`);
    }
    return;
  }

  console.log(`Usage:
  node verify-and-insert.mjs --ktype 17370 --brand VW --model Transporter --year 2005
  node verify-and-insert.mjs --file <findings.ndjson> --out <verified.ndjson>
  node verify-and-insert.mjs --file <findings.ndjson> --execute`);
  process.exit(1);
}

main().catch(console.error);
