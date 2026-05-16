/**
 * Glavista Eurocode Scraper
 * ==========================
 * Henter ALLE frontruter fra Glavistas offentlige katalog.
 *
 * URL-struktur (bekreftet):
 *   Merke-liste:  https://www.glavista.com/en/windscreen
 *   Merke-side:   https://www.glavista.com/en/windscreen/{merke}-windscreen
 *   Produktside:  https://www.glavista.com/en//windscreen/{eurocode}-{slug}
 *
 * Kjøring:
 *   cd ~/bilglass
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' api/scrapers/glavista-scraper.ts
 *
 * Output: data/glavista-catalog.json
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://www.glavista.com";
const OUTPUT_PATH = path.join(__dirname, "../../data/glavista-catalog.json");
const CONCURRENCY = 5; // samtidige requests
const DELAY_MS = 800;  // delay mellom batcher (vær snill mot serveren)

// Merker vi vil scrape (70+ merker bekreftet på Glavista)
const TARGET_BRANDS = [
  "aiways", "aixam", "alfa-romeo", "asia", "audi", "bedford", "bmw", "byd",
  "cadillac", "chevrolet", "chrysler", "citroen", "cupra", "dacia", "daewoo",
  "daf", "daihatsu", "dodge", "ds-automobiles", "ebro", "erf", "fiat", "ford",
  "honda", "hummer", "hyundai", "infinity", "isuzu", "iveco", "jaguar", "jeep",
  "kia", "lada", "lancia", "lexus", "lotus", "magirus", "man", "maserati",
  "maxus", "mazda", "mcc", "mg", "mercedes", "mitsubishi", "nio", "nissan",
  "opel", "perodua", "peugeot", "polestar", "porsche", "proton", "ram", "ravo",
  "renault", "rover", "saab", "seat", "scania", "skoda", "smart", "ssang-yong",
  "subaru", "suzuki", "tesla", "toyota", "vauxhall", "volvo", "vw"
];

interface GlavistaRecord {
  eurocode: string;
  articleNumber: string; // Glavista-nummer
  scanNumber: string | null;
  category: "frontrute";
  supplier: "Glavista";
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null; // EUR, listepris
  stockStatus: number; // 0 = unknown
  warehouseLocation: null;
  oemNumbers: string[];
  crossReferences: string[];
  weight: null;
  dimensions: { width: null; height: null; thickness: null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: null;
  source: "glavista";
  lastUpdated: string;
  url: string; // original Glavista URL
}

// ============================================================================
// HTTP HJELPER
// ============================================================================

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AutoglassBot/1.0; +https://auto-glass.no/bot)",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.warn(`   HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`   Fetch error for ${url}:`, (err as Error).message);
    return null;
  }
}

// ============================================================================
// PARSING
// ============================================================================

/** Hent alle merker fra hovedsiden (fallback hvis hardkodet liste ikke er komplett) */
async function scrapeBrandList(): Promise<string[]> {
  console.log("📥 Henter merke-liste fra Glavista...");
  const html = await fetchHTML(`${BASE_URL}/en/windscreen`);
  if (!html) return TARGET_BRANDS;

  const brands: string[] = [];
  // Regex: href="windscreen/bmw-windscreen"
  const regex = /href="windscreen\/([a-z0-9-]+)-windscreen"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const brand = match[1];
    if (!brands.includes(brand)) brands.push(brand);
  }

  console.log(`   Fant ${brands.length} merker`);
  return brands.length > 0 ? brands : TARGET_BRANDS;
}

/** Hent alle produkt-URLer fra en merke-side */
async function scrapeProductUrls(brand: string): Promise<string[]> {
  const url = `${BASE_URL}/en/windscreen/${brand}-windscreen`;
  const html = await fetchHTML(url);
  if (!html) return [];

  const urls: string[] = [];
  // Regex: href="/en//windscreen/2465agsv-bmw-3er-4t-f30-kombi-f31-2011"
  const regex = /href="(\/en\/\/windscreen\/[^"]+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const productUrl = BASE_URL + match[1];
    if (!urls.includes(productUrl)) urls.push(productUrl);
  }

  return urls;
}

/** Parse enkelt produktside */
function parseProductPage(html: string, url: string): GlavistaRecord | null {
  // Eurocode
  const euroMatch = html.match(/Eurocode:\s*([A-Z0-9]+)/i);
  if (!euroMatch) return null;
  const eurocode = euroMatch[1].toUpperCase().trim();

  // OE Numbers
  const oeMatch = html.match(/OE Number:\s*([^<]+)/i);
  const oemNumbers = oeMatch
    ? oeMatch[1]
        .split(/[,;/]/)
        .map((s) => s.trim().replace(/\s/g, ""))
        .filter((s) => s.length > 5)
    : [];

  // Glavista Number
  const gvMatch = html.match(/Glavista Number:\s*([^<]+)/i);
  const articleNumber = gvMatch ? gvMatch[1].trim() : "";

  // Brand
  const brandMatch = html.match(/Brand:\s*([^<]+)/i);
  const brand = brandMatch ? brandMatch[1].trim().toLowerCase() : "";

  // Model
  const modelMatch = html.match(/Model:\s*([^<]+)/i);
  const model = modelMatch ? modelMatch[1].trim() : "";

  // Year
  const yearMatch = html.match(/Model Year:\s*(\d{4})\s*-\s*(\d{4}|\s*)/i);
  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  if (yearMatch) {
    yearFrom = parseInt(yearMatch[1], 10);
    const toStr = yearMatch[2]?.trim();
    if (toStr) yearTo = parseInt(toStr, 10);
  } else {
    const singleYear = html.match(/Model Year:\s*(\d{4})/i);
    if (singleYear) yearFrom = parseInt(singleYear[1], 10);
  }

  // Properties / flagg
  const propsMatch = html.match(/Properties:\s*([^<]+)/i);
  const props = propsMatch ? propsMatch[1].toLowerCase() : "";

  const flags = {
    adas: /camera|sensor|calibration|adas/i.test(props + html),
    rainSensor: /rain|regn|sensor/i.test(props),
    heated: /heat|oppvarm|heated|defogging/i.test(props),
    acoustic: /acoustic|akustisk|noise/i.test(props),
    antenna: /antenna|antenne/i.test(props),
    hud: /head-up|hud|projeksjon/i.test(props),
    shade: /solar|sun|shade|solstripe|tonet/i.test(props),
    camera: /camera|kamera/i.test(props),
    laneAssist: /lane|filskifte/i.test(props + html),
  };

  // Price (EUR)
  const priceMatch = html.match(/Suggested retail price:\s*([\d.,]+)\s*€/i);
  const price = priceMatch
    ? parseFloat(priceMatch[1].replace(/\./g, "").replace(/,/g, "."))
    : null;

  // Tinting
  const tintMatch = html.match(/Tinting:\s*([^<]+)/i);
  const tinting = tintMatch ? tintMatch[1].trim() : "";

  // Body Variant
  const bodyMatch = html.match(/Body Variant:\s*([^<]+)/i);
  const bodyVariant = bodyMatch ? bodyMatch[1].trim() : "";

  // Description
  const description = `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : ""} ${model} ${bodyVariant} ${yearFrom || ""}-${yearTo || ""} ${tinting}`.trim();

  return {
    eurocode,
    articleNumber,
    scanNumber: null,
    category: "frontrute",
    supplier: "Glavista",
    brand,
    model,
    yearFrom,
    yearTo,
    ...flags,
    price,
    stockStatus: 0,
    warehouseLocation: null,
    oemNumbers,
    crossReferences: [],
    weight: null,
    dimensions: { width: null, height: null, thickness: null },
    description,
    prefix4: eurocode.slice(0, 4),
    imageUrl: null,
    pdfUrl: null,
    source: "glavista",
    lastUpdated: new Date().toISOString(),
    url,
  };
}

// ============================================================================
// BATCH HÅNDTERING
// ============================================================================

async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R | null>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    for (const r of batchResults) {
      if (r !== null) results.push(r);
    }
    if (i + concurrency < items.length) {
      process.stdout.write(`\r   Batch ${i + 1}-${Math.min(i + concurrency, items.length)} / ${items.length}`);
      await sleep(DELAY_MS);
    }
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// HOVED-FLYT
// ============================================================================

async function main() {
  console.log("🌐 Glavista Eurocode Scraper");
  console.log("============================");

  // Steg 1: Hent merker
  const brands = await scrapeBrandList();
  console.log(`\n📋 ${brands.length} merker å scrape\n`);

  // Steg 2: Hent alle produkt-URLer per merke
  const allUrls: string[] = [];
  const brandUrlMap: Record<string, string[]> = {};

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    process.stdout.write(`[${i + 1}/${brands.length}] ${brand.padEnd(15)} `);
    const urls = await scrapeProductUrls(brand);
    brandUrlMap[brand] = urls;
    allUrls.push(...urls);
    console.log(`${urls.length.toString().padStart(3)} produkter`);
    await sleep(DELAY_MS);
  }

  console.log(`\n📦 Totalt ${allUrls.length} produkt-URLer funnet`);
  if (allUrls.length === 0) {
    console.error("❌ Ingen produkter funnet. Sjekk om Glavista har endret struktur.");
    process.exit(1);
  }

  // Steg 3: Parse hver produktside
  console.log("\n🔧 Parser produktsider...");
  const records = await processBatch(allUrls, async (url) => {
    const html = await fetchHTML(url);
    if (!html) return null;
    return parseProductPage(html, url);
  }, CONCURRENCY);

  console.log(`\n✅ ${records.length} av ${allUrls.length} produkter parset`);

  // Statistikk
  const brandCounts: Record<string, number> = {};
  let withAdas = 0;
  let withRain = 0;
  let withHeated = 0;
  let withAcoustic = 0;
  let withPrice = 0;

  for (const r of records) {
    brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
    if (r.adas) withAdas++;
    if (r.rainSensor) withRain++;
    if (r.heated) withHeated++;
    if (r.acoustic) withAcoustic++;
    if (r.price) withPrice++;
  }

  console.log("\n📊 Fordeling per merke:");
  Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => {
      console.log(`   ${brand.padEnd(15)} ${count.toString().padStart(3)}`);
    });

  console.log("\n📊 Utstyr/flagg:");
  console.log(`   ADAS:        ${withAdas}`);
  console.log(`   Regnsensor:  ${withRain}`);
  console.log(`   Oppvarmet:   ${withHeated}`);
  console.log(`   Akustisk:    ${withAcoustic}`);
  console.log(`   Med pris:    ${withPrice}`);

  // Steg 4: Lagre
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        meta: {
          scrapedAt: new Date().toISOString(),
          source: "Glavista",
          totalRecords: records.length,
          brands: Object.keys(brandCounts).length,
          categories: { frontrute: records.length },
        },
        records,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Lagret til: ${OUTPUT_PATH}`);
  console.log("   Klar for merging med UNI Micro-katalog eller upload til KV.");
}

main().catch((err) => {
  console.error("❌ Feil:", err);
  process.exit(1);
});
