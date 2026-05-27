#!/usr/bin/env node
/**
 * enrich-catalog-from-pdf-ad.mjs
 * ================================
 * Enrich glass_catalog with ADAS/equipment data parsed from Mygrant PDFs.
 *
 * Strategy:
 *   1. Parse all Mygrant PDFs for NAGS codes + vehicle fitment + ADAS features
 *   2. Build a lookup: make + model + year_range → { adasFeatures, glassType }
 *   3. For each product in catalog-prod.json, fuzzy-match against lookup
 *   4. Update product fields: adas (array), rainSensor, heated, acoustic, laneAssist, hud, camera
 *   5. Write enriched catalog back to catalog-prod.json
 *
 * This improves Layer 1-4 matching accuracy without requiring kType.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────
const PDF_DIRS = [
  "data/mygrant-pdfs",
  "data/mygrant-pdfs-more",
  "data/mygrant-backfill",
  "data/mygrant-2023",
];
const CATALOG_PATH = path.join(ROOT, "data", "catalog-prod.json");
const OUTPUT_PATH = path.join(ROOT, "data", "catalog-prod-enriched.json");
const DRY_RUN = process.argv.includes("--dry-run");

// NAGS prefix → glass type
const NAGS_PREFIX_TO_TYPE = {
  DW: "frontrute", FW: "frontrute", DL: "frontrute", FL: "frontrute",
  DB: "bakrute", FB: "bakrute",
  DD: "siderute", FD: "siderute", DQ: "siderute", FQ: "siderute",
  DV: "siderute", FV: "siderute", DS: "siderute", FS: "siderute",
  DR: "tak", FR: "tak",
};

// ADAS feature keywords → catalog field
const FEATURE_MAP = {
  // Rain sensor
  "rn snsr": "rainSensor", "rain sensor": "rainSensor", "rain/light snsr": "rainSensor",
  "rn/light snsr": "rainSensor", "rn/humidity snsr": "rainSensor", "humidity snsr": "rainSensor",
  "rn light snsr": "rainSensor", "rain light snsr": "rainSensor",
  // Heated
  "htd": "heated", "heated": "heated",
  // Acoustic
  "acstc": "acoustic", "acoustic": "acoustic", "soundscreen": "acoustic",
  // Lane assist
  "lka": "laneAssist", "lane keep": "laneAssist", "ldws": "laneAssist",
  "lane tracing": "laneAssist", "ln change asst": "laneAssist",
  // HUD
  "hud": "hud", "head up": "hud",
  // Camera
  "driver camera": "camera", "fwd coll": "camera", "fca": "camera",
  "pre-coll": "camera", "collision mitigation": "camera",
  // ADAS general
  "adas": "adas", "adaptive cruise": "adas", "traffic sign": "adas",
  "emerg braking": "adas", "auto emerg braking": "adas",
  "evasion aid": "adas", "highway asst": "adas", "hwy asst": "adas",
  "proactive driving": "adas", "road sign": "adas",
};

// ── PDF → text ────────────────────────────────────────────────────────────
function pdfToText(pdfPath) {
  try {
    return execSync(`pdftotext "${pdfPath}" - 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    return "";
  }
}

function isRealPdf(pdfPath) {
  try {
    const magic = execSync(`file -b "${pdfPath}"`, { encoding: "utf-8" }).trim();
    return magic.startsWith("PDF document");
  } catch (e) {
    return false;
  }
}

// ── Text parsing ──────────────────────────────────────────────────────────
function parseNagsEntries(text) {
  const entries = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const nagsPattern = /^([DF][BWLDQVSRA][0-9]{4,5})(?:\s+([A-Z]{2,4}))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(nagsPattern);
    if (!match) continue;

    const nagsCode = match[1];
    const suffix = match[2] || null;
    const prefix = nagsCode.substring(0, 2);
    const glassType = NAGS_PREFIX_TO_TYPE[prefix] || "unknown";

    let descLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (nagsPattern.test(next)) break;
      if (/^(NEW PARTS RELEASE|MYGRANTGLASS|CONTACT YOUR|PARTS RELEASE|TRUCKS|NAGS|PART DESCRIPTION|BRAND)$/.test(next)) break;
      if (/^[A-Z]+, [A-Z]+/.test(next) && next.length < 60) break;
      descLines.push(next);
      j++;
    }

    const description = descLines.join(" ").trim();
    if (!description) continue;

    const parsed = parseDescription(description);
    entries.push({ nagsCode, suffix, glassType, description, ...parsed });
    i = j - 1;
  }

  return entries;
}

function parseDescription(desc) {
  const result = {
    yearFrom: null, yearTo: null, make: null, model: null, bodyType: null,
    adasFeatures: [], isNewPart: false,
  };

  result.isNewPart = desc.includes("* New Part") || desc.includes("*New Part");

  const yearMatch = desc.match(/^(\d{2,4})[-–](\d{2,4})?\s/);
  if (yearMatch) {
    let from = parseInt(yearMatch[1], 10);
    let to = yearMatch[2] ? parseInt(yearMatch[2], 10) : null;
    if (from < 100) from = from >= 50 ? 1900 + from : 2000 + from;
    if (to && to < 100) to = to >= 50 ? 1900 + to : 2000 + to;
    result.yearFrom = from;
    result.yearTo = to;
  }

  const vehicleMatch = desc.match(/^\d{2,4}[-–]\s+([A-Za-z][A-Za-z\s]+?)(?:[-–])?\s*(\dD\s+\w+|\dD)\s*[\(\*]/);
  if (vehicleMatch) {
    const rawMakeModel = vehicleMatch[1].trim();
    result.bodyType = vehicleMatch[2].trim();
    const parts = rawMakeModel.split(/\s+/);
    if (parts.length >= 2) {
      result.make = parts[0].toUpperCase();
      result.model = parts.slice(1).join(" ");
    } else {
      result.make = rawMakeModel.toUpperCase();
    }
  } else {
    const simpleMatch = desc.match(/^\d{2,4}[-–]\s+([A-Za-z]+)\s+(.+?)\s*\(/);
    if (simpleMatch) {
      result.make = simpleMatch[1].toUpperCase();
      result.model = simpleMatch[2].trim();
    }
  }

  const parenMatch = desc.match(/\(([^)]+)\)/);
  if (parenMatch) {
    result.adasFeatures = parenMatch[1].split(",").map((f) => f.trim()).filter(Boolean);
  }

  return result;
}

// ── Build lookup from PDF entries ─────────────────────────────────────────
function buildLookup(entries) {
  const lookup = new Map(); // key: "MAKE:MODEL:YEAR_FROM:YEAR_TO" → { features, glassType }

  for (const e of entries) {
    if (!e.make || !e.yearFrom) continue;
    const yearTo = e.yearTo || e.yearFrom;
    const key = `${e.make}:${e.model || ""}:${e.yearFrom}:${yearTo}:${e.glassType}`;

    const existing = lookup.get(key);
    if (!existing) {
      lookup.set(key, { features: new Set(e.adasFeatures), glassType: e.glassType });
    } else {
      for (const f of e.adasFeatures) existing.features.add(f);
    }
  }

  return lookup;
}

// ── Extract catalog fields from feature set ───────────────────────────────
function extractEquipment(features) {
  const eq = {
    adas: [],
    rainSensor: false,
    heated: false,
    acoustic: false,
    laneAssist: false,
    hud: false,
    camera: false,
  };

  for (const feature of features) {
    const lower = feature.toLowerCase();
    for (const [keyword, field] of Object.entries(FEATURE_MAP)) {
      if (lower.includes(keyword)) {
        if (field === "adas") {
          if (!eq.adas.includes(feature)) eq.adas.push(feature);
        } else {
          eq[field] = true;
        }
      }
    }
  }

  return eq;
}

// ── Match product against lookup ──────────────────────────────────────────
function matchProduct(product, lookup) {
  if (!product.brand || !product.yearFrom) return null;

  const make = product.brand.toUpperCase();
  const model = (product.model || "").toUpperCase();
  const pf = product.yearFrom || 0;
  const pt = product.yearTo || pf;
  const cat = product.category;

  let bestMatch = null;
  let bestScore = 0;

  for (const [key, data] of lookup.entries()) {
    const [lMake, lModel, lYearFrom, lYearTo, lGlassType] = key.split(":");
    if (lMake !== make) continue;

    // Model fuzzy match
    let modelScore = 0;
    if (!lModel && !model) {
      modelScore = 1;
    } else if (lModel && model) {
      const lNorm = lModel.replace(/[^A-Z0-9]/g, "");
      const pNorm = model.replace(/[^A-Z0-9]/g, "");
      if (lNorm === pNorm) {
        modelScore = 1;
      } else if (lNorm.includes(pNorm) || pNorm.includes(lNorm)) {
        modelScore = 0.7;
      } else {
        // Word overlap
        const lWords = new Set(lNorm.match(/.{2,}/g) || []);
        const pWords = new Set(pNorm.match(/.{2,}/g) || []);
        let overlap = 0;
        for (const w of lWords) if (pWords.has(w)) overlap++;
        modelScore = overlap / Math.max(lWords.size, pWords.size, 1);
      }
    }

    if (modelScore < 0.3) continue;

    // Year overlap
    const lf = parseInt(lYearFrom, 10);
    const lt = parseInt(lYearTo, 10);
    const overlap = Math.max(0, Math.min(pt, lt) - Math.max(pf, lf));
    const span = Math.max(pt - pf, lt - lf, 1);
    const yearScore = overlap / span;

    // Category match
    let catScore = 0;
    if (cat && lGlassType === cat) catScore = 1;

    const score = modelScore * 40 + yearScore * 35 + catScore * 25;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = data;
    }
  }

  if (bestMatch && bestScore > 30) {
    return { ...extractEquipment(bestMatch.features), matchScore: Math.round(bestScore) };
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Enrich Catalog from PDF ADAS Data");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Parse all PDFs
  const { readdirSync } = await import("fs");
  const allPdfs = [];
  for (const dir of PDF_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!existsSync(fullDir)) continue;
    const pdfs = readdirSync(fullDir).filter((f) => f.endsWith(".pdf"));
    for (const pdf of pdfs) {
      const fullPath = path.join(fullDir, pdf);
      if (isRealPdf(fullPath)) allPdfs.push(fullPath);
    }
  }

  console.log(`📄 Found ${allPdfs.length} real PDFs`);

  let allEntries = [];
  for (const pdfPath of allPdfs) {
    const relPath = path.relative(ROOT, pdfPath);
    process.stdout.write(`   📖 ${relPath} ... `);
    const text = pdfToText(pdfPath);
    const entries = parseNagsEntries(text);
    console.log(`${entries.length} entries`);
    allEntries.push(...entries);
  }

  // Deduplicate
  const byNags = new Map();
  for (const e of allEntries) {
    const key = e.nagsCode + (e.suffix || "");
    if (!byNags.has(key)) byNags.set(key, e);
  }
  allEntries = Array.from(byNags.values());
  console.log(`\n📊 Total unique NAGS entries: ${allEntries.length}`);

  // 2. Build lookup
  const lookup = buildLookup(allEntries);
  console.log(`🔍 Lookup keys: ${lookup.size}`);

  // 3. Load catalog
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  const records = catalog.records || [];
  console.log(`📦 Catalog products: ${records.length}`);

  // 4. Enrich
  let enriched = 0;
  let withNewAdas = 0;
  let withNewRain = 0;
  let withNewHeat = 0;
  let withNewAcoustic = 0;
  let withNewLane = 0;
  let withNewHud = 0;
  let withNewCam = 0;

  for (const product of records) {
    const match = matchProduct(product, lookup);
    if (!match) continue;

    enriched++;

    if (match.adas.length > 0 && (!product.adasFeatures || product.adasFeatures.length === 0)) {
      product.adasFeatures = match.adas;
      withNewAdas++;
    }
    if (match.adas.length > 0 && !product.adas) {
      product.adas = true;
    }
    if (match.rainSensor && !product.rainSensor) {
      product.rainSensor = true;
      withNewRain++;
    }
    if (match.heated && !product.heated) {
      product.heated = true;
      withNewHeat++;
    }
    if (match.acoustic && !product.acoustic) {
      product.acoustic = true;
      withNewAcoustic++;
    }
    if (match.laneAssist && !product.laneAssist) {
      product.laneAssist = true;
      withNewLane++;
    }
    if (match.hud && !product.hud) {
      product.hud = true;
      withNewHud++;
    }
    if (match.camera && !product.camera) {
      product.camera = true;
      withNewCam++;
    }
  }

  console.log(`\n📊 Enrichment results:`);
  console.log(`   Products matched: ${enriched}`);
  console.log(`   New ADAS arrays: ${withNewAdas}`);
  console.log(`   New rainSensor: ${withNewRain}`);
  console.log(`   New heated: ${withNewHeat}`);
  console.log(`   New acoustic: ${withNewAcoustic}`);
  console.log(`   New laneAssist: ${withNewLane}`);
  console.log(`   New hud: ${withNewHud}`);
  console.log(`   New camera: ${withNewCam}`);

  // 5. Write output
  if (!DRY_RUN) {
    writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2));
    console.log(`\n💾 Written: ${OUTPUT_PATH}`);

    // Also update the main catalog
    writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`💾 Updated: ${CATALOG_PATH}`);
  } else {
    console.log(`\n🚫 DRY-RUN: No files written`);
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
