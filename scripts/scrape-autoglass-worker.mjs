#!/usr/bin/env node
/**
 * Single worker for auto-glass.no swarm scraper
 * Usage: node scrape-autoglass-worker.mjs <batch-file> <output-file>
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const RATE_LIMIT_MS = 150;

const batchFile = process.argv[2];
const outputFile = process.argv[3];
const workerId = process.argv[4] || '0';

if (!batchFile || !outputFile) {
  console.error('Usage: node scrape-autoglass-worker.mjs <batch-file> <output-file> [worker-id]');
  process.exit(1);
}

const missing = JSON.parse(readFileSync(batchFile, 'utf-8'));
console.log(`[Worker ${workerId}] 📋 URLs: ${missing.length}`);

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
  
  console.log(`[Worker ${workerId}] 🔐 Logging in...`);
  await page.goto(`${BASE_URL}/min-konto/`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');
  
  try {
    await page.waitForSelector('a[href*="logout"]', { timeout: 10000 });
  } catch (e) {
    console.log(`[Worker ${workerId}] ❌ Login failed`);
    await browser.close();
    process.exit(1);
  }
  console.log(`[Worker ${workerId}] ✅ Logged in`);
  
  let totalProducts = 0;
  let emptyUrls = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < missing.length; i++) {
    const meta = missing[i];
    const pct = ((i / missing.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`\r[Worker ${workerId}] [${pct}%] ${i+1}/${missing.length} | ${meta.brand} ${meta.model} | Products: ${totalProducts} | Empty: ${emptyUrls} | Err: ${errors} | ${elapsed}min`);
    
    try {
      let pageNum = 1;
      let hasMore = true;
      const allProducts = [];
      
      while (hasMore) {
        const url = pageNum === 1 ? meta.url : `${meta.url}${meta.url.includes('?') ? '&' : '?'}page=${pageNum}`;
        
        await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
        
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
            
            allProducts.push({ title: title?.trim() || null, sku: sku?.trim() || null, typeCode: typeCode?.trim() || null, typeCodeRel: typeCodeRel?.trim() || null, price });
          } catch (e) {}
        }
        
        hasMore = await page.locator('a.next, .next.page-numbers').count() > 0;
        pageNum++;
        if (hasMore) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
      
      if (allProducts.length > 0) {
        const record = { brand: meta.brand, model: meta.model, submodel: meta.submodel, yearRange: meta.yearRange, url: meta.url, products: allProducts, scrapedAt: new Date().toISOString() };
        appendFileSync(outputFile, JSON.stringify(record) + '\n');
        totalProducts += allProducts.length;
      } else {
        emptyUrls++;
      }
    } catch (e) {
      errors++;
    }
    
    if (i < missing.length - 1) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }
  
  console.log(`\n[Worker ${workerId}] ✅ Done! ${missing.length} URLs, ${totalProducts} products, ${emptyUrls} empty, ${errors} errors`);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
