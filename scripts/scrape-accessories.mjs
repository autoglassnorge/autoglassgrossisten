#!/usr/bin/env node
/**
 * Auto-glass.no Accessory Scraper
 * ================================
 * Iterates through product catalog pages and scrapes related products / accessories
 * for each product. Saves mapping to D1 glass_catalog.accessory_skus
 *
 * Login required (same credentials as other scrapers)
 * Run: node scripts/scrape-accessories.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'accessory-checkpoint.json');
const OUTPUT_SQL_FILE = resolve(DATA_DIR, 'accessory-updates.sql');
const LOG_FILE = resolve(DATA_DIR, 'accessory-scrape.log');

const RATE_LIMIT_MS = 500; // Slower for product pages
const SAVE_EVERY = 50;
const MAX_PRODUCTS_PER_CATEGORY = 50; // Limit per category page to avoid overload

// Ensure directories exist
try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

// Load existing checkpoint
let processedSkus = new Set();
if (existsSync(CHECKPOINT_FILE)) {
  const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
  processedSkus = new Set(cp.processedSkus || []);
}

// Load category tree (from previous scraper run)
const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));

// Build list of category URLs to scrape
const urlsToScrape = [];
for (const brand of categoryTree) {
  for (const model of brand.models) {
    for (const year of model.years) {
      urlsToScrape.push({
        brand: brand.name,
        model: model.name,
        submodel: null,
        yearRange: year.yearRange,
        url: year.url
      });
    }
    for (const submodel of model.submodels) {
      for (const year of submodel.years) {
        urlsToScrape.push({
          brand: brand.name,
          model: model.name,
          submodel: submodel.name,
          yearRange: year.yearRange,
          url: year.url
        });
      }
    }
  }
}

console.log(`📋 Total categories: ${urlsToScrape.length}`);
console.log(`📦 Already processed: ${processedSkus.size} products`);
console.log(`🎯 Remaining: ~${urlsToScrape.length * 10 - processedSkus.size} products (estimated)`);

function saveCheckpoint() {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({
    processedSkus: Array.from(processedSkus),
    timestamp: new Date().toISOString()
  }, null, 2));
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
 * Scrape accessories for a single product page
 */
async function scrapeProductAccessories(page, productUrl, sku) {
  try {
    await page.goto(productUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });

    // Look for related products / accessories section
    // Common WooCommerce selectors
    const relatedSectionSelectors = [
      '.related.products',
      '.upsells.products',
      '.product-accessories',
      '[class*="related"]',
      '[class*="accessory"]',
      '[class*="tilbeh"]'
    ];

    let relatedSection = null;
    for (const selector of relatedSectionSelectors) {
      const el = await page.locator(selector).first();
      if (await el.count() > 0) {
        relatedSection = el;
        break;
      }
    }

    if (!relatedSection) {
      return []; // No accessories found
    }

    // Extract SKUs from related products
    const accessorySkus = [];
    const relatedProducts = await relatedSection.locator('.product').all();

    for (const related of relatedProducts) {
      try {
        // Try to find SKU in various places
        const relatedSku = await related.locator('.sku').textContent().catch(() => null);
        const relatedLink = await related.locator('a').getAttribute('href').catch(() => null);

        if (relatedSku && relatedSku.trim() !== sku) {
          accessorySkus.push(relatedSku.trim());
        } else if (relatedLink) {
          // Extract SKU from URL if possible: /produkt/2126S/
          const urlMatch = relatedLink.match(/\/produkt\/(\w+)\/?$/);
          if (urlMatch && urlMatch[1] !== sku) {
            accessorySkus.push(urlMatch[1]);
          }
        }
      } catch (e) {}
    }

    return accessorySkus;
  } catch (e) {
    log(`❌ Error scraping ${productUrl}: ${e.message}`);
    return [];
  }
}

/**
 * Scrape accessories from a category page (list view)
 */
async function scrapeCategoryAccessories(page, categoryUrl, meta) {
  const accessoriesFound = [];

  try {
    await page.goto(categoryUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });

    // Get all product cards on the page
    const productCards = await page.locator('.product').all();
    log(`📄 ${meta.brand} ${meta.model} ${meta.yearRange}: ${productCards.length} products`);

    for (const card of productCards.slice(0, MAX_PRODUCTS_PER_CATEGORY)) {
      try {
        // Get product URL and SKU from card
        const productLink = await card.locator('a').first().getAttribute('href').catch(() => null);
        const sku = await card.locator('.sku').textContent().catch(() => null);

        if (!sku || !productLink) continue;
        const cleanSku = sku.trim();

        // Skip if already processed
        if (processedSkus.has(cleanSku)) continue;

        // Scrape accessories for this product
        const accessorySkus = await scrapeProductAccessories(page, productLink, cleanSku);

        if (accessorySkus.length > 0) {
          log(`✅ ${cleanSku}: ${accessorySkus.length} accessories (${accessorySkus.join(', ')})`);
          appendSql(cleanSku, accessorySkus);
          accessoriesFound.push({ sku: cleanSku, accessories: accessorySkus });
        } else {
          log(`➖ ${cleanSku}: no accessories`);
        }

        processedSkus.add(cleanSku);

      } catch (e) {
        log(`⚠️ Error processing card: ${e.message}`);
      }

      // Rate limit between product pages
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

  } catch (e) {
    log(`❌ Error loading category ${categoryUrl}: ${e.message}`);
  }

  return accessoriesFound;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Block heavy resources for speed
  await context.route('**/*', (route, request) => {
    const type = request.resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
      route.abort();
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();

  // Login
  log('🔐 Logging in...');
  await page.goto(`${BASE_URL}/min-konto/`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');

  try {
    await page.waitForSelector('a[href*="logout"]', { timeout: 10000 });
  } catch (e) {
    log('❌ Login failed');
    await browser.close();
    process.exit(1);
  }
  log('✅ Logged in');

  // Scrape categories
  let totalFound = 0;
  let totalCategories = 0;
  const startTime = Date.now();

  for (let i = 0; i < urlsToScrape.length; i++) {
    const meta = urlsToScrape[i];
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | ${meta.brand} ${meta.model} ${meta.yearRange} | Found: ${totalFound} | ${elapsed}min`);

    const found = await scrapeCategoryAccessories(page, meta.url, meta);
    totalFound += found.length;
    totalCategories++;

    // Save checkpoint periodically
    if (totalCategories % SAVE_EVERY === 0) {
      saveCheckpoint();
      log(`💾 Checkpoint saved: ${processedSkus.size} products processed`);
    }

    // Rate limit between categories
    await new Promise(r => setTimeout(r, 200));
  }

  // Final save
  saveCheckpoint();

  log(`\n🏁 Complete!`);
  log(`📦 Total products processed: ${processedSkus.size}`);
  log(`🔗 Products with accessories: ${totalFound}`);
  log(`📄 SQL written to: ${OUTPUT_SQL_FILE}`);
  log(`⏱️ Total time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

  await browser.close();
}

main().catch(e => {
  log(`💥 Fatal error: ${e.message}`);
  process.exit(1);
});
