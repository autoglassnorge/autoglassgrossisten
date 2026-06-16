#!/usr/bin/env node
/**
 * ULTRA-FAST Auto-glass.no Accessory Scraper
 * ============================================
 * 8 parallel pages, 50ms rate limit, aggressive resource blocking.
 * 
 * Run: node scripts/scrape-accessories-ultra.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'accessory-checkpoint-ultra.json');
const OUTPUT_SQL_FILE = resolve(DATA_DIR, 'accessory-updates-ultra.sql');
const LOG_FILE = resolve(DATA_DIR, 'accessory-scrape-ultra.log');

const RATE_LIMIT_MS = 50;
const PARALLEL_PAGES = 8;
const SAVE_EVERY = 100;

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

async function scrapeProductAccessories(page, productUrl, sku) {
  try {
    await page.goto(productUrl, { timeout: 10000, waitUntil: 'domcontentloaded' });
    
    const relatedSelectors = ['.related.products', '.upsells.products', '.product-accessories', '[class*="related"]', '[class*="accessory"]', '[class*="tilbeh"]'];
    let relatedSection = null;
    for (const sel of relatedSelectors) {
      const el = await page.locator(sel).first();
      if (await el.count() > 0) { relatedSection = el; break; }
    }
    if (!relatedSection) return [];

    const accessorySkus = [];
    const relatedProducts = await relatedSection.locator('.product').all();
    for (const related of relatedProducts) {
      try {
        const relatedSku = await related.locator('.sku').textContent().catch(() => null);
        const relatedLink = await related.locator('a').getAttribute('href').catch(() => null);
        if (relatedSku && relatedSku.trim() !== sku) {
          accessorySkus.push(relatedSku.trim());
        } else if (relatedLink) {
          const urlMatch = relatedLink.match(/\/produkt\/(\w+)\/?$/);
          if (urlMatch && urlMatch[1] !== sku) accessorySkus.push(urlMatch[1]);
        }
      } catch (e) {}
    }
    return accessorySkus;
  } catch (e) {
    return [];
  }
}

async function scrapeCategory(page, meta) {
  const found = [];
  try {
    await page.goto(meta.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    const productCards = await page.locator('.product').all();
    if (productCards.length === 0) return 0;

    for (const card of productCards) {
      try {
        const productLink = await card.locator('a').first().getAttribute('href').catch(() => null);
        const sku = await card.locator('.sku').textContent().catch(() => null);
        if (!sku || !productLink) continue;
        const cleanSku = sku.trim();
        if (processedSkus.has(cleanSku)) continue;

        const accessorySkus = await scrapeProductAccessories(page, productLink, cleanSku);
        if (accessorySkus.length > 0) {
          log(`✅ ${cleanSku}: ${accessorySkus.length} accessories (${accessorySkus.join(', ')})`);
          appendSql(cleanSku, accessorySkus);
          found.push({ sku: cleanSku, accessories: accessorySkus });
        }
        processedSkus.add(cleanSku);
      } catch (e) {}
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
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media' || type === 'script') {
      route.abort();
    } else {
      route.continue();
    }
  });

  const pages = [];
  for (let i = 0; i < PARALLEL_PAGES; i++) pages.push(await context.newPage());

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
    log('❌ Login failed'); await browser.close(); process.exit(1);
  }
  log('✅ Logged in');

  const cookies = await context.cookies();
  for (let i = 1; i < PARALLEL_PAGES; i++) {
    await pages[i].context().addCookies(cookies);
  }

  let totalFound = 0;
  const startTime = Date.now();

  for (let i = 0; i < urlsToScrape.length; i += PARALLEL_PAGES) {
    const batch = urlsToScrape.slice(i, i + PARALLEL_PAGES);
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = i > 0 ? (elapsed / i * 60).toFixed(1) : '0';
    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | Found: ${totalFound} | ${elapsed}min | ${rate}s/cat`);

    const results = await Promise.all(batch.map((meta, idx) => scrapeCategory(pages[idx], meta)));
    totalFound += results.reduce((a, b) => a + b, 0);

    if (i % (SAVE_EVERY * PARALLEL_PAGES) === 0) {
      saveCheckpoint();
      log(`💾 Checkpoint: ${processedSkus.size} products, ${totalFound} with accessories`);
    }
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
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
