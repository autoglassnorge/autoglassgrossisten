/**
 * Generate a data-driven golden fixture for the search accuracy harness.
 *
 * Input:
 *   - data/catalog-prod.json (eurocode → category/type_code/make/model/year)
 *
 * Output:
 *   - api/cf-worker/test/search-accuracy/fixtures/golden-generated.json
 */

import fs from "fs";
import path from "path";
import {
  expectedGeneration,
  parseGenerationFromDescription,
} from "../../../src/lib/generation";

const ROOT = path.resolve(__dirname, "../../../../..");
const OUT_PATH = path.resolve(
  ROOT,
  "api/cf-worker/test/search-accuracy/fixtures/golden-generated.json"
);

const CATEGORY_ORDER = ["frontrute", "bakrute", "sideglass", "dørglass"] as const;

type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  expected: Record<string, string[]>;
};

function normalizeBrand(brand: string): string {
  const map: Record<string, string> = {
    VOLKSWAGEN: "VW",
    "MERCEDES-BENZ": "MERCEDES",
    "MERCEDES BENZ": "MERCEDES",
  };
  return map[brand.toUpperCase()] || brand.toUpperCase();
}

function categoryFromTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null;
  const tc = typeCode.toUpperCase();
  if (tc === "F") return "frontrute";
  if (tc === "B") return "bakrute";
  if (tc.startsWith("D")) return "dørglass";
  if (tc.startsWith("S")) return "sideglass";
  return null;
}

function categoryFromRecordCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c.includes("frontrute")) return "frontrute";
  if (c.includes("bakrute")) return "bakrute";
  if (c.includes("dør") || c.includes("dor") || c.includes("dørrute")) return "dørglass";
  if (c.includes("side") || c.includes("siderute") || c.includes("quarter")) return "sideglass";
  return null;
}

function loadJson<T>(relPath: string): T {
  const full = path.resolve(ROOT, relPath);
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

function main() {
  const catalogRaw = loadJson<any>("data/catalog-prod.json");
  const catalog: any[] = Array.isArray(catalogRaw)
    ? catalogRaw
    : catalogRaw.records || [];

  const fixtures: Fixture[] = [];

  function modelCode(s: string): string {
    return s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  function wordTokens(s: string): Set<string> {
    return new Set(
      s
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((t) => t.length >= 2)
    );
  }

  function matchesFamily(
    rec: any,
    family: { make: string; tokens: string[] }
  ): boolean {
    if (normalizeBrand(rec.brand) !== family.make) return false;
    const modelNorm = modelCode(rec.model || "");
    const modelWords = wordTokens(rec.model || "");
    const descWords = wordTokens(rec.description || "");
    return family.tokens.some(
      (t) =>
        modelNorm.includes(t) ||
        modelWords.has(t) ||
        descWords.has(t)
    );
  }

  function yearCovers(rec: any, year: number): boolean {
    const from = rec.year_from ? Number(rec.year_from) : null;
    const to = rec.year_to ? Number(rec.year_to) : null;
    if (from != null && year < from) return false;
    if (to != null && to > 0 && year > to) return false;
    return true;
  }

  function categoryOf(rec: any): string | null {
    return categoryFromRecordCategory(rec.category) || categoryFromTypeCode(rec.type_code);
  }

  function isCrossReference(rec: any): boolean {
    const desc = (rec.description || "").toUpperCase().trim();
    return (
      desc.startsWith("USE ") ||
      desc.startsWith("BRUK ") ||
      desc.startsWith("+++USE") ||
      desc.startsWith("+++ USE")
    );
  }

  function generationMatches(rec: any, make: string, model: string, year: number): boolean {
    const expectedGen = expectedGeneration(make, model, year);
    if (!expectedGen) return true;
    const recordGen =
      parseGenerationFromDescription(rec.description) ||
      parseGenerationFromDescription(rec.model);
    if (recordGen && recordGen !== expectedGen) return false;
    return true;
  }

  // Synthetic supplements for known alias-heavy families.
  // For each family we pick the catalog records whose make/model and year range
  // match the target vehicle, then use those exact eurocodes as expected answers.
  // This keeps the golden set realistic and avoids over-broad kType-based sets.
  const targetFamilies = [
    { make: "VW", tokens: ["TRANSPORTER", "T5", "T6"], modelLike: "Transporter", year: 2015 },
    { make: "VW", tokens: ["GOLF"], modelLike: "Golf", year: 2018 },
    { make: "VOLVO", tokens: ["XC60"], modelLike: "XC60", year: 2018 },
    { make: "VOLVO", tokens: ["V70"], modelLike: "V70", year: 2012 },
    { make: "BMW", tokens: ["3SERIE", "3ER"], modelLike: "3 Serie", year: 2016 },
    { make: "BMW", tokens: ["5SERIE", "5ER"], modelLike: "5 Serie", year: 2016 },
    { make: "AUDI", tokens: ["A4"], modelLike: "A4", year: 2016 },
    { make: "AUDI", tokens: ["A6"], modelLike: "A6", year: 2016 },
    { make: "MERCEDES", tokens: ["CCLASS", "CKLASSE", "W205", "W206"], modelLike: "C-Class", year: 2021 },
    { make: "MERCEDES", tokens: ["ECLASS", "EKLASSE", "W213"], modelLike: "E-Class", year: 2018 },
    { make: "MERCEDES", tokens: ["ACLASS", "AKLASSE", "W177"], modelLike: "A-Class", year: 2018 },
    { make: "SKODA", tokens: ["OCTAVIA"], modelLike: "Octavia", year: 2018 },
    { make: "SKODA", tokens: ["SUPERB"], modelLike: "Superb", year: 2018 },
    { make: "FORD", tokens: ["FOCUS"], modelLike: "Focus", year: 2016 },
    { make: "FORD", tokens: ["MONDEO"], modelLike: "Mondeo", year: 2016 },
    { make: "TOYOTA", tokens: ["COROLLA"], modelLike: "Corolla", year: 2016 },
    { make: "TOYOTA", tokens: ["RAV4"], modelLike: "RAV4", year: 2016 },
  ];

  let syntheticCounter = 1;
  for (const family of targetFamilies) {
    const matches = catalog.filter(
      (rec) =>
        rec.eurocode &&
        categoryOf(rec) &&
        !isCrossReference(rec) &&
        matchesFamily(rec, family) &&
        yearCovers(rec, family.year) &&
        generationMatches(rec, family.make, family.modelLike, family.year)
    );

    if (matches.length === 0) continue;

    // Use the most common model token as the canonical model for this fixture.
    const modelCounts = new Map<string, number>();
    for (const rec of matches) {
      const code = modelCode(rec.model || "");
      if (code) modelCounts.set(code, (modelCounts.get(code) || 0) + 1);
    }
    const topModel = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

    const expected: Record<string, string[]> = {};
    for (const rec of matches) {
      // Keep records that share the dominant model code, but also allow
      // generation-specific siblings (e.g. W205/W206) to coexist.
      if (topModel && modelCode(rec.model || "") !== topModel) continue;
      const cat = categoryOf(rec);
      if (!cat) continue;
      if (!expected[cat]) expected[cat] = [];
      expected[cat].push(rec.eurocode);
    }

    const cleaned: Record<string, string[]> = {};
    for (const cat of CATEGORY_ORDER) {
      const list = expected[cat] || [];
      if (list.length) cleaned[cat] = Array.from(new Set(list)).sort();
    }
    if (Object.keys(cleaned).length === 0) continue;

    fixtures.push({
      regnr: `SYNTH${String(syntheticCounter).padStart(3, "0")}`,
      make: family.make,
      model: family.modelLike,
      year: family.year,
      expected: cleaned,
    });
    syntheticCounter++;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`Wrote ${fixtures.length} fixtures to ${OUT_PATH}`);
  console.log(`  Synthetic families: ${syntheticCounter - 1}`);
}

main();
