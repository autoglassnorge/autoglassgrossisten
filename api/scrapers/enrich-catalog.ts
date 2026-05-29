/**
 * Enrich Master Catalog
 * =====================
 * Beriker master-catalog.json med:
 *   1. yearFrom/yearTo fra description (hvis manglende)
 *   2. category fra eurocode-suffix + description
 *   3. HTML entity decoding i model
 *
 * Kjøring:
 *   npx tsx api/scrapers/enrich-catalog.ts
 */

import * as fs from "fs";
import * as path from "path";

const CATALOG_PATH = path.join(process.cwd(), "data", "master-catalog.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "master-catalog-enriched.json");

// ─── Interfaces ─────────────────────────────────────────────────
interface GlassRecord {
  eurocode: string;
  articleNumber: string;
  scanNumber: string | null;
  category: string;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null;
  stockStatus: number;
  warehouseLocation: string | null;
  oemNumbers: string[];
  crossReferences: string[];
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
}

interface CatalogData {
  meta: { mergedAt: string; totalRecords: number; sources: string[]; categories: Record<string, number> };
  records: GlassRecord[];
}

// ─── Year extraction ────────────────────────────────────────────
const YEAR_PATTERNS = [
  // "2018-2022", "2018-", "2018–2022" (various dashes)
  { pattern: /\b(19|20)(\d{2})\s*[-–—]\s*(19|20)?(\d{2})?\b/, groupFrom: [1, 2], groupTo: [3, 4] },
  // "2010/2015" or "2010/ 2015"
  { pattern: /\b(19|20)(\d{2})\s*\/\s*(19|20)(\d{2})\b/, groupFrom: [1, 2], groupTo: [3, 4] },
  // Isolated year at start or after semicolon: "BMW X4 2018" or "2018; WS..."
  { pattern: /(?:^|;\s*)(19|20)(\d{2})\b/, groupFrom: [1, 2], groupTo: null },
];

function extractYear(description: string): { yearFrom: number | null; yearTo: number | null } {
  if (!description) return { yearFrom: null, yearTo: null };

  // Try each pattern
  for (const { pattern, groupFrom, groupTo } of YEAR_PATTERNS) {
    const match = description.match(pattern);
    if (match) {
      const centuryFrom = match[groupFrom[0]];
      const yearFromShort = match[groupFrom[1]];
      const yearFrom = parseInt(centuryFrom + yearFromShort, 10);

      let yearTo: number | null = null;
      if (groupTo && match[groupTo[0]] && match[groupTo[1]]) {
        const centuryTo = match[groupTo[0]];
        const yearToShort = match[groupTo[1]];
        yearTo = parseInt(centuryTo + yearToShort, 10);
      }

      // Sanity checks
      if (yearFrom >= 1960 && yearFrom <= 2030) {
        if (yearTo === null || (yearTo >= yearFrom && yearTo <= 2035)) {
          return { yearFrom, yearTo };
        }
      }
    }
  }

  return { yearFrom: null, yearTo: null };
}

// ─── Category inference ─────────────────────────────────────────
interface CategoryRule {
  test: (record: GlassRecord) => boolean;
  category: string;
  confidence: number; // higher = more certain
}

const CATEGORY_RULES: CategoryRule[] = [
  // === Eurocode suffix rules (highest confidence) ===
  // AG = Auto Glass / Windscreen (Pilkington convention)
  { test: (r) => /^\d{4}AG/i.test(r.eurocode), category: "frontrute", confidence: 90 },
  // AC = Auto Clear / Windscreen
  { test: (r) => /^\d{4}AC/i.test(r.eurocode), category: "frontrute", confidence: 85 },
  // AK = Auto... (windscreen variant)
  { test: (r) => /^\d{4}AK/i.test(r.eurocode), category: "frontrute", confidence: 80 },
  // AB = Auto... (older windscreen)
  { test: (r) => /^\d{4}AB/i.test(r.eurocode), category: "frontrute", confidence: 85 },
  // AS = Auto Solar (windscreen with solar properties)
  { test: (r) => /^\d{4}AS/i.test(r.eurocode), category: "frontrute", confidence: 70 },

  // LG = Left Glass (door)
  { test: (r) => /^\d{4}LG/i.test(r.eurocode), category: "siderute venstre", confidence: 90 },
  // LC = Left Clear / Left Door
  { test: (r) => /^\d{4}LC/i.test(r.eurocode), category: "siderute venstre", confidence: 85 },
  // LB = Left Back / Left Body
  { test: (r) => /^\d{4}LB/i.test(r.eurocode), category: "siderute venstre", confidence: 80 },
  // LY = Left privacy (green/yellow)
  { test: (r) => /^\d{4}LY/i.test(r.eurocode), category: "siderute venstre", confidence: 85 },

  // RG = Right Glass (door)
  { test: (r) => /^\d{4}RG/i.test(r.eurocode), category: "siderute høyre", confidence: 90 },
  // RC = Right Clear / Right Door
  { test: (r) => /^\d{4}RC/i.test(r.eurocode), category: "siderute høyre", confidence: 85 },
  // RB = Right Back / Right Body
  { test: (r) => /^\d{4}RB/i.test(r.eurocode), category: "siderute høyre", confidence: 80 },
  // RY = Right privacy (green/yellow)
  { test: (r) => /^\d{4}RY/i.test(r.eurocode), category: "siderute høyre", confidence: 85 },

  // BG = Back Glass
  { test: (r) => /^\d{4}BG/i.test(r.eurocode), category: "bakrute", confidence: 90 },
  // BY = Back privacy (yellow/green)
  { test: (r) => /^\d{4}BY/i.test(r.eurocode), category: "bakrute", confidence: 85 },
  // BC = Back Clear
  { test: (r) => /^\d{4}BC/i.test(r.eurocode), category: "bakrute", confidence: 80 },

  // GZ = Glass Zone / panoramic (can be roof or other)
  { test: (r) => /^\d{4}GZ/i.test(r.eurocode), category: "tak", confidence: 60 },

  // === Description hints (medium confidence) ===
  { test: (r) => /\bWS\b|WINDSCREEN|FRONT\s*GLASS|FRNTRUTE|WINDSCHUTZ/i.test(r.description), category: "frontrute", confidence: 75 },
  { test: (r) => /\bL\s+FD\b|\bL\s+RD\b|\bL\s+RQ\b|\bLEFT\s+DOOR\b|L\s*DGE/i.test(r.description), category: "siderute venstre", confidence: 75 },
  { test: (r) => /\bR\s+FD\b|\bR\s+RD\b|\bR\s+RQ\b|\bRIGHT\s+DOOR\b|R\s*DGE/i.test(r.description), category: "siderute høyre", confidence: 75 },
  { test: (r) => /\bBL\b|BACK\s+LIGHT|REAR\s+GLASS|BAKRUTE|BACK\s*WINDOW/i.test(r.description), category: "bakrute", confidence: 70 },
  { test: (r) => /\bROOF\b|\bTAK\b|PANORAMIC|SUN\s*ROOF|MOON\s*ROOF/i.test(r.description), category: "tak", confidence: 65 },
  { test: (r) => /QUARTER\s*GLASS|HJØRNE|QUARTER\s*LIGHT/i.test(r.description), category: "quarter", confidence: 65 },
  { test: (r) => /\bDOOR\s*GLASS\b|\bDØR\s*GLASS\b|DGE\s*PU|DGE\s*SAL/i.test(r.description), category: "dørglass", confidence: 60 },
  { test: (r) => /MIRROR\s*COVER|WIPER\s*ARM|SENSOR\s*GEL|ULTRAWIZ|COLD\s*KNIFE|LEVER\b/i.test(r.description), category: "tilbehør", confidence: 80 },
];

function inferCategory(record: GlassRecord): { category: string; confidence: number } {
  // If already well-categorized, keep it
  if (record.category && record.category !== "annet" && record.category !== "Unknown") {
    return { category: record.category, confidence: 100 };
  }

  let bestCategory = "annet";
  let bestConfidence = 0;

  for (const rule of CATEGORY_RULES) {
    if (rule.test(record) && rule.confidence > bestConfidence) {
      bestCategory = rule.category;
      bestConfidence = rule.confidence;
    }
  }

  return { category: bestCategory, confidence: bestConfidence };
}

// ─── Model normalization ────────────────────────────────────────
function decodeHtmlEntities(str: string | null): string | null {
  if (!str) return str;
  return str
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#\d+;/g, (match) => {
      try {
        return String.fromCharCode(parseInt(match.replace(/&#|;/g, ""), 10));
      } catch {
        return match;
      }
    });
}

function normalizeModel(model: string | null): string | null {
  if (!model) return model;
  let m = decodeHtmlEntities(model);
  if (!m) return m;
  // Trim extra spaces
  m = m.replace(/\s+/g, " ").trim();
  // Remove trailing special chars that aren't meaningful
  m = m.replace(/[-\/]+$/, "").trim();
  return m;
}

// ─── Main ───────────────────────────────────────────────────────
function main() {
  console.log("🔧 Enrich Master Catalog");
  console.log("========================\n");

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`❌ Fant ikke ${CATALOG_PATH}`);
    process.exit(1);
  }

  const data: CatalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const records = data.records;
  console.log(`📄 Lastet ${records.length.toLocaleString("no")} records\n`);

  let yearExtracted = 0;
  let yearToExtracted = 0;
  let categoryInferred = 0;
  let categoryChanged = 0;
  let modelNormalized = 0;

  const categoryChanges: Record<string, number> = {};

  for (const r of records) {
    // 1. Year extraction
    if (!r.yearFrom && r.description) {
      const { yearFrom, yearTo } = extractYear(r.description);
      if (yearFrom) {
        r.yearFrom = yearFrom;
        yearExtracted++;
        if (yearTo) {
          r.yearTo = yearTo;
          yearToExtracted++;
        }
      }
    }

    // 2. Category inference
    const oldCat = r.category;
    const { category: newCat, confidence } = inferCategory(r);
    if (newCat !== oldCat) {
      r.category = newCat;
      categoryChanged++;
      const key = `${oldCat} → ${newCat}`;
      categoryChanges[key] = (categoryChanges[key] || 0) + 1;
    }
    if (oldCat === "annet" || oldCat === "Unknown") {
      categoryInferred++;
    }

    // 3. Model normalization
    const oldModel = r.model;
    r.model = normalizeModel(r.model);
    if (r.model !== oldModel) {
      modelNormalized++;
    }
  }

  // Recalculate category stats
  const newCatCounts: Record<string, number> = {};
  for (const r of records) {
    newCatCounts[r.category] = (newCatCounts[r.category] || 0) + 1;
  }

  console.log("📊 Year extraction:");
  console.log(`   yearFrom extrahert: ${yearExtracted}`);
  console.log(`   yearTo extrahert:   ${yearToExtracted}`);

  console.log("\n📊 Category inference:");
  console.log(`   Endret kategori:    ${categoryChanged}`);
  console.log(`   Modell normalisert: ${modelNormalized}`);

  console.log("\n📊 Nye kategori-fordelinger:");
  for (const [cat, count] of Object.entries(newCatCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / records.length) * 100).toFixed(1);
    console.log(`   ${cat}: ${count} (${pct}%)`);
  }

  console.log("\n📊 Topp kategori-endringer:");
  Object.entries(categoryChanges)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => console.log(`   ${k}: ${v}`));

  // Save
  (data.meta as any).categories = newCatCounts;
  (data.meta as any).enrichedAt = new Date().toISOString();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`\n💾 Lagret til: ${OUTPUT_PATH}`);

  // Also update the original path for convenience
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
  console.log(`💾 Oppdatert:  ${CATALOG_PATH}`);
}

main();
