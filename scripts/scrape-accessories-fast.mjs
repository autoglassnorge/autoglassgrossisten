#!/usr/bin/env node
/**
 * FAST Auto-glass.no Accessory Scraper
 * ====================================
 * Optimized: scrapes ONLY category pages, skips product page visits.
 * Uses multi-page parallelism for speed.
 *
 * Run: node scripts/scrape-accessories-fast.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'accessory-checkpoint-fast.json');
const OUTPUT_SQL_FILE = resolve(DATA_DIR, 'accessory-updates-fast.sql');
const LOG_FILE = resolve(DATA_DIR, 'accessory-scrape-fast.log');

const RATE_LIMIT_MS = 100; // 100ms between categories (was 500ms per product)
const PARALLEL_PAGES = 4; // 4 parallel page contexts
const SAVE_EVERY = 50;

try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

let processedSkus = new Set();
if (existsSync(CHECKPOINT_FILE)) {
  const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
  processedSkus = new Set(cp.processedSkus || []);
}

const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));
const urlsToScrape = [];
for (const brand of categoryTree) {
  for (const model of brand.models) {
    for (const year of model.years) {
      urlsToScrape.push({ brand: brand.name, model: model.name, submodel: null, yearRange: year.yearRange, url: year.url });
    }
    for (const submodel of model.submodels) {
      for (const year of submodel.years) {
        urlsToScrape.push({ brand: brand.name, model: model.name, submodel: submodel.name, yearRange: year.yearRange, url: year.url });
      }
    }
  }
}

console.log(`📋 Total categories: ${urlsToScrape.length}`);
console.log(`📦 Already processed: ${processedSkus.size} products`);

function saveCheckpoint() {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processedSkus: Array.from(processedSkus), timestamp: new Date().toISOString() }, null, 2));
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function appendSql(sku, accessorySkus) {
  const json = JSON.stringify(accessorySkus);
  const sql = `UPDATE glass_catalog SET accessory_skus = '${json.replace(/'/g, "''")}' WHERE article_number = '${sku}' AND accessory_skus IS NULL;\n`;
  appendFileSync(OUTPUT_SQL_FILE, sql);
}

/**
 * Scrape a single category page for product SKUs.
 * Does NOT visit product pages — just extracts from list view.
 */
async function scrapeCategoryPage(page, meta, index) {
  const accessoriesFound = [];
  try {
    await page.goto(meta.url, { timeout: 15000, waitUntil: 'domcontentloaded' });

    const productCards = await page.locator('.product').all();
    if (productCards.length === 0) return 0;

    for (const card of productCards) {
      try {
        const sku = await card.locator('.sku').textContent().catch(() => null);
        if (!sku) continue;
        const cleanSku = sku.trim();

        if (processedSkus.has(cleanSku)) continue;

        // Check if card has "related products" indicator (some themes show this in list view)
        // OR just check if product has accessories via data-attribute
        const hasRelated = await card.locator('.related-products, .product-accessories, [class*="tilbeh"], [class*="relat"]').count() > 0;
        if (!hasRelated) {
          processedSkus.add(cleanSku);
          continue; // No accessories visible in list view
        }

        // Extract related SKUs from the card
        const relatedSkus = [];
        const relatedItems = await card.locator('.related-item, .accessory-item').all();
        for (const item of relatedItems) {
          const relatedSku = await item.getAttribute('data-sku').catch(() => null);
          if (relatedSku && relatedSku !== cleanSku) relatedSkus.push(relatedSku);
        }

        if (relatedSkus.length > 0) {
          log(`✅ ${cleanSku}: ${relatedSkus.length} accessories (${relatedSkus.join(', ')})`);
          appendSql(cleanSku, relatedSkus);
          accessoriesFound.push({ sku: cleanSku, accessories: relatedSkus });
        }

        processedSkus.add(cleanSku);
      } catch (e) {}
    }

  } catch (e) {
    log(`❌ ${meta.brand} ${meta.model} ${meta.yearRange}: ${e.message}`);
  }
  return accessoriesFound.length;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Block heavy resources
  await context.route('**/*', (route, request) => {
    const type = request.resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
      route.abort();
    } else {
      route.continue();
    }
  });

  // Create parallel pages
  const pages = [];
  for (let i = 0; i < PARALLEL_PAGES; i++) {
    pages.push(await context.newPage());
  }

  // Login on first page
  log('🔐 Logging in...');
  await pages[0].goto(`${BASE_URL}/min-konto/`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await pages[0].waitForSelector('#username', { timeout: 10000 });
  await pages[0].fill('#username', EMAIL);
  await pages[0].fill('#password', PASSWORD);
  await pages[0].click('button[name="login"]');
  await pages[0].waitForLoadState('domcontentloaded');
  try {
    await pages[0].waitForSelector('a[href*="logout"]', { timeout: 10000 });
  } catch (e) {
    log('❌ Login failed');
    await browser.close();
    process.exit(1);
  }
  log('✅ Logged in');

  // Copy cookies to other pages
  const cookies = await context.cookies();
  for (let i = 1; i < PARALLEL_PAGES; i++) {
    await pages[i].context().addCookies(cookies);
  }

  let totalFound = 0;
  const startTime = Date.now();

  // Process in batches of PARALLEL_PAGES
  for (let i = 0; i < urlsToScrape.length; i += PARALLEL_PAGES) {
    const batch = urlsToScrape.slice(i, i + PARALLEL_PAGES);
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | Found: ${totalFound} | ${elapsed}min | Parallel: ${PARALLEL_PAGES}`);

    // Run parallel
    const results = await Promise.all(
      batch.map((meta, idx) => scrapeCategoryPage(pages[idx], meta, i + idx))
    );
    totalFound += results.reduce((a, b) => a + b, 0);

    // Save checkpoint periodically
    if (i % (SAVE_EVERY * PARALLEL_PAGES) === 0) {
      saveCheckpoint();
      log(`💾 Checkpoint: ${processedSkus.size} products, ${totalFound} with accessories`);
    }

    // Rate limit between batches
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  saveCheckpoint();
  log(`\n🏁 Complete!`);
  log(`📦 Products processed: ${processedSkus.size}`);
  log(`🔗 With accessories: ${totalFound}`);
  log(`⏱️ Total: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

  await browser.close();
}

main().catch(e => {
  log(`💥 Fatal: ${e.message}`);
  process.exit(1);
});
