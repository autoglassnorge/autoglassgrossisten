/**
 * Post-process Pilkington products
 * Fixes type detection, normalizes brands, enriches data
 */

import * as fs from "fs";
import * as path from "path";

const INPUT_PATH = path.join(process.cwd(), "data", "scrapers", "pilkington-products.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "pilkington-products.json");

interface PilkingtonProduct {
  id: number;
  eurocode: string;
  name: string;
  brand: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  type: string;
  flags: string[];
  images: string[];
  url: string;
  scrapedAt: string;
}

// Type mapping from Pilkington abbreviations
const TYPE_MAP: Record<string, string> = {
  "W": "WS",      // Windscreen (sometimes just "W" instead of "WS")
  "WS": "WS",     // Windscreen
  "SG": "SG",     // Side Glass
  "BG": "BG",     // Back Glass
  "QG": "QG",     // Quarter Glass
  "DG": "DG",     // Door Glass
  "TW": "TW",     // Truck Windscreen
  "TS": "TS",     // Truck Side
  "TB": "TB",     // Truck Back
  "RG": "RG",     // Rear Glass
  "RS": "RS",     // Rear Screen
};

// Normalize brand names
function normalizeBrand(brand: string): string {
  const map: Record<string, string> = {
    "ALFA ROMEO": "ALFA", "ALFA-ROMEO": "ALFA",
    "LAND ROVER": "LANDROVER", "LAND-ROVER": "LANDROVER",
    "ROLLS ROYCE": "ROLLSROYCE", "ROLLS-ROYCE": "ROLLSROYCE",
    "ASTON MARTIN": "ASTONMARTIN", "ASTON-MARTIN": "ASTONMARTIN",
    "GREAT WALL": "GREATWALL",
    "MERCEDES BENZ": "MERCEDES", "MERCEDES-BENZ": "MERCEDES",
    "VW": "VOLKSWAGEN",
    "VAUXHALL": "OPEL",
  };
  return map[brand.toUpperCase()] || brand.toUpperCase();
}

function parseType(name: string): { type: string; flags: string[] } {
  const parts = name.split(";");
  const flagsPart = parts[1]?.trim() || "";
  const tokens = flagsPart.split(/\s+/).filter(t => t);

  if (tokens.length === 0) return { type: "", flags: [] };

  const firstToken = tokens[0].toUpperCase();

  // Direct mapping
  if (TYPE_MAP[firstToken]) {
    return { type: TYPE_MAP[firstToken], flags: tokens.slice(1) };
  }

  // Try to detect from context
  if (firstToken.startsWith("W")) return { type: "WS", flags: tokens };

  return { type: "", flags: tokens };
}

function main() {
  console.log("🔧 Post-process Pilkington products");
  console.log("====================================\n");

  if (!fs.existsSync(INPUT_PATH)) {
    console.log(`⚠️  Input ikke funnet: ${INPUT_PATH}`);
    console.log("   (Pilkington scraper er ikke ferdig ennå)");
    return;
  }

  const products: PilkingtonProduct[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  console.log(`📂 Laster ${products.length} produkter`);

  const typeCounts = new Map<string, number>();
  let fixed = 0;

  for (const p of products) {
    const { type, flags } = parseType(p.name);

    if (type && type !== p.type) {
      p.type = type;
      p.flags = flags;
      fixed++;
    }

    p.brand = normalizeBrand(p.brand);

    typeCounts.set(p.type || "UNKNOWN", (typeCounts.get(p.type || "UNKNOWN") || 0) + 1);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 1));

  console.log(`\n📊 Type-fordeling etter fiks:`);
  for (const [t, c] of Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t}: ${c}`);
  }

  console.log(`\n🔧 Fikset type for ${fixed} produkter`);
  console.log(`💾 Lagret til: ${OUTPUT_PATH}`);
}

main();
