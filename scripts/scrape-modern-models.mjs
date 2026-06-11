#!/usr/bin/env node
/**
 * Targeted scrape for modern models missing from glass_catalog
 */
import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

const TARGETS = [
  {
    brand: 'BMW',
    model: 'i4',
    url: 'https://auto-glass.no/varer/nettbutikk/autoglass/bmw/i-4/2022/',
    ktype: 144689,
  },
  {
    brand: 'VOLVO',
    model: 'XC90 II',
    url: 'https://auto-glass.no/varer/nettbutikk/autoglass/volvo/xc-90/2015-ii/',
    ktype: 136994,
  },
];

async function scrapePage(page, url, brand, model) {
  const products = [];
  let pageNum = 1;
  let hasMore = true;

  while (hasMore && pageNum <= 5) {
    const pageUrl = pageNum === 1 ? url : `${url}page/${pageNum}/`;
    try {
      await page.goto(pageUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const items = await page.$$eval('ul.products li.product', (lis) =>
        lis.map((li) => {
          const link = li.querySelector('a.woocommerce-LoopProduct-link');
          const title = li.querySelector('.woocommerce-loop-product__title');
          const price = li.querySelector('.price');
          const img = li.querySelector('img');
          return {
            title: title?.textContent?.trim() || '',
            url: link?.href || '',
            priceText: price?.textContent?.trim() || '',
            image: img?.src || '',
          };
        })
      );

      if (items.length === 0) {
        hasMore = false;
      } else {
        for (const item of items) {
          products.push({ ...item, brand, model, scrapedAt: new Date().toISOString() });
        }
        pageNum++;
      }
    } catch (e) {
      console.log(`Error on page ${pageNum}: ${e.message}`);
      hasMore = false;
    }
  }

  return products;
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

  // Login
  console.log('🔐 Logging in...');
  await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');
  console.log('✅ Logged in');

  const allProducts = [];
  for (const target of TARGETS) {
    console.log(`\n📦 Scraping ${target.brand} ${target.model}...`);
    const products = await scrapePage(page, target.url, target.brand, target.model);
    console.log(`  Found ${products.length} products`);
    for (const p of products) {
      allProducts.push({ ...p, ktype: target.ktype });
    }
  }

  await browser.close();

  // Save results
  const fs = await import('fs');
  fs.writeFileSync('/tmp/modern-models-scraped.json', JSON.stringify(allProducts, null, 2));
  console.log(`\n💾 Saved ${allProducts.length} products to /tmp/modern-models-scraped.json`);
}

main().catch(console.error);
