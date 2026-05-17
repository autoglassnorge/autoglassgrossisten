/**
 * Euroglass.ru Scraper
 * Extracts auto glass products with Eurocodes from Russian auto glass shop
 * Sitemap: 17,164 products across sitemap-shop-1.xml + sitemap-shop-2.xml
 */
import * as fs from "fs";
import * as path from "path";
// Use built-in fetch (Node 20+)

// Simple p-limit implementation
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

interface EuroglassProduct {
  url: string;
  name: string;
  eurocode: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  glassType: string; // frontrute, bakrute, sideglass, dørglass
  brand: string; // AGC, Pilkington, etc.
  features: Record<string, string>;
  image: string | null;
}

const BASE_URL = "https://euroglass.ru";
const CONCURRENCY = 10;
const FETCH_TIMEOUT = 15000;
const OUTPUT_DIR = path.join(process.cwd(), "data", "scrapers");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "euroglass-ru-products.json");
const CHECKPOINT_FILE = path.join(OUTPUT_DIR, "euroglass-ru-checkpoint.json");

const limit = pLimit(CONCURRENCY);

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function parseProductPage(html: string, url: string): EuroglassProduct | null {
  // Extract Eurocode from meta or page title
  const titleMatch = html.match(/<title>(.+?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : "";

  // Eurocode from meta description or title
  // Try multiple patterns to find Eurocode
  const euroPatterns = [
    /Eurocode:<\/span>\s*<span[^>]*>([A-Z0-9]+)/i,
    /Eurocode\s*[-–]\s*([A-Z0-9]+)/i,
    /Еврокод:\s*([A-Z0-9]+)/i,
    /eurocode['"]?\s*[:=]\s*['"]?([A-Z0-9]+)/i,
  ];
  let eurocode = "";
  for (const p of euroPatterns) {
    const m = html.match(p);
    if (m) { eurocode = m[1]; break; }
  }
  if (!eurocode || eurocode.length < 4) return null;

  // Parse product name from h1
  const h1Match = html.match(/<h1[^>]*itemprop="name"[^>]*>(.+?)<\/h1>/);
  const name = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";

  // Extract make from breadcrumbs
  const breadMatch = html.match(/<a class="bread__link" href="\/([^\/]+)\/">/);
  const make = breadMatch ? breadMatch[1].toUpperCase() : "";

  // Parse year from name: "2013-2018" or "2009-"
  const yearMatch = name.match(/(\d{4})\s*-\s*(\d{4})/);
  const yearFrom = yearMatch ? parseInt(yearMatch[1]) : null;
  const yearTo = yearMatch ? parseInt(yearMatch[2]) : null;

  // Glass type from name
  let glassType = "annet";
  const lowerName = name.toLowerCase();
  if (lowerName.includes("лобовое") || lowerName.includes("ветровое")) glassType = "frontrute";
  else if (lowerName.includes("заднее")) glassType = "bakrute";
  else if (lowerName.includes("боковое")) glassType = "sideglass";
  else if (lowerName.includes("дверное")) glassType = "dørglass";

  // Brand from name (last comma-separated part)
  const brandMatch = name.match(/,\s*([^,]+)$/);
  const brand = brandMatch ? brandMatch[1].trim() : "";

  // Model from URL path: /toyota/corolla/
  const urlMatch = url.match(/\/([^\/]+)\/([^\/]+)\//);
  const model = urlMatch ? urlMatch[2].replace(/-/g, " ").toUpperCase() : "";

  // Features from .p-features
  const features: Record<string, string> = {};
  const featRegex = /<span class="p-features__item-name">(.+?)<\/span><span class="p-features__item-val">(.+?)<\/span>/g;
  let m;
  while ((m = featRegex.exec(html)) !== null) {
    const key = m[1].replace(/:\s*$/, "").trim();
    const val = m[2].replace(/<[^>]+>/g, "").trim();
    features[key] = val;
  }

  // Image
  const imgMatch = html.match(/itemprop="image"[^>]*src="([^"]+)"/);
  const image = imgMatch ? imgMatch[1] : null;

  return {
    url,
    name,
    eurocode,
    make,
    model,
    yearFrom,
    yearTo,
    glassType,
    brand,
    features,
    image,
  };
}

async function getProductUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (const sitemap of ["sitemap-shop-1.xml", "sitemap-shop-2.xml"]) {
    console.log(`📥 Fetching ${sitemap}...`);
    const xml = await fetchWithTimeout(`${BASE_URL}/${sitemap}`, FETCH_TIMEOUT);
    const matches = xml.matchAll(/<loc>(.+?)<\/loc>/g);
    for (const m of matches) {
      const url = m[1];
      // Only product pages have 3+ path segments: /make/model/product-slug/
      const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 3) {
        urls.push(url);
      }
    }
  }
  return urls;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load checkpoint
  let completed = new Set<string>();
  let products: EuroglassProduct[] = [];
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    completed = new Set(cp.completed || []);
    products = cp.products || [];
    console.log(`🔄 Resuming from checkpoint: ${completed.size} done, ${products.length} products`);
  }

  const urls = await getProductUrls();
  console.log(`🔗 Total product URLs: ${urls.length}`);

  const remaining = urls.filter((u) => !completed.has(u));
  console.log(`⏳ Remaining: ${remaining.length}`);

  let done = 0;
  const startTime = Date.now();

  await Promise.all(
    remaining.map((url) =>
      limit(async () => {
        try {
          const html = await fetchWithTimeout(url, FETCH_TIMEOUT);
          const product = parseProductPage(html, url);
          if (product) {
            products.push(product);
          }
          completed.add(url);
          done++;

          if (done % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = done / elapsed;
            const eta = (remaining.length - done) / rate / 60;
            console.log(`   ${done}/${remaining.length} done @ ${rate.toFixed(1)} p/s | ETA: ${eta.toFixed(1)} min | Products: ${products.length}`);
            // Save checkpoint
            fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ completed: Array.from(completed), products }, null, 2));
          }
        } catch (e) {
          completed.add(url); // Mark as done even on error to not retry
          done++;
        }
      })
    )
  );

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ products, meta: { total: products.length, scrapedAt: new Date().toISOString() } }, null, 2));
  fs.unlinkSync(CHECKPOINT_FILE);

  console.log(`\n✅ Done! ${products.length} products scraped`);

  // Stats
  const byMake: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byBrand: Record<string, number> = {};
  for (const p of products) {
    byMake[p.make] = (byMake[p.make] || 0) + 1;
    byType[p.glassType] = (byType[p.glassType] || 0) + 1;
    byBrand[p.brand] = (byBrand[p.brand] || 0) + 1;
  }
  console.log("\n🏷️ Top makes:", Object.entries(byMake).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("📦 Glass types:", Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("🏭 Top brands:", Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(", "));
}

main().catch(console.error);
