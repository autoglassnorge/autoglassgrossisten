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
import type { GlassRecord } from "../../../src/types";
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
const BOVSOFT_V2_PATH = path.resolve(ROOT, "../../data/finn-no-regnr/verified-bovsoft-v2.ndjson");
const VERIFIED_REGNR_PATH = path.resolve(ROOT, "../../data/finn-no-regnr/verified-regnr.ndjson");
const CATALOG_PATH = path.resolve(ROOT, "data/catalog-prod.json");

const CATEGORY_ORDER = ["frontrute", "bakrute", "sideglass", "dørglass"] as const;

type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  expected: Record<string, string[]>;
  hasCollision?: boolean;
  collisionGroup?: string;
};

type Source = {
  path: string;
  label: "bovsoft" | "bovsoft-v2" | "verified-regnr";
  useKtypeDedup: boolean;
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
  catalog: GlassRecord[],
  make: string,
  model: string,
  year: number
): Record<string, string[]> | null {
  const expected: Record<string, string[]> = {};
  for (const rec of catalog) {
    if (!rec.eurocode) continue;
    const cat = categoryOf(rec);
    if (!cat || isCrossReference(rec)) continue;
    const recBrand = normalizeBrand(rec.brand || "");
    if (recBrand !== make) continue;
    if (!modelMatches(model, rec.model, make)) continue;
    if (!yearCompatible(rec, year, make, model)) continue;

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

function findVariantCollisions(candidates: Candidate[]): Set<string> {
  const variantsByKey = new Map<string, Set<string>>();

  for (const c of candidates) {
    const key = `${c.make}|${c.model.toUpperCase()}|${c.year}`;
    // For sources with a TecDoc kType, the kType is the strongest disambiguator.
    // For regnr-only sources, use the raw SVV/model string as the variant id.
    const variantId = c.ktype ? c.ktype : `${c.source}:${c.model.toUpperCase()}`;
    if (!variantsByKey.has(key)) variantsByKey.set(key, new Set());
    variantsByKey.get(key)!.add(variantId);
  }

  const collisions = new Set<string>();
  for (const [key, variants] of variantsByKey) {
    if (variants.size > 1) {
      collisions.add(key);
    }
  }
  return collisions;
}

type Candidate = {
  make: string;
  model: string;
  year: number;
  source: string;
  useKtypeDedup: boolean;
  ktype: string;
};

function main() {
  const catalogRaw = loadJson<unknown>(CATALOG_PATH);
  const catalog: GlassRecord[] = Array.isArray(catalogRaw)
    ? (catalogRaw as GlassRecord[])
    : ((catalogRaw as any).records || []) as GlassRecord[];

  const sources: Source[] = [];
  if (fs.existsSync(BOVSOFT_PATH)) {
    sources.push({
      path: BOVSOFT_PATH,
      label: "bovsoft",
      useKtypeDedup: false,
    });
  }
  if (fs.existsSync(BOVSOFT_V2_PATH)) {
    sources.push({
      path: BOVSOFT_V2_PATH,
      label: "bovsoft-v2",
      useKtypeDedup: true,
    });
  }
  if (fs.existsSync(VERIFIED_REGNR_PATH)) {
    sources.push({
      path: VERIFIED_REGNR_PATH,
      label: "verified-regnr",
      useKtypeDedup: false,
    });
  }
  if (sources.length === 0) {
    console.error("No input data found");
    process.exit(1);
  }

  const candidates: Candidate[] = [];
  for (const source of sources) {
    const rows = loadNdjson<any>(source.path);
    for (const r of rows) {
      let make: string | undefined;
      let model: string | undefined;
      let year: number | null = null;

      if (source.label === "bovsoft" || source.label === "bovsoft-v2") {
        make = normalizeBrand(r.brand);
        model = r.model || "";
        year = parseYear(r.yearFrom) || parseYear(r.yearTo);
      } else {
        make = normalizeBrand(r.svvBrand || r.brand);
        model = r.svvModel || r.model || "";
        year = typeof r.svvYear === "number" ? r.svvYear : null;
      }

      if (!make || !model || !year) continue;

      const ktype = source.useKtypeDedup && r.ktype != null ? String(r.ktype) : "";
      candidates.push({
        make,
        model,
        year,
        source: source.label,
        useKtypeDedup: source.useKtypeDedup,
        ktype,
      });
    }
  }

  const collisionKeys = findVariantCollisions(candidates);

  const seen = new Set<string>();
  const fixtures: Fixture[] = [];
  let counter = 1;

  for (const c of candidates) {
    const key = `${c.make}|${c.model.toUpperCase()}|${c.year}|${c.ktype}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const expected = computeExpected(catalog, c.make, c.model, c.year);
    if (!expected) continue;

    const collisionKey = `${c.make}|${c.model.toUpperCase()}|${c.year}`;
    const isCollision = collisionKeys.has(collisionKey);

    fixtures.push({
      regnr: `REAL${String(counter).padStart(3, "0")}`,
      make: c.make,
      model: c.model,
      year: c.year,
      expected,
      hasCollision: isCollision,
      collisionGroup: isCollision ? collisionKey : undefined,
    });
    counter++;
  }

  const collisionCount = fixtures.filter((f) => f.hasCollision).length;
  console.log(`  Collisions: ${collisionCount}/${fixtures.length}`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`Wrote ${fixtures.length} real fixtures to ${OUT_PATH}`);
  console.log(`  Sources: ${sources.map((s) => s.label).join(", ")}`);
}

main();
