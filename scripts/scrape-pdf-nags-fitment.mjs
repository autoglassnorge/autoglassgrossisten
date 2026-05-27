#!/usr/bin/env node
/**
 * scrape-pdf-nags-fitment.mjs
 * ===========================
 * Parse Mygrant "New Parts Release" PDFs for NAGS codes + vehicle fitment + ADAS features.
 *
 * Strategy:
 *   1. Convert PDF → text with pdftotext (already installed)
 *   2. Parse text for NAGS codes, year ranges, make, model, body type, ADAS flags
 *   3. Match against catalog-prod.json via make/model/year/prefix4
 *   4. Store inferred mappings in scrape_results (D1)
 *
 * PDF locations:
 *   data/mygrant-pdfs/*.pdf (some are HTML caches — skip those)
 *   data/mygrant-pdfs-more/*.pdf
 *   data/mygrant-backfill/*.pdf
 *   data/mygrant-2023/*.pdf
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
const PREFIX4_CACHE_PATH = path.join(ROOT, "data", "ktype-prefix4-cache.json");
const OUTPUT_JSON = path.join(ROOT, "data", "pdf-nags-fitment.json");
const DRY_RUN = process.argv.includes("--dry-run");

// NAGS prefix → glass type
const NAGS_PREFIX_TO_TYPE = {
  DW: "frontrute", FW: "frontrute", DL: "frontrute", FL: "frontrute",
  DB: "bakrute", FB: "bakrute",
  DD: "siderute", FD: "siderute", DQ: "siderute", FQ: "siderute",
  DV: "siderute", FV: "siderute", DS: "siderute", FS: "siderute",
  DR: "tak", FR: "tak",
};

// ── PDF → text ────────────────────────────────────────────────────────────
function pdfToText(pdfPath) {
  try {
    const text = execSync(`pdftotext "${pdfPath}" - 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return text;
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

  // Pattern: NAGS code line followed by description line(s)
  // Example:
  //   DW02995 GTY
  //   23- Lucid Air 4D Sedan (Slr, Acstc Intrlyr, ...)

  const nagsPattern = /^([DF][BWLDQVSRA][0-9]{4,5})(?:\s+([A-Z]{2,4}))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(nagsPattern);
    if (!match) continue;

    const nagsCode = match[1];
    const suffix = match[2] || null;
    const prefix = nagsCode.substring(0, 2);
    const glassType = NAGS_PREFIX_TO_TYPE[prefix] || "unknown";

    // Look ahead for description lines
    let descLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      // Stop if next line is another NAGS code or a header/footer
      if (nagsPattern.test(next)) break;
      if (/^(NEW PARTS RELEASE|MYGRANTGLASS|CONTACT YOUR|PARTS RELEASE|TRUCKS|NAGS|PART DESCRIPTION|BRAND)$/.test(next)) break;
      if (/^[A-Z]+, [A-Z]+/.test(next) && next.length < 60) break; // header line like "FORD F150, BMW X3"
      descLines.push(next);
      j++;
    }

    const description = descLines.join(" ").trim();
    if (!description) continue;

    // Parse year, make, model, body type, ADAS features from description
    const parsed = parseDescription(description);

    entries.push({
      nagsCode,
      suffix,
      glassType,
      description,
      ...parsed,
    });

    i = j - 1; // Skip consumed lines
  }

  return entries;
}

function parseDescription(desc) {
  const result = {
    yearFrom: null,
    yearTo: null,
    make: null,
    model: null,
    bodyType: null,
    adasFeatures: [],
    isNewPart: false,
  };

  // Check for "* New Part" marker
  result.isNewPart = desc.includes("* New Part") || desc.includes("*New Part");

  // Year pattern: "23- " or "2023- " or "2022-2023 " or "2019- "
  const yearMatch = desc.match(/^(\d{2,4})[-–](\d{2,4})?\s/);
  if (yearMatch) {
    let from = parseInt(yearMatch[1], 10);
    let to = yearMatch[2] ? parseInt(yearMatch[2], 10) : null;

    // Normalize 2-digit years
    if (from < 100) {
      from = from >= 50 ? 1900 + from : 2000 + from;
    }
    if (to && to < 100) {
      to = to >= 50 ? 1900 + to : 2000 + to;
    }

    result.yearFrom = from;
    result.yearTo = to;
  }

  // Make/Model pattern: "year- Make Model-BodyType" or "year- Make Model BodyType"
  // Example: "23- Lucid Air 4D Sedan", "24- Chevrolet Corvette-2D Coupe"
  const vehicleMatch = desc.match(/^\d{2,4}[-–]\s+([A-Za-z][A-Za-z\s]+?)(?:[-–])?\s*(\dD\s+\w+|\dD)\s*[\(\*]/);
  if (vehicleMatch) {
    const rawMakeModel = vehicleMatch[1].trim();
    result.bodyType = vehicleMatch[2].trim();

    // Split make and model
    const parts = rawMakeModel.split(/\s+/);
    if (parts.length >= 2) {
      result.make = parts[0].toUpperCase();
      result.model = parts.slice(1).join(" ");
    } else {
      result.make = rawMakeModel.toUpperCase();
    }
  } else {
    // Fallback: try simpler pattern
    const simpleMatch = desc.match(/^\d{2,4}[-–]\s+([A-Za-z]+)\s+(.+?)\s*\(/);
    if (simpleMatch) {
      result.make = simpleMatch[1].toUpperCase();
      result.model = simpleMatch[2].trim();
    }
  }

  // ADAS features in parentheses
  const parenMatch = desc.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const features = parenMatch[1].split(",").map((f) => f.trim()).filter(Boolean);
    result.adasFeatures = features;
  }

  return result;
}

// ── Catalog matching ──────────────────────────────────────────────────────
function loadCatalog() {
  const data = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  return data.records || [];
}

function loadPrefix4Cache() {
  const data = JSON.parse(readFileSync(PREFIX4_CACHE_PATH, "utf-8"));
  return data.entries || {};
}

function matchAgainstCatalog(entries, catalog, prefix4Cache) {
  // Build prefix4 → products index
  const byPrefix4 = new Map();
  for (const p of catalog) {
    if (!p.prefix4) continue;
    if (!byPrefix4.has(p.prefix4)) byPrefix4.set(p.prefix4, []);
    byPrefix4.get(p.prefix4).push(p);
  }

  const matched = [];

  for (const entry of entries) {
    if (!entry.make || !entry.yearFrom) continue;

    // Lookup prefix4 from cache
    const cacheKey = `${entry.make}:${entry.model || ""}:${entry.yearFrom}`;
    const cacheKeyNoYear = `${entry.make}:${entry.model || ""}`;

    let prefix4Entries = prefix4Cache[cacheKey] || prefix4Cache[cacheKeyNoYear];
    if (!prefix4Entries || prefix4Entries.length === 0) continue;

    // Take highest confidence prefix4
    const best = prefix4Entries.sort((a, b) => b.confidence - a.confidence)[0];
    const prefix4 = best.prefix4;

    // Find products with this prefix4
    const candidates = byPrefix4.get(prefix4) || [];

    // Filter by make match
    const makeMatches = candidates.filter((p) => {
      if (!p.brand) return false;
      return p.brand.toUpperCase() === entry.make;
    });

    if (makeMatches.length === 0) continue;

    // Score by year overlap and ADAS similarity
    const scored = makeMatches.map((p) => {
      let score = 0;

      // Year overlap
      const ef = entry.yearFrom;
      const et = entry.yearTo || 2030;
      const pf = p.yearFrom || 0;
      const pt = p.yearTo || 2030;
      const overlap = Math.max(0, Math.min(et, pt) - Math.max(ef, pf));
      const span = Math.max(et - ef, pt - pf, 1);
      score += (overlap / span) * 30;

      // Category match
      const entryType = entry.glassType;
      const catMap = { frontrute: "frontrute", bakrute: "bakrute", siderute: "siderute", tak: "tak" };
      if (catMap[entryType] === p.category) score += 20;

      // ADAS feature overlap
      const entryAdas = new Set(entry.adasFeatures.map((f) => f.toLowerCase()));
      let adasOverlap = 0;
      for (const flag of p.adas || []) {
        if (entryAdas.has(flag.toLowerCase())) adasOverlap++;
      }
      score += adasOverlap * 5;

      return { product: p, score: Math.min(score, 100) };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0];

    if (bestMatch && bestMatch.score > 20) {
      matched.push({
        nagsCode: entry.nagsCode,
        suffix: entry.suffix,
        glassType: entry.glassType,
        make: entry.make,
        model: entry.model,
        bodyType: entry.bodyType,
        yearFrom: entry.yearFrom,
        yearTo: entry.yearTo,
        adasFeatures: entry.adasFeatures,
        eurocode: bestMatch.product.eurocode,
        catalogBrand: bestMatch.product.brand,
        catalogModel: bestMatch.product.model,
        catalogCategory: bestMatch.product.category,
        catalogYearFrom: bestMatch.product.yearFrom,
        catalogYearTo: bestMatch.product.yearTo,
        matchScore: Math.round(bestMatch.score),
        prefix4,
      });
    }
  }

  return matched;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Mygrant PDF NAGS + Vehicle Fitment Parser");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Find all real PDFs
  const { readdirSync } = await import("fs");
  const allPdfs = [];
  for (const dir of PDF_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!existsSync(fullDir)) continue;
    const pdfs = readdirSync(fullDir).filter((f) => f.endsWith(".pdf"));
    for (const pdf of pdfs) {
      const fullPath = path.join(fullDir, pdf);
      if (isRealPdf(fullPath)) {
        allPdfs.push(fullPath);
      } else {
        console.log(`   ⚠️  Skipping non-PDF: ${dir}/${pdf}`);
      }
    }
  }

  console.log(`📄 Found ${allPdfs.length} real PDFs\n`);

  // 2. Parse each PDF
  let allEntries = [];
  for (const pdfPath of allPdfs) {
    const relPath = path.relative(ROOT, pdfPath);
    process.stdout.write(`   📖 ${relPath} ... `);
    const text = pdfToText(pdfPath);
    const entries = parseNagsEntries(text);
    console.log(`${entries.length} entries`);
    allEntries.push(...entries);
  }

  console.log(`\n📊 Total parsed entries: ${allEntries.length}`);

  // 3. Deduplicate by NAGS code
  const byNags = new Map();
  for (const e of allEntries) {
    const key = e.nagsCode + (e.suffix || "");
    if (!byNags.has(key)) byNags.set(key, e);
  }
  allEntries = Array.from(byNags.values());
  console.log(`📊 After dedup: ${allEntries.length}`);

  // 4. Load catalog and match
  console.log(`\n🔍 Loading catalog ...`);
  const catalog = loadCatalog();
  console.log(`   Catalog: ${catalog.length} products`);

  console.log(`🔍 Loading prefix4 cache ...`);
  const prefix4Cache = loadPrefix4Cache();
  console.log(`   Cache keys: ${Object.keys(prefix4Cache).length}`);

  console.log(`\n🔗 Matching entries against catalog ...`);
  const matched = matchAgainstCatalog(allEntries, catalog, prefix4Cache);
  console.log(`   Matched: ${matched.length} / ${allEntries.length}`);

  // 5. Output
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalPdfs: allPdfs.length,
      totalEntries: allEntries.length,
      matchedEntries: matched.length,
      pdfs: allPdfs.map((p) => path.relative(ROOT, p)),
    },
    entries: allEntries,
    matched,
  };

  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  console.log(`\n💾 Written: ${OUTPUT_JSON}`);

  // 6. Summary by make
  const byMake = new Map();
  for (const m of matched) {
    byMake.set(m.make, (byMake.get(m.make) || 0) + 1);
  }
  console.log(`\n📈 Matches by make:`);
  for (const [make, count] of [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`   ${make}: ${count}`);
  }

  // 7. Write to D1 scrape_results (if not dry-run)
  if (!DRY_RUN && matched.length > 0) {
    console.log(`\n📝 Writing ${matched.length} entries to D1 scrape_results ...`);
    await writeToD1(matched);
  }

  console.log("\n✅ Done!");
}

async function writeToD1(matched) {
  // Build SQL INSERT statements
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < matched.length; i += batchSize) {
    batches.push(matched.slice(i, i + batchSize));
  }

  let written = 0;
  for (const batch of batches) {
    const values = batch.map((m) => {
      const raw = JSON.stringify({
        nagsCode: m.nagsCode,
        suffix: m.suffix,
        adasFeatures: m.adasFeatures,
        bodyType: m.bodyType,
        matchScore: m.matchScore,
        prefix4: m.prefix4,
      });
      return `(
        'pdf_nags',
        ${m.make ? `'${m.make.replace(/'/g, "''")}'` : "NULL"},
        ${m.model ? `'${m.model.replace(/'/g, "''")}'` : "NULL"},
        ${m.yearFrom || "NULL"},
        ${m.eurocode ? `'${m.eurocode}'` : "NULL"},
        NULL,
        '${m.glassType}',
        '${raw.replace(/'/g, "''")}',
        ${m.matchScore / 100},
        'inferred'
      )`;
    }).join(",\n");

    const sql = `INSERT INTO scrape_results
      (source, make, model, year, eurocode, oem_number, glass_part_type, raw_payload, confidence, status)
      VALUES ${values};`;

    try {
      const result = execSync(
        `cd ${path.join(ROOT, "api/cf-worker")} && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      written += batch.length;
      process.stdout.write(`.`);
    } catch (e) {
      process.stdout.write(`X`);
      console.error("\n   Error:", e.message?.slice(0, 200));
    }
  }

  console.log(`\n   Written: ${written}/${matched.length}`);
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
