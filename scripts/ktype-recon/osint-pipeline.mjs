#!/usr/bin/env node
/**
 * kType OSINT Pipeline
 * ====================
 * Hovedscript som orkestrerer kType-recon fra åpne kilder:
 *
 * 1. Leser glass_catalog fra D1 (eller lokal backup) for å finne
 *    merker/modeller som mangler kType-dekning.
 * 2. Leser eksisterende regnr/VIN-data (f.eks. fra finn-no-regnr).
 * 3. Bruker vPIC for VIN-dekoding (gratis).
 * 4. Genererer Google dorks for manuell verifisering.
 * 5. Output: strukturert NDJSON med vehicle fingerprints + dorks.
 *
 * Usage:
 *   node osint-pipeline.mjs --catalog <catalog.json> --regnr <regnr.ndjson> --out <output.ndjson>
 *   node osint-pipeline.mjs --brand "VW" --model "Transporter" --year 2005
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// === Step 1: Load catalog and find gaps ===
function loadCatalog(path) {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data) ? data : data.records || [];
}

function findKtypeGaps(catalog) {
  // Group by brand+model, count products with/without kType
  const groups = new Map();
  for (const r of catalog) {
    const key = `${r.brand || ""}|${r.model || ""}|${r.year_from || ""}-${r.year_to || ""}`;
    if (!groups.has(key)) groups.set(key, { brand: r.brand, model: r.model, yearFrom: r.year_from, yearTo: r.year_to, withKtype: 0, withoutKtype: 0, eurocodes: [] });
    const g = groups.get(key);
    if (r.ktype) g.withKtype++;
    else g.withoutKtype++;
    g.eurocodes.push(r.eurocode);
  }
  return Array.from(groups.values())
    .filter(g => g.withoutKtype > 0)
    .sort((a, b) => b.withoutKtype - a.withoutKtype);
}

// === Step 2: Match regnr/VIN to gaps ===
function matchVinsToGaps(regnrRecords, gaps) {
  const matched = [];
  for (const r of regnrRecords) {
    // Normalize brand for matching
    const brand = normalizeBrand(r.brand || r.finnBrand || "");
    const model = (r.model || "").toLowerCase();
    // Find gap that matches this brand+model
    const gap = gaps.find(g => {
      const gb = normalizeBrand(g.brand || "");
      const gm = (g.model || "").toLowerCase();
      return brand === gb && (model.includes(gm) || gm.includes(model));
    });
    if (gap && r.vin) {
      matched.push({
        regnr: r.regnr,
        vin: r.vin,
        brand: r.brand || r.finnBrand,
        model: r.model || r.finnModel,
        year: r.year,
        gap,
        sources: { bovsoft: r.ktype || null, finn: r.finnkode || null },
      });
    }
  }
  return matched;
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

// === Step 3: Generate Google dorks ===
function generateDorks({ brand, model, year, eurocodes }) {
  const base = `${brand || ""} ${model || ""}`.trim();
  const dorks = [];
  dorks.push({ type: "ktype", label: "Bredt kType-søk", query: `"${base}" ktype` });
  dorks.push({ type: "tecdoc", label: "TecDoc-søk", query: `"${base}" TecDoc` });
  dorks.push({ type: "forum", label: "Forum + kType", query: `site:forum "${base}" ktype` });
  for (const ec of eurocodes.slice(0, 3)) {
    dorks.push({ type: "eurocode", label: `Eurocode ${ec}`, query: `"${ec}" ktype OR TecDoc` });
  }
  if (year) {
    dorks.push({ type: "year", label: "Årsmodell + kType", query: `"${base}" ${year} ktype` });
  }
  return dorks;
}

// === Step 4: Build recon record ===
function buildReconRecord(gap, matchedVins) {
  const vins = matchedVins.map(m => ({ regnr: m.regnr, vin: m.vin }));
  return {
    brand: gap.brand,
    model: gap.model,
    yearFrom: gap.yearFrom,
    yearTo: gap.yearTo,
    productsWithoutKtype: gap.withoutKtype,
    productsWithKtype: gap.withKtype,
    eurocodes: gap.eurocodes,
    sampleVins: vins.slice(0, 5),
    dorks: generateDorks({ brand: gap.brand, model: gap.model, year: gap.yearFrom, eurocodes: gap.eurocodes }),
    priority: gap.withoutKtype * 10 + (vins.length > 0 ? 50 : 0),
    reconStatus: vins.length > 0 ? "has_vin_ready" : "needs_vin_discovery",
  };
}

// === Main ===
async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const catalogPath = getArg("--catalog") || "data/catalog-prod.json";
  const regnrPath = getArg("--regnr") || "data/finn-no-regnr/verified-bovsoft.ndjson";
  const outPath = getArg("--out") || "data/ktype-recon-priority.ndjson";
  const singleBrand = getArg("--brand");
  const singleModel = getArg("--model");
  const singleYear = getArg("--year");

  // Single mode
  if (singleBrand) {
    const dorks = generateDorks({ brand: singleBrand, model: singleModel, year: singleYear, eurocodes: [] });
    console.log(`# OSINT Recon: ${singleBrand} ${singleModel || ""} ${singleYear || ""}\n`);
    dorks.forEach((d, i) => console.log(`${i + 1}. **${d.label}**\n   https://www.google.com/search?q=${encodeURIComponent(d.query)}\n`));
    return;
  }

  // Batch mode
  console.log(`🔍 kType OSINT Pipeline`);
  console.log(`   Catalog: ${catalogPath}`);
  console.log(`   Regnr:   ${regnrPath}`);

  if (!existsSync(catalogPath)) {
    console.error(`❌ Catalog not found: ${catalogPath}`);
    process.exit(1);
  }

  const catalog = loadCatalog(catalogPath);
  console.log(`   Loaded ${catalog.length} catalog records`);

  const gaps = findKtypeGaps(catalog);
  console.log(`   Found ${gaps.length} brand/model groups with missing kType`);

  let matchedVins = [];
  if (existsSync(regnrPath)) {
    const regnrLines = readFileSync(regnrPath, "utf-8").split("\n").filter(Boolean);
    const regnrRecords = regnrLines.map(l => JSON.parse(l));
    matchedVins = matchVinsToGaps(regnrRecords, gaps);
    console.log(`   Matched ${matchedVins.length} VINs to gaps`);
  }

  const reconRecords = gaps.map(gap => {
    const vins = matchedVins.filter(m => {
      const gb = normalizeBrand(gap.brand || "");
      const mb = normalizeBrand(m.brand || "");
      return gb === mb;
    });
    return buildReconRecord(gap, vins);
  });

  // Sort by priority
  reconRecords.sort((a, b) => b.priority - a.priority);

  // Write NDJSON
  const ndjson = reconRecords.map(r => JSON.stringify(r)).join("\n");
  writeFileSync(outPath, ndjson + "\n");

  // Write summary markdown
  const mdPath = outPath.replace(/\.ndjson$/, "-summary.md");
  let md = `# kType OSINT Recon Priority List\n\n`;
  md += `Generert: ${new Date().toISOString()}\n\n`;
  md += `| Priority | Brand | Model | År | Uten kType | Med kType | VINs | Status |\n`;
  md += `|----------|-------|-------|-----|------------|-----------|------|--------|\n`;
  for (const r of reconRecords.slice(0, 50)) {
    md += `| ${r.priority} | ${r.brand || ""} | ${r.model || ""} | ${r.yearFrom || ""}-${r.yearTo || ""} | ${r.productsWithoutKtype} | ${r.productsWithKtype} | ${r.sampleVins.length} | ${r.reconStatus} |\n`;
  }
  md += `\n## Topp 10 søk (klikk for Google)\n\n`;
  for (const r of reconRecords.slice(0, 10)) {
    md += `### ${r.brand} ${r.model} (${r.yearFrom}-${r.yearTo})\n\n`;
    for (const d of r.dorks) {
      md += `- [${d.label}](https://www.google.com/search?q=${encodeURIComponent(d.query)})\n`;
    }
    md += "\n";
  }
  writeFileSync(mdPath, md);

  console.log(`\n✅ Lagret ${reconRecords.length} recon records:`);
  console.log(`   NDJSON:  ${outPath}`);
  console.log(`   Summary: ${mdPath}`);
  console.log(`\n   Topp 5 prioriteter:`);
  for (const r of reconRecords.slice(0, 5)) {
    console.log(`   • ${r.brand} ${r.model} (${r.yearFrom}-${r.yearTo}): ${r.productsWithoutKtype} uten kType, ${r.sampleVins.length} VINs`);
  }
}

main().catch(console.error);
