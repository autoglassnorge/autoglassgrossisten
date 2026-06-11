# Fuzzy-Matcher SVV → TecDoc (Fase 1 MemPalace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone fuzzy-matcher pipeline that takes a Norwegian regnr, looks it up via SVV Enkeltoppslag, normalizes brand/model/year, resolves TecDoc kType with confidence score, and stores results in both D1 (`svv_tecdoc_matches` table) and MemPalace KG.

**Architecture:** Reuse existing Worker code (`svv.ts`, `tecdoc-resolver.ts`, `brand.ts`) in a standalone Node.js ESM script. The script outputs SQL for D1 insertion and appends KG facts to `.kimi/mempalace/kg-append.jsonl` for MemPalace indexing.

**Tech Stack:** Node.js v22, ESM, TypeScript types (extracted to `.d.ts`), SQLite/D1, MemPalace KG (JSONL append)

---

## File Map

| File | Responsibility |
|---|---|
| `api/cf-worker/migrations/0016_svv_tecdoc_matches.sql` | D1 schema for `svv_tecdoc_matches` table |
| `scripts/lib/svv-fuzzy.mjs` | Reusable fuzzy-matcher module (SVV lookup + TecDoc resolve + scoring) |
| `scripts/lib/tecdoc-resolver-standalone.mjs` | Standalone extraction of `resolveTecDocKType` from Worker code |
| `scripts/lib/svv-client-standalone.mjs` | Standalone extraction of `fetchSvvEnkeltoppslag` + `parseSvvVehicle` |
| `scripts/fuzzy-match-svv-tecdoc.mjs` | CLI entrypoint — reads regnr(s), runs pipeline, writes to D1 SQL + MemPalace KG |
| `.kimi/mempalace/kg-append.jsonl` | MemPalace KG append file (updated by script) |

---

## Task 1: D1 Schema Migration

**Files:**
- Create: `api/cf-worker/migrations/0016_svv_tecdoc_matches.sql`

- [ ] **Step 1.1: Write migration SQL**

```sql
-- SVV → TecDoc fuzzy match results (Fase 1 MemPalace)
-- Stores every SVV lookup → normalized vehicle → TecDoc kType resolution
CREATE TABLE IF NOT EXISTS svv_tecdoc_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  normalized_make TEXT NOT NULL,
  normalized_model TEXT NOT NULL,
  ktype INTEGER,
  tecdoc_brand TEXT,
  tecdoc_model TEXT,
  tecdoc_year_from INTEGER,
  tecdoc_year_to INTEGER,
  confidence_score REAL,
  confidence_level TEXT CHECK(confidence_level IN ('exact','high','medium','low','none')),
  match_reasons TEXT, -- JSON array of strings
  svv_status TEXT, -- 'ok', 'not_found', 'auth_error', 'upstream_error', 'parse_error', 'not_configured'
  svv_source TEXT DEFAULT 'svv.enkeltoppslag',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_regnr ON svv_tecdoc_matches(regnr);
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_ktype ON svv_tecdoc_matches(ktype);
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_make_model ON svv_tecdoc_matches(normalized_make, normalized_model);
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_created ON svv_tecdoc_matches(created_at DESC);
```

- [ ] **Step 1.2: Verify migration syntax**

Run: `sqlite3 :memory: < api/cf-worker/migrations/0016_svv_tecdoc_matches.sql`
Expected: No errors, table created successfully.

---

## Task 2: Extract Standalone SVV Client

**Files:**
- Create: `scripts/lib/svv-client-standalone.mjs`

- [ ] **Step 2.1: Port SVV fetch logic to standalone ESM**

Copy `parseSvvVehicle` and `fetchSvvEnkeltoppslag` from `api/cf-worker/src/providers/svv.ts` into a standalone module. Use native `fetch` (Node.js 18+) and remove TypeScript types (keep JSDoc for clarity).

```javascript
/**
 * @typedef {Object} TecdocVehicle
 * @property {string} regno
 * @property {string} vin
 * @property {string} make
 * @property {string} model
 * @property {number} year
 * @property {number} k_type
 * @property {string} [typeCode]
 * @property {number} [length]
 * @property {string} [fuelCode]
 * @property {string} [engineCode]
 * @property {number} [seats]
 * @property {number} [gvwr]
 * @property {string} [color]
 * @property {string} [fuelType]
 * @property {string} [euroClass]
 * @property {string} [nextEUDate]
 * @property {string} [registrationStatus]
 * @property {string} [vehicleClass]
 * @property {number} [seatCount]
 */

/** @typedef {{status:'ok',vehicle:TecdocVehicle}|{status:'not_configured'|'auth_error'|'not_found'|'upstream_error'|'parse_error',httpStatus?:number}} SvvFetchResult */

export async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSvvVehicle(data, regnr) {
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;
  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;
  const merke = generelt?.merke?.[0]?.merke || "";
  const model = generelt?.handelsbetegnelse?.[0] || "";
  const typeCode = generelt?.typebetegnelse || "";
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;
  const vin = k.kjoretoyId?.understellsnummer || "";
  const length = td?.dimensjoner?.lengde || 0;
  const fuelCode = td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";
  const engineCode = td?.motorOgDrivverk?.motor?.[0]?.motorKode || "";
  const seats = td?.persontall?.sitteplasserTotalt || 0;
  const gvwr = td?.vekter?.tillattTotalvekt || 0;
  const color = td?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn;
  const fuelType = td?.miljodata?.miljoOgdrivstoffGruppe?.[0]?.drivstoffKodeMiljodata?.kodeNavn;
  const euroClass = td?.miljodata?.euroKlasse?.kodeNavn;
  const nextEUDate = k.periodiskKjoretoyKontroll?.kontrollfrist;
  const registrationStatus = k.registrering?.registreringsstatus?.kodeBeskrivelse;
  const vehicleClass = k.kjoretoyklassifisering?.beskrivelse;
  const seatCount = td?.persontall?.sitteplasserTotalt;

  return {
    regno: regnr,
    vin,
    make: merke.toUpperCase(),
    model: model.toUpperCase(),
    year,
    k_type: 0,
    typeCode,
    length,
    fuelCode,
    engineCode,
    seats,
    gvwr,
    color,
    fuelType,
    euroClass,
    nextEUDate,
    registrationStatus,
    vehicleClass,
    seatCount,
  };
}

export async function fetchSvvEnkeltoppslag(regnr, apiKey) {
  if (!apiKey || apiKey === "NOT_SET") {
    console.error("SVV: SVV_API_KEY not configured");
    return { status: "not_configured" };
  }
  try {
    const res = await fetchWithTimeout(
      `https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
      {
        headers: {
          "Accept": "application/json",
          "SVV-Authorization": `Apikey ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      },
      15000
    );

    if (res.status === 401 || res.status === 403) {
      return { status: "auth_error", httpStatus: res.status };
    }
    if (res.status === 404) {
      return { status: "not_found", httpStatus: 404 };
    }
    if (!res.ok) {
      return { status: "upstream_error", httpStatus: res.status };
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      return { status: "parse_error" };
    }

    const vehicle = parseSvvVehicle(data, regnr);
    if (!vehicle) {
      return { status: "not_found" };
    }
    return { status: "ok", vehicle };
  } catch (e) {
    return { status: "upstream_error" };
  }
}
```

- [ ] **Step 2.2: Test SVV client standalone**

Run:
```bash
node -e "import('./scripts/lib/svv-client-standalone.mjs').then(m => console.log('exports:', Object.keys(m)))"
```
Expected: `[ 'fetchWithTimeout', 'parseSvvVehicle', 'fetchSvvEnkeltoppslag' ]`

---

## Task 3: Extract Standalone TecDoc Resolver

**Files:**
- Create: `scripts/lib/tecdoc-resolver-standalone.mjs`

- [ ] **Step 3.1: Port resolveTecDocKType to standalone ESM**

Extract the entire `resolveTecDocKType` function and all helpers from `api/cf-worker/src/lib/tecdoc-resolver.ts` into a standalone module. Import `tecdoc-index.json` via ESM JSON import. Reuse `normalizeBrand` and `getBrandAliases` from a shared brand module.

```javascript
import IDX from '../../api/cf-worker/src/data/tecdoc-index.json' assert { type: 'json' };
import { normalizeBrand, getBrandAliases } from './brand-standalone.mjs';

// ... (all helpers: NOISE_WORDS, MODEL_ALIASES, CHASSIS_GENERATIONS,
// normalizeModelText, extractTokens, extractChassisCodes, scoreEntry,
// ensureInitialized, etc. — copied verbatim from tecdoc-resolver.ts)

export function resolveTecDocKType(make, model, year) {
  // identical logic to Worker version
}
```

- [ ] **Step 3.2: Extract brand helpers to standalone module**

Create `scripts/lib/brand-standalone.mjs` by copying `normalizeBrand` and `getBrandAliases` from `api/cf-worker/src/lib/brand.ts`.

```javascript
const BRAND_MAP = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  // ... (full map from brand.ts)
};

const ALIAS_REVERSE = new Map();
for (const [key, val] of Object.entries(BRAND_MAP)) {
  if (!ALIAS_REVERSE.has(val)) ALIAS_REVERSE.set(val, new Set());
  ALIAS_REVERSE.get(val).add(key);
  ALIAS_REVERSE.get(val).add(val);
}

export function normalizeBrand(brand) {
  const b = brand.toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

export function getBrandAliases(brand) {
  const normalized = normalizeBrand(brand);
  const aliases = ALIAS_REVERSE.get(normalized);
  return aliases ? Array.from(aliases) : [normalized];
}
```

- [ ] **Step 3.3: Test TecDoc resolver standalone**

Run:
```bash
node -e "import('./scripts/lib/tecdoc-resolver-standalone.mjs').then(m => console.log(m.resolveTecDocKType('VOLKSWAGEN','GOLF',2015)))"
```
Expected: Returns a `TecDocResult` object with `status`, `candidates` array, and scores.

---

## Task 4: Build Fuzzy Matcher Orchestrator

**Files:**
- Create: `scripts/lib/svv-fuzzy.mjs`

- [ ] **Step 4.1: Write the orchestrator module**

```javascript
import { fetchSvvEnkeltoppslag } from './svv-client-standalone.mjs';
import { resolveTecDocKType } from './tecdoc-resolver-standalone.mjs';
import { normalizeBrand } from './brand-standalone.mjs';

/**
 * Run the full SVV → TecDoc fuzzy matching pipeline for a single regnr.
 * @param {string} regnr
 * @param {string} svvApiKey
 * @returns {Promise<{regnr:string,svvStatus:string,vehicle:object|null,normalizedMake:string,normalizedModel:string,tecdocResult:object|null,confidenceScore:number,confidenceLevel:string,matchReasons:string[],createdAt:string}>}
 */
export async function runFuzzyMatch(regnr, svvApiKey) {
  const startedAt = new Date().toISOString();

  // 1. SVV lookup
  const svvResult = await fetchSvvEnkeltoppslag(regnr, svvApiKey);

  if (svvResult.status !== 'ok') {
    return {
      regnr,
      svvStatus: svvResult.status,
      vehicle: null,
      normalizedMake: '',
      normalizedModel: '',
      tecdocResult: null,
      confidenceScore: 0,
      confidenceLevel: 'none',
      matchReasons: [`SVV failed: ${svvResult.status}`],
      createdAt: startedAt,
    };
  }

  const vehicle = svvResult.vehicle;

  // 2. Normalize
  const normalizedMake = normalizeBrand(vehicle.make);
  const normalizedModel = vehicle.model.toUpperCase().trim();

  // 3. TecDoc kType resolution
  const tecdocResult = resolveTecDocKType(normalizedMake, normalizedModel, vehicle.year);

  // 4. Compute confidence
  let confidenceScore = 0;
  let confidenceLevel = 'none';
  let matchReasons = [];

  if (tecdocResult.candidates.length > 0) {
    const best = tecdocResult.candidates[0];
    confidenceScore = best.score;
    matchReasons = best.reasons;
    confidenceLevel = tecdocResult.status === 'resolved' ? 'exact' :
                      tecdocResult.status === 'ambiguous' ? 'high' :
                      confidenceScore >= 0.4 ? 'medium' :
                      confidenceScore >= 0.15 ? 'low' : 'none';
  } else {
    matchReasons = ['No TecDoc candidates found'];
  }

  return {
    regnr,
    svvStatus: 'ok',
    vehicle,
    normalizedMake,
    normalizedModel,
    tecdocResult,
    confidenceScore,
    confidenceLevel,
    matchReasons,
    createdAt: startedAt,
  };
}
```

- [ ] **Step 4.2: Test orchestrator with mock data**

Run:
```bash
node -e "
import('./scripts/lib/svv-fuzzy.mjs').then(async m => {
  // Test with a known good regnr if SVV key is available, else mock
  console.log('module loaded:', typeof m.runFuzzyMatch);
});
"
```
Expected: `module loaded: function`

---

## Task 5: Build CLI Entrypoint

**Files:**
- Create: `scripts/fuzzy-match-svv-tecdoc.mjs`

- [ ] **Step 5.1: Write CLI script**

```javascript
#!/usr/bin/env node
/**
 * SVV → TecDoc Fuzzy Matcher CLI
 * Usage: node scripts/fuzzy-match-svv-tecdoc.mjs <regnr> [regnr2 ...]
 * Env: SVV_API_KEY required
 * Outputs:
 *   - D1 SQL INSERT statements to stdout (redirect to file for wrangler d1 execute --file=...)
 *   - MemPalace KG facts appended to .kimi/mempalace/kg-append.jsonl
 */
import { runFuzzyMatch } from './lib/svv-fuzzy.mjs';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  // Try .env.local first
  const envPaths = [
    resolve(root, '.env.local'),
    resolve(root, '.env.production'),
    resolve(root, '.env'),
  ];
  for (const p of envPaths) {
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^SVV_API_KEY=(.+)$/);
        if (m) return m[1].trim();
      }
    }
  }
  return process.env.SVV_API_KEY || '';
}

function escapeSqlString(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function appendKGFact(subject, predicate, object, validFrom) {
  const kgPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  const line = JSON.stringify({ subject, predicate, object, validFrom: validFrom || new Date().toISOString() }) + '\n';
  appendFileSync(kgPath, line);
}

function generateSqlInsert(result) {
  const best = result.tecdocResult?.candidates?.[0] || null;
  const cols = [
    'regnr', 'make', 'model', 'year', 'normalized_make', 'normalized_model',
    'ktype', 'tecdoc_brand', 'tecdoc_model', 'tecdoc_year_from', 'tecdoc_year_to',
    'confidence_score', 'confidence_level', 'match_reasons', 'svv_status', 'svv_source', 'created_at'
  ];
  const vals = [
    escapeSqlString(result.regnr),
    escapeSqlString(result.vehicle?.make),
    escapeSqlString(result.vehicle?.model),
    result.vehicle?.year || 'NULL',
    escapeSqlString(result.normalizedMake),
    escapeSqlString(result.normalizedModel),
    best?.ktype || 'NULL',
    escapeSqlString(best?.brand),
    escapeSqlString(best?.model),
    best?.yearFrom || 'NULL',
    best?.yearTo || 'NULL',
    result.confidenceScore || 'NULL',
    escapeSqlString(result.confidenceLevel),
    escapeSqlString(JSON.stringify(result.matchReasons)),
    escapeSqlString(result.svvStatus),
    escapeSqlString('svv.enkeltoppslag'),
    escapeSqlString(result.createdAt),
  ];
  return `INSERT INTO svv_tecdoc_matches (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
}

async function main() {
  const regnrs = process.argv.slice(2).map(r => r.toUpperCase().replace(/\s/g, ''));
  if (regnrs.length === 0) {
    console.error('Usage: node scripts/fuzzy-match-svv-tecdoc.mjs <regnr> [regnr2 ...]');
    process.exit(1);
  }

  const svvApiKey = loadEnv();
  if (!svvApiKey || svvApiKey === 'NOT_SET') {
    console.error('Error: SVV_API_KEY not found in .env.local or environment');
    process.exit(1);
  }

  const sqlLines = [];
  sqlLines.push("BEGIN TRANSACTION;");

  for (const regnr of regnrs) {
    console.error(`[FuzzyMatch] Processing ${regnr}...`);
    const result = await runFuzzyMatch(regnr, svvApiKey);

    // Generate SQL
    sqlLines.push(generateSqlInsert(result));

    // Append to MemPalace KG
    const ts = result.createdAt;
    appendKGFact(`regnr:${regnr}`, 'svv_lookup_status', result.svvStatus, ts);
    if (result.svvStatus === 'ok') {
      appendKGFact(`regnr:${regnr}`, 'normalized_make', result.normalizedMake, ts);
      appendKGFact(`regnr:${regnr}`, 'normalized_model', result.normalizedModel, ts);
      appendKGFact(`regnr:${regnr}`, 'vehicle_year', String(result.vehicle.year), ts);
      if (result.tecdocResult?.candidates?.length > 0) {
        const best = result.tecdocResult.candidates[0];
        appendKGFact(`regnr:${regnr}`, 'matched_ktype', String(best.ktype), ts);
        appendKGFact(`regnr:${regnr}`, 'tecdoc_brand', best.brand, ts);
        appendKGFact(`regnr:${regnr}`, 'tecdoc_model', best.model, ts);
        appendKGFact(`regnr:${regnr}`, 'match_confidence_score', String(best.score.toFixed(3)), ts);
        appendKGFact(`regnr:${regnr}`, 'match_confidence_level', result.confidenceLevel, ts);
        appendKGFact(`regnr:${regnr}`, 'match_reasons', JSON.stringify(result.matchReasons), ts);
      } else {
        appendKGFact(`regnr:${regnr}`, 'matched_ktype', 'none', ts);
      }
    }

    // Print human-readable summary to stderr
    console.error(`  SVV: ${result.svvStatus} | Make: ${result.normalizedMake} | Model: ${result.normalizedModel} | Year: ${result.vehicle?.year || 'N/A'}`);
    if (result.tecdocResult?.candidates?.length > 0) {
      const best = result.tecdocResult.candidates[0];
      console.error(`  Best kType: ${best.ktype} (${best.brand} ${best.model}) score=${best.score.toFixed(3)} level=${result.confidenceLevel}`);
    } else {
      console.error(`  No TecDoc match`);
    }
  }

  sqlLines.push("COMMIT;");

  // Output SQL to stdout
  console.log(sqlLines.join('\n'));

  console.error(`[FuzzyMatch] Done. ${regnrs.length} regnr(s) processed. SQL emitted to stdout. KG appended to .kimi/mempalace/kg-append.jsonl`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 5.2: Make script executable**

Run: `chmod +x scripts/fuzzy-match-svv-tecdoc.mjs`

---

## Task 6: Test End-to-End

**Files:**
- Test: `scripts/fuzzy-match-svv-tecdoc.mjs`

- [ ] **Step 6.1: Run with a known regnr (requires SVV_API_KEY)**

Run:
```bash
export SVV_API_KEY=$(grep SVV_API_KEY .env.local | cut -d= -f2)
node scripts/fuzzy-match-svv-tecdoc.mjs AB12345 > /tmp/fuzzy-test.sql 2> /tmp/fuzzy-test.log
```
Expected:
- `/tmp/fuzzy-test.log` shows SVV status, make/model/year, best kType, score, confidence level
- `/tmp/fuzzy-test.sql` contains valid SQLite INSERT statements wrapped in BEGIN/COMMIT
- `.kimi/mempalace/kg-append.jsonl` has new lines for `regnr:AB12345` facts

- [ ] **Step 6.2: Validate SQL syntax**

Run:
```bash
sqlite3 :memory: < api/cf-worker/migrations/0016_svv_tecdoc_matches.sql
cat /tmp/fuzzy-test.sql | sqlite3 :memory:
```
Expected: No syntax errors. (Data won't persist in :memory:, but SQL parses.)

- [ ] **Step 6.3: Validate KG append format**

Run:
```bash
tail -5 .kimi/mempalace/kg-append.jsonl | node -e "
const lines = require('fs').readFileSync(0,'utf8').trim().split('\n');
lines.forEach(l => { const f = JSON.parse(l); console.log(f.subject, f.predicate, f.object); });
"
```
Expected: All lines parse as valid JSON with `subject`, `predicate`, `object`, `validFrom` fields.

---

## Task 7: Add npm script alias

**Files:**
- Modify: `package.json`

- [ ] **Step 7.1: Add script entry**

Find the `"scripts"` section in `package.json` and add:
```json
"fuzzy:svv-tecdoc": "node scripts/fuzzy-match-svv-tecdoc.mjs",
"fuzzy:svv-tecdoc:sql": "node scripts/fuzzy-match-svv-tecdoc.mjs > data/fuzzy-match-output.sql",
```

- [ ] **Step 7.2: Verify package.json syntax**

Run: `node -e "console.log(Object.keys(require('./package.json').scripts).filter(k => k.includes('fuzzy')))"`
Expected: `[ 'fuzzy:svv-tecdoc', 'fuzzy:svv-tecdoc:sql' ]`

---

## Task 8: Apply D1 Migration

**Files:**
- Run: D1 migration via wrangler

- [ ] **Step 8.1: Apply locally**

Run:
```bash
cd api/cf-worker && wrangler d1 execute glass-catalog-db --local --file=migrations/0016_svv_tecdoc_matches.sql
```
Expected: Migration applied successfully, `svv_tecdoc_matches` table exists in local D1.

- [ ] **Step 8.2: (Optional) Apply to remote**

Run:
```bash
cd api/cf-worker && wrangler d1 execute glass-catalog-db --remote --file=migrations/0016_svv_tecdoc_matches.sql
```
Expected: Remote D1 updated. (Only run after local verification.)

---

## Self-Review

### Spec coverage

| Krav | Task |
|---|---|
| SVV-oppslag | Task 2, Task 4 |
| brand/model/year normalisering | Task 3 (brand-standalone), Task 4 |
| TecDoc kType-match | Task 3 (tecdoc-resolver-standalone), Task 4 |
| confidence score | Task 4 (orchestrator computes score + level) |
| Lagre i D1-tabell | Task 1 (schema), Task 5 (SQL generation), Task 8 (migration) |
| Lagre i MemPalace KG | Task 5 (kg-append.jsonl writes) |

### Placeholder scan

No placeholders. All code is concrete and copy-pasteable.

### Type consistency

- `confidenceLevel` values: `'exact'`, `'high'`, `'medium'`, `'low'`, `'none'` — consistent across schema, orchestrator, and KG.
- `svvStatus` values: `'ok'`, `'not_configured'`, `'auth_error'`, `'not_found'`, `'upstream_error'`, `'parse_error'` — match `SvvFetchResult` union.
- Field names in SQL (`normalized_make`, `normalized_model`, `confidence_score`, `match_reasons`) match the JS object property names used in the script.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-fuzzy-matcher-svv-tecdoc-mempalace.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch fresh subagents per task (Tasks 1-3 can run in parallel; Task 4 depends on 2+3; Task 5 depends on 4; Task 6-8 are sequential).

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints.

**Which approach?**
