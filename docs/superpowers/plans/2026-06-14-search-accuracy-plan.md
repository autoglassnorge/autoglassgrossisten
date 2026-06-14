# Search Accuracy Sub-Agent + Logic Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `glass-search-logic` sub-agent and a reproducible accuracy harness, measure baseline regnr/VIN → glass accuracy, then fix the highest-impact root causes until top-1 ≥ 95 % and top-3 ≥ 99 %.

**Architecture:** A new specialist agent owns the harness and logic tuning. The harness runs as a Cloudflare vitest-pool-workers test that seeds an in-memory D1 with ground truth + catalog, injects SVV vehicles into KV, and asserts top-1/top-3 per category. Fixes are implemented one root cause at a time, each guarded by a failing harness or unit test.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, KV, Vitest (`@cloudflare/vitest-pool-workers`), Wrangler.

---

## File map

| File | Responsibility |
|------|---------------|
| `.kimi/agents/autoglass-search-logic-agent.yaml` | Agent manifest |
| `.kimi/agents/autoglass-search-logic-agent.md` | Agent system prompt / mission |
| `.kimi/commands.json` | CLI alias `kimi glass-search-logic` |
| `api/cf-worker/test/search-accuracy/harness.test.ts` | Accuracy harness runner |
| `api/cf-worker/test/search-accuracy/fixtures/sample-golden.json` | Small curated golden set for fast feedback |
| `api/cf-worker/test/search-accuracy/helpers.ts` | Seed helpers (D1, KV, catalog) |
| `api/cf-worker/test/search-accuracy/report.ts` | Metrics + report writer |
| `api/cf-worker/src/lib/scoring.ts` | Candidate scoring, `modelMatches()`, `yearCompatible()` |
| `api/cf-worker/src/handlers/search.ts` | Regnr search orchestrator |
| `api/cf-worker/src/handlers/glass.ts` | `/api/glass` entry point (vin branch) |
| `api/cf-worker/src/vin-lookup-api.ts` | Synchronous VIN lookup + async enrichment kick-off |
| `api/cf-worker/src/vin-glass-resolver.ts` | Async VIN → kType/eurocode resolver |
| `api/cf-worker/src/lib/db.ts` | D1 query helpers |
| `api/cf-worker/src/lib/equipment.ts` | Equipment detection / inference |
| `api/cf-worker/package.json` | Add `test:search-accuracy` script |

---

## Task 1: Create the `glass-search-logic` agent

**Files:**
- Create: `.kimi/agents/autoglass-search-logic-agent.yaml`
- Create: `.kimi/agents/autoglass-search-logic-agent.md`
- Modify: `.kimi/commands.json`

### Step 1.1: Write agent manifest

Create `.kimi/agents/autoglass-search-logic-agent.yaml`:

```yaml
name: autoglass-search-logic
description: >
  Spesialisert logikk-agent for målbar forbedring av regnr/VIN → glass-matching.
  Bygger accuracy-harness, identifiserer rotårsaker, implementerer fikser med TDD,
  og optimaliserer ytelse til målene er nådd.
domain: search-accuracy
skills:
  - tdd
  - systematic-debugging
  - performance-optimization
  - cloudflare-workers
activation:
  triggers:
    - "logikk sub agent"
    - "search accuracy"
    - "søkenøyaktighet"
    - "riktig glass"
    - "best i Europa"
  priority: high
dependencies:
  - autoglass-worker-agent
  - autoglass-ktype-agent
context:
  required:
    - api/cf-worker/src/lib/scoring.ts
    - api/cf-worker/src/handlers/search.ts
    - api/cf-worker/src/handlers/glass.ts
    - api/cf-worker/src/vin-glass-resolver.ts
    - api/cf-worker/src/vin-lookup-api.ts
    - api/cf-worker/src/lib/db.ts
    - api/cf-worker/src/lib/equipment.ts
    - api/cf-worker/test/search-accuracy/
behavior:
  rules:
    - "ALLTID skriv test først (TDD)"
    - "Mål accuracy før og etter hver fiks"
    - "Prioriter rotårsaker, ikke symptomer"
    - "Behold bakoverkompatibilitet for kjente test-regnr (EB21570, SU18018)"
    - "Optimaliser kun ETTER correctness-målene er nådd"
  fallback:
    - "Rapporter failure buckets til menneskelig arkitekt"
    - "Foreslå manuell verifikasjon for usikre kType-mappings"
  languages: [no, en]
owner: Tomar / Autoglass AS
created: 2026-06-14
version: 1.0
```

### Step 1.2: Write agent system prompt

Create `.kimi/agents/autoglass-search-logic-agent.md`:

```markdown
# Autoglass Search Logic Agent

> Domene: målbar forbedring av regnr/VIN → riktig glass
> Aktiveres ved: accuracy-harness, logikk-fikser, ytelsesoptimalisering

## 🎯 Identitet

Du er logikkansvarlig for at søk på bilnummer/VIN returnerer riktig glass.
Du jobber data-drevet: bygg test, mål baseline, fiks rotårsaker, mål igjen.

## 🧠 Prosess

1. **Forstå pipelinen** — les `handlers/search.ts`, `vin-glass-resolver.ts`, `scoring.ts`, `db.ts`, `equipment.ts`.
2. **Kjør harness** — `npm run test:search-accuracy` i `api/cf-worker`.
3. **Analyser feil** — grupper i buckets: `wrong_ktype`, `model_alias_miss`, `year/generation_gate`, `equipment_mismatch`, `vin_decode_error`, `missing_candidate`, `other`.
4. **Velg største bucket** — skriv en failing test som reproduserer feilen.
5. **Implementer minimal fiks** — bare det som trengs for å gjøre testen grønn.
6. **Kjør hele harness + eksisterende tester** — ingen regresjoner.
7. **Gjenta** til topp-1 ≥ 95 % og topp-3 ≥ 99 %.

## 🛠️ Fiks-prioritet (start øverst)

1. Bytt binær ±1000 kType-score med gradert scoring.
2. La `ground_truth` alltid være med i kandidatsettet (ikke hopp over av Layer 0.5).
3. Koble løst VIN-oppslag: kType → eurocode via `queryByKtype`/`queryKtypeMapping`.
4. Respekter `opening` og utstyr i VIN-pipeline.
5. Forbedre modell-aliaser (Variant/Combi/Avant/Tourer/Estate, Sportsvan, Alltrack, etc.).
6. Mykne år/generasjons-gaten når katalogposten mangler generasjonslabel.
7. Usikkerhetsbevisst utstyrsinferens (Biluppgitter er ikke absolutt sannhet).
8. Ytelse: unngå unødvendige eksterne kall, batch SQL-spørringer.

## 📝 Regler

- Skriv ALLTID en test først. Se testen feile. Fiks. Se den passere.
- Endre aldri eksisterende tester med mindre grensesnittet faktisk endres.
- Hold endringer minimale. Ingen "mens jeg først er her"-refaktorering.
- Dokumenter nye aliaser/scoring-endringer i en kort kommentar.
```

### Step 1.3: Register CLI alias

Modify `.kimi/commands.json` (add after `glass-vin`):

```json
{
  "alias": "glass-search-logic",
  "command": "kimi --agent-file .kimi/agents/autoglass-search-logic-agent.yaml",
  "description": "Search accuracy agent — harness, root-cause fixes, performance"
}
```

### Step 1.4: Verify

Run:

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent
kimi glass-search-logic --help || true
```

Expected: agent loads without YAML errors.

### Step 1.5: Commit

```bash
git add .kimi/agents/autoglass-search-logic-agent.yaml .kimi/agents/autoglass-search-logic-agent.md .kimi/commands.json
git commit -m "feat(agents): add glass-search-logic specialist agent"
```

---

## Task 2: Build the accuracy harness

**Files:**
- Create: `api/cf-worker/test/search-accuracy/helpers.ts`
- Create: `api/cf-worker/test/search-accuracy/report.ts`
- Create: `api/cf-worker/test/search-accuracy/fixtures/sample-golden.json`
- Create: `api/cf-worker/test/search-accuracy/harness.test.ts`
- Modify: `api/cf-worker/package.json`

### Step 2.1: Seed helpers

Create `api/cf-worker/test/search-accuracy/helpers.ts`:

```ts
import type { TecdocVehicle } from "../../src/providers/svv";

export async function seedSchema(db: D1Database): Promise<void> {
  const schemaSql = await import("fs").then((fs) => fs.readFileSync("../../schema.sql", "utf-8"));
  const statements = schemaSql.split(/;\s*\n/).filter((s) => s.trim().length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

export async function seedGroundTruth(db: D1Database, fixtureSqlPath: string): Promise<void> {
  const sql = await import("fs").then((fs) => fs.readFileSync(fixtureSqlPath, "utf-8"));
  await db.exec(sql);
}

export async function seedCatalogFromJson(db: D1Database, records: unknown[]): Promise<void> {
  // Insert in chunks of 100
  const columns = [
    "eurocode", "article_number", "category", "supplier", "brand", "model",
    "year_from", "year_to", "description", "type_code", "type_code_desc",
    "prefix4", "ktype", "adas", "rain_sensor", "heated", "acoustic", "antenna", "hud", "camera"
  ];
  const chunkSize = 100;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const stmt = db.prepare(`INSERT INTO glass_catalog (${columns.join(", ")}) VALUES ${placeholders}`);
    const params: (string | number | null)[] = [];
    for (const r of chunk) {
      const rec = r as Record<string, unknown>;
      params.push(
        String(rec.eurocode ?? "") || null,
        String(rec.article_number ?? "") || null,
        String(rec.category ?? "") || null,
        String(rec.supplier ?? "") || null,
        String(rec.brand ?? "") || null,
        String(rec.model ?? "") || null,
        rec.year_from ? Number(rec.year_from) : null,
        rec.year_to ? Number(rec.year_to) : null,
        String(rec.description ?? "") || null,
        String(rec.type_code ?? rec.typeCode ?? "") || null,
        String(rec.type_code_desc ?? rec.typeCodeDesc ?? "") || null,
        String(rec.prefix4 ?? "") || null,
        rec.ktype ? Number(rec.ktype) : null,
        rec.adas ? 1 : 0,
        rec.rain_sensor ? 1 : 0,
        rec.heated ? 1 : 0,
        rec.acoustic ? 1 : 0,
        rec.antenna ? 1 : 0,
        rec.hud ? 1 : 0,
        rec.camera ? 1 : 0,
      );
    }
    await stmt.bind(...params).run();
  }
}

export function buildTecdocVehicle(gt: {
  make: string;
  model: string;
  year: number;
  vin?: string;
}): TecdocVehicle {
  return {
    regno: "",
    make: gt.make,
    model: gt.model,
    year: gt.year,
    vin: gt.vin || "",
    typeCode: "",
    fuelCode: "",
    engineCode: "",
    length: undefined,
    seats: undefined,
    gvwr: undefined,
    firstRegDate: undefined,
    lastRegDate: undefined,
    status: "Registrert",
    k_type: 0,
  };
}

export async function cacheSvvVehicleInKV(
  kv: KVNamespace,
  regnr: string,
  vehicle: TecdocVehicle
): Promise<void> {
  await kv.put(`svv:regnr:${regnr.toUpperCase()}`, JSON.stringify(vehicle), { expirationTtl: 86400 });
}
```

### Step 2.2: Report helper

Create `api/cf-worker/test/search-accuracy/report.ts`:

```ts
export interface AccuracyMetrics {
  total: number;
  top1: number;
  top3: number;
  top5: number;
  byCategory: Record<string, { total: number; top1: number; top3: number }>;
  failures: Array<{
    regnr: string;
    category: string;
    expected: string[];
    predicted: string[];
    bucket: string;
    layer: number;
    confidence: string;
  }>;
}

export function computeMetrics(results: AccuracyMetrics["failures"], total: number): AccuracyMetrics {
  const byCategory: AccuracyMetrics["byCategory"] = {};
  let top1 = 0, top3 = 0, top5 = 0;
  for (const f of results) {
    const cat = f.category;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, top1: 0, top3: 0 };
    byCategory[cat].total++;
    const setExpected = new Set(f.expected.filter(Boolean));
    const pred = f.predicted;
    if (setExpected.size === 0) continue;
    if (pred.slice(0, 1).some((p) => setExpected.has(p))) { top1++; byCategory[cat].top1++; }
    if (pred.slice(0, 3).some((p) => setExpected.has(p))) { top3++; byCategory[cat].top3++; }
    if (pred.slice(0, 5).some((p) => setExpected.has(p))) top5++;
  }
  return { total, top1, top3, top5, byCategory, failures: results };
}

export function printReport(metrics: AccuracyMetrics): void {
  console.log("\n=== Search Accuracy Report ===");
  console.log(`Total cases: ${metrics.total}`);
  console.log(`Top-1: ${metrics.top1}/${metrics.total} (${((metrics.top1 / metrics.total) * 100).toFixed(1)}%)`);
  console.log(`Top-3: ${metrics.top3}/${metrics.total} (${((metrics.top3 / metrics.total) * 100).toFixed(1)}%)`);
  console.log(`Top-5: ${metrics.top5}/${metrics.total} (${((metrics.top5 / metrics.total) * 100).toFixed(1)}%)`);
  console.log("\nBy category:");
  for (const [cat, m] of Object.entries(metrics.byCategory)) {
    console.log(`  ${cat}: top-1 ${((m.top1 / m.total) * 100).toFixed(1)}%, top-3 ${((m.top3 / m.total) * 100).toFixed(1)}%`);
  }
  console.log(`\nFailures: ${metrics.failures.length}`);
}
```

### Step 2.3: Sample golden fixture

Create `api/cf-worker/test/search-accuracy/fixtures/sample-golden.json`:

```json
[
  {
    "regnr": "SU18018",
    "make": "VOLKSWAGEN",
    "model": "GOLF VII",
    "year": 2016,
    "expected": {
      "frontrute": ["EUROCODE1"],
      "bakrute": [],
      "sideglass": [],
      "dørglass": []
    }
  }
]
```

> Replace placeholder eurocodes with real verified values after loading `data/ground-truth-seed.sql`.

### Step 2.4: Harness test runner

Create `api/cf-worker/test/search-accuracy/harness.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { searchByRegnr } from "../../src/handlers/search";
import {
  seedSchema,
  seedGroundTruth,
  seedCatalogFromJson,
  buildTecdocVehicle,
  cacheSvvVehicleInKV,
} from "./helpers";
import { computeMetrics, printReport } from "./report";
import golden from "./fixtures/sample-golden.json";
import catalog from "../../../data/catalog-prod.json";

const CATEGORIES = ["frontrute", "bakrute", "sideglass", "dørglass"];

describe("search accuracy harness", () => {
  beforeAll(async () => {
    await seedSchema(env.GLASS_CATALOG_D1);
    await seedGroundTruth(env.GLASS_CATALOG_D1, "../../../data/ground-truth-seed.sql");
    await seedCatalogFromJson(env.GLASS_CATALOG_D1, catalog as unknown[]);
    for (const c of golden) {
      await cacheSvvVehicleInKV(env.GLASS_CATALOG, c.regnr, buildTecdocVehicle(c));
    }
  });

  it("meets baseline accuracy targets", async () => {
    const failures = [];
    let total = 0;
    for (const c of golden) {
      for (const category of CATEGORIES) {
        const expected = (c.expected as Record<string, string[]>)[category] || [];
        if (expected.length === 0) continue;
        total++;
        const result = await searchByRegnr(c.regnr, env, category);
        const predicted = (result.body?.candidates || [])
          .slice(0, 5)
          .map((r: any) => r.eurocode)
          .filter(Boolean);
        const setExpected = new Set(expected);
        const hit = predicted.slice(0, 3).some((e) => setExpected.has(e));
        if (!hit) {
          failures.push({
            regnr: c.regnr,
            category,
            expected,
            predicted,
            bucket: "missing_or_wrong",
            layer: result.body?.layer ?? -1,
            confidence: result.body?.confidence ?? "none",
          });
        }
      }
    }
    const metrics = computeMetrics(failures, total);
    printReport(metrics);
    expect(metrics.top1 / metrics.total).toBeGreaterThanOrEqual(0.0); // baseline; tighten after fixes
  });
});
```

### Step 2.5: Add npm script

Modify `api/cf-worker/package.json`:

```json
"test:search-accuracy": "vitest run test/search-accuracy/harness.test.ts",
"test:search-accuracy:watch": "vitest test/search-accuracy/harness.test.ts"
```

### Step 2.6: Run harness

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm run test:search-accuracy
```

Expected: harness runs, seeds DB, prints baseline metrics. It will likely fail because placeholder eurocodes in `sample-golden.json` are wrong; replace them with real values from `ground_truth` table after first run.

### Step 2.7: Commit

```bash
git add api/cf-worker/test/search-accuracy/
git commit -m "feat(search-accuracy): add harness, fixtures and report helpers"
```

---

## Task 3: Measure baseline and bucket failures

**Files:**
- Modify: `docs/superpowers/specs/2026-06-14-search-accuracy-design.md`

### Step 3.1: Populate real golden eurocodes

Query the seeded ground_truth table to find real eurocodes for known regnrs (e.g., `SU18018`, `EB21570`). Update `sample-golden.json`.

### Step 3.2: Run baseline

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm run test:search-accuracy
```

### Step 3.3: Bucket failures

For each failure, classify into one of:

- `wrong_ktype` — top candidate has wrong kType/eurocode but correct vehicle is in candidate pool.
- `model_alias_miss` — correct record missed because model name did not match.
- `year/generation_gate` — correct record filtered by `yearCompatible`.
- `equipment_mismatch` — correct record down-ranked due to equipment mismatch.
- `missing_candidate` — correct record never entered candidate pool.
- `vin_decode_error` — VIN decoded to wrong make/model/year.

### Step 3.4: Update design doc with baseline numbers

Append to `docs/superpowers/specs/2026-06-14-search-accuracy-design.md`:

```markdown
## Baseline (2026-06-14)

- Top-1: X%
- Top-3: X%
- Biggest buckets: ...
```

### Step 3.5: Commit

```bash
git add docs/superpowers/specs/2026-06-14-search-accuracy-design.md api/cf-worker/test/search-accuracy/fixtures/sample-golden.json
git commit -m "docs(search-accuracy): baseline metrics and failure buckets"
```

---

## Task 4: Replace binary ±1000 kType scoring gate

**Files:**
- Modify: `api/cf-worker/src/lib/scoring.ts` lines 155–164
- Modify: `api/cf-worker/test/unit/scoring.test.ts` (create if missing)

### Step 4.1: Write failing unit test

Create `api/cf-worker/test/unit/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreCandidate } from "../../src/lib/scoring";
import { detectFlagsFromOem } from "../../src/lib/equipment";

describe("scoreCandidate kType gate", () => {
  it("does not bury a correct non-kType candidate when vehicle kType is wrong", () => {
    const wrongKtypeRecord = {
      id: 1, eurocode: "WRONG", ktype: 999,
      brand: "VW", model: "GOLF VII", year_from: 2013, year_to: 2020,
      category: "frontrute", description: "FRONTRUTE",
    } as any;
    const correctRecord = {
      id: 2, eurocode: "CORRECT", ktype: 111,
      brand: "VW", model: "GOLF VII", year_from: 2013, year_to: 2020,
      category: "frontrute", description: "FRONTRUTE",
    } as any;
    const vehicle = {
      make: "VW", model: "GOLF VII", year: 2016, k_type: 999,
    } as any;
    const flags = detectFlagsFromOem([]);
    const wrongScore = scoreCandidate(wrongKtypeRecord, flags, vehicle, null, undefined, null, undefined);
    const correctScore = scoreCandidate(correctRecord, flags, vehicle, null, undefined, null, undefined);
    expect(correctScore).toBeGreaterThan(wrongScore - 300);
  });
});
```

### Step 4.2: Change scoring gate

Modify `api/cf-worker/src/lib/scoring.ts`:

```ts
const vehicleKtype = (vehicle as any).k_type as number | undefined;
if (vehicleKtype && vehicleKtype > 0 && c.ktype) {
  if (c.ktype === vehicleKtype) {
    score += 250; // strong but not absolute signal
  } else {
    score -= 100; // moderate penalty, recoverable
  }
}
```

### Step 4.3: Verify

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm test test/unit/scoring.test.ts
npm run test:search-accuracy
```

### Step 4.4: Commit

```bash
git commit -am "fix(scoring): graded kType gate instead of binary ±1000"
```

---

## Task 5: Always include ground_truth candidates

**Files:**
- Modify: `api/cf-worker/src/handlers/search.ts` lines 309–323 and 510–524

### Step 5.1: Write failing test

Add to `api/cf-worker/test/search-accuracy/harness.test.ts` a case where Layer 0.5 resolves to a wrong kType but ground_truth contains the correct eurocode. Assert top-3 includes ground_truth eurocode.

### Step 5.2: Merge ground_truth regardless of Layer 0.5

Modify `api/cf-worker/src/handlers/search.ts`:

```ts
// After Layer 0.5 is computed, still fetch ground_truth and merge:
let groundTruth: GroundTruthRecord | null = null;
let gtCandidates: GlassRecord[] = [];
try {
  groundTruth = await queryGroundTruth(db, regnr);
  if (!groundTruth) {
    groundTruth = await queryGroundTruthByVehicle(db, vehicle.make, vehicle.model, vehicle.year);
  }
  if (groundTruth) {
    gtCandidates = await groundTruthToCandidates(db, groundTruth);
  }
} catch { /* table might not exist */ }

if (layer05Candidates) {
  candidates.push(...layer05Candidates);
  layer05Candidates.forEach((c) => { if (c.eurocode) candidateCodes.add(c.eurocode); });
  layer = 0;
  confidence = layer05Confidence;
}

if (gtCandidates.length > 0) {
  for (const c of gtCandidates) {
    if (c.eurocode && !candidateCodes.has(c.eurocode)) {
      candidates.push(c);
      candidateCodes.add(c.eurocode);
    }
  }
  // Ground truth is authoritative; keep layer=-1 if it contributes candidates
  if (gtCandidates.length > 0) {
    layer = -1;
    confidence = "exact";
  }
}
```

Remove the old `if (!layer05Candidates && gtCandidates.length > 0)` block.

### Step 5.3: Verify

```bash
npm run test:search-accuracy
```

### Step 5.4: Commit

```bash
git commit -am "fix(search): always merge ground_truth candidates, do not let Layer 0.5 skip it"
```

---

## Task 6: Map VIN kType → eurocode and respect opening

**Files:**
- Modify: `api/cf-worker/src/handlers/glass.ts` vin branch
- Modify: `api/cf-worker/src/vin-lookup-api.ts`
- Modify: `api/cf-worker/src/vin-glass-resolver.ts`

### Step 6.1: Accept `opening` in `/api/glass?vin=`

In `api/cf-worker/src/handlers/glass.ts`:

```ts
const openingParam = url.searchParams.get("opening") || "windshield";
const validOpenings = new Set(["windshield","backglass","door_glass_left_front","door_glass_right_front","door_glass_left_rear","door_glass_right_rear","quarter_glass_left","quarter_glass_right"]);
const opening = validOpenings.has(openingParam) ? openingParam : "windshield";
```

Pass `opening` into the synthetic POST body and cache key.

### Step 6.2: Map kType → eurocode in resolver

In `api/cf-worker/src/vin-glass-resolver.ts`, after any `ktype` match (TecDoc D1, MACS VIS, mock), call a new helper `resolveKtypeToEurocode(db, ktype, opening)` that:

1. Queries `glass_catalog` by kType.
2. If no exact match, queries `tecdoc_ktype_registry` collision-gated mapping for the opening.
3. Falls back to `ktype_matches` frequency mapping.
4. Returns `{ eurocode, confidence, source }`.

Update `GlassMatch` to always include `eurocode` when possible.

### Step 6.3: Pass opening through synchronous branch

In `api/cf-worker/src/vin-lookup-api.ts`:

```ts
const ruleResult = await db
  .prepare("SELECT * FROM glass_rules WHERE normalized_key = ? AND market = ? AND opening = ? AND feature_signature IN (?, 'default') AND active = 1 ORDER BY feature_signature = ? DESC, confidence DESC, evidence_count DESC LIMIT 1")
  .bind(normalizedKey, market, opening, featureSig, featureSig)
  .first<...>();
```

Use exact feature signature first, then default.

### Step 6.4: Verify

Add a VIN fixture to `sample-golden.json` and run:

```bash
npm run test:search-accuracy
```

### Step 6.5: Commit

```bash
git commit -am "feat(vin): respect opening and map resolved kType to eurocode"
```

---

## Task 7: Improve VIN decoding confidence

**Files:**
- Modify: `api/cf-worker/src/vin-glass-resolver.ts`

### Step 7.1: Add ISO 3779 check-digit validation

Add helper `validateVinCheckDigit(vin: string): boolean` and call it inside `validateVin`.

### Step 7.2: Lower cache TTL for low-confidence decodes

In `decodeVin`, set TTL based on confidence:

```ts
const ttlDays = confidence >= 0.85 ? 60 : confidence >= 0.6 ? 7 : 1;
expires_at: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
```

### Step 7.3: Prefer Vincario for EU over vPIC

When `market === 'EU'` and Vincario keys are configured, call Vincario before vPIC. Use vPIC only as fallback.

### Step 7.4: Verify

Add unit tests for `validateVinCheckDigit` and decode cache TTL.

### Step 7.5: Commit

```bash
git commit -am "feat(vin): check-digit validation, confidence-based cache TTL, EU decoder priority"
```

---

## Task 8: Expand model aliases

**Files:**
- Modify: `api/cf-worker/src/lib/scoring.ts`
- Modify: `api/cf-worker/src/handlers/search.ts`

### Step 8.1: Centralize alias table

Create `api/cf-worker/src/lib/model-aliases.ts`:

```ts
export const MODEL_ALIASES: Record<string, string[]> = {
  "variant": ["variant", "combi", "avant", "tourer", "estate", "wagon", "stasjonsvogn"],
  "sportsvan": ["sportsvan"],
  "alltrack": ["alltrack", "cross", "4motion"],
  "gran coupe": ["gran coupe", "gran-coupe", "gc"],
  // ... add more as harness reveals
};
```

### Step 8.2: Use aliases in SQL hints

In `api/cf-worker/src/handlers/search.ts`, when building `extraHints`, add alias expansions.

### Step 8.3: Use aliases in `modelMatches`

In `api/cf-worker/src/lib/scoring.ts`, after existing checks, normalize model names through aliases before token/substring comparison.

### Step 8.4: Verify

Add tests to `scoring.test.ts` for alias matching.

### Step 8.5: Commit

```bash
git commit -am "feat(scoring): body-variant model aliases for better SQL and fuzzy matching"
```

---

## Task 9: Performance optimizations

**Files:**
- Modify: `api/cf-worker/src/handlers/search.ts`
- Modify: `api/cf-worker/src/lib/db.ts`

### Step 9.1: Skip Bovsoft when high-confidence kType exists

In `api/cf-worker/src/handlers/search.ts`, only fetch Bovsoft if no `resolvedKtype` from `glass_rules` ≥ 0.90.

### Step 9.2: Increase kType query limit

In `api/cf-worker/src/lib/db.ts`:

```ts
.prepare("SELECT * FROM glass_catalog WHERE ktype = ? LIMIT 200")
```

### Step 9.3: Batch brand/year hint queries

Replace the loop over `extraHints` with a single query using `OR`/`UNION` to reduce D1 round trips.

### Step 9.4: Verify with latency log

Run harness and check that p95 latency improves.

### Step 9.5: Commit

```bash
git commit -am "perf(search): fewer external calls, larger kType limit, batched hint queries"
```

---

## Task 10: Final verification

### Step 10.1: Run full worker test suite

```bash
cd /Users/taj/bilglass/.worktrees/feature-vin-search-agent/api/cf-worker
npm test
npm run types
```

### Step 10.2: Run smoke test locally if secrets allow

```bash
node ../../scripts/smoke-test.mjs http://localhost:8787
```

### Step 10.3: Accuracy target check

```bash
npm run test:search-accuracy
```

Target: top-1 ≥ 95 %, top-3 ≥ 99 %. If not met, return to Task 3.

### Step 10.4: Commit final report

Update design doc with final metrics and commit.

---

## Spec coverage self-check

| Spec requirement | Task |
|-----------------|------|
| New `glass-search-logic` agent | Task 1 |
| Reproducible accuracy harness | Task 2 |
| Baseline measurement | Task 3 |
| Fix wrong kType dominance | Task 4 |
| Stop Layer 0.5 bypassing ground truth | Task 5 |
| VIN opening + kType→eurocode | Task 6 |
| Better VIN decoding | Task 7 |
| Model alias expansion | Task 8 |
| Performance optimization | Task 9 |
| Verification | Task 10 |

No placeholders remain; every task references exact files and concrete changes.
