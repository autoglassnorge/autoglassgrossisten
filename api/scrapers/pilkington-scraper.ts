/**
 * Pilkington IRL Scraper v2 — Robust & Fast
 *
 * Improvements over v1:
 * - PID lock file prevents race conditions / parallel instances
 * - NDJSON append-only checkpoint (O(1) writes, no 3.5MB JSON.stringify)
 * - p-limit concurrency (5 parallel fetches in batches of 5)
 * - Empty name fallback to SKU
 * - BATCH_LIMIT 1000
 * - SIGINT/SIGTERM cleanup
 */

import * as fs from "fs";
import * as path from "path";
// Simple p-limit implementation (avoids ESM/CJS conflict with p-limit v6+)
function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    if (queue.length === 0 || activeCount >= concurrency) return;
    activeCount++;
    const fn = queue.shift()!;
    Promise.resolve().then(() => fn());
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = () => {
        fn().then(
          (val: T) => { activeCount--; resolve(val); next(); },
          (err: any) => { activeCount--; reject(err); next(); }
        );
      };
      queue.push(run);
      next();
    });
  };
}

// ─── Configuration ──────────────────────────────────────────────
const BASE_URL = "https://www.pilkingtonautomotiveglass.ie";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const BATCH_LIMIT = 1000;        // Products per run
const CONCURRENCY = 10;          // Parallel fetches
const FETCH_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 2000;
const OUTPUT_DIR = path.join(process.cwd(), "data", "scrapers");

// ─── File paths ─────────────────────────────────────────────────
const LOCK_FILE = path.join(OUTPUT_DIR, ".pilkington.lock");
const COMPLETED_FILE = path.join(OUTPUT_DIR, "pilkington-completed.ndjson");
const PRODUCTS_FILE = path.join(OUTPUT_DIR, "pilkington-products.ndjson");
const META_FILE = path.join(OUTPUT_DIR, "pilkington-meta.json");
const OLD_CHECKPOINT = path.join(OUTPUT_DIR, "pilkington-checkpoint.json");
const OLD_PRODUCTS = path.join(OUTPUT_DIR, "pilkington-products.json");

// ─── Interfaces ─────────────────────────────────────────────────
interface PilkingtonProduct {
  id: number;
  eurocode: string;
  name: string;
  brand: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  type: string;
  flags: string[];
  images: string[];
  url: string;
  scrapedAt: string;
}

interface ScrapeMeta {
  lastIndex: number;
  count: number;
  lastRunAt: string;
  version: number;
}

// ─── PID Lock ───────────────────────────────────────────────────
function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim(), 10);
      if (!isNaN(pid)) {
        try {
          // Check if process is still alive (throws if not)
          process.kill(pid, 0);
          console.error(`🔒 Lock active by PID ${pid}. Exiting.`);
          return false;
        } catch {
          // Process dead — stale lock, remove it
          fs.unlinkSync(LOCK_FILE);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim(), 10);
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch { /* ignore */ }
}

// Ensure lock is released on exit
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(0); });
process.on("SIGTERM", () => { releaseLock(); process.exit(0); });

// ─── NDJSON Checkpoint ──────────────────────────────────────────
function loadCompletedIds(): Set<number> {
  const set = new Set<number>();
  if (!fs.existsSync(COMPLETED_FILE)) return set;
  const lines = fs.readFileSync(COMPLETED_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const id = parseInt(line.trim(), 10);
    if (!isNaN(id)) set.add(id);
  }
  return set;
}

function appendCompletedIds(ids: number[]) {
  if (ids.length === 0) return;
  const data = ids.map(id => id.toString()).join("\n") + "\n";
  fs.appendFileSync(COMPLETED_FILE, data);
}

function appendProducts(products: PilkingtonProduct[]) {
  if (products.length === 0) return;
  const data = products.map(p => JSON.stringify(p)).join("\n") + "\n";
  fs.appendFileSync(PRODUCTS_FILE, data);
}

function loadMeta(): ScrapeMeta {
  if (!fs.existsSync(META_FILE)) {
    return { lastIndex: 0, count: 0, lastRunAt: "", version: 2 };
  }
  return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
}

function saveMeta(meta: ScrapeMeta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ─── Migrate from old JSON checkpoint ───────────────────────────
function migrateIfNeeded(): boolean {
  if (fs.existsSync(COMPLETED_FILE) && fs.existsSync(PRODUCTS_FILE)) {
    return false; // Already migrated
  }
  if (!fs.existsSync(OLD_CHECKPOINT)) {
    return false; // Nothing to migrate
  }

  console.log("🔄 Migrerer fra gammel JSON-checkpoint...");
  const old = JSON.parse(fs.readFileSync(OLD_CHECKPOINT, "utf-8"));
  const completedIds: number[] = old.completedIds || [];
  const products: PilkingtonProduct[] = old.products || [];

  // Write to NDJSON
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  appendCompletedIds(completedIds);
  appendProducts(products);

  saveMeta({
    lastIndex: completedIds.length > 0 ? Math.max(...completedIds) : 0,
    count: completedIds.length,
    lastRunAt: new Date().toISOString(),
    version: 2,
  });

  console.log(`   Migrert: ${completedIds.length} produkter`);
  return true;
}

// ─── Fetch with retry ───────────────────────────────────────────
async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e: any) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

// ─── Parse sitemap for product IDs ──────────────────────────────
async function parseSitemap(): Promise<number[]> {
  console.log("📥 Henter sitemap...");
  const xml = await fetchWithRetry(SITEMAP_URL);
  const ids: number[] = [];
  const regex = /products\/id-(\d+)\.html/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    ids.push(parseInt(match[1], 10));
  }
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  console.log(`   Fant ${unique.length.toLocaleString("no")} produkter i sitemap`);
  return unique;
}

// ─── Type code extraction from SKU pattern ──────────────────────
function guessTypeFromSku(sku: string): string {
  // Pilkington SKUs sometimes encode type in first 2-4 chars
  // Known patterns from analysis:
  const prefix = sku.slice(0, 4).toUpperCase();
  if (prefix.includes("WS") || prefix.startsWith("W")) return "WS";
  if (prefix.includes("BG") || prefix.startsWith("B")) return "BG";
  if (prefix.includes("DG") || prefix.startsWith("D")) return "DG";
  if (prefix.includes("SG") || prefix.startsWith("S")) return "SG";
  if (prefix.includes("QG") || prefix.startsWith("Q")) return "QG";
  if (prefix.includes("RG") || prefix.startsWith("R")) return "RG";
  if (prefix.includes("TW") || prefix.includes("TS") || prefix.includes("TB")) return "TW";
  return "";
}

// ─── Parse product page ─────────────────────────────────────────
function parseProductPage(html: string, id: number): PilkingtonProduct | null {
  const scripts: string[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1].trim());

  let data: any;
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s);
      if (parsed["@type"] === "Product" && parsed.sku) {
        data = parsed;
        break;
      }
    } catch { continue; }
  }

  if (!data || data["@type"] !== "Product" || !data.sku) {
    return null;
  }

  let name = (data.name as string) || "";
  const sku = data.sku as string;
  const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];

  // Fallback: empty name → use SKU
  if (!name.trim()) {
    name = `Pilkington ${sku}`;
  }

  const parts = name.split(";");
  const vehiclePart = parts[0]?.trim() || "";
  const flagsPart = parts[1]?.trim() || "";

  const yearMatch = vehiclePart.match(/(\d{4})\s*$/);
  const yearFrom = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const flagTokens = flagsPart.split(/\s+/).filter(t => t);
  let type = flagTokens[0] || "";
  const knownTypes: Record<string, string> = {
    "WS": "WS", "W": "WS", "SG": "SG", "S": "SG", "BG": "BG", "B": "BG",
    "QG": "QG", "Q": "QG", "DG": "DG", "D": "DG", "TW": "TW",
    "TS": "TS", "TB": "TB", "RG": "RG", "RS": "RS",
  };
  if (knownTypes[type]) {
    type = knownTypes[type];
  } else if (type.startsWith("W")) {
    type = "WS";
  } else {
    type = "";
  }

  // If still no type (empty name case), try SKU pattern
  if (!type) {
    type = guessTypeFromSku(sku);
  }

  const flags = type ? flagTokens.slice(1) : flagTokens;

  let brand = "";
  let model = "";

  if (vehiclePart) {
    const withoutYear = vehiclePart.replace(/\s*\d{4}\s*$/, "").trim();
    const multiWordBrands = [
      "ALFA ROMEO", "LAND ROVER", "ROLLS ROYCE", "ASTON MARTIN",
      "GREAT WALL", "FORD USA", "MERCEDES BENZ", "MERCEDES-BENZ",
    ];

    let remaining = withoutYear.toUpperCase();
    for (const mw of multiWordBrands) {
      if (remaining.startsWith(mw)) {
        brand = mw;
        model = withoutYear.slice(mw.length).trim();
        break;
      }
    }

    if (!brand) {
      const firstSpace = withoutYear.indexOf(" ");
      if (firstSpace > 0) {
        brand = withoutYear.slice(0, firstSpace).trim().toUpperCase();
        model = withoutYear.slice(firstSpace + 1).trim();
      } else {
        brand = withoutYear.toUpperCase();
        model = "";
      }
    }
  }

  return {
    id,
    eurocode: sku,
    name,
    brand,
    model,
    yearFrom,
    yearTo: yearFrom ? yearFrom + 10 : undefined,
    type,
    flags: flags.filter(f => f.length > 1),
    images,
    url: `${BASE_URL}/products/id-${id}.html`,
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Scrape single product ──────────────────────────────────────
async function scrapeOne(id: number): Promise<PilkingtonProduct | null> {
  try {
    const html = await fetchWithRetry(`${BASE_URL}/products/id-${id}.html`, 2);
    return parseProductPage(html, id);
  } catch {
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  // 1. PID lock
  if (!acquireLock()) {
    process.exit(0);
  }

  console.log("🌐 Pilkington IRL Scraper v2");
  console.log("=============================\n");
  console.log(`   PID: ${process.pid} | Concurrency: ${CONCURRENCY} | Batch: ${BATCH_LIMIT}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 2. Migrate old checkpoint if needed
  migrateIfNeeded();

  // 3. Load checkpoint
  const completedSet = loadCompletedIds();
  const meta = loadMeta();

  // 4. Parse sitemap
  const allIds = await parseSitemap();
  const remainingIds = Array.from(allIds.filter(id => !completedSet.has(id)));

  console.log(`   Allerede scrape'et: ${completedSet.size.toLocaleString("no")}`);
  console.log(`   Gjenstår: ${remainingIds.length.toLocaleString("no")}`);

  if (remainingIds.length === 0) {
    console.log("\n✅ Alle produkter allerede scrape'et!");
    releaseLock();
    return;
  }

  // 5. Limit batch
  const toProcess = remainingIds.slice(0, BATCH_LIMIT);
  console.log(`\n🚀 Prosesserer ${toProcess.length} produkter med ${CONCURRENCY} parallelle fetch...`);
  const startTime = Date.now();

  // 6. Concurrency limiter
  const limit = pLimit(CONCURRENCY);

  // 7. Process in mini-batches to avoid V8 deopt
  const MINI_BATCH = CONCURRENCY;
  let processed = 0;
  let newProducts: PilkingtonProduct[] = [];
  let newIds: number[] = [];

  for (let i = 0; i < toProcess.length; i += MINI_BATCH) {
    const batchIds = toProcess.slice(i, i + MINI_BATCH);
    const results = await Promise.all(
      batchIds.map(id => limit(() => scrapeOne(id)))
    );

    for (let j = 0; j < results.length; j++) {
      const product = results[j];
      if (product) {
        newProducts.push(product);
        newIds.push(product.id);
      }
    }

    processed += batchIds.length;

    // Progress log every 50
    if (processed % 50 === 0 || processed === toProcess.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / (Date.now() - startTime) * 1000).toFixed(2);
      const totalNow = completedSet.size + newProducts.length;
      console.log(`   ${processed}/${toProcess.length} done (${elapsed}s) @ ${rate} prod/s | Total: ${totalNow}`);
    }

    // Flush to NDJSON every 100 products (or at end)
    if (newProducts.length >= 100 || processed === toProcess.length) {
      appendProducts(newProducts);
      appendCompletedIds(newIds);
      newProducts = [];
      newIds = [];
    }
  }

  // 8. Final save
  if (newProducts.length > 0) {
    appendProducts(newProducts);
    appendCompletedIds(newIds);
  }

  const totalCount = await countProductsInNDJSON();
  saveMeta({
    lastIndex: toProcess[toProcess.length - 1] || meta.lastIndex,
    count: totalCount,
    lastRunAt: new Date().toISOString(),
    version: 2,
  });

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n⏱️  Tid: ${elapsed} minutter`);
  console.log(`   Batch ferdig: ${processed} produkter prosessert`);
  console.log(`   Totalt i database: ${totalCount}`);
  console.log(`   Gjenstår: ${remainingIds.length - processed}`);

  // 9. Stats
  const stats = await computeStats();
  console.log("\n📊 Resultater:");
  console.log(`   Totalt produkter: ${stats.total.toLocaleString("no")}`);
  console.log(`   Unike merker: ${stats.brands}`);
  console.log(`   Med årstall: ${stats.withYear.toLocaleString("no")}`);
  console.log(`   Med flagg: ${stats.withFlags.toLocaleString("no")}`);
  console.log(`   Type-fordeling:`);
  for (const [t, c] of stats.types.slice(0, 10)) {
    console.log(`      ${t}: ${c.toLocaleString("no")}`);
  }

  releaseLock();
}

// ─── Helpers ────────────────────────────────────────────────────
async function countProductsInNDJSON(): Promise<number> {
  if (!fs.existsSync(COMPLETED_FILE)) return 0;
  // Fast line count
  const buf = fs.readFileSync(COMPLETED_FILE, "utf-8");
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === "\n") count++;
  }
  return count;
}

async function computeStats(): Promise<{
  total: number;
  brands: number;
  withYear: number;
  withFlags: number;
  types: [string, number][];
}> {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    return { total: 0, brands: 0, withYear: 0, withFlags: 0, types: [] };
  }

  const brands = new Map<string, number>();
  const types = new Map<string, number>();
  let withYear = 0;
  let withFlags = 0;
  let total = 0;

  const lines = fs.readFileSync(PRODUCTS_FILE, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const p: PilkingtonProduct = JSON.parse(line);
      total++;
      brands.set(p.brand, (brands.get(p.brand) || 0) + 1);
      if (p.type) types.set(p.type, (types.get(p.type) || 0) + 1);
      if (p.yearFrom) withYear++;
      if (p.flags && p.flags.length > 0) withFlags++;
    } catch { /* skip corrupt lines */ }
  }

  return {
    total,
    brands: brands.size,
    withYear,
    withFlags,
    types: Array.from(types.entries()).sort((a, b) => b[1] - a[1]),
  };
}

main().catch(e => {
  console.error("❌ Feil:", e.message);
  releaseLock();
  process.exit(1);
});
