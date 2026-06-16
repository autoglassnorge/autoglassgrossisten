#!/usr/bin/env node
/**
 * HYBRID Auto-glass.no Accessory Scraper
 * =======================================
 * Playwright for login, then fetch() with cookies for product pages.
 * 10-20x faster than page.goto() per product.
 *
 * Run: node scripts/scrape-accessories-hybrid.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'accessory-checkpoint-hybrid.json');
const OUTPUT_SQL_FILE = resolve(DATA_DIR, 'accessory-updates-hybrid.sql');
const LOG_FILE = resolve(DATA_DIR, 'accessory-scrape-hybrid.log');

const RATE_LIMIT_MS = 100; // Between fetch batches
const PARALLEL_FETCH = 10; // 10 parallel fetches
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

// Parse accessories from HTML string
function parseAccessoriesFromHtml(html, sku) {
  const accessorySkus = [];
  // Look for related products section
  const relatedMatch = html.match(/<section[^>]*class="[^"]*related[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  if (!relatedMatch) return accessorySkus;

  const relatedHtml = relatedMatch[1];
  // Extract product SKUs from related section
  const skuMatches = relatedHtml.matchAll(/class="[^"]*sku[^"]*"[^>]*>([^<]+)</gi);
  for (const match of skuMatches) {
    const relatedSku = match[1].trim();
    if (relatedSku && relatedSku !== sku) {
      accessorySkus.push(relatedSku);
    }
  }

  // Also try data-sku attributes
  const dataSkuMatches = relatedHtml.matchAll(/data-sku="([^"]+)"/g);
  for (const match of dataSkuMatches) {
    const relatedSku = match[1].trim();
    if (relatedSku && relatedSku !== sku && !accessorySkus.includes(relatedSku)) {
      accessorySkus.push(relatedSku);
    }
  }

  return accessorySkus;
}

async function fetchWithCookies(url, cookieString) {
  const res = await fetch(url, {
    headers: {
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!res.ok) return null;
  return res.text();
}

async function scrapeCategoryWithFetch(page, meta, cookieString) {
  const found = [];
  try {
    await page.goto(meta.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    const productCards = await page.locator('.product').all();
    if (productCards.length === 0) return 0;

    // Build list of products to check
    const productsToCheck = [];
    for (const card of productCards) {
      try {
        const productLink = await card.locator('a').first().getAttribute('href').catch(() => null);
        const sku = await card.locator('.sku').textContent().catch(() => null);
        if (!sku || !productLink) continue;
        const cleanSku = sku.trim();
        if (processedSkus.has(cleanSku)) continue;
        productsToCheck.push({ sku: cleanSku, url: productLink });
      } catch (e) {}
    }

    // Fetch product pages in parallel batches
    for (let i = 0; i < productsToCheck.length; i += PARALLEL_FETCH) {
      const batch = productsToCheck.slice(i, i + PARALLEL_FETCH);
      const htmls = await Promise.all(
        batch.map(p => fetchWithCookies(p.url, cookieString))
      );

      for (let j = 0; j < batch.length; j++) {
        const product = batch[j];
        const html = htmls[j];
        if (!html) {
          processedSkus.add(product.sku);
          continue;
        }

        const accessorySkus = parseAccessoriesFromHtml(html, product.sku);
        if (accessorySkus.length > 0) {
          log(`✅ ${product.sku}: ${accessorySkus.length} accessories (${accessorySkus.join(', ')})`);
          appendSql(product.sku, accessorySkus);
          found.push({ sku: product.sku, accessories: accessorySkus });
        }
        processedSkus.add(product.sku);
      }

      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  } catch (e) {
    log(`❌ ${meta.brand} ${meta.model} ${meta.yearRange}: ${e.message}`);
  }
  return found.length;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.route('**/*', (route, request) => {
    const type = request.resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
      route.abort();
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();

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
    log('❌ Login failed'); await browser.close(); process.exit(1);
  }
  log('✅ Logged in');

  // Extract cookies for fetch
  const cookies = await context.cookies();
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  log(`🍪 Cookies extracted: ${cookies.length} cookies`);

  let totalFound = 0;
  const startTime = Date.now();

  for (let i = 0; i < urlsToScrape.length; i++) {
    const meta = urlsToScrape[i];
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = i > 0 ? (elapsed / i * 60).toFixed(0) : '0';
    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | Found: ${totalFound} | ${elapsed}min | ${rate}s/cat`);

    const found = await scrapeCategoryWithFetch(page, meta, cookieString);
    totalFound += found;

    if (i % SAVE_EVERY === 0) {
      saveCheckpoint();
      log(`💾 Checkpoint: ${processedSkus.size} products, ${totalFound} with accessories`);
    }
  }

  saveCheckpoint();
  log(`\n🏁 Complete!`);
  log(`📦 Products: ${processedSkus.size}`);
  log(`🔗 With accessories: ${totalFound}`);
  log(`⏱️ Total: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  await browser.close();
}

main().catch(e => {
  log(`💥 Fatal: ${e.message}`);
  process.exit(1);
});
