/**
 * Autoglass.ru Scraper
 * Model pages have tables with Eurocodes, OEM numbers, glass types, manufacturers
 * Sitemap: ~14,256 URLs, model pages contain 5-20 products each
 */
import * as fs from "fs";
import * as path from "path";

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

interface AutoglassProduct {
  eurocode: string;
  oem: string | null;
  glassType: string;
  manufacturer: string | null;
  features: string | null;
  modelPage: string;
  make: string;
  model: string;
}

const BASE_URL = "https://www.autoglass.ru";
const CONCURRENCY = 15;
const FETCH_TIMEOUT = 15000;
const OUTPUT_DIR = path.join(process.cwd(), "data", "scrapers");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "autoglass-ru-products.json");
const CHECKPOINT_FILE = path.join(OUTPUT_DIR, "autoglass-ru-checkpoint.json");

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

function parseModelPage(html: string, url: string): AutoglassProduct[] {
  const products: AutoglassProduct[] = [];

  // Extract make from breadcrumb or title
  const makeMatch = html.match(/<span itemprop="name">([^<]+)<\/span>\s*<meta itemprop="position" content="3"/);
  const make = makeMatch ? makeMatch[1].trim().toUpperCase() : "";

  // Extract model from h1 or title
  const h1Match = html.match(/<h1[^>]*itemprop="name"[^>]*>(.+?)<\/h1>/);
  const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";
  const model = h1Text.replace(/стекло|лобовое|боковое|заднее|на|еврокод|\d{4,}/gi, "").replace(/\s+/g, " ").trim();

  // Find all table rows with products
  // Each product is in a <tr> containing table_code, table_type, etc.
  const rowRegex = /<tr[^>]*>[\s\S]*?<td class="nowrap table_code table_block"[^>]*>[\s\S]*?<\/tr>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[0];

    // Eurocode
    const euroMatch = row.match(/<a[^>]*href="([^"]+)"[^>]*itemprop="url">([A-Z0-9]+)<\/a>/);
    const eurocode = euroMatch ? euroMatch[2] : "";
    if (!eurocode) continue;

    // OEM number
    const oemMatch = row.match(/<td class="table_article table_block">([\s\S]*?)<\/td>/);
    const oem = oemMatch ? oemMatch[1].replace(/<[^>]+>/g, "").trim() || null : null;

    // Glass type
    const typeMatch = row.match(/<td class="table_type table_block">[\s\S]*?<span>([^<]+)<\/span>/);
    const typeText = typeMatch ? typeMatch[1].trim() : "";
    let glassType = "annet";
    if (typeText.includes("Лобовое")) glassType = "frontrute";
    else if (typeText.includes("Заднее")) glassType = "bakrute";
    else if (typeText.includes("Боковое")) glassType = "sideglass";
    else if (typeText.includes("Дверное")) glassType = "dørglass";

    // Manufacturer / vendor
    const vendorMatch = row.match(/<td class="table_vendor table_block">([\s\S]*?)<\/td>/);
    const manufacturer = vendorMatch ? vendorMatch[1].replace(/<[^>]+>/g, "").trim() || null : null;

    // Features / characteristics
    const charMatch = row.match(/<td class="table_characteristics table_block">([\s\S]*?)<\/td>/);
    const features = charMatch ? charMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null : null;

    products.push({
      eurocode,
      oem,
      glassType,
      manufacturer,
      features,
      modelPage: url,
      make,
      model,
    });
  }

  return products;
}

async function getModelUrls(): Promise<string[]> {
  console.log("📥 Fetching sitemap...");
  const xml = await fetchWithTimeout(`${BASE_URL}/sitemap.xml`, FETCH_TIMEOUT);
  const urls: string[] = [];
  const matches = xml.matchAll(/<loc>(.+?)<\/loc>/g);
  for (const m of matches) {
    const url = m[1];
    const pathname = new URL(url).pathname;
    // Skip non-model pages
    if (pathname === "/") continue;
    if (pathname.includes("kontakty") || pathname.includes("uslugi") || pathname.includes("faq") ||
        pathname.includes("services") || pathname.includes("garantiya") || pathname.includes("dostavka") ||
        pathname.includes("o-nas") || pathname.includes("blog") || pathname.includes("news")) continue;
    // Must be .html or have model-like pattern
    if (!pathname.endsWith(".html")) continue;
    urls.push(url);
  }
  return urls;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load checkpoint
  let completed = new Set<string>();
  let products: AutoglassProduct[] = [];
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    completed = new Set(cp.completed || []);
    products = cp.products || [];
    console.log(`🔄 Resuming: ${completed.size} done, ${products.length} products`);
  }

  const urls = await getModelUrls();
  console.log(`🔗 Total model URLs: ${urls.length}`);

  const remaining = urls.filter((u) => !completed.has(u));
  console.log(`⏳ Remaining: ${remaining.length}`);

  let done = 0;
  const startTime = Date.now();

  await Promise.all(
    remaining.map((url) =>
      limit(async () => {
        try {
          const html = await fetchWithTimeout(url, FETCH_TIMEOUT);
          const pageProducts = parseModelPage(html, url);
          products.push(...pageProducts);
          completed.add(url);
          done++;

          if (done % 50 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = done / elapsed;
            const eta = (remaining.length - done) / rate / 60;
            console.log(`   ${done}/${remaining.length} done @ ${rate.toFixed(1)} p/s | ETA: ${eta.toFixed(1)} min | Products: ${products.length}`);
            fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ completed: Array.from(completed), products }, null, 2));
          }
        } catch (e) {
          completed.add(url);
          done++;
        }
      })
    )
  );

  // Deduplicate by eurocode
  const seen = new Set<string>();
  const unique = products.filter((p) => {
    if (seen.has(p.eurocode)) return false;
    seen.add(p.eurocode);
    return true;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ products: unique, meta: { total: unique.length, scrapedAt: new Date().toISOString() } }, null, 2));
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

  console.log(`\n✅ Done! ${unique.length} unique products scraped`);

  const byMake: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const p of unique) {
    byMake[p.make] = (byMake[p.make] || 0) + 1;
    byType[p.glassType] = (byType[p.glassType] || 0) + 1;
  }
  console.log("🏷️ Top makes:", Object.entries(byMake).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("📦 Glass types:", Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(", "));
}

main().catch(console.error);
