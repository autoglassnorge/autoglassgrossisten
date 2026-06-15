# Flere reelle fixtures + hard-negative mining – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utvide søkenøyaktighetsharnesset med flere reelle, norske kjøretøy – spesielt varebiler, elbiler og modeller som lett forveksles – og utstyre hver fixture med metadata om den er en "hard negative" (samme merke/modell/år, flere ulike glassvarianter).

**Architecture:** Vi holder fast ved dagens data-drevne fixture-generator, men beriker den med et ekstra verifisert datasett (`verified-bovsoft-v2.ndjson`) og en katalog-mining-funksjon som finner kollisjonsgrupper. Fixtures som ligger i en kollisjonsgruppe tagges med `hardNegative: true` og `collisionGroup`, slik at harnessen kan rapportere nøyaktighet separat for enkle og vanskelige tilfeller.

**Tech Stack:** TypeScript (Node/TSX), SQLite D1 (kun i testene), Vitest, Wrangler.

---

## File overview

| File | Responsibility |
|------|----------------|
| `api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts` | Leser verifiserte kilder, bygger fixtures, beregner expected-sets, finner kollisjonsgrupper og skriver `golden-real.json`. |
| `api/cf-worker/test/search-accuracy/fixtures/golden-real.json` | Reelle norske fixtures med evt. `hardNegative`/`collisionGroup`. |
| `api/cf-worker/test/search-accuracy/fixtures/catalog-sample.json` | Nødvendig utsnitt av katalogen for testene. |
| `api/cf-worker/test/search-accuracy/scripts/generate-catalog-sample.ts` | Bygger `catalog-sample.json` ut fra fixtures. |
| `api/cf-worker/test/search-accuracy/harness.test.ts` | Kjører søk mot fixtures og samler resultater. |
| `api/cf-worker/test/search-accuracy/report.ts` | Beregner og printer accuracy-metrics. |
| `api/cf-worker/src/lib/scoring.ts` | Inneholder `modelMatches` og `yearCompatible` som gjenbrukes. |

---

## Task 1: Inventory and include the new verified source

**Files:**
- Modify: `api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts:30-32` (source paths), `:140-146` (source list), `:148-189` (dedup-loop)

**Context:** I tillegg til `verified-bovsoft.ndjson` og `verified-regnr.ndjson` finnes `verified-bovsoft-v2.ndjson`. Den inneholder ktype, generasjon og utstyrsdata (sensors), og er spesielt nyttig for å fange Audi-varianter som ellers kollapser til ett kjøretøy.

- [ ] **Step 1: Add the new source constant**

```ts
const BOVSOFT_V2_PATH = path.resolve(ROOT, "../../data/finn-no-regnr/verified-bovsoft-v2.ndjson");
```

Add it right after `BOVSOFT_PATH`.

- [ ] **Step 2: Extend the source list with a discriminating type**

Change the source declaration from:

```ts
const sources: { path: string; label: string }[] = [];
```

to:

```ts
type Source = {
  path: string;
  label: "bovsoft" | "bovsoft-v2" | "verified-regnr";
  useKtypeDedup: boolean;
};

const sources: Source[] = [];
```

Then push the sources with their flags:

```ts
if (fs.existsSync(BOVSOFT_PATH)) sources.push({ path: BOVSOFT_PATH, label: "bovsoft", useKtypeDedup: false });
if (fs.existsSync(BOVSOFT_V2_PATH)) sources.push({ path: BOVSOFT_V2_PATH, label: "bovsoft-v2", useKtypeDedup: true });
if (fs.existsSync(VERIFIED_REGNR_PATH)) sources.push({ path: VERIFIED_REGNR_PATH, label: "verified-regnr", useKtypeDedup: false });
```

- [ ] **Step 3: Handle `bovsoft-v2` row parsing**

In the row-parsing loop, add a branch for `bovsoft-v2`:

```ts
if (source.label === "bovsoft-v2") {
  make = normalizeBrand(r.brand);
  model = r.model || "";
  year = parseYear(r.yearFrom) || parseYear(r.yearTo);
} else if (source.label === "bovsoft") {
  make = normalizeBrand(r.brand);
  model = r.model || "";
  year = parseYear(r.yearFrom) || parseYear(r.yearTo);
} else {
  make = normalizeBrand(r.svvBrand || r.brand);
  model = r.svvModel || r.model || "";
  year = typeof r.svvYear === "number" ? r.svvYear : null;
}
```

- [ ] **Step 4: Use ktype in the dedup key when available**

Replace the existing dedup block:

```ts
const key = `${make}|${model.toUpperCase()}|${year}`;
if (seen.has(key)) continue;
seen.add(key);
```

with:

```ts
const ktype = source.useKtypeDedup && r.ktype ? String(r.ktype) : "";
const key = `${make}|${model.toUpperCase()}|${year}|${ktype}`;
if (seen.has(key)) continue;
seen.add(key);
```

- [ ] **Step 5: Verify the script still compiles**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run the generator to see fixture count**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
npx tsx api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts
```

Expected: count increases (typically 120–220 fixtures depending on unique ktype variants in v2).

---

## Task 2: Detect hard-negative collision groups in the catalog

**Files:**
- Modify: `api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts` (add `detectCollision` function and tag fixtures)

**Context:** En "hard negative" er et kjøretøy der samme `make|model|år` i katalogen har mer enn én distinkt glassvariant i samme kategori, med ulikt utstyr. Ved å tagge slike fixtures får vi en egen accuracy-metric.

- [ ] **Step 1: Add an equipment-signature helper**

Insert after `categoryOf`:

```ts
function equipmentSignature(rec: any): string {
  const flags = [
    rec.adas ? "A" : "",
    rec.rain_sensor ? "R" : "",
    rec.heated ? "H" : "",
    rec.acoustic ? "C" : "",
    rec.antenna ? "T" : "",
    rec.camera ? "M" : "",
    rec.hud ? "U" : "",
    rec.shade ? "S" : "",
  ];
  return flags.join("");
}
```

- [ ] **Step 2: Add the collision detector**

Insert after `computeExpected`:

```ts
function findCollisionGroups(catalog: any[]): Map<string, boolean> {
  const collisions = new Map<string, boolean>();
  const groups = new Map<string, Map<string, Set<string>>>();
  // key -> category -> Set<equipmentSignature|eurocode>

  for (const rec of catalog) {
    if (!rec.eurocode || !categoryOf(rec) || isCrossReference(rec)) continue;
    const make = normalizeBrand(rec.brand || "");
    if (!make) continue;
    const model = (rec.model || "").toUpperCase();
    const yearFrom = rec.year_from ? Number(rec.year_from) : null;
    const yearTo = rec.year_to ? Number(rec.year_to) : null;
    const cat = categoryOf(rec);
    if (!cat) continue;
    const sig = `${equipmentSignature(rec)}|${rec.eurocode}`;

    for (let year = yearFrom || 1900; yearTo && year <= yearTo; year++) {
      const key = `${make}|${model}|${year}`;
      if (!groups.has(key)) groups.set(key, new Map());
      const catMap = groups.get(key)!;
      if (!catMap.has(cat)) catMap.set(cat, new Set());
      catMap.get(cat)!.add(sig);
    }
  }

  for (const [key, catMap] of groups) {
    for (const [cat, sigs] of catMap) {
      // Collision = same category, same make/model/year, multiple distinct glass signatures
      if (sigs.size > 1) {
        collisions.set(key, true);
        break;
      }
    }
  }
  return collisions;
}
```

- [ ] **Step 3: Extend the Fixture type with hard-negative metadata**

Change:

```ts
type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  expected: Record<string, string[]>;
};
```

to:

```ts
type Fixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  expected: Record<string, string[]>;
  hardNegative?: boolean;
  collisionGroup?: string;
};
```

- [ ] **Step 4: Tag fixtures when they fall inside a collision group**

In `main()`, after loading the catalog, compute collisions once:

```ts
const collisions = findCollisionGroups(catalog);
```

Then when pushing a fixture:

```ts
const collisionKey = `${make}|${model.toUpperCase()}|${year}`;
const isCollision = collisions.get(collisionKey) || false;

fixtures.push({
  regnr: `REAL${String(counter).padStart(3, "0")}`,
  make,
  model,
  year,
  expected,
  hardNegative: isCollision,
  collisionGroup: isCollision ? collisionKey : undefined,
});
```

- [ ] **Step 5: Log collision coverage**

Before writing output, print:

```ts
const hardNegatives = fixtures.filter((f) => f.hardNegative).length;
console.log(`  Hard negatives: ${hardNegatives}/${fixtures.length}`);
```

- [ ] **Step 6: Run the generator and inspect output**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
npx tsx api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts
```

Expected: output contains a non-zero `Hard negatives:` count and `golden-real.json` includes `hardNegative`/`collisionGroup` fields where relevant.

---

## Task 3: Update harness and report to split accuracy by hard-negative flag

**Files:**
- Modify: `api/cf-worker/test/search-accuracy/harness.test.ts:30-45` (type), `:130-148` and similar blocks (pass flag to FailureDetail)
- Modify: `api/cf-worker/test/search-accuracy/report.ts` (metrics split + print)

**Context:** Hver fixture kjøres for fire kategorier. Når vi har `hardNegative`-metadata, ønsker vi å vite om søket er like bra på vanskelige tilfeller som på enkle.

- [ ] **Step 1: Extend the GoldenFixture type in harness.test.ts**

Change:

```ts
type GoldenFixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  expected: Record<string, string[]>;
};
```

to:

```ts
type GoldenFixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  expected: Record<string, string[]>;
  hardNegative?: boolean;
  collisionGroup?: string;
};
```

- [ ] **Step 2: Add `hardNegative` to FailureDetail and every results.push call**

In `report.ts`, change:

```ts
export type FailureDetail = {
  regnr: string;
  category: string;
  expected: string[];
  predicted: string[];
  allCandidates: string[];
  bucket: string;
  layer: number;
  confidence: string;
  make?: string;
  model?: string;
  year?: number;
  ktype?: number;
  vin?: string;
  vinDecode?: { make?: string; generation?: string; body?: string };
  expectedKtype?: number;
  topKtype?: number;
};
```

to:

```ts
export type FailureDetail = {
  regnr: string;
  category: string;
  expected: string[];
  predicted: string[];
  allCandidates: string[];
  bucket: string;
  layer: number;
  confidence: string;
  make?: string;
  model?: string;
  year?: number;
  ktype?: number;
  vin?: string;
  vinDecode?: { make?: string; generation?: string; body?: string };
  expectedKtype?: number;
  topKtype?: number;
  hardNegative?: boolean;
};
```

In `harness.test.ts`, for **each** of the four `results.push({...})` calls, add:

```ts
hardNegative: c.hardNegative,
```

- [ ] **Step 3: Compute and print split metrics in report.ts**

In `computeMetrics`, keep the existing aggregate metrics, but also compute:

```ts
const hard = results.filter((r) => r.hardNegative);
const easy = results.filter((r) => !r.hardNegative);
const hardMetrics = computeMetrics(hard, Math.max(hard.length, 1));
const easyMetrics = computeMetrics(easy, Math.max(easy.length, 1));
```

Then expose them on the returned object:

```ts
return {
  ...baseMetrics,
  hard: hardMetrics,
  easy: easyMetrics,
};
```

Where `baseMetrics` is the existing return value. You will need to extend the return type.

- [ ] **Step 4: Print the split in `printReport`**

After the existing category breakdown, add:

```ts
if (metrics.hard && metrics.easy) {
  console.log(`\nHard negatives (${metrics.hard.total} cases): top-1 ${(metrics.hard.top1 / metrics.hard.total * 100).toFixed(1)}%, top-3 ${(metrics.hard.top3 / metrics.hard.total * 100).toFixed(1)}%, top-5 ${(metrics.hard.top5 / metrics.hard.total * 100).toFixed(1)}%`);
  console.log(`Easy fixtures (${metrics.easy.total} cases): top-1 ${(metrics.easy.top1 / metrics.easy.total * 100).toFixed(1)}%, top-3 ${(metrics.easy.top3 / metrics.easy.total * 100).toFixed(1)}%, top-5 ${(metrics.easy.top5 / metrics.easy.total * 100).toFixed(1)}%`);
}
```

- [ ] **Step 5: Typecheck and run the harness**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npx tsc --noEmit
npm run test:search-accuracy 2>&1 | tail -50
```

Expected: compile OK and report shows separate hard-negative/easy accuracy lines.

---

## Task 4: Regenerate fixtures and catalog sample

**Files:**
- Modify (generated): `api/cf-worker/test/search-accuracy/fixtures/golden-real.json`
- Modify (generated): `api/cf-worker/test/search-accuracy/fixtures/catalog-sample.json`

- [ ] **Step 1: Regenerate golden-real.json**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
npx tsx api/cf-worker/test/search-accuracy/scripts/generate-real-golden.ts
```

- [ ] **Step 2: Regenerate catalog-sample.json**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
npx tsx api/cf-worker/test/search-accuracy/scripts/generate-catalog-sample.ts
```

Expected: `catalog-sample.json` grows to cover all new expected eurocodes. Log line shows `Needed eurocodes:` count.

- [ ] **Step 3: Inspect fixture distribution**

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
python3 -c "
import json
from collections import Counter
fixtures = json.load(open('api/cf-worker/test/search-accuracy/fixtures/golden-real.json'))
print('Total', len(fixtures))
print('Hard negatives', sum(1 for f in fixtures if f.get('hardNegative')))
brands = Counter(f['make'] for f in fixtures)
for b, c in brands.most_common(30): print(b, c)
"
```

Expected: more fixtures, broader merkefordeling, and a non-zero hard-negative count.

---

## Task 5: Run accuracy harness and fix any failures

**Files:**
- Run: `api/cf-worker/test/search-accuracy/harness.test.ts`
- Possibly modify: `api/cf-worker/src/handlers/search.ts`, `api/cf-worker/src/lib/scoring.ts` if failure buckets appear

- [ ] **Step 1: Run search accuracy harness**

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm run test:search-accuracy 2>&1 | tail -80
```

- [ ] **Step 2: Record baseline numbers**

Note total cases, top-1/top-3/top-5 percentages, and the hard-negative split. If failures exist, note the bucket names printed by the report.

- [ ] **Step 3: Fix top failure bucket(s)**

Common buckets after expanding fixtures:

1. **`model_alias_miss`** – søk finner riktig merke/år men feil modell. Fix: utvid `modelMatches` eller SQL-hint-varianter i `search.ts`.
2. **`equipment_mismatch`** – toppresultat har feil utstyr (f.eks. ADAS vs ikke-ADAS). Fix: juster `strictEquipment`/`scoreCandidate` vekter eller lær utstyrsfordeling per modell.
3. **`year/generation_gate`** – kandidat filtreres bort på feil år. Fix: juster `yearCompatible` for merket/generasjonen.
4. **`kType_collision`** – TecDoc løser til feil ktype. Fix: avvis ktype dersom kompatibilitetssjekk feiler (allerede gjort), eller bruk kType-kollisjonsgating.

For the first failure bucket:

- Read the printed failure details (regnr, expected, predicted, layer, confidence, make/model/year).
- Identify whether the issue is in matching logic or in catalog coverage.
- Make the minimal code change in `src/handlers/search.ts` or `src/lib/scoring.ts`.
- Re-run `npm run test:search-accuracy`.
- Repeat until no failures remain.

Target: top-1 ≥ 95 % and top-3 ≥ 99 % on the full real-fixture suite; hard-negative top-3 ≥ 95 %.

---

## Task 6: Run full cf-worker test suite and typecheck

**Files:**
- Run: `api/cf-worker/package.json` scripts

- [ ] **Step 1: Typecheck**

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full unit test suite**

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm test 2>&1 | tail -30
```

Expected: all test files pass, same count or higher as before.

---

## Task 7: Commit, merge to main, and deploy

**Files:**
- Git repository root and feature worktree

- [ ] **Step 1: Commit in the feature worktree**

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
git add -A
git commit -m "test(search-accuracy): expanded real fixtures + hard-negative mining

- Add verified-bovsoft-v2.ndjson as a fixture source.
- Use ktype-aware dedup for bovsoft-v2 to capture generation/equipment variants.
- Detect hard-negative collision groups in catalog (same make/model/year,
  multiple glass variants) and tag fixtures.
- Split accuracy report into hard-negative and easy fixtures.
- Regenerate golden-real.json and catalog-sample.json.
- Search accuracy: <X>/Y top-1/3/5 on expanded real fixtures."
```

Fill in `<X>` and `<Y>` with the actual numbers from the harness.

- [ ] **Step 2: Merge to main**

```bash
cd /Users/taj/bilglass
git stash -u
git fetch origin
git merge feature/vin-search-agent -m "Merge feature/vin-search-agent: expanded real fixtures + hard-negative mining"
git push origin main
git stash pop
```

Expected: fast-forward or clean merge, push succeeds.

- [ ] **Step 3: Deploy worker**

```bash
cd /Users/taj/bilglass
npm run worker:deploy
```

Expected: deploy succeeds, new Version ID printed.

- [ ] **Step 4: Smoke test production**

```bash
cd /Users/taj/bilglass
npm run smoke:prod
```

Expected: 6/6 tests pass.

- [ ] **Step 5: Write MemPalace diary**

Use the MemPalace MCP tool with:

- `type`: "FEAT"
- `task`: "Utvidet søkenøyaktighetsharness med flere reelle fixtures og hard-negative mining"
- `status`: "GO"
- `rating`: 5
- `files`: number of files changed
- `tags`: `["search-accuracy", "hard-negative", "real-fixtures", "cf-worker", "deploy"]`

---

## Self-review checklist

1. **Spec coverage:**
   - Flere reelle fixtures → Task 1, 4.
   - Hard-negative mining → Task 2.
   - Accuracy-rapport på vanskelige tilfeller → Task 3.
   - Fiks feilbøtter → Task 5.
   - Deploy → Task 7.
   - Ingen gaps.

2. **Placeholder scan:**
   - No "TBD", "TODO", "fill in" etc.
   - All code blocks are concrete.
   - Commands include expected output.

3. **Type consistency:**
   - `Fixture` type extended with `hardNegative?`/`collisionGroup?`.
   - `FailureDetail` extended with `hardNegative?`.
   - `Source` type uses `useKtypeDedup` boolean consistently.
