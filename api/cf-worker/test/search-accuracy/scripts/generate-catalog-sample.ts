/**
 * Generate a targeted catalog sample for the search accuracy harness.
 *
 * Input:
 *   - data/catalog-prod.json
 *   - api/cf-worker/test/search-accuracy/fixtures/*.json (all golden sets)
 *
 * Output:
 *   - api/cf-worker/test/search-accuracy/fixtures/catalog-sample.json
 *
 * Includes every catalog record whose eurocode appears in any fixture's
 * expected answers, so the harness stays fast and self-contained.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../../..");
const FIXTURES_DIR = path.resolve(ROOT, "api/cf-worker/test/search-accuracy/fixtures");
const CATALOG_PATH = path.resolve(ROOT, "data/catalog-prod.json");
const OUT_PATH = path.resolve(FIXTURES_DIR, "catalog-sample.json");

const FIXTURE_FILES = [
  "sample-golden.json",
  "no-ground-truth-fixtures.json",
  "golden-generated.json",
  "golden-real.json",
];

type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  expected: Record<string, string[]>;
};

function loadJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function main() {
  const catalogRaw = loadJson<any>(CATALOG_PATH);
  const catalog: any[] = Array.isArray(catalogRaw)
    ? catalogRaw
    : catalogRaw.records || [];

  const needed = new Set<string>();
  for (const name of FIXTURE_FILES) {
    const p = path.resolve(FIXTURES_DIR, name);
    if (!fs.existsSync(p)) {
      console.warn(`Skipping missing fixture: ${name}`);
      continue;
    }
    const fixtures = loadJson<Fixture[]>(p);
    for (const f of fixtures) {
      for (const list of Object.values(f.expected)) {
        for (const code of list) {
          if (code) needed.add(code);
        }
      }
    }
  }

  const filtered = catalog.filter((r) => {
    const code = String(r.eurocode ?? "");
    return code && needed.has(code);
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(filtered) + "\n");
  console.log(`Wrote ${filtered.length} catalog records to ${OUT_PATH}`);
  console.log(`  Needed eurocodes: ${needed.size}`);
}

main();
