#!/usr/bin/env node
/**
 * Optimized auto-glass.no product catalog scraper
 * Blocks images/CSS/JS to speed up loading
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'checkpoint.json');
const OUTPUT_FILE = resolve(DATA_DIR, 'products.ndjson');

const RATE_LIMIT_MS = 300;
const SAVE_EVERY = 100;

try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

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

let startIndex = 0;
if (existsSync(CHECKPOINT_FILE)) {
  const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
  startIndex = cp.lastIndex || 0;
}

console.log(`📋 Total URLs: ${urlsToScrape.length} | Starting from: ${startIndex} | Remaining: ${urlsToScrape.length - startIndex}`);

function saveCheckpoint(index) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: index, timestamp: new Date().toISOString() }, null, 2));
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
  console.log('🔐 Logging in...');
  await page.goto(`${BASE_URL}/min-konto/`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');
  
  // Verify login by checking for logout or my account content
  try {
    await page.waitForSelector('a[href*="logout"]', { timeout: 10000 });
  } catch (e) {
    console.log('❌ Login failed');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ Logged in\n');
  
  let totalProducts = 0;
  let processed = 0;
  let emptyUrls = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < urlsToScrape.length; i++) {
    const meta = urlsToScrape[i];
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = processed > 0 ? (elapsed / processed).toFixed(2) : '0';
    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | ${meta.brand} ${meta.model} ${meta.submodel || ''} (${meta.yearRange}) | Products: ${totalProducts} | Empty: ${emptyUrls} | ${elapsed}min | ${rate}min/url`);
    
    try {
      let pageNum = 1;
      let hasMore = true;
      const allProducts = [];
      
      while (hasMore) {
        const url = pageNum === 1 ? meta.url : `${meta.url}${meta.url.includes('?') ? '&' : '?'}page=${pageNum}`;
        
        await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
        
        // Quick check if products exist
        const productCount = await page.locator('.product').count();
        if (productCount === 0) {
          hasMore = false;
          break;
        }
        
        const cards = await page.locator('.product').all();
        for (const card of cards) {
          try {
            const title = await card.locator('.woocommerce-loop-product__title').textContent().catch(() => null);
            const sku = await card.locator('.sku').textContent().catch(() => null);
            const typeCode = await card.locator('.typecode').textContent().catch(() => null);
            const typeCodeRel = await card.locator('.typecode').getAttribute('rel').catch(() => null);
            const priceText = await card.locator('.woocommerce-Price-amount').textContent().catch(() => null);
            
            let price = null;
            if (priceText) {
              const match = priceText.replace(/\s/g, '').replace(/\./g, '').match(/(\d+)/);
              if (match) price = parseInt(match[1], 10);
            }
            
            allProducts.push({
              title: title?.trim() || null,
              sku: sku?.trim() || null,
              typeCode: typeCode?.trim() || null,
              typeCodeRel: typeCodeRel?.trim() || null,
              price
            });
          } catch (e) {}
        }
        
        hasMore = await page.locator('a.next, .next.page-numbers').count() > 0;
        pageNum++;
        
        if (hasMore) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
      
      if (allProducts.length > 0) {
        const record = {
          brand: meta.brand,
          model: meta.model,
          submodel: meta.submodel,
          yearRange: meta.yearRange,
          url: meta.url,
          products: allProducts,
          scrapedAt: new Date().toISOString()
        };
        appendFileSync(OUTPUT_FILE, JSON.stringify(record) + '\n');
        totalProducts += allProducts.length;
      } else {
        emptyUrls++;
      }
      
      processed++;
      
      if ((i + 1) % SAVE_EVERY === 0) {
        saveCheckpoint(i + 1);
      }
      
    } catch (e) {
      console.error(`\n⚠️  Error: ${e.message}`);
      saveCheckpoint(i);
      try { await page.goto(`${BASE_URL}/min-konto/`, { timeout: 15000, waitUntil: 'domcontentloaded' }); } catch (e2) {}
    }
    
    if (i < urlsToScrape.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }
  
  saveCheckpoint(urlsToScrape.length);
  console.log(`\n\n✅ Done! ${processed} URLs, ${totalProducts} products, ${emptyUrls} empty`);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
