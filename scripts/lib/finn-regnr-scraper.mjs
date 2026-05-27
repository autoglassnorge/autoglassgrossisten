/**
 * Finn.no Regnr Scraper Module
 * ============================
 * Two-step scraper:
 *   1. Scrape search pages → collect finnkodes (filtered by brand)
 *   2. Scrape ad pages → extract registration numbers
 *
 * Uses curl + JSON-LD parsing (fast, no JS rendering needed).
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ──────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  // Rate limiting (respectful)
  requestDelayMs: 1000,
  maxPages: 1000,
  adsPerPage: 38,
  batchSize: 50,

  // Brand filter (from glass catalog)
  targetBrands: [
    "Audi", "BMW", "Mercedes", "Mercedes-Benz", "VW", "Volkswagen",
    "Toyota", "Ford", "Volvo", "Peugeot", "Renault", "Skoda",
    "Kia", "Hyundai", "Nissan", "Mazda", "Honda", "Citroen",
    "Citroën", "Opel", "Seat", "Tesla", "Mitsubishi", "Suzuki",
    "Subaru", "Jeep", "Land Rover", "Jaguar", "Porsche", "Mini",
    "Fiat", "Lexus", "Infiniti", "Alfa Romeo", "DS", "Dacia",
    "Cupra", "Genesis", "Polestar", "BYD", "MG", "Ssangyong",
  ],

  // Output
  outputDir: resolve(process.cwd(), "data", "finn-no-regnr"),

  // Retry
  maxRetries: 3,
  retryDelayMs: 2000,

  // User agent
  userAgent:
    "AutoglassAS-B2B-Scraper/1.0 (+https://auto-glass.no; contact@auto-glass.no)",
};

// Normalize brand names for matching
function normalizeBrand(brand) {
  const b = (brand || "").toLowerCase().trim();
  if (b === "mercedes-benz") return "mercedes";
  if (b === "vw") return "volkswagen";
  return b;
}

function isTargetBrand(brand, targetBrands) {
  const normalized = normalizeBrand(brand);
  return targetBrands.some((tb) => normalizeBrand(tb) === normalized);
}

// ─── File Helpers ───────────────────────────────────────────────
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function appendNDJSON(filePath, records) {
  if (records.length === 0) return;
  const data = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  appendFileSync(filePath, data);
}

function loadCheckpoint(outputDir) {
  const cpFile = resolve(outputDir, "checkpoint.json");
  if (!existsSync(cpFile)) {
    return { step: 1, lastPage: 0, lastAdIndex: 0, totalFinnkodes: 0, totalRegnr: 0 };
  }
  return JSON.parse(readFileSync(cpFile, "utf-8"));
}

function saveCheckpoint(outputDir, checkpoint) {
  const cpFile = resolve(outputDir, "checkpoint.json");
  writeFileSync(cpFile, JSON.stringify(checkpoint, null, 2));
}

// ─── Fetch with retry ───────────────────────────────────────────
async function fetchWithRetry(url, config, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429) {
        console.warn(`   ⚠️  HTTP 429 (rate limited) — waiting 60s...`);
        await sleep(60_000);
        continue;
      }
      if (res.status === 403) {
        console.warn(`   ⚠️  HTTP 403 — waiting 30s...`);
        await sleep(30_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(config.retryDelayMs * (i + 1));
    }
  }
  throw new Error("Max retries exceeded");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Step 1: Parse search page ──────────────────────────────────
function parseSearchPage(html) {
  const results = [];

  // Parse article blocks from HTML (finn.no renders ads server-side as <article> tags)
  const articles = html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g);
  for (const match of articles) {
    const art = match[1];

    // Extract finnkode from URL
    const finnkodeMatch = art.match(/\/mobility\/(?:item|used)\/(\d+)/);
    if (!finnkodeMatch) continue;
    const finnkode = finnkodeMatch[1];

    // Extract brand/model from h2/h3 title
    const titleMatch = art.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
    let brand = "";
    let model = "";
    let fullTitle = "";

    if (titleMatch) {
      // Strip HTML tags
      fullTitle = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // Parse brand/model from title like "Porsche Panamera" or "BMW 3-serie"
      const multiWordBrands = [
        "Alfa Romeo", "Aston Martin", "Land Rover", "Rolls Royce",
        "Great Wall", "Mercedes Benz", "Mercedes-Benz",
      ];

      let remaining = fullTitle;
      for (const mw of multiWordBrands) {
        if (remaining.toLowerCase().startsWith(mw.toLowerCase())) {
          brand = mw;
          model = remaining.slice(mw.length).trim();
          break;
        }
      }

      if (!brand) {
        const firstSpace = remaining.indexOf(" ");
        if (firstSpace > 0) {
          brand = remaining.slice(0, firstSpace).trim();
          model = remaining.slice(firstSpace + 1).trim();
        } else {
          brand = remaining;
        }
      }
    }

    if (finnkode) {
      results.push({
        finnkode,
        brand,
        model,
        url: `https://www.finn.no/mobility/item/${finnkode}`,
      });
    }
  }

  return results;
}

// ─── Step 2: Parse ad page for regnr ────────────────────────────
function parseAdPage(html) {
  // Norwegian plate pattern: 2 letters + 3-5 digits/letters
  // e.g. KJ36935, AB12345, EL49228
  const matches = html.match(/\b[A-Z]{2}\d{3,5}\b/g);
  if (!matches || matches.length === 0) return null;

  // Most common regnr appears multiple times in the HTML
  const counts = new Map();
  for (const m of matches) {
    counts.set(m, (counts.get(m) || 0) + 1);
  }

  // Return the most frequent match (likely the actual regnr)
  let best = null;
  let bestCount = 0;
  for (const [reg, count] of counts) {
    if (count > bestCount) {
      best = reg;
      bestCount = count;
    }
  }

  return best;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Step 1: Scrape search pages to collect finnkodes
 */
export async function scrapeSearchPages(config = DEFAULT_CONFIG, onProgress) {
  ensureDir(config.outputDir);
  const checkpoint = loadCheckpoint(config.outputDir);
  const finnkodesFile = resolve(config.outputDir, "finnkodes.ndjson");

  // If already done step 1, skip
  if (checkpoint.step > 1) {
    console.log("✅ Step 1 already completed — skipping");
    return checkpoint.totalFinnkodes;
  }

  const targetBrandsNormalized = config.targetBrands.map(normalizeBrand);
  let page = checkpoint.lastPage + 1;
  let totalCollected = checkpoint.totalFinnkodes;
  let batch = [];

  console.log(`🚀 Step 1: Scraping search pages (starting from page ${page})`);
  console.log(`   Target brands: ${config.targetBrands.length}`);

  while (page <= config.maxPages) {
    const url = `https://www.finn.no/mobility/search/car?registration_class=1&page=${page}`;

    try {
      const html = await fetchWithRetry(url, config);
      const ads = parseSearchPage(html);

      if (ads.length === 0) {
        console.log(`\n🏁 No more ads found at page ${page}. Stopping.`);
        break;
      }

      // Filter by target brand
      const filtered = ads.filter((ad) =>
        isTargetBrand(ad.brand, config.targetBrands)
      );

      for (const ad of filtered) {
        ad.scrapedAt = new Date().toISOString();
        batch.push(ad);
        totalCollected++;
      }

      // Flush batch
      if (batch.length >= config.batchSize) {
        appendNDJSON(finnkodesFile, batch);
        batch = [];
        saveCheckpoint(config.outputDir, {
          ...checkpoint,
          lastPage: page,
          totalFinnkodes: totalCollected,
        });
      }

      if (onProgress) {
        onProgress({ step: 1, page, collected: totalCollected, adsOnPage: ads.length, filtered: filtered.length });
      }

      // Progress log every 10 pages
      if (page % 10 === 0) {
        console.log(`   Page ${page}: ${ads.length} ads, ${filtered.length} matching brands (total: ${totalCollected})`);
      }

      await sleep(config.requestDelayMs);
      page++;
    } catch (e) {
      console.error(`\n❌ Error on page ${page}: ${e.message}`);
      // Save checkpoint and continue after delay
      if (batch.length > 0) {
        appendNDJSON(finnkodesFile, batch);
        batch = [];
      }
      saveCheckpoint(config.outputDir, {
        ...checkpoint,
        lastPage: page,
        totalFinnkodes: totalCollected,
      });
      await sleep(config.retryDelayMs * 2);
      page++;
    }
  }

  // Final flush
  if (batch.length > 0) {
    appendNDJSON(finnkodesFile, batch);
  }

  saveCheckpoint(config.outputDir, {
    ...checkpoint,
    step: 2,
    lastPage: page - 1,
    totalFinnkodes: totalCollected,
  });

  console.log(`\n✅ Step 1 complete: ${totalCollected} finnkodes collected`);
  return totalCollected;
}

/**
 * Step 2: Scrape ad pages to extract regnr
 */
export async function scrapeAdPages(config = DEFAULT_CONFIG, onProgress) {
  ensureDir(config.outputDir);
  const checkpoint = loadCheckpoint(config.outputDir);
  const finnkodesFile = resolve(config.outputDir, "finnkodes.ndjson");
  const regnrFile = resolve(config.outputDir, "regnr.ndjson");

  // Must have completed step 1
  if (checkpoint.step < 2) {
    console.log("⚠️  Step 1 not completed yet. Run step 1 first.");
    return 0;
  }

  // Load finnkodes from file
  if (!existsSync(finnkodesFile)) {
    console.error("❌ finnkodes.ndjson not found. Run step 1 first.");
    return 0;
  }

  const finnkodes = [];
  const lines = readFileSync(finnkodesFile, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      finnkodes.push(JSON.parse(line));
    } catch {
      // skip corrupt
    }
  }

  let adIndex = checkpoint.lastAdIndex || 0;
  let totalRegnr = checkpoint.totalRegnr || 0;
  let batch = [];

  console.log(`🚀 Step 2: Scraping ${finnkodes.length} ad pages (starting from index ${adIndex})`);

  while (adIndex < finnkodes.length) {
    const ad = finnkodes[adIndex];
    const url = ad.url || `https://www.finn.no/mobility/item/${ad.finnkode}`;

    try {
      const html = await fetchWithRetry(url, config);
      const regnr = parseAdPage(html);

      if (regnr) {
        batch.push({
          regnr,
          finnkode: ad.finnkode,
          brand: ad.brand,
          model: ad.model,
          url,
          scrapedAt: new Date().toISOString(),
        });
        totalRegnr++;
      }

      // Flush batch
      if (batch.length >= config.batchSize) {
        appendNDJSON(regnrFile, batch);
        batch = [];
        saveCheckpoint(config.outputDir, {
          ...checkpoint,
          lastAdIndex: adIndex,
          totalRegnr,
        });
      }

      if (onProgress) {
        onProgress({ step: 2, adIndex, total: finnkodes.length, regnrFound: totalRegnr, currentRegnr: regnr });
      }

      // Progress log every 50 ads
      if (adIndex % 50 === 0 || adIndex === finnkodes.length - 1) {
        const pct = ((adIndex / finnkodes.length) * 100).toFixed(1);
        console.log(`   ${adIndex}/${finnkodes.length} (${pct}%) — ${totalRegnr} regnr found`);
      }

      await sleep(config.requestDelayMs);
    } catch (e) {
      if (adIndex % 50 === 0) {
        console.warn(`   ⚠️  Error on ad ${adIndex}: ${e.message}`);
      }
      // Continue to next ad
    }

    adIndex++;
  }

  // Final flush
  if (batch.length > 0) {
    appendNDJSON(regnrFile, batch);
  }

  saveCheckpoint(config.outputDir, {
    ...checkpoint,
    step: 3,
    lastAdIndex: adIndex,
    totalRegnr,
  });

  console.log(`\n✅ Step 2 complete: ${totalRegnr} regnr extracted from ${adIndex} ads`);
  return totalRegnr;
}

/**
 * Step 3: Deduplicate and generate output files
 */
export function deduplicateAndOutput(config = DEFAULT_CONFIG) {
  const regnrFile = resolve(config.outputDir, "regnr.ndjson");
  const listFile = resolve(config.outputDir, "regnr-list.txt");
  const metaFile = resolve(config.outputDir, "regnr-metadata.json");

  if (!existsSync(regnrFile)) {
    console.error("❌ regnr.ndjson not found. Run step 2 first.");
    return { count: 0, unique: 0 };
  }

  const records = [];
  const lines = readFileSync(regnrFile, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip corrupt
    }
  }

  // Deduplicate by regnr (keep first occurrence)
  const seen = new Set();
  const unique = [];
  for (const r of records) {
    if (!seen.has(r.regnr)) {
      seen.add(r.regnr);
      unique.push(r);
    }
  }

  // Write plain list
  const regnrList = unique.map((r) => r.regnr).join("\n") + "\n";
  writeFileSync(listFile, regnrList);

  // Write metadata
  writeFileSync(metaFile, JSON.stringify({
    total: records.length,
    unique: unique.length,
    byBrand: unique.reduce((acc, r) => {
      const b = r.brand || "Unknown";
      acc[b] = (acc[b] || 0) + 1;
      return acc;
    }, {}),
    generatedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`✅ Step 3 complete:`);
  console.log(`   Total records: ${records.length}`);
  console.log(`   Unique regnr: ${unique.length}`);
  console.log(`   Output: ${listFile}`);
  console.log(`   Metadata: ${metaFile}`);

  return { count: records.length, unique: unique.length };
}

/**
 * Reset checkpoint (for fresh start)
 */
export function resetCheckpoint(config = DEFAULT_CONFIG) {
  const cpFile = resolve(config.outputDir, "checkpoint.json");
  if (existsSync(cpFile)) {
    writeFileSync(cpFile, JSON.stringify({ step: 1, lastPage: 0, lastAdIndex: 0, totalFinnkodes: 0, totalRegnr: 0 }, null, 2));
    console.log("🔄 Checkpoint reset");
  }
}
