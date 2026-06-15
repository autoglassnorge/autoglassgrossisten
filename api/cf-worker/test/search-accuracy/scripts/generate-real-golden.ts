/**
 * Generate real-vehicle golden fixtures from verified Norwegian regnr data.
 *
 * Input (outside the committed worktree):
 *   - /Users/taj/bilglass/data/finn-no-regnr/verified-bovsoft.ndjson
 *   - /Users/taj/bilglass/data/finn-no-regnr/verified-regnr.ndjson
 *   - data/catalog-prod.json
 *
 * Output:
 *   - api/cf-worker/test/search-accuracy/fixtures/golden-real.json
 *
 * The output is anonymized (synthetic regnr identifiers, no VIN) so real
 * Norwegian registration numbers are not committed to the repository.
 */

import fs from "fs";
import path from "path";
import {
  modelMatches,
  yearCompatible,
} from "../../../src/lib/scoring";

const ROOT = path.resolve(__dirname, "../../../../..");
const OUT_PATH = path.resolve(
  ROOT,
  "api/cf-worker/test/search-accuracy/fixtures/golden-real.json"
);

// Verified data lives in the main bilglass repo (gitignored there).
const BOVSOFT_PATH = path.resolve(ROOT, "../../data/finn-no-regnr/verified-bovsoft.ndjson");
const VERIFIED_REGNR_PATH = path.resolve(ROOT, "../../data/finn-no-regnr/verified-regnr.ndjson");
const CATALOG_PATH = path.resolve(ROOT, "data/catalog-prod.json");

const CATEGORY_ORDER = ["frontrute", "bakrute", "sideglass", "dørglass"] as const;

type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
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

function parseYear(y: string | null | undefined): number | null {
  if (!y || typeof y !== "string") return null;
  const m = y.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function loadJson<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(relPath, "utf8")) as T;
}

function loadNdjson<T>(p: string): T[] {
  const text = fs.readFileSync(p, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

function computeExpected(
  catalog: any[],
  make: string,
  model: string,
  year: number
): Record<string, string[]> | null {
  const expected: Record<string, string[]> = {};
  for (const rec of catalog) {
    if (!rec.eurocode || !categoryOf(rec) || isCrossReference(rec)) continue;
    const recBrand = normalizeBrand(rec.brand || "");
    if (recBrand !== make) continue;
    if (!modelMatches(model, rec.model, make)) continue;
    if (!yearCompatible(rec, year, make, model)) continue;

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
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function main() {
  const catalogRaw = loadJson<any>(CATALOG_PATH);
  const catalog: any[] = Array.isArray(catalogRaw)
    ? catalogRaw
    : catalogRaw.records || [];

  const sources: { path: string; label: string }[] = [];
  if (fs.existsSync(BOVSOFT_PATH)) sources.push({ path: BOVSOFT_PATH, label: "bovsoft" });
  if (fs.existsSync(VERIFIED_REGNR_PATH)) sources.push({ path: VERIFIED_REGNR_PATH, label: "verified-regnr" });
  if (sources.length === 0) {
    console.error("No input data found");
    process.exit(1);
  }

  const seen = new Set<string>();
  const fixtures: Fixture[] = [];
  let counter = 1;

  for (const source of sources) {
    const rows = loadNdjson<any>(source.path);
    for (const r of rows) {
      let make: string | undefined;
      let model: string | undefined;
      let year: number | null = null;

      if (source.label === "bovsoft") {
        make = normalizeBrand(r.brand);
        model = r.model || "";
        year = parseYear(r.yearFrom) || parseYear(r.yearTo);
      } else {
        make = normalizeBrand(r.svvBrand || r.brand);
        model = r.svvModel || r.model || "";
        year = typeof r.svvYear === "number" ? r.svvYear : null;
      }

      if (!make || !model || !year) continue;

      // Deduplicate on normalized vehicle identity to avoid a handful of models
      // dominating the suite.
      const key = `${make}|${model.toUpperCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const expected = computeExpected(catalog, make, model, year);
      if (!expected) continue;

      fixtures.push({
        regnr: `REAL${String(counter).padStart(3, "0")}`,
        make,
        model,
        year,
        expected,
      });
      counter++;
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`Wrote ${fixtures.length} real fixtures to ${OUT_PATH}`);
  console.log(`  Sources: ${sources.map((s) => s.label).join(", ")}`);
}

main();
