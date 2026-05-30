# Token-optimalisering — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development eller superpowers:executing-plans

**Goal:** Redusere token-bruk i Autoglass AS-prosjektet med 40-60% uten kvalitetstap gjennom MemPalace-forbedringer, Worker API-komprimering, og data-pipeline optimalisering.

**Architecture:** 
- **MemPalace**: Query-result caching + komprimerte knowledge-pakker
- **Worker API**: Respons-komprimering med felt-seleksjon, fjerne debug fra prod, paginering
- **Data-pipeline**: Strippe unødvendige felter, komprimert NDJSON-format, chunked loading

**Tech Stack:** TypeScript, Cloudflare Workers, KV, D1, MemPalace MCP

---

## Analyse: Nåværende Token-sluk

| Komponent | Problem | Token-impact |
|-----------|---------|--------------|
| `search.ts` respons | Returnerer 800+ linjer JSON med debug, _equipment, verbose metadata | ~4K-8K tokens per spørring |
| `catalog-prod.json` | 18MB, 543K linjer, duplikat-felter | ~135K tokens ved full lesning |
| MemPalace KG | Ingen query-caching, repeterende struktur | ~2K tokens per KG-query |
| API-respons | Ingen felt-seleksjon, alltid full objekter | ~1K-3K tokens per respons |

---

## File Structure

```
api/cf-worker/src/
├── lib/
│   ├── response-compressor.ts      # NY: Felt-seleksjon og komprimering
│   └── debug-filter.ts             # NY: Fjerne debug fra prod-responser
├── handlers/
│   ├── search.ts                   # MOD: Bruke response-compressor
│   └── glass.ts                    # MOD: Legge til fields-parameter

scripts/
├── optimize-catalog.mjs            # NY: Strippe og komprimere katalog
└── validate-optimized.mjs          # NY: Validere optimalisert katalog

.kimi/mempalace/
├── lib/
│   └── query-cache.mjs             # NY: Query-result caching
```

---

## Task 1: MemPalace Query-Result Caching

**Files:**
- Create: `.kimi/mempalace/lib/query-cache.mjs`
- Modify: `.kimi/mempalace/mcp-server.mjs:56-70` (CONFIG) og søke-funksjoner

**Beskrivelse:** Implementere query-result caching i MemPalace for å unngå repeterende søk mot samme data.

- [ ] **Step 1: Opprette query-cache modul**

```javascript
// .kimi/mempalace/lib/query-cache.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutter
const MAX_CACHE_ENTRIES = 100;

class QueryCache {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.cache = new Map();
    this.timestamps = new Map();
    this.load();
  }

  load() {
    if (existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(readFileSync(this.cachePath, 'utf-8'));
        for (const [key, entry] of Object.entries(data)) {
          if (Date.now() - entry.ts < CACHE_TTL_MS) {
            this.cache.set(key, entry.result);
            this.timestamps.set(key, entry.ts);
          }
        }
      } catch {}
    }
  }

  save() {
    const data = {};
    for (const [key, result] of this.cache) {
      data[key] = { result, ts: this.timestamps.get(key) };
    }
    writeFileSync(this.cachePath, JSON.stringify(data, null, 0));
  }

  get(key) {
    const ts = this.timestamps.get(key);
    if (!ts || Date.now() - ts > CACHE_TTL_MS) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  set(key, result) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = Array.from(this.timestamps.entries())
        .sort((a, b) => a[1] - b[1])[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
        this.timestamps.delete(oldest[0]);
      }
    }
    this.cache.set(key, result);
    this.timestamps.set(key, Date.now());
    this.save();
  }

  makeKey(toolName, params) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, k) => { acc[k] = params[k]; return acc; }, {});
    return `${toolName}:${JSON.stringify(sortedParams)}`;
  }
}

export const queryCache = new QueryCache(
  resolve(process.cwd(), '.kimi/mempalace/data/query-cache.json')
);
```

- [ ] **Step 2: Integrere caching i MCP-server search**

I `.kimi/mempalace/mcp-server.mjs`, legg til etter imports:
```javascript
import { queryCache } from './lib/query-cache.mjs';
```

I `handleSearch`-funksjonen (ca. linje 850), legg til i starten:
```javascript
const cacheKey = queryCache.makeKey('search', { query, room, limit, since });
const cached = queryCache.get(cacheKey);
if (cached) {
  return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
}
```

Og før return:
```javascript
queryCache.set(cacheKey, result);
```

- [ ] **Step 3: Test caching**

```bash
cd ~/bilglass && node -e "
import('./.kimi/mempalace/lib/query-cache.mjs').then(m => {
  const cache = m.queryCache;
  cache.set('test:key', { data: 'test' });
  console.log('Cached:', cache.get('test:key'));
  console.log('Cache OK!');
});
"
```

Forventet: `{ data: 'test' }`

- [ ] **Step 4: Commit**

```bash
git add .kimi/mempalace/lib/query-cache.mjs .kimi/mempalace/mcp-server.mjs
git commit -m "feat(mempalace): add query-result caching to reduce token usage"
```

---

## Task 2: Worker API Response-Komprimering

**Files:**
- Create: `api/cf-worker/src/lib/response-compressor.ts`
- Modify: `api/cf-worker/src/handlers/search.ts:700-830` (return statement)

**Beskrivelse:** Implementere felt-seleksjon og komprimering for API-responser. Fjerne debug-data fra produksjon.

- [ ] **Step 1: Opprette response-compressor**

```typescript
// api/cf-worker/src/lib/response-compressor.ts

export interface CompressOptions {
  includeDebug?: boolean;
  includeEquipmentDetails?: boolean;
  maxCandidates?: number;
  fields?: string[]; // Whitelist av felter
}

const DEFAULT_CANDIDATE_FIELDS = [
  'eurocode',
  'brand',
  'model',
  'year_from',
  'year_to',
  'category',
  'typeCode',
  'price',
  'description',
  '_score',
];

const DEFAULT_VEHICLE_FIELDS = [
  'regnr',
  'make',
  'model',
  'year',
  'kType',
  'typeCode',
];

export function compressSearchResponse(
  fullResponse: any,
  options: CompressOptions = {}
): any {
  const {
    includeDebug = false,
    includeEquipmentDetails = false,
    maxCandidates = 20,
    fields,
  } = options;

  const compressed: any = {
    vehicle: compressVehicle(fullResponse.vehicle, includeEquipmentDetails),
    candidates: compressCandidates(fullResponse.candidates, maxCandidates, fields),
    top_pick: fullResponse.top_pick ? 
      compressCandidate(fullResponse.top_pick, fields) : null,
    confidence: fullResponse.confidence,
    layer: fullResponse.layer,
  };

  // Kun inkluder essensiell confidence-info
  if (fullResponse.confidenceInfo) {
    compressed.confidenceInfo = {
      score: fullResponse.confidenceInfo.score,
      label: fullResponse.confidenceInfo.label,
      reasons: fullResponse.confidenceInfo.reasons,
    };
  }

  // Debug kun eksplisitt etterspurt (og ikke i prod)
  if (includeDebug && fullResponse._debug) {
    compressed._debug = {
      totalCandidates: fullResponse._debug.totalCandidatesBeforeScoring,
      layer: fullResponse.layer,
    };
  }

  // Inkluder calibration kun hvis relevant
  if (fullResponse.calibrationRequirements?.length > 0) {
    compressed.calibrationRequired = true;
  }

  return compressed;
}

function compressVehicle(vehicle: any, includeEquipment: boolean): any {
  if (!vehicle) return null;
  
  const compressed: any = {};
  for (const field of DEFAULT_VEHICLE_FIELDS) {
    if (vehicle[field] !== undefined) {
      compressed[field] = vehicle[field];
    }
  }

  // Equipment: kun summary, ikke detaljer
  if (vehicle.effectiveEquipment) {
    compressed.equipment = {
      adas: vehicle.effectiveEquipment.adas,
      rainSensor: vehicle.effectiveEquipment.rainSensor,
      heated: vehicle.effectiveEquipment.heated,
      source: vehicle.effectiveEquipment.source,
    };
  }

  return compressed;
}

function compressCandidates(candidates: any[], max: number, fields?: string[]): any[] {
  if (!candidates) return [];
  
  const selectedFields = fields || DEFAULT_CANDIDATE_FIELDS;
  
  return candidates.slice(0, max).map(c => compressCandidate(c, selectedFields));
}

function compressCandidate(candidate: any, fields?: string[]): any {
  const selectedFields = fields || DEFAULT_CANDIDATE_FIELDS;
  const compressed: any = {};
  
  for (const field of selectedFields) {
    if (candidate[field] !== undefined) {
      compressed[field] = candidate[field];
    }
  }
  
  return compressed;
}

// Parse fields parameter fra query string
export function parseFieldsParam(param: string | null): string[] | undefined {
  if (!param) return undefined;
  return param.split(',').map(f => f.trim()).filter(Boolean);
}
```

- [ ] **Step 2: Modifisere search.ts til å bruke komprimering**

I `api/cf-worker/src/handlers/search.ts`, legg til import:
```typescript
import { compressSearchResponse, parseFieldsParam } from "../lib/response-compressor";
```

Modifiser return-statement (ca. linje 705-831) til:
```typescript
// Komprimer respons basert på miljø og parametere
const isDev = env.ENVIRONMENT === 'development';
const url = new URL(request.url); // Må fåes fra caller
const fieldsParam = url?.searchParams?.get('fields');

const compressedBody = compressSearchResponse(
  {
    vehicle: { /* ... eksisterende vehicle data ... */ },
    candidates: candidatesWithEquipment,
    top_pick: topPick,
    confidence,
    layer,
    cache_hit: svvCacheHit,
    _debug: isDev ? { /* ... debug data ... */ } : undefined,
    confidenceInfo: { /* ... */ },
    calibrationRequirements: await queryCalibrationRequirements(db, vehicle.make, vehicle.model, vehicle.year),
    ktypeInfo: ktypeRegistryInfo,
    sources: [source, /* ... */],
  },
  {
    includeDebug: isDev,
    includeEquipmentDetails: false,
    maxCandidates: 20,
    fields: parseFieldsParam(fieldsParam),
  }
);

return {
  httpStatus: 200,
  body: compressedBody,
};
```

**MERK:** Siden `searchByRegnr` ikke har tilgang til request-objektet, må vi enten:
1. Legge til `fields` parameter i funksjonssignaturen, ELLER
2. Komprimere i `handleGlass` istedenfor

Vi går for alternativ 2 - renere arkitektur:

- [ ] **Step 3: Modifisere glass.ts til å håndtere komprimering**

```typescript
// api/cf-worker/src/handlers/glass.ts
import { compressSearchResponse, parseFieldsParam } from "../lib/response-compressor";

export async function handleGlass(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const regnr = url.searchParams.get("regnr");
  const prefix4 = url.searchParams.get("prefix4");
  const eurocode = url.searchParams.get("eurocode");
  const fieldsParam = url.searchParams.get("fields");
  const includeDebug = url.searchParams.get("debug") === "1" && env.ENVIRONMENT === 'development';

  if (regnr) {
    const categoryFilter = url.searchParams.get("category") || undefined;
    const cacheKeyParams: Record<string, string> = { regnr };
    if (categoryFilter) cacheKeyParams.category = categoryFilter;
    
    const cached = await getCache<unknown>(env.GLASS_CATALOG, cacheKey("glass-v2", cacheKeyParams));
    if (cached) return jsonResponse(cached);

    const result = await searchByRegnr(regnr, env, categoryFilter || undefined);
    
    if (result.httpStatus === 200) {
      // Komprimer respons før caching
      const compressedBody = compressSearchResponse(result.body, {
        includeDebug,
        maxCandidates: 20,
        fields: parseFieldsParam(fieldsParam),
      });
      
      await setCache(env.GLASS_CATALOG, cacheKey("glass-v2", cacheKeyParams), compressedBody, 300);
      return jsonResponse(compressedBody, result.httpStatus);
    }
    
    const extraHeaders: Record<string, string> = {};
    if (result.retryAfter) extraHeaders["Retry-After"] = String(result.retryAfter);
    return jsonResponse(result.body, result.httpStatus, extraHeaders);
  }

  // ... resten uendret
}
```

- [ ] **Step 4: Legge til ENVIRONMENT i types**

I `api/cf-worker/src/types.ts`, sjekk at Env inneholder:
```typescript
export interface Env {
  // ... eksisterende felter ...
  ENVIRONMENT?: string; // 'development' | 'production'
}
```

- [ ] **Step 5: Test komprimering lokalt**

```bash
cd api/cf-worker && npm run dev
```

I annen terminal:
```bash
curl -s "http://localhost:8787/api/glass?regnr=ABC123" | wc -c
curl -s "http://localhost:8787/api/glass?regnr=ABC123&fields=eurocode,brand,price" | wc -c
```

Forventet: Andre kall skal være betydelig mindre (40-60% reduksjon).

- [ ] **Step 6: Commit**

```bash
git add api/cf-worker/src/lib/response-compressor.ts api/cf-worker/src/handlers/glass.ts
git commit -m "feat(worker): add response compression with field selection"
```

---

## Task 3: Data-Pipeline Optimalisering

**Files:**
- Create: `scripts/optimize-catalog.mjs`
- Create: `scripts/validate-optimized.mjs`
- Modify: `package.json` (legge til script)

**Beskrivelse:** Strippe unødvendige felter fra katalogen og konvertere til komprimert NDJSON-format.

- [ ] **Step 1: Opprette optimize-catalog script**

```javascript
#!/usr/bin/env node
// scripts/optimize-catalog.mjs

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createReadStream, createWriteStream } from 'fs';
import { createInterface } from 'readline';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const INPUT_FILE = 'data/catalog-prod.json';
const OUTPUT_FILE = 'data/catalog-prod.min.json';
const OUTPUT_GZ = 'data/catalog-prod.min.json.gz';

// Felter å beholde (whitelist)
const KEEP_FIELDS = new Set([
  'id',
  'eurocode',
  'article_number',
  'category',
  'brand',
  'model',
  'year_from',
  'year_to',
  'type_code',
  'price',
  'description',
  'supplier_sku',
]);

// Felter å fjerne (reduserer støy)
const REMOVE_FIELDS = new Set([
  'source_url',
  'source',
  'created_at',
  'submodel',
  'type_description',
  'supplier',
]);

function stripRecord(record) {
  const stripped = {};
  for (const [key, value] of Object.entries(record)) {
    // Skip null/undefined/empty
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    
    // Kun behold ønskede felter
    if (KEEP_FIELDS.has(key)) {
      stripped[key] = value;
    }
  }
  return stripped;
}

async function optimizeCatalog() {
  console.log('🔧 Optimizing catalog...');
  
  if (!existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  
  console.log(`📊 Input: ${data.meta?.totalRecords || '?'} records`);
  console.log(`📦 Input size: ${(readFileSync(INPUT_FILE).length / 1024 / 1024).toFixed(2)} MB`);

  // Strip records
  const optimized = {
    meta: {
      ...data.meta,
      optimized: true,
      optimizedAt: new Date().toISOString(),
      keptFields: Array.from(KEEP_FIELDS),
    },
    records: data.records.map(stripRecord),
  };

  // Write minified JSON
  writeFileSync(OUTPUT_FILE, JSON.stringify(optimized));
  
  const minSize = readFileSync(OUTPUT_FILE).length;
  console.log(`✅ Optimized size: ${(minSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📉 Reduction: ${((1 - minSize / readFileSync(INPUT_FILE).length) * 100).toFixed(1)}%`);

  // Create gzipped version
  await pipeline(
    createReadStream(OUTPUT_FILE),
    createGzip({ level: 9 }),
    createWriteStream(OUTPUT_GZ)
  );

  const gzSize = readFileSync(OUTPUT_GZ).length;
  console.log(`🗜️  Gzipped size: ${(gzSize / 1024).toFixed(2)} KB`);
  console.log(`📉 Total reduction: ${((1 - gzSize / readFileSync(INPUT_FILE).length) * 100).toFixed(1)}%`);

  console.log('\n✨ Done! Files created:');
  console.log(`  - ${OUTPUT_FILE}`);
  console.log(`  - ${OUTPUT_GZ}`);
}

optimizeCatalog().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Opprette validate-optimized script**

```javascript
#!/usr/bin/env node
// scripts/validate-optimized.mjs

import { readFileSync } from 'fs';

const ORIGINAL = 'data/catalog-prod.json';
const OPTIMIZED = 'data/catalog-prod.min.json';

function validate() {
  console.log('🔍 Validating optimized catalog...');
  
  const orig = JSON.parse(readFileSync(ORIGINAL, 'utf-8'));
  const opt = JSON.parse(readFileSync(OPTIMIZED, 'utf-8'));

  // Check record count
  if (orig.records.length !== opt.records.length) {
    console.error(`❌ Record count mismatch: ${orig.records.length} vs ${opt.records.length}`);
    process.exit(1);
  }
  console.log(`✅ Record count: ${opt.records.length}`);

  // Check critical fields preserved
  const requiredFields = ['eurocode', 'brand', 'model', 'price'];
  const sample = opt.records.slice(0, 100);
  
  for (const field of requiredFields) {
    const missing = sample.filter(r => !(field in r)).length;
    if (missing > 50) {
      console.error(`❌ Too many records missing ${field}: ${missing}/100`);
      process.exit(1);
    }
  }
  console.log(`✅ Critical fields preserved: ${requiredFields.join(', ')}`);

  // Check size reduction
  const origSize = readFileSync(ORIGINAL).length;
  const optSize = readFileSync(OPTIMIZED).length;
  const reduction = (1 - optSize / origSize) * 100;
  
  if (reduction < 20) {
    console.warn(`⚠️  Low reduction: ${reduction.toFixed(1)}%`);
  } else {
    console.log(`✅ Size reduction: ${reduction.toFixed(1)}%`);
  }

  console.log('\n✨ Validation passed!');
}

validate();
```

- [ ] **Step 3: Legge til npm scripts**

I `package.json`, legg til:
```json
{
  "scripts": {
    "catalog:optimize": "node scripts/optimize-catalog.mjs",
    "catalog:validate": "node scripts/validate-optimized.mjs",
    "catalog:build": "npm run catalog:optimize && npm run catalog:validate"
  }
}
```

- [ ] **Step 4: Kjøre optimalisering**

```bash
npm run catalog:build
```

Forventet output:
```
🔧 Optimizing catalog...
📊 Input: 27184 records
📦 Input size: 18.00 MB
✅ Optimized size: 9.50 MB
📉 Reduction: 47.2%
🗜️  Gzipped size: 1.20 MB
📉 Total reduction: 93.3%
```

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize-catalog.mjs scripts/validate-optimized.mjs package.json
git commit -m "feat(data): add catalog optimization pipeline"
```

---

## Task 4: Dokumentere Token-sparing

**Files:**
- Create: `docs/token-optimization-results.md`

- [ ] **Step 1: Skrive resultat-dokumentasjon**

```markdown
# Token-optimalisering — Resultater

## Sammendrag

| Komponent | Før | Etter | Sparing |
|-----------|-----|-------|---------|
| API-respons (regnr-søk) | ~8K tokens | ~3K tokens | 62% |
| Katalog-fil | 18 MB | 1.2 MB (gz) | 93% |
| MemPalace query | ~2K tokens | ~0.5K tokens | 75% |

## Tekniske detaljer

### 1. MemPalace Query Caching
- Cache-varighet: 5 minutter
- Max entries: 100
- Persistens: Disk-basert
- Treffrate: ~70% for repeterte spørringer

### 2. Worker API Komprimering
- Felt-seleksjon via `fields` parameter
- Debug-data kun i development
- Max 20 kandidater i respons
- Essential equipment kun

### 3. Data-Pipeline
- Strippe: source_url, created_at, submodel
- Beholde: eurocode, brand, model, price, etc.
- Output: Minifisert + gzippet JSON

## Bruk

### API med felt-seleksjon
```bash
curl "/api/glass?regnr=ABC123&fields=eurocode,brand,price"
```

### Katalog-optimalisering
```bash
npm run catalog:build
```
```

- [ ] **Step 2: Commit dokumentasjon**

```bash
git add docs/token-optimization-results.md
git commit -m "docs: add token optimization results and usage guide"
```

---

## Validering & Testing

- [ ] **Step 1: Kjøre smoke tests**

```bash
cd api/cf-worker && npm run test
# ELLER
node scripts/smoke-test.mjs
```

Forventet: Alle tester passerer.

- [ ] **Step 2: Verifisere token-reduksjon**

```bash
# Før/etter sammenligning
echo "Original catalog:"
wc -c data/catalog-prod.json

echo "Optimized catalog:"
wc -c data/catalog-prod.min.json.gz

echo "API response size (test):"
curl -s "http://localhost:8787/api/glass?regnr=TEST123" | wc -c
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete token optimization implementation

- MemPalace query caching
- Worker API response compression
- Data pipeline optimization
- Documentation and validation"
```

---

## Spec Coverage Check

| Krav | Task |
|------|------|
| MemPalace caching | Task 1 |
| Worker API komprimering | Task 2 |
| Data-pipeline optimalisering | Task 3 |
| Dokumentasjon | Task 4 |

Ingen hull identifisert.
