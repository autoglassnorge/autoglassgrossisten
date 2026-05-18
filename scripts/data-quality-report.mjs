#!/usr/bin/env node
/**
 * Data-kvalitetsrapport
 * =====================
 * Genererer markdown-rapport om katalog-tilstand.
 *
 * Kjøring:
 *   node scripts/data-quality-report.mjs [path/to/catalog.json]
 *   node scripts/data-quality-report.mjs --output docs/data-quality-report.md
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : path.join(process.cwd(), "data", "catalog-prod.json");

const OUT_ARG = process.argv.find((a) => a.startsWith("--output="));
const OUTPUT_PATH = OUT_ARG ? OUT_ARG.split("=")[1] : null;

function generateReport() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Katalog ikke funnet: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = catalog.records || [];
  const meta = catalog.meta || {};

  const now = new Date().toISOString();

  // Statistikk
  const sourceCounts = {};
  const brandCounts = {};
  const categoryCounts = {};
  const yearCounts = {};
  const supplierCounts = {};
  let withPrice = 0;
  let withStock = 0;
  let withImage = 0;
  let withOem = 0;
  let withNags = 0;
  let adasCount = 0;
  let rainCount = 0;
  let heatedCount = 0;
  let acousticCount = 0;

  for (const r of records) {
    // Kilder
    const src = r.source || "unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;

    // Brands
    const brand = r.brand || "Unknown";
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;

    // Kategorier
    const cat = r.category || "unknown";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    // År
    if (r.yearFrom) {
      yearCounts[r.yearFrom] = (yearCounts[r.yearFrom] || 0) + 1;
    }

    // Leverandører
    if (r.supplier) {
      supplierCounts[r.supplier] = (supplierCounts[r.supplier] || 0) + 1;
    }

    // Felter
    if (r.price !== null && r.price > 0) withPrice++;
    if (r.stockStatus > 0) withStock++;
    if (r.imageUrl) withImage++;
    if (r.oemNumbers?.length > 0) withOem++;
    if (r.nagsCodes?.length > 0) withNags++;

    // Flaggs
    if (r.adas) adasCount++;
    if (r.rainSensor) rainCount++;
    if (r.heated) heatedCount++;
    if (r.acoustic) acousticCount++;
  }

  // Topp 20 brands
  const topBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Topp 10 leverandører
  const topSuppliers = Object.entries(supplierCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // År-range
  const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);

  const report = `# Data-kvalitetsrapport — Autoglass AS

> Generert: ${now}
> Katalog: \`${CATALOG_PATH}\`
> Versjon: ${meta.version || "N/A"}

---

## 📊 Oversikt

| Metrikk | Verdi |
|---------|-------|
| **Totalt antall poster** | ${records.length.toLocaleString("nb-NO")} |
| **Versjon** | ${meta.version || "N/A"} |
| **Sist merget** | ${meta.mergedAt || "N/A"} |
| **Kilder** | ${Object.keys(sourceCounts).join(", ")} |
| **Unike merker** | ${Object.keys(brandCounts).length} |
| **Årsspenn** | ${years[0] || "N/A"} — ${years[years.length - 1] || "N/A"} |

---

## 📦 Kilder

| Kilde | Antall | Andel |
|-------|--------|-------|
${Object.entries(sourceCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([src, count]) => `| ${src} | ${count.toLocaleString("nb-NO")} | ${((count / records.length) * 100).toFixed(1)}% |`)
  .join("\n")}

---

## 🏭 Topp 20 Merker

| Merke | Antall |
|-------|--------|
${topBrands.map(([b, c]) => `| ${b} | ${c.toLocaleString("nb-NO")} |`).join("\n")}

---

## 📂 Kategorier

| Kategori | Antall | Andel |
|----------|--------|-------|
${Object.entries(categoryCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `| ${cat} | ${count.toLocaleString("nb-NO")} | ${((count / records.length) * 100).toFixed(1)}% |`)
  .join("\n")}

---

## 🏷️ Leverandører (topp 10)

| Leverandør | Antall |
|------------|--------|
${topSuppliers.map(([s, c]) => `| ${s} | ${c.toLocaleString("nb-NO")} |`).join("\n")}

---

## 📋 Felt-dekning

| Felt | Dekning |
|------|---------|
| Pris | ${((withPrice / records.length) * 100).toFixed(1)}% |
| Lagerstatus | ${((withStock / records.length) * 100).toFixed(1)}% |
| Bilde | ${((withImage / records.length) * 100).toFixed(1)}% |
| OEM-numre | ${((withOem / records.length) * 100).toFixed(1)}% |
| NAGS-koder | ${((withNags / records.length) * 100).toFixed(1)}% |

---

## 🚩 Flaggs

| Flagg | Antall | Andel |
|-------|--------|-------|
| ADAS | ${adasCount.toLocaleString("nb-NO")} | ${((adasCount / records.length) * 100).toFixed(1)}% |
| Regnsensor | ${rainCount.toLocaleString("nb-NO")} | ${((rainCount / records.length) * 100).toFixed(1)}% |
| Oppvarmet | ${heatedCount.toLocaleString("nb-NO")} | ${((heatedCount / records.length) * 100).toFixed(1)}% |
| Akustisk | ${acousticCount.toLocaleString("nb-NO")} | ${((acousticCount / records.length) * 100).toFixed(1)}% |

---

*Rapport generert av autoglass-data-agent*
`;

  if (OUTPUT_PATH) {
    fs.writeFileSync(OUTPUT_PATH, report);
    console.log(`💾 Rapport lagret til: ${OUTPUT_PATH}`);
  } else {
    console.log(report);
  }
}

generateReport();
