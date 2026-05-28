#!/usr/bin/env node
/**
 * kType Finding Verifier
 * ======================
 * Kryssjekker et mistenkt kType-funn mot eksisterende katalog-data
 * for å vurdere om det er eksakt match, sannsynlig match, eller svak match.
 *
 * Usage:
 *   node verify-finding.mjs --ktype 12345 --brand "VW" --model "Transporter" --year 2005 --eurocode "2525CSGYA"
 *   node verify-finding.mjs --file <finding.json> --catalog <catalog.json>
 */

import { readFileSync } from "fs";

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
  const { ktype, brand, model, year, eurocode, oeNumber } = finding;
  const results = {
    ktype,
    brand,
    model,
    year,
    eurocode,
    oeNumber,
    verification: {
      catalogMatches: [],
      brandMatch: false,
      modelMatch: false,
      yearCompatible: false,
      eurocodeExists: false,
      oeNumberExists: false,
      confidence: "unknown",
      score: 0,
      reasons: [],
    },
  };

  const normBrand = normalizeBrand(brand);

  for (const r of catalog) {
    const rBrand = normalizeBrand(r.brand);
    const brandMatch = rBrand === normBrand;
    const modelMatch = model && r.model && (
      r.model.toLowerCase().includes(model.toLowerCase()) ||
      model.toLowerCase().includes(r.model.toLowerCase())
    );
    const yearMatch = year && r.year_from && r.year_to &&
      year >= r.year_from && year <= r.year_to;
    const euroMatch = eurocode && r.eurocode &&
      r.eurocode.toUpperCase() === eurocode.toUpperCase();
    const oeMatch = oeNumber && r.article_number &&
      r.article_number.toUpperCase() === oeNumber.toUpperCase();

    if (brandMatch || modelMatch || euroMatch || oeMatch) {
      results.verification.catalogMatches.push({
        eurocode: r.eurocode,
        brand: r.brand,
        model: r.model,
        yearFrom: r.year_from,
        yearTo: r.year_to,
        category: r.category,
        brandMatch,
        modelMatch,
        yearMatch,
        euroMatch,
        oeMatch,
      });
    }
  }

  // Score the finding
  let score = 0;
  const reasons = [];

  if (results.verification.catalogMatches.length > 0) {
    const best = results.verification.catalogMatches[0];
    results.verification.brandMatch = best.brandMatch;
    results.verification.modelMatch = best.modelMatch;
    results.verification.yearCompatible = best.yearMatch;
    results.verification.eurocodeExists = best.euroMatch;
    results.verification.oeNumberExists = best.oeMatch;

    if (best.brandMatch) { score += 25; reasons.push("Brand matcher katalog"); }
    if (best.modelMatch) { score += 25; reasons.push("Modell matcher katalog"); }
    if (best.yearMatch) { score += 25; reasons.push("Årsmodell matcher katalog"); }
    if (best.euroMatch) { score += 15; reasons.push("Eurocode finnes i katalog"); }
    if (best.oeMatch) { score += 10; reasons.push("OE-nummer finnes i katalog"); }
  } else {
    reasons.push("Ingen katalogtreff funnet");
  }

  // kType-specific scoring
  if (ktype) {
    const ktypeMatches = catalog.filter(r => r.ktype === ktype);
    if (ktypeMatches.length > 0) {
      score += 10;
      reasons.push(`kType ${ktype} finnes i ${ktypeMatches.length} katalog-produkter`);
    }
  }

  results.verification.score = score;
  results.verification.reasons = reasons;

  if (score >= 80) results.verification.confidence = "exact";
  else if (score >= 50) results.verification.confidence = "probable";
  else if (score >= 25) results.verification.confidence = "possible";
  else results.verification.confidence = "weak";

  return results;
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const catalogPath = getArg("--catalog") || "data/catalog-prod.json";
  const catalog = loadCatalog(catalogPath);

  // Single finding
  const ktype = getArg("--ktype");
  const brand = getArg("--brand");
  const model = getArg("--model");
  const year = getArg("--year") ? parseInt(getArg("--year"), 10) : undefined;
  const eurocode = getArg("--eurocode");
  const oeNumber = getArg("--oe");

  if (ktype || brand || eurocode) {
    const finding = { ktype: ktype ? parseInt(ktype, 10) : undefined, brand, model, year, eurocode, oeNumber };
    const result = verifyFinding(finding, catalog);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Batch from file
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    const findings = JSON.parse(readFileSync(file, "utf-8"));
    const results = (Array.isArray(findings) ? findings : [findings]).map(f => verifyFinding(f, catalog));
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`Usage:
  node verify-finding.mjs --ktype 12345 --brand "VW" --model "Transporter" --year 2005
  node verify-finding.mjs --eurocode "2525CSGYA" --brand "VW"
  node verify-finding.mjs --file <findings.json> --catalog <catalog.json>`);
  process.exit(1);
}

main().catch(console.error);
