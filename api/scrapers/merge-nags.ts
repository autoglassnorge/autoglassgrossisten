/**
 * Merge NAGS Codes into Master Catalog
 * =====================================
 * Kobler NAGS-koder til eksisterende GlassRecord basert på:
 *   - make (merke)
 *   - model (modell — fuzzy match)
 *   - yearFrom/yearTo (år)
 *   - glass type (kategori)
 *
 * Kilder:
 *   - data/nags-vintage.json (Import Glass Corp PDF)
 *   - data/nags-modern-seed.json (web research)
 *
 * Kjøring:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' api/scrapers/merge-nags.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPER
// ============================================================================

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
  nagsCodes: string[];  // NEW
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
}

interface NagsEntry {
  nagsCode: string;
  suffix?: string | null;
  make?: string;
  model?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  yearRange?: string;  // vintage format like "42-66" or "2015-2020"
  glassType?: string;  // frontrute, bakrute, siderute, tak
  vehicle?: string;    // vintage raw vehicle string
  source: string;
  note?: string;
}

interface CatalogFile {
  meta: { mergedAt: string; totalRecords: number; sources: string[]; categories: Record<string, number> };
  records: GlassRecord[];
}

// ============================================================================
// NORMALIZER
// ============================================================================

const MAKE_ALIASES: Record<string, string> = {
  "gm": "CHEVROLET",
  "gmc": "GMC",
  "chevy": "CHEVROLET",
  "chev": "CHEVROLET",
  "merc": "MERCURY",
  "olds": "OLDSMOBILE",
  "pont": "PONTIAC",
  "chrys": "CHRYSLER",
  "ply": "PLYMOUTH",
  "intl": "INTERNATIONAL",
  "vw": "VOLKSWAGEN",
  "merc-benz": "MERCEDES-BENZ",
  "mb": "MERCEDES-BENZ",
};

function normalizeMake(make: string | null | undefined): string {
  if (!make) return "";
  const m = make.toUpperCase().trim();
  // Remove common suffixes
  const clean = m.replace(/\s+(TRUCK|PICKUP|VAN|CONVERTIBLE|COUPE|SEDAN|HATCHBACK|WAGON|CAB|UTILITY)\s*$/i, "").trim();
  return MAKE_ALIASES[clean.toLowerCase()] || clean;
}

function normalizeModel(model: string | null | undefined): string {
  if (!model) return "";
  return model.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYearRange(yearRange: string | undefined): { yearFrom: number | null; yearTo: number | null } {
  if (!yearRange) return { yearFrom: null, yearTo: null };
  const m = yearRange.match(/(\d{2,4})\s*[-–—]\s*(\d{2,4})?/);
  if (!m) return { yearFrom: null, yearTo: null };

  let from = parseInt(m[1], 10);
  let to = m[2] ? parseInt(m[2], 10) : null;

  // Fix 2-digit years
  if (from < 100) from = from < 30 ? 2000 + from : 1900 + from;
  if (to !== null && to < 100) to = to < 30 ? 2000 + to : 1900 + to;

  return { yearFrom: from, yearTo: to };
}

function inferGlassType(nagsCode: string): string {
  const prefix = nagsCode.substring(0, 2).toUpperCase();
  switch (prefix) {
    case "DW": case "FW": case "DL": case "FL": return "frontrute";
    case "DB": case "FB": return "bakrute";
    case "DD": case "FD": return "siderute";
    case "DQ": case "FQ": return "siderute";
    case "DV": case "FV": return "siderute";
    case "DS": case "FS": return "siderute";
    case "DR": case "FR": return "tak";
    case "DT": case "FT": return "annet";
    case "DP": return "annet";
    case "BB": return "bakrute";  // vintage back glass
    default: return "annet";
  }
}

function modelMatches(searchModel: string, recordModel: string | null): boolean {
  if (!recordModel) return false;
  const sm = normalizeModel(searchModel);
  const rm = normalizeModel(recordModel);

  // Direct inclusion
  if (sm.includes(rm) || rm.includes(sm)) return true;

  // Token overlap
  const sTokens = sm.split(/\s+/).filter(t => t.length >= 2);
  const rTokens = rm.split(/\s+/).filter(t => t.length >= 2);
  const common = sTokens.filter(t => rTokens.includes(t));

  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 3) return true;

  // Special case: short model names like "LS", "CT", "XT"
  const shortModels = ["LS", "CTS", "CT4", "CT5", "CT6", "XT4", "XT5", "XT6", "SRX", "XTS", "ATS", "G6", "G8", "H1", "H2", "H3", "PT"];
  for (const m of shortModels) {
    if (sTokens.includes(m) && rTokens.includes(m)) return true;
  }

  // Substring match within tokens (e.g., "F150" contains "150")
  for (const st of sTokens) {
    for (const rt of rTokens) {
      if (st.length >= 3 && rt.length >= 3) {
        if (st.includes(rt) || rt.includes(st)) return true;
      }
    }
  }

  return false;
}

// Extract make/model from vintage vehicle string
function parseVintageVehicle(vehicle: string): { make: string; model: string } {
  const v = vehicle.toUpperCase();

  // Common make extraction
  const makes = ["FORD", "CHEVROLET", "CHEVY", "GM", "GMC", "CHRYSLER", "DODGE", "PLYMOUTH",
    "JEEP", "CADILLAC", "LINCOLN", "MERCURY", "BUICK", "OLDSMOBILE", "PONTIAC",
    "TESLA", "RAM", "INTERNATIONAL", "VOLKSWAGEN", "VW", "NISSAN", "TOYOTA",
    "HONDA", "BMW", "MERCEDES", "AUDI", "VOLVO"];

  for (const make of makes) {
    if (v.includes(make)) {
      const rest = v.substring(v.indexOf(make) + make.length).trim();
      return { make, model: rest.replace(/^[\s,]+/, "").trim() };
    }
  }

  return { make: "", model: vehicle };
}

// ============================================================================
// LOAD NAGS DATA
// ============================================================================

function loadNagsData(): NagsEntry[] {
  const entries: NagsEntry[] = [];

  // Combined master file (includes all sources: MyGrant, Dominion, GlassKnow, forums, etc.)
  try {
    const combined = JSON.parse(fs.readFileSync("data/nags-all-combined.json", "utf-8"));
    for (const e of combined.entries) {
      entries.push(e);
    }
    console.log(`✅ Combined master: ${combined.entries.length} entries`);
    return entries; // All data is already combined, no need to load individual files
  } catch (e) {
    console.log("⚠️  No combined master, falling back to individual files");
  }

  // Modern seed data
  try {
    const modern = JSON.parse(fs.readFileSync("data/nags-modern-seed.json", "utf-8"));
    for (const e of modern.entries) {
      entries.push(e);
    }
    console.log(`✅ Modern seed: ${modern.entries.length} entries`);
  } catch (e) {
    console.log("⚠️  No modern seed data");
  }

  // Vintage data
  try {
    const vintage = JSON.parse(fs.readFileSync("data/nags-vintage.json", "utf-8"));
    for (const e of vintage.entries) {
      const { make, model } = parseVintageVehicle(e.vehicle);
      const { yearFrom, yearTo } = parseYearRange(e.yearRange);
      entries.push({
        nagsCode: e.nagsCode,
        make,
        model,
        yearFrom,
        yearTo,
        glassType: inferGlassType(e.nagsCode),
        vehicle: e.vehicle,
        source: e.source,
      });
    }
    console.log(`✅ Vintage data: ${vintage.entries.length} entries`);
  } catch (e) {
    console.log("⚠️  No vintage data");
  }

  return entries;
}

// ============================================================================
// MERGE
// ============================================================================

function mergeNagsIntoCatalog(catalog: CatalogFile, nagsEntries: NagsEntry[]): { updated: number; stats: Record<string, number> } {
  let updated = 0;
  const stats: Record<string, number> = {};
  const MAX_NAGS_PER_RECORD = 15;

  for (const nags of nagsEntries) {
    const nagsMake = normalizeMake(nags.make);
    const nagsModel = normalizeModel(nags.model);
    const nagsType = nags.glassType || inferGlassType(nags.nagsCode);

    if (!nagsMake) continue;

    // Parse NAGS model into individual model names (for multi-model entries like "F150, F250, EXPEDITION")
    const nagsModelNames = nagsModel.split(/[,\/\&]+/).map(m => m.trim()).filter(m => m.length >= 2);
    const isMultiModel = nagsModelNames.length > 1;

    // Find matching records
    const matches = catalog.records.filter((r) => {
      // Make match
      if (normalizeMake(r.brand) !== nagsMake) return false;

      // Type match
      const recordType = r.category?.toLowerCase() || "annet";
      const nagsTypeLower = nagsType.toLowerCase();
      if (nagsTypeLower !== recordType && !r.description?.toLowerCase().includes(nagsTypeLower)) {
        // Allow some flexibility — if NAGS says frontrute and record says annet, still consider
        if (recordType !== "annet") return false;
      }

      // Year overlap
      if (nags.yearFrom && r.yearTo && nags.yearFrom > r.yearTo) return false;
      if (nags.yearTo && r.yearFrom && nags.yearTo < r.yearFrom) return false;

      // Model match (fuzzy)
      if (nagsModel && r.model) {
        const rModelNorm = normalizeModel(r.model);
        
        // For multi-model NAGS entries, require catalog model to match at least 2 models
        // OR match the primary model with high confidence
        if (isMultiModel && nagsModelNames.length >= 2) {
          let matchCount = 0;
          for (const nm of nagsModelNames) {
            if (modelMatches(nm, r.model) || rModelNorm.includes(nm) || nm.includes(rModelNorm)) {
              matchCount++;
            }
          }
          // Require at least 2 model matches, or a very specific single match
          if (matchCount < 2) {
            // Exception: if catalog model is very specific and matches one model exactly
            const rTokens = rModelNorm.split(/\s+/).filter(t => t.length >= 3);
            const exactMatch = nagsModelNames.some(nm => rTokens.some(t => t === nm));
            if (!exactMatch) return false;
          }
        } else {
          if (!modelMatches(nagsModel, r.model)) return false;
        }
        return true;
      }

      return true;
    });

    if (matches.length > 0) {
      // Add NAGS code to all matches
      const fullNags = nags.suffix ? `${nags.nagsCode} ${nags.suffix}` : nags.nagsCode;
      for (const match of matches) {
        if (!match.nagsCodes) match.nagsCodes = [];
        if (match.nagsCodes.length >= MAX_NAGS_PER_RECORD) continue;
        if (!match.nagsCodes.includes(fullNags)) {
          match.nagsCodes.push(fullNags);
          updated++;
        }
      }

      stats[nagsMake] = (stats[nagsMake] || 0) + matches.length;
    }
  }

  return { updated, stats };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log("🔀 Merge NAGS Codes into Catalog");
  console.log("=================================\n");

  // Load catalog
  const catalog: CatalogFile = JSON.parse(fs.readFileSync("data/catalog-prod.json", "utf-8"));
  console.log(`📦 Catalog: ${catalog.records.length} records`);

  // Initialize nagsCodes if missing
  for (const r of catalog.records) {
    if (!r.nagsCodes) r.nagsCodes = [];
  }

  // Load NAGS data
  const nagsEntries = loadNagsData();
  console.log(`🔍 Total NAGS entries to merge: ${nagsEntries.length}\n`);

  // Merge
  console.log("🔄 Merging...");
  const { updated, stats } = mergeNagsIntoCatalog(catalog, nagsEntries);

  // Results
  console.log(`\n📊 Results:`);
  console.log(`   Records with NAGS codes added: ${updated}`);
  console.log(`   Unique brands affected:`);
  for (const [brand, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${brand}: ${count} matches`);
  }

  // Count total records with NAGS
  const withNags = catalog.records.filter(r => r.nagsCodes && r.nagsCodes.length > 0);
  console.log(`\n   Total records with ≥1 NAGS code: ${withNags.length}`);

  // Show some examples
  console.log(`\n📝 Examples:`);
  withNags.slice(0, 5).forEach(r => {
    console.log(`   ${r.eurocode} | ${r.brand} ${r.model} ${r.yearFrom}-${r.yearTo} | NAGS: ${r.nagsCodes.join(", ")}`);
  });

  // Save
  const outputPath = path.join(process.cwd(), "data", "catalog-prod.json");
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  console.log(`\n💾 Saved to: ${outputPath}`);
}

main();
