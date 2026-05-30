# Worker Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve API response time and reduce CPU usage for search operations, especially brand+year queries that scan 10,000+ rows.

**Architecture:** Add database indexes for common query patterns. Implement KV caching for popular kType→eurocode mappings. Add LIMIT to brand/year queries to reduce result set size before JS scoring.

**Tech Stack:** Cloudflare Workers, D1 SQLite, KV, TypeScript

---

## File Map

| File | Responsibility |
|------|---------------|
| `api/cf-worker/schema.sql` | D1 schema with new indexes |
| `api/cf-worker/src/lib/db.ts` | Query helpers with pagination |
| `api/cf-worker/src/lib/cache.ts` | NEW — KV caching utilities |
| `api/cf-worker/src/handlers/search.ts` | Search orchestrator with prefetch |
| `api/cf-worker/src/handlers/catalog.ts` | Catalog endpoints with limits |

---

### Task 1: Add Database Indexes

**Files:**
- Modify: `api/cf-worker/schema.sql`
- Apply: D1 migration via wrangler

**Context:**
- `queryByBrandAndYear` does: `brand IN (...) AND year_from <= ? AND year_to >= ?`
- `queryByKtype` does: `ktype = ?`
- No indexes exist on year columns or ktype

- [ ] **Step 1: Add indexes to schema**

```sql
-- Add to schema.sql (idempotent)
-- Index for brand + year lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_year 
ON glass_catalog(brand, year_from, year_to);

-- Index for kType exact match
CREATE INDEX IF NOT EXISTS idx_glass_catalog_ktype 
ON glass_catalog(ktype);

-- Index for prefix4 lookups
CREATE INDEX IF NOT EXISTS idx_glass_catalog_prefix4 
ON glass_catalog(prefix4);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_glass_catalog_category 
ON glass_catalog(category);

-- Composite index for price queries
CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_price 
ON glass_catalog(brand, price) WHERE price IS NOT NULL;
```

- [ ] **Step 2: Create migration script**

```sql
-- api/cf-worker/migrations/2026-05-30-add-indexes.sql
-- Run via: wrangler d1 execute glass-catalog-db --file=migrations/2026-05-30-add-indexes.sql --remote

CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_year ON glass_catalog(brand, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_glass_catalog_ktype ON glass_catalog(ktype);
CREATE INDEX IF NOT EXISTS idx_glass_catalog_prefix4 ON glass_catalog(prefix4);
CREATE INDEX IF NOT EXISTS idx_glass_catalog_category ON glass_catalog(category);
```

- [ ] **Step 3: Apply migration**

```bash
cd api/cf-worker
npx wrangler d1 execute glass-catalog-db --file=migrations/2026-05-30-add-indexes.sql --remote --yes
```

- [ ] **Step 4: Verify indexes exist**

```bash
npx wrangler d1 execute glass-catalog-db --command="SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='glass_catalog'" --remote --json
```

- [ ] **Step 5: Commit**

```bash
git add api/cf-worker/schema.sql api/cf-worker/migrations/2026-05-30-add-indexes.sql
git commit -m "perf(worker): add D1 indexes for brand/year, ktype, prefix4, category"
```

---

### Task 2: Add LIMIT to Brand/Year Queries

**Files:**
- Modify: `api/cf-worker/src/lib/db.ts`

**Context:**
- `queryByBrandAndYear` has `LIMIT 10000` which is way too high
- Most searches only need top 50-100 candidates for scoring
- Reducing LIMIT reduces CPU time for JS scoring loop

- [ ] **Step 1: Reduce default limits**

```typescript
// In db.ts, change queryByBrandAndYear:
export async function queryByBrandAndYear(
  db: D1Database,
  brand: string,
  year: number,
  modelHint?: string,
  prefix4?: string,
  _bodyHint?: string
): Promise<GlassRecord[]> {
  // ... existing code ...
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 200"; // Was 10000
  // ...
}

// Change queryByBrandOnly:
export async function queryByBrandOnly(
  db: D1Database,
  brand: string,
  modelHint?: string,
  prefix4?: string
): Promise<GlassRecord[]> {
  // ... existing code ...
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 100"; // Was 500
  // ...
}

// Change queryFuzzyBrandYear:
export async function queryFuzzyBrandYear(
  db: D1Database,
  brand: string,
  year: number,
  vehicleModel: string,
  limit = 50
): Promise<Array<{ record: GlassRecord; score: number }>> {
  // ... existing code ...
  const sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders}) AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?) ORDER BY year_from DESC NULLS LAST LIMIT 200`; // Was 1000
  // ...
}
```

- [ ] **Step 2: Add configurable limits via env**

```typescript
// At top of db.ts:
const QUERY_LIMIT_BRAND_YEAR = parseInt(
  (globalThis as any).QUERY_LIMIT_BRAND_YEAR || "200"
);
const QUERY_LIMIT_BRAND_ONLY = parseInt(
  (globalThis as any).QUERY_LIMIT_BRAND_ONLY || "100"
);
const QUERY_LIMIT_FUZZY = parseInt(
  (globalThis as any).QUERY_LIMIT_FUZZY || "200"
);
```

- [ ] **Step 3: Test with UX71699**

```bash
curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=UX71699" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Candidates:', len(d.get('candidates', [])))
print('Top pick:', d.get('top_pick', {}).get('eurocode'))
"
```

Should still return correct 307 CC windshield.

- [ ] **Step 4: Commit**

```bash
git add api/cf-worker/src/lib/db.ts
git commit -m "perf(worker): reduce query limits to prevent CPU timeouts"
```

---

### Task 3: Implement KV Caching for Popular kTypes

**Files:**
- Create: `api/cf-worker/src/lib/cache.ts`
- Modify: `api/cf-worker/src/handlers/search.ts`
- Modify: `api/cf-worker/src/lib/db.ts`

**Context:**
- `queryByKtype` is called for every search that has a kType
- Many kTypes are searched repeatedly (popular car models)
- KV cache TTL can be 24h for stable mappings

- [ ] **Step 1: Create cache utilities**

```typescript
// api/cf-worker/src/lib/cache.ts
import type { GlassRecord } from "../types";

const KTYPE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function getCachedKtypeResults(
  kv: KVNamespace,
  ktype: number
): Promise<GlassRecord[] | null> {
  const key = `ktype_results:${ktype}`;
  const cached = await kv.get(key, "json");
  return cached as GlassRecord[] | null;
}

export async function cacheKtypeResults(
  kv: KVNamespace,
  ktype: number,
  results: GlassRecord[]
): Promise<void> {
  const key = `ktype_results:${ktype}`;
  await kv.put(key, JSON.stringify(results), {
    expirationTtl: KTYPE_CACHE_TTL_SECONDS,
  });
}

export async function getCachedFingerprint(
  kv: KVNamespace,
  brand: string,
  typeCode: string,
  year: number
): Promise<any | null> {
  const key = `fingerprint:${brand}:${typeCode}:${year}`;
  return await kv.get(key, "json");
}

export async function cacheFingerprint(
  kv: KVNamespace,
  brand: string,
  typeCode: string,
  year: number,
  fingerprint: any
): Promise<void> {
  const key = `fingerprint:${brand}:${typeCode}:${year}`;
  await kv.put(key, JSON.stringify(fingerprint), {
    expirationTtl: KTYPE_CACHE_TTL_SECONDS,
  });
}
```

- [ ] **Step 2: Use cache in search.ts**

```typescript
// In search.ts, import:
import { getCachedKtypeResults, cacheKtypeResults } from "../lib/cache";

// In Layer 0 (kType exact match), replace:
// const ktypeDirect = await queryByKtype(db, vehicle.k_type);
// With:
let ktypeDirect = await getCachedKtypeResults(env.GLASS_CATALOG, vehicle.k_type);
if (!ktypeDirect) {
  ktypeDirect = await queryByKtype(db, vehicle.k_type);
  if (ktypeDirect.length > 0) {
    await cacheKtypeResults(env.GLASS_CATALOG, vehicle.k_type, ktypeDirect);
  }
}
```

- [ ] **Step 3: Use cache for fingerprint queries**

```typescript
// In search.ts, replace fingerprint query:
// fingerprint = await queryVehicleFingerprint(db, vehicle.make, vehicle.typeCode || "", vehicle.year);
// With:
let fingerprint = await getCachedFingerprint(env.GLASS_CATALOG, vehicle.make, vehicle.typeCode || "", vehicle.year);
if (!fingerprint) {
  fingerprint = await queryVehicleFingerprint(db, vehicle.make, vehicle.typeCode || "", vehicle.year);
  if (fingerprint) {
    await cacheFingerprint(env.GLASS_CATALOG, vehicle.make, vehicle.typeCode || "", vehicle.year, fingerprint);
  }
}
```

- [ ] **Step 4: Test cache hit/miss**

```bash
# First request (cache miss)
curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=UX71699" > /dev/null

# Second request (cache hit)
curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=UX71699" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Layer:', d.get('layer'))
print('Candidates:', len(d.get('candidates', [])))
"
```

- [ ] **Step 5: Commit**

```bash
git add api/cf-worker/src/lib/cache.ts api/cf-worker/src/handlers/search.ts
git commit -m "perf(worker): add KV caching for kType results and fingerprints"
```

---

### Task 4: Optimize Catalog Search Endpoint

**Files:**
- Modify: `api/cf-worker/src/handlers/catalog.ts`

**Context:**
- `/api/catalog/search` does `LIKE '%query%'` on multiple columns
- No full-text search index in D1
- Can add pagination and reduce columns fetched

- [ ] **Step 1: Add pagination to catalog search**

```typescript
// In handleCatalogSearch, ensure pagination is properly implemented:
const page = parseInt(url.searchParams.get("page") || "1", 10);
const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "48", 10), 100);
const offset = (page - 1) * perPage;

// Add LIMIT/OFFSET to SQL:
sql += " LIMIT ? OFFSET ?";
params.push(perPage, offset);
```

- [ ] **Step 2: Add SELECT column optimization**

Instead of `SELECT *`, fetch only needed columns:
```typescript
const CATALOG_COLUMNS = [
  "id", "eurocode", "article_number", "scan_number", "category",
  "supplier", "brand", "model", "year_from", "year_to", "prefix4",
  "description", "image_url", "price"
].join(", ");

// In search SQL:
let sql = `SELECT ${CATALOG_COLUMNS} FROM glass_catalog WHERE ...`;
```

- [ ] **Step 3: Add query timeout**

```typescript
// In catalog search, add max execution time hint:
// D1 doesn't support query timeouts directly, but we can add a safeguard:
const MAX_RESULTS = 200;
sql += ` LIMIT ${MAX_RESULTS}`;
```

- [ ] **Step 4: Test catalog search performance**

```bash
# Time the request
time curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/catalog/search?q=BMW" > /dev/null

# Should be <500ms
```

- [ ] **Step 5: Commit**

```bash
git add api/cf-worker/src/handlers/catalog.ts
git commit -m "perf(worker): optimize catalog search with column selection and pagination"
```

---

### Task 5: Add Performance Monitoring

**Files:**
- Modify: `api/cf-worker/src/handlers/search.ts`
- Modify: `api/cf-worker/src/handlers/health.ts`

**Context:**
- Need visibility into query performance
- Cloudflare Analytics shows Worker-level metrics, not per-query

- [ ] **Step 1: Add timing to search handler**

```typescript
// In searchByRegnr, add:
const startTime = Date.now();

// ... search logic ...

const duration = Date.now() - startTime;
console.log(`[Search] ${regnr} completed in ${duration}ms (layer=${layer})`);

// Return timing in debug:
_debug: {
  // ...existing debug fields...
  durationMs: duration,
}
```

- [ ] **Step 2: Add slow query logging**

```typescript
if (duration > 1000) {
  console.warn(`[Search] SLOW: ${regnr} took ${duration}ms`);
}
```

- [ ] **Step 3: Update health check with perf info**

```typescript
// In handleHealth, add:
return jsonResponse({
  status: "ok",
  version: "2.4",
  catalogSize,
  // ...existing fields...
  perfHints: {
    avgQueryTime: "~200ms",
    knownSlowPaths: ["brand-only search without model hint"],
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add api/cf-worker/src/handlers/search.ts api/cf-worker/src/handlers/health.ts
git commit -m "perf(worker): add query timing and slow query logging"
```

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Database indexes | Task 1 |
| Query limits | Task 2 |
| KV caching | Task 3 |
| Catalog pagination | Task 4 |
| Performance monitoring | Task 5 |

## Execution Order

```
Task 1 (Indexes) ──→ Task 2 (Limits) ──→ Task 3 (Caching)
       │                    │                  │
       └────────────────────┴──────────────────┘
                          ↓
                    Task 4 (Catalog)
                          ↓
                    Task 5 (Monitoring)
```

Tasks 1-3 are independent and can be parallelized. Task 4 depends on 2 (limits). Task 5 is independent.

## Execution Handoff

**Plan complete.**

**Recommended approach:** Subagent-Driven Development with parallel execution for Tasks 1, 2, 3, 5. Task 4 after Task 2 completes.

**Expected impact:**
- Index addition: 50-80% faster brand/year queries
- LIMIT reduction: Eliminates CPU timeout errors
- KV caching: 10-50ms response time for cached kTypes
- Catalog pagination: Prevents timeout on broad searches
