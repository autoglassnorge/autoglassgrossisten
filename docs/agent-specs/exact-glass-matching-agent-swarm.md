# 4-Agent Swarm: Exact Glass Matching via Feature Flags

## Goal
When a user searches with regnr/VIN and specifies equipment features (e.g., "I have rain sensor"), the VIN lookup system returns windshields that match those features. Feature flags stored in `glass_catalog` columns (`rain_sensor`, `heated`, `acoustic`, `camera`, `lane_assist`, `antenna`, `hud`) are the primary signal, not just description parsing at runtime.

## Non-Goals
- Do NOT change the `description` column or remove existing description-parsing logic.
- Do NOT change the `searchByRegnr()` orchestrator in `search.ts` (Agent 3 may call it, but `search.ts` itself is off-limits).
- Do NOT modify the D1 schema (columns already exist); only populate existing columns.
- Do NOT change the `glass_rules` caching logic or `kType` resolution flow.

## Current Repo Facts
- **Stack:** Cloudflare Worker, TypeScript, Wrangler CLI, D1 SQLite.
- **Package manager:** `npm`.
- **Build:** `npm run build` (uses `wrangler` / `esbuild`).
- **Test:** `npm run test` (vitest).
- **D1 execute:** `cd ~/bilglass/api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=<sql>`.
- **glass_catalog table:** 38,561+ rows. Feature columns exist (`rain_sensor INTEGER DEFAULT 0`, etc.) but are all 0.
- **Existing feature parsing:** `lib/equipment.ts` has `detectFlagsFromDescription()` which parses description text at runtime. This is the source of truth for the SQL parser.
- **Existing scoring:** `lib/scoring.ts` has `scoreCandidate()` which already scores equipment matches. It relies on `inferRecordEquipment()` which falls back to description parsing.
- **VIN lookup API:** `vin-lookup-api.ts` accepts `features` in the request body and passes them to `resolveGlass()`, but `resolveGlass()` only uses them for `glass_rules` lookup (feature signature), not catalog scoring.
- **Model matching:** `lib/scoring.ts` has `modelMatches()` which handles case-insensitive matching, brand-specific rules (VW, Volvo, Mercedes), and token overlap. No body-type bonus.

## Architecture
The `vin-glass-resolver.ts` module currently resolves a VIN -> `GlassMatch` (kType/eurocode). It does NOT touch the catalog directly. We add a **new catalog-aware path** inside `vin-glass-resolver.ts` that:
1. Resolves kType (existing logic, unchanged).
2. Queries `glass_catalog` by kType + brand + model + year.
3. Scores catalog rows by model match + equipment match + body-type match.
4. Returns the best-scored `GlassRecord` with confidence.

This new path is exposed as a new function `resolveGlassFromCatalog()` inside `vin-glass-resolver.ts`. The existing `resolveGlass()` function continues to work as before but can optionally call `resolveGlassFromCatalog()` when the caller wants a full catalog product instead of just a kType/eurocode.

## Shared Contract: Interfaces Workers Must Not Change

```typescript
// From types.ts -- GlassRecord (must remain unchanged)
export interface GlassRecord {
  id: number;
  supplier_sku: string;
  eurocode: string | null;
  article_number: string | null;
  scan_number: string | null;
  category: string;
  supplier: string | null;
  brand: string;
  model: string | null;
  submodel: string | null;
  year_from: number | null;
  year_to: number | null;
  prefix4: string;
  adas: number;
  rain_sensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  hud: number;
  shade: number;
  camera: number;
  lane_assist: number;
  adas_features: string | null;
  price: number | null;
  stock_status: number | null;
  warehouse_location: string | null;
  oem_numbers: string | null;
  cross_references: string | null;
  weight: number | null;
  dimensions: string | null;
  color: string | null;
  solar: number | null;
  tinted: number | null;
  description: string;
  image_url: string | null;
  pdf_url: string | null;
  source: string;
  source_url: string | null;
  nags_codes: string | null;
  brand_original: string | null;
  ktype: number | null;
  created_at: string | null;
  typeCode?: string;
  typeCodeDesc?: string;
  position?: "driver" | "passenger" | "center" | "both" | null;
  nagsCodes?: string[];
  properties?: Record<string, unknown>;
}

// From vin-glass-resolver.ts -- EquipmentFeatures (must remain unchanged)
export interface EquipmentFeatures {
  camera?: boolean;
  hud?: boolean;
  rainSensor?: boolean;
  heated?: boolean;
  acoustic?: boolean;
}

// From vin-glass-resolver.ts -- GlassMatch (must remain unchanged)
export interface GlassMatch {
  ktype?: number;
  kba?: string;
  nags?: string;
  oemPartNumber?: string;
  eurocode?: string;
  confidence: number;
  source: string;
}
```

## New Interface: `CatalogGlassMatch` (created by Agent 3)

```typescript
// Add to vin-glass-resolver.ts, alongside GlassMatch
export interface CatalogGlassMatch extends GlassMatch {
  /** Full catalog record of the best match */
  record?: GlassRecord;
  /** Equipment match quality: perfect | good | check | mismatch */
  equipmentMatch?: "perfect" | "good" | "check" | "mismatch";
  /** How many of the requested features matched */
  featuresMatched?: number;
  /** How many requested features were missing */
  featuresMissing?: number;
}
```

## New Function: `scoreCatalogModelMatch()` (created by Agent 2)

```typescript
/**
 * Score how well a catalog record matches a vehicle model.
 * Returns 0.0-1.0 confidence score.
 *
 * Scoring signals:
 *  - Exact match (case-insensitive): +1.0
 *  - Substring containment (e.g. "Model 3" inside "Tesla Model 3"): +0.8
 *  - Series tolerance (e.g. "5 SERIES" vs "5 SERIE"): +0.7
 *  - Body type bonus (e.g. "Sedan" vs "Sedan" in description): +0.1
 *  - Token overlap (Jaccard): proportional
 */
export function scoreCatalogModelMatch(
  vehicleModel: string,
  vehicleBody: string | null,
  record: GlassRecord
): number;
```

**Rules:**
- Compare `vehicleModel` against `record.model` AND `record.description`.
- Case-insensitive comparison (`toUpperCase()` or `toLowerCase()`).
- Series tolerance: normalize `"SERIES"` -> `"SERIE"`, `"SEDAN"` -> `"SED"` only when comparing.
- Body type bonus: if `vehicleBody` is non-null and `record.description` contains a known body-type keyword matching it, add +0.1.
- Known body keywords: `sedan: ["sedan", "saloon", "4d", "4-d"]`, `suv: ["suv", "cross", "xc", "4x4", "jeep"]`, `hatch: ["hatch", "5d", "5-d", "hatchback"]`, `wagon: ["wagon", "estate", "sw", "touring", "stasjons"]`, `van: ["van", "varebil", "kassevogn", "mpv"]`.

## New Function: `resolveGlassFromCatalog()` (created by Agent 3)

```typescript
/**
 * Resolve the best glass product from the catalog given a kType and vehicle info.
 *
 * If `features` is provided, score +0.2 for each matching feature flag and -0.1
 * for each missing feature the user specified.
 * If `features` is NOT provided, infer features from the record description and
 * do NOT apply feature scoring (model match is the primary signal).
 *
 * Returns the best-scored CatalogGlassMatch, or null if no suitable record.
 */
export async function resolveGlassFromCatalog(
  db: D1Database,
  ktype: number,
  vehicle: {
    make: string;
    model: string;
    year: number;
    body?: string | null;
  },
  opening: GlassOpening,
  features?: EquipmentFeatures
): Promise<CatalogGlassMatch | null>;
```

**Implementation steps:**
1. Query `glass_catalog` by `ktype = ? AND brand = ?` (brand normalized via `normalizeBrand`).
2. Filter by year compatibility: `record.year_from <= vehicle.year <= record.year_to` (or parse year range from description if DB columns are null).
3. Filter by opening category: `record.category` matches `opening` (e.g., `windshield` -> `frontrute`).
4. For each record, compute:
   - `modelScore = scoreCatalogModelMatch(vehicle.model, vehicle.body, record)` (0.0-1.0)
   - `featureScore = 0`
   - If `features` is provided:
     - For each truthy feature key: `if record.<column> === 1 then featureScore += 0.2 else featureScore -= 0.1`
     - Where column mapping is: `camera`->`camera`, `hud`->`hud`, `rainSensor`->`rain_sensor`, `heated`->`heated`, `acoustic`->`acoustic`
   - If `features` is NOT provided:
     - `featureScore = 0` (no bonus, no penalty -- rely on description inference later)
5. Total score = `modelScore * 0.6 + featureScore * 0.4` (weights chosen so model match dominates but features can override close ties).
6. Pick the highest-scoring record. If score < 0.3, return `null`.
7. Return `CatalogGlassMatch` with `confidence = min(0.99, score)` and `source = 'catalog_featured'`.

## Integration Point: `resolveGlass()` (Agent 3 may touch lightly)

The `resolveGlass()` function in `vin-glass-resolver.ts` currently returns a `GlassMatch`. After Agent 3, it should optionally call `resolveGlassFromCatalog()` when the resolver reaches a kType match (Layer 1.5 or paid fallbacks) and the caller wants full product details.

**Specific integration rule:**
- After a kType is resolved (e.g., from `resolveTecDocFromD1` or paid APIs), and if `resolveGlassFromCatalog()` is available, call it with the resolved kType and the decoded vehicle.
- If `resolveGlassFromCatalog()` returns a `CatalogGlassMatch`, use that as the final match instead of the bare `GlassMatch`.
- If it returns `null`, fall back to the existing `GlassMatch` behavior.
- The `resolveGlass()` signature must remain unchanged; only the internal `match` construction changes.

---

# Agent 1: Feature Parser (D1 SQL)

**Owner:** SQL-only agent. No TypeScript changes.
**Allowed:** Create SQL files under `~/bilglass/api/cf-worker/migrations/` or a temporary SQL file.
**Forbidden:** Any `.ts` file. Any schema change (ALTER TABLE, etc.).

**Task:**
Generate a single SQL file `migrations/0020_parse_features_from_description.sql` that contains UPDATE statements to populate feature columns from `description` text.

**Feature code mapping (from description -> column):**
| Description contains | Column | Value |
|---|---|---|
| `AKU`, `AKO`, `AKUS` | `acoustic` | 1 |
| `SENS`, `SENSOR` | `rain_sensor` | 1 |
| `EL`, `ELE`, `EL.` (as standalone token) | `heated` | 1 |
| `LDW`, `CITY` | `lane_assist` | 1 |
| `CAM`, `CAMERA` | `camera` | 1 |
| `HUD` | `hud` | 1 |
| `ANT` (as standalone token) | `antenna` | 1 |

**SQL requirements:**
- Use `UPPER(description)` for case-insensitive matching.
- Use word-boundary matching (`LIKE '% SENS %'` OR `LIKE '%SENS,%'` etc.) to avoid false positives (e.g., "SENSITIV" should NOT match `SENS`).
- Each feature should be a separate `UPDATE` statement with a `WHERE` clause that only touches rows where the column is currently 0 and the description contains the code.
- Include a `SELECT COUNT(*)` validation query at the end.

**Example SQL pattern:**
```sql
UPDATE glass_catalog
SET rain_sensor = 1
WHERE rain_sensor = 0
  AND (
    UPPER(description) LIKE '% SENS %'
    OR UPPER(description) LIKE '%SENS,%'
    OR UPPER(description) LIKE '%SENS.%'
    OR UPPER(description) LIKE '%SENS+%'
    OR UPPER(description) LIKE '%SENS-%'
    OR UPPER(description) LIKE '%SENS/%'
    OR UPPER(description) LIKE '%SENS]'
    OR UPPER(description) LIKE '[SENS %'
    OR UPPER(description) LIKE '%SENSOR%'
  );
```

**Run command:**
```bash
cd ~/bilglass/api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote --file=migrations/0020_parse_features_from_description.sql
```

**Validation:**
After execution, run:
```sql
SELECT 
  SUM(rain_sensor) as rain_sensor_count,
  SUM(heated) as heated_count,
  SUM(acoustic) as acoustic_count,
  SUM(camera) as camera_count,
  SUM(lane_assist) as lane_assist_count,
  SUM(antenna) as antenna_count,
  SUM(hud) as hud_count
FROM glass_catalog;
```
Expected: At least 5,000 rows should have at least one feature flag set to 1 (total across all columns). If fewer than 5,000, report the exact counts and flag for review.

---

# Agent 2: Model Matching Improvement

**Owner:** TypeScript implementation in `vin-glass-resolver.ts`.
**Allowed:** Edit `~/bilglass/api/cf-worker/src/vin-glass-resolver.ts` (create new functions only). May read `lib/scoring.ts` for reference.
**Forbidden:** Edit `lib/scoring.ts`, `search.ts`, `types.ts`, or any other file.

**Task:**
Create the function `scoreCatalogModelMatch()` in `vin-glass-resolver.ts` (see interface above).

**Requirements:**
1. **Case-insensitive matching:** Both `vehicleModel` and `record.model` / `record.description` are compared after `.toUpperCase()`.
2. **Series tolerance:** Before comparison, normalize the strings:
   - Replace `"SERIES"` with `"SERIE"`
   - Replace `"SEDAN"` with `"SED"`
   - This applies to both vehicle and record sides.
3. **Body type bonus:** If `vehicleBody` is provided and `record.description` contains a matching body-type keyword, add +0.1 to the score.
4. **Score output:** Must be a number between 0.0 and 1.0.

**Implementation details:**
```typescript
export function scoreCatalogModelMatch(
  vehicleModel: string,
  vehicleBody: string | null,
  record: GlassRecord
): number {
  // 1. Normalize inputs
  const vm = normalizeModelForMatching(vehicleModel);
  const rm = normalizeModelForMatching(record.model || "");
  const desc = normalizeModelForMatching(record.description || "");

  // 2. Exact match (after normalization)
  if (vm === rm || vm === desc) return 1.0;

  // 3. Substring containment
  if (rm.includes(vm) || vm.includes(rm) || desc.includes(vm) || vm.includes(desc)) {
    return 0.8;
  }

  // 4. Token overlap (Jaccard-style)
  const vTokens = new Set(vm.split(/\s+/));
  const rTokens = new Set(rm.split(/\s+/));
  const intersection = new Set([...vTokens].filter(t => rTokens.has(t)));
  const union = new Set([...vTokens, ...rTokens]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  let score = jaccard;

  // 5. Body type bonus
  if (vehicleBody) {
    const bodyKeywords: Record<string, string[]> = {
      sedan: ["sedan", "saloon", "4d", "4-d"],
      suv: ["suv", "cross", "xc", "4x4", "jeep"],
      hatch: ["hatch", "5d", "5-d", "hatchback"],
      wagon: ["wagon", "estate", "sw", "touring", "stasjons"],
      van: ["van", "varebil", "kassevogn", "mpv"],
      coupe: ["coupe", "2d", "2-d"],
    };
    const keywords = bodyKeywords[vehicleBody.toLowerCase()] || [];
    const descLower = (record.description || "").toLowerCase();
    if (keywords.some(k => descLower.includes(k))) {
      score += 0.1;
    }
  }

  return Math.min(1.0, score);
}

function normalizeModelForMatching(model: string): string {
  return model
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bSERIES\b/g, "SERIE")
    .replace(/\bSEDAN\b/g, "SED");
}
```

**Validation:**
```bash
cd ~/bilglass/api/cf-worker && npm run build
```
Must compile with zero errors. If `scoreCatalogModelMatch` is not exported, add `export` to the function definition.

---

# Agent 3: Feature Scoring in Resolver

**Owner:** TypeScript implementation in `vin-glass-resolver.ts`.
**Allowed:** Edit `~/bilglass/api/cf-worker/src/vin-glass-resolver.ts` (create `resolveGlassFromCatalog()`, `CatalogGlassMatch`, and light integration into `resolveGlass()`). May read `lib/db.ts` for query patterns.
**Forbidden:** Edit `lib/scoring.ts`, `search.ts`, `types.ts`, `lib/equipment.ts`, or any other file.

**Task:**
Create `resolveGlassFromCatalog()` and `CatalogGlassMatch` in `vin-glass-resolver.ts` (see interfaces above). Integrate it into `resolveGlass()` so that when a kType is resolved and the catalog has matching rows, the resolver returns a `CatalogGlassMatch` instead of a bare `GlassMatch`.

**Requirements:**
1. **Query:** Use `db.prepare()` with a parameterized query:
   ```sql
   SELECT * FROM glass_catalog WHERE ktype = ? AND brand = ? LIMIT 50
   ```
   - Brand must be normalized using `normalizeBrand(vehicle.make)`.
2. **Year filtering:** After query, filter in-memory:
   ```typescript
   if (record.year_from !== null && record.year_to !== null) {
     if (vehicle.year < record.year_from || vehicle.year > record.year_to) return false;
   }
   ```
   If `year_from`/`year_to` are null, parse from `description` using `parseYearRangeFromDescription()` from `lib/generation.ts` (import it).
3. **Category filtering:** Map `opening` to category keywords:
   - `windshield` -> `frontrute`
   - `backglass` -> `bakrute`
   - `door_*` -> `dorglass`
   - `quarter_*` -> `sideglass`
   Check `record.category.toLowerCase()` against these.
4. **Feature scoring:**
   - If `features` parameter is provided and has at least one truthy key:
     - For each truthy key, `record.<column> === 1 ? +0.2 : -0.1`
     - Column mapping: `camera`->`camera`, `hud`->`hud`, `rainSensor`->`rain_sensor`, `heated`->`heated`, `acoustic`->`acoustic`
   - If `features` is undefined or empty, `featureScore = 0`.
5. **Total score:** `score = modelScore * 0.6 + featureScore * 0.4`
   - If `score < 0.3`, discard the record.
6. **Return:** The highest-scoring record as `CatalogGlassMatch` with `confidence = min(0.99, score)` and `source = 'catalog_featured'`.

**Integration into `resolveGlass()`:**
At the end of `resolveGlass()`, after a match is found (either from `glass_rules`, `tecdoc_d1`, or paid APIs), add:

```typescript
// After any match with a kType, try to resolve the exact catalog product
if (match?.ktype && db) {
  try {
    const catalogMatch = await resolveGlassFromCatalog(
      db,
      match.ktype,
      { make: trustedMake, model: trustedModel, year: trustedYear || 0, body: vehicle.body_style },
      opening,
      features
    );
    if (catalogMatch) {
      // Upgrade the match to include catalog record info
      match = { ...match, ...catalogMatch };
    }
  } catch (e) {
    console.warn('[resolveGlass] Catalog resolution failed:', e);
  }
}
```

This must be placed:
- After `resolveTecDocFromD1` succeeds (before caching to `glass_rules`), AND
- After any paid API succeeds (before caching to `glass_rules`), AND
- After `glass_rules` hit (before returning).

In all three cases, if `resolveGlassFromCatalog` returns a non-null result, the `match` object should be enriched with `record`, `equipmentMatch`, `featuresMatched`, and `featuresMissing`.

**Validation:**
```bash
cd ~/bilglass/api/cf-worker && npm run build
```
Must compile with zero errors. If `CatalogGlassMatch` causes type conflicts with `GlassMatch`, ensure it uses `extends` not overrides.

---

# Agent 4: End-to-End Test

**Owner:** Test writer and runner.
**Allowed:** Create test files under `~/bilglass/api/cf-worker/src/` or `~/bilglass/api/cf-worker/test/`. May call the D1 API or write unit tests with mock data.
**Forbidden:** Edit production source files. Do NOT modify `vin-glass-resolver.ts`, `search.ts`, or any implementation file.

**Task:**
Write and run an end-to-end test that verifies the feature-scoring behavior.

**Test file:** `src/vin-glass-resolver.catalog.test.ts` (or similar, next to `vin-lookup-api.test.ts`)

**Test 1: Tesla Model 3 with rain sensor + heated**
```typescript
test("resolveGlassFromCatalog prioritizes rain_sensor + heated", async () => {
  const mockDb = createMockD1([
    { id: 1, ktype: 12345, brand: "TESLA", model: "MODEL 3", category: "frontrute", rain_sensor: 1, heated: 1, description: "FRONTRUTE SENS EL", price: 5000 },
    { id: 2, ktype: 12345, brand: "TESLA", model: "MODEL 3", category: "frontrute", rain_sensor: 0, heated: 0, description: "FRONTRUTE BASIS", price: 4000 },
  ]);

  const result = await resolveGlassFromCatalog(
    mockDb,
    12345,
    { make: "Tesla", model: "Model 3", year: 2021 },
    "windshield",
    { rainSensor: true, heated: true }
  );

  expect(result).not.toBeNull();
  expect(result?.record?.rain_sensor).toBe(1);
  expect(result?.record?.heated).toBe(1);
  expect(result?.featuresMatched).toBe(2);
  expect(result?.featuresMissing).toBe(0);
  expect(result?.confidence).toBeGreaterThan(0.8);
});
```

**Test 2: Without features -> should return any Model 3 windshield**
```typescript
test("resolveGlassFromCatalog returns any match when features not provided", async () => {
  const mockDb = createMockD1([
    { id: 1, ktype: 12345, brand: "TESLA", model: "MODEL 3", category: "frontrute", rain_sensor: 0, heated: 0, description: "FRONTRUTE BASIS", price: 4000 },
  ]);

  const result = await resolveGlassFromCatalog(
    mockDb,
    12345,
    { make: "Tesla", model: "Model 3", year: 2021 },
    "windshield"
  );

  expect(result).not.toBeNull();
  expect(result?.record?.model).toBe("MODEL 3");
  // Without features, we do not penalize missing equipment
  expect(result?.confidence).toBeGreaterThan(0.3);
});
```

**Test 3: Missing feature penalty**
```typescript
test("resolveGlassFromCatalog penalizes missing rain sensor", async () => {
  const mockDb = createMockD1([
    { id: 1, ktype: 12345, brand: "TESLA", model: "MODEL 3", category: "frontrute", rain_sensor: 0, heated: 1, description: "FRONTRUTE EL", price: 4500 },
    { id: 2, ktype: 12345, brand: "TESLA", model: "MODEL 3", category: "frontrute", rain_sensor: 1, heated: 0, description: "FRONTRUTE SENS", price: 4500 },
  ]);

  // User wants rain sensor -> second record should win despite same price
  const result = await resolveGlassFromCatalog(
    mockDb,
    12345,
    { make: "Tesla", model: "Model 3", year: 2021 },
    "windshield",
    { rainSensor: true }
  );

  expect(result?.record?.rain_sensor).toBe(1);
  expect(result?.featuresMatched).toBe(1);
  expect(result?.featuresMissing).toBe(0);
});
```

**Mock D1 helper:**
```typescript
function createMockD1(rows: Partial<GlassRecord>[]): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: rows }),
      }),
    }),
  } as unknown as D1Database;
}
```

**Validation:**
```bash
cd ~/bilglass/api/cf-worker && npm run test -- src/vin-glass-resolver.catalog.test.ts
```
All tests must pass. If the test file is placed elsewhere, adjust the path.

**Report:** After tests pass, report:
1. Number of tests passed/failed.
2. Match confidence difference with vs without features (compare `result.confidence` from Test 1 vs Test 2).
3. Any edge cases discovered (e.g., records with null `ktype`, records with mismatched category).

---

# Merge Order
1. **Agent 1** runs first (independent -- SQL only, no code dependency).
2. **Agent 2** runs next (creates `scoreCatalogModelMatch()` -- no dependency on Agent 1).
3. **Agent 3** runs after Agent 2 (uses `scoreCatalogModelMatch()` and depends on Agent 2's function existing in `vin-glass-resolver.ts`).
4. **Agent 4** runs last (tests the integration of Agents 2 + 3; depends on both).

# Final Integration Verification
After all agents complete:
```bash
cd ~/bilglass/api/cf-worker
npm run build
npm run test
```
- `npm run build` must pass with zero errors.
- All tests must pass (including new catalog tests from Agent 4).

# Rollback Plan
If `npm run build` fails after Agent 3:
1. Check if Agent 2's `scoreCatalogModelMatch` is exported correctly.
2. Check if Agent 3's `resolveGlassFromCatalog` has correct imports (especially `GlassRecord` from `types.ts`).
3. Check if `CatalogGlassMatch` extends `GlassMatch` correctly (no conflicting property types).

If D1 SQL execution fails (Agent 1):
1. Run `SELECT COUNT(*) FROM glass_catalog` to verify connectivity.
2. Check for syntax errors in the SQL file (SQLite vs D1 dialect differences).
3. If timeouts occur, split the SQL into smaller batches per feature column.
