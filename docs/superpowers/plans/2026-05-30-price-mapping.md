# Price Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map auto-glass.no SKUs to catalog eurocodes so prices can be synced for all products, not just the ~1,800 direct matches.

**Architecture:** Scrape auto-glass.no product pages to extract hidden eurocodes (if present) or build a fuzzy title→eurocode mapping. Store mapping in a JSON file, update sync script to use it.

**Tech Stack:** Node.js, Playwright (for product page scraping), csv-parse, catalog-prod.json

---

## File Map

| File | Responsibility |
|------|---------------|
| `scripts/scrape-product-pages.mjs` | NEW — Scrape individual product pages for eurocodes |
| `scripts/build-sku-eurocode-mapping.mjs` | NEW — Build and validate SKU→eurocode mapping |
| `scripts/sync-prices-to-catalog.mjs` | Modify — Use mapping for price sync |
| `data/autoglass-scrape/sku-eurocode-mapping.json` | NEW — Persistent mapping cache |
| `data/autoglass-scrape/products-autoglass-no.csv` | Source — auto-glass.no product export |

---

### Task 1: Investigate Product Page Structure

**Files:**
- Create: `scripts/scrape-product-pages.mjs` (initial probe version)

**Context:**
- auto-glass.no product pages may contain eurocode in HTML (meta tags, product description, or hidden fields)
- Need to check if eurocode is present before building full scraper

- [ ] **Step 1: Probe a few product pages for eurocode**

```js
// scripts/probe-product-pages.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const COOKIES = JSON.parse(readFileSync('data/autoglass-scrape/cookies.json', 'utf-8'));
const SKUS = ['1276BZ', '10025C', '1299GGENC']; // Sample SKUs from CSV

async function probe() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(COOKIES);
  
  for (const sku of SKUS) {
    const page = await context.newPage();
    await page.goto(`https://auto-glass.no/vare/${sku.toLowerCase()}/`, { waitUntil: 'networkidle' });
    
    // Check various locations for eurocode
    const html = await page.content();
    const eurocodeMatch = html.match(/\b(\d{4}[A-Z]{4,}[A-Z0-9]*)\b/g);
    console.log(`\nSKU: ${sku}`);
    console.log('Potential eurocodes:', [...new Set(eurocodeMatch || [])].slice(0, 10));
    
    // Check meta tags
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
    console.log('Meta desc:', metaDesc);
    
    await page.close();
  }
  
  await browser.close();
}

probe();
```

- [ ] **Step 2: Run probe and analyze results**

```bash
node scripts/probe-product-pages.mjs
```

**Decision point:**
- If eurocode IS found on product pages → proceed to Task 2A (page scraping)
- If eurocode is NOT found → proceed to Task 2B (fuzzy title matching)

- [ ] **Step 3: Commit probe script**

```bash
git add scripts/probe-product-pages.mjs
git commit -m "chore: probe auto-glass.no product pages for eurocodes"
```

---

### Task 2A: Scrape Product Pages for Eurocodes

*(Only if eurocode found on product pages)*

**Files:**
- Create: `scripts/scrape-product-pages.mjs`
- Create: `data/autoglass-scrape/sku-eurocode-mapping.json`

**Context:**
- ~27,000 product pages to scrape
- Need cookies for authentication
- Should be resumable (checkpoint progress)

- [ ] **Step 1: Build full product page scraper**

```js
// scripts/scrape-product-pages.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse } from 'csv-parse/sync';

const CSV_PATH = 'data/autoglass-scrape/products-autoglass-no.csv';
const COOKIE_PATH = 'data/autoglass-scrape/cookies.json';
const OUTPUT_PATH = 'data/autoglass-scrape/sku-eurocode-mapping.json';
const PROGRESS_PATH = 'data/autoglass-scrape/scrape-progress.json';

const BATCH_SIZE = 50; // Pages per browser session
const DELAY_MS = 500; // Between requests

async function main() {
  const csv = parse(readFileSync(CSV_PATH, 'utf-8'), { columns: true, skip_empty_lines: true });
  const skus = csv.map(r => r.sku?.trim()).filter(Boolean);
  
  // Load existing progress
  const existing = existsSync(OUTPUT_PATH) 
    ? JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')) 
    : {};
  const progress = existsSync(PROGRESS_PATH)
    ? JSON.parse(readFileSync(PROGRESS_PATH, 'utf-8'))
    : { completed: 0, failed: [] };
  
  const remaining = skus.slice(progress.completed);
  console.log(`Total: ${skus.length}, Already done: ${progress.completed}, Remaining: ${remaining.length}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const cookies = JSON.parse(readFileSync(COOKIE_PATH, 'utf-8'));
  await context.addCookies(cookies);
  
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(remaining.length / BATCH_SIZE)}`);
    
    for (const sku of batch) {
      if (existing[sku]) continue; // Already mapped
      
      try {
        const page = await context.newPage();
        await page.goto(`https://auto-glass.no/vare/${sku.toLowerCase()}/`, { 
          waitUntil: 'domcontentloaded', 
          timeout: 15000 
        });
        
        const html = await page.content();
        
        // Extract eurocode — adjust regex based on probe results
        const match = html.match(/eurokode[\s:]*(\d{4}[A-Z]{4,}[A-Z0-9]*)/i);
        if (match) {
          existing[sku] = match[1].toUpperCase();
          console.log(`  ✓ ${sku} → ${match[1]}`);
        } else {
          console.log(`  ✗ ${sku} — no eurocode found`);
        }
        
        await page.close();
        await new Promise(r => setTimeout(r, DELAY_MS));
      } catch (e) {
        console.log(`  ⚠ ${sku} — error: ${e.message}`);
        progress.failed.push(sku);
      }
    }
    
    // Save progress after each batch
    progress.completed = Object.keys(existing).length;
    writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2));
    writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  }
  
  await browser.close();
  console.log(`\nDone! Mapped ${Object.keys(existing).length} SKUs to eurocodes`);
}

main().catch(console.error);
```

- [ ] **Step 2: Run scraper (resumable)**

```bash
node scripts/scrape-product-pages.mjs
```

This will take 30-60 minutes. It's resumable — if interrupted, restart and it continues where it left off.

- [ ] **Step 3: Validate mapping quality**

```bash
node -e "
const m = require('./data/autoglass-scrape/sku-eurocode-mapping.json');
console.log('Total mappings:', Object.keys(m).length);
console.log('Sample:', Object.entries(m).slice(0, 5));
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape-product-pages.mjs data/autoglass-scrape/sku-eurocode-mapping.json
git commit -m "feat(data): scrape auto-glass.no product pages for SKU→eurocode mapping"
```

---

### Task 2B: Fuzzy Title Matching (Fallback)

*(Only if eurocode NOT found on product pages)*

**Files:**
- Create: `scripts/build-sku-eurocode-mapping.mjs`

**Context:**
- Product page doesn't list eurocode
- Must match by title/description similarity
- auto-glass.no title: "BMW 3-SERIE 4D SAL 91- WS GEL"
- Catalog description: "BMW 3-SERIE 4D SAL 91-;WS GEL RSN VIN"

- [ ] **Step 1: Build fuzzy matcher**

```js
// scripts/build-sku-eurocode-mapping.mjs
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const csv = parse(readFileSync('data/autoglass-scrape/products-autoglass-no.csv', 'utf-8'), { 
  columns: true, 
  skip_empty_lines: true 
});

const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));

// Build normalized title index for catalog
const catalogIndex = catalog.records.map(r => ({
  eurocode: r.eurocode,
  text: `${r.brand || ''} ${r.model || ''} ${r.description || ''}`.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(),
}));

function normalizeTitle(title) {
  return title.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSetSimilarity(a, b) {
  const tokensA = new Set(a.split(' ').filter(t => t.length >= 2));
  const tokensB = new Set(b.split(' ').filter(t => t.length >= 2));
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  return intersection.size / Math.max(tokensA.size, tokensB.size);
}

const mapping = {};

for (const row of csv) {
  const sku = row.sku?.trim();
  const title = normalizeTitle(row.title || '');
  if (!sku || !title) continue;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const cat of catalogIndex) {
    const score = tokenSetSimilarity(title, cat.text);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat.eurocode;
    }
  }
  
  if (bestMatch && bestScore > 0.7) {
    mapping[sku] = { eurocode: bestMatch, score: bestScore };
  }
}

writeFileSync('data/autoglass-scrape/sku-eurocode-mapping.json', JSON.stringify(mapping, null, 2));
console.log(`Created ${Object.keys(mapping).length} mappings`);
```

- [ ] **Step 2: Run and validate**

```bash
node scripts/build-sku-eurocode-mapping.mjs
```

- [ ] **Step 3: Manual review of sample mappings**

```bash
node -e "
const m = require('./data/autoglass-scrape/sku-eurocode-mapping.json');
const entries = Object.entries(m).slice(0, 20);
for (const [sku, {eurocode, score}] of entries) {
  console.log(\`\${sku} → \${eurocode} (score: \${score.toFixed(2)})\`);
}
"
```

Review the first 20. If quality is poor (<0.8 average score), adjust threshold or matching algorithm.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sku-eurocode-mapping.mjs data/autoglass-scrape/sku-eurocode-mapping.json
git commit -m "feat(data): build SKU→eurocode mapping via fuzzy title matching"
```

---

### Task 3: Update Price Sync to Use Mapping

**Files:**
- Modify: `scripts/sync-prices-to-catalog.mjs`

**Context:**
- Current sync only matches direct SKU=eurocode
- With mapping, can match ~10,000+ additional products

- [ ] **Step 1: Load and use mapping in sync script**

Add to `sync-prices-to-catalog.mjs`:
```js
// After loading catalog and CSV:
const MAPPING_PATH = resolve('/Users/taj/bilglass/data/autoglass-scrape/sku-eurocode-mapping.json');
let skuToEurocode = {};
if (existsSync(MAPPING_PATH)) {
  skuToEurocode = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'));
  // Handle both formats: direct string or {eurocode, score} object
  for (const [sku, val] of Object.entries(skuToEurocode)) {
    if (typeof val === 'object' && val.eurocode) {
      skuToEurocode[sku] = val.eurocode;
    }
  }
  console.log(`📋 Loaded ${Object.keys(skuToEurocode).length} SKU→eurocode mappings`);
}

// Update CSV price building section:
const csvPrices = new Map();
for (const row of csvRecords) {
  const sku = row.sku?.trim().toUpperCase();
  const priceStr = row.price?.trim();
  if (!sku || !priceStr) continue;
  
  const price = parseInt(priceStr, 10);
  if (isNaN(price) || price <= 0) continue;
  
  // Try direct SKU match first
  let eurocode = sku.match(/^\d{4}[A-Z]{4,}[A-Z0-9]*$/) ? sku : null;
  
  // Fall back to mapping
  if (!eurocode && skuToEurocode[sku]) {
    eurocode = skuToEurocode[sku];
  }
  
  if (eurocode) {
    const existing = csvPrices.get(eurocode);
    if (!existing || price > existing) {
      csvPrices.set(eurocode, price);
    }
  }
}
```

- [ ] **Step 2: Run updated sync**

```bash
node scripts/sync-prices-to-catalog.mjs
```

Expected: significantly more products updated (target: 5,000-10,000).

- [ ] **Step 3: Regenerate D1 inserts**

```bash
cd /Users/taj/bilglass && npx tsx api/cf-worker/scripts/migrate-to-d1.ts
```

- [ ] **Step 4: Commit and deploy**

```bash
git add scripts/sync-prices-to-catalog.mjs data/catalog-prod.json api/cf-worker/generated-inserts.sql
git commit -m "feat(data): sync prices using SKU→eurocode mapping"
git push origin main
```

---

### Task 4: Verify Price Coverage

**Files:**
- None (verification only)

- [ ] **Step 1: Check D1 price count**

```bash
cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --command="SELECT COUNT(*) as cnt FROM glass_catalog WHERE price IS NOT NULL AND price > 0" --remote --json
```

- [ ] **Step 2: Test API for products with prices**

```bash
curl -s "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/catalog/search?q=BMW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
priced = [p for p in d.get('products', []) if p.get('price')]
print(f'Products with prices: {len(priced)}/{len(d.get(\"products\", []))}')
for p in priced[:3]:
  print(f'  {p[\"eurocode\"]}: {p[\"price\"]} kr')
"
```

- [ ] **Step 3: Document coverage in MemPalace**

```bash
# Add to MemPalace knowledge graph
echo "price_sync_coverage: $(date) — X products with prices"
```

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Find eurocodes on product pages | Task 1 (probe), Task 2A |
| Fallback fuzzy matching | Task 2B |
| Use mapping for price sync | Task 3 |
| Verify coverage | Task 4 |

## Decision Tree

```
Task 1 (Probe)
  ├── Eurocode found? ──→ Task 2A (Page scraping)
  └── Not found? ───────→ Task 2B (Fuzzy matching)
            ↓
      Task 3 (Sync update)
            ↓
      Task 4 (Verify)
```

## Execution Handoff

**Plan complete.**

**Recommended approach:** Task 1 must run first (probe determines path). Tasks 2A/2B are large data operations best run as background jobs. Task 3 depends on 2A/2B output. Task 4 is verification.

**For subagent execution:** Dispatch one agent for Task 1, then based on results dispatch either 2A or 2B agent. Task 3 and 4 can be same agent or separate.
