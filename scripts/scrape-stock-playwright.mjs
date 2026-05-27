#!/usr/bin/env node
/**
 * Scrape stock status from auto-glass.no using Playwright
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'stock-pw-checkpoint.json');
const OUTPUT_FILE = resolve(DATA_DIR, 'stock-status-pw.json');

async function main() {
  console.log('🔐 Logging in with Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(`${BASE_URL}/min-konto/`, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');
  
  try {
    await page.waitForSelector('a[href*="logout"]', { timeout: 10000 });
    console.log('✅ Logged in\n');
  } catch (e) {
    console.log('❌ Login failed');
    await browser.close();
    process.exit(1);
  }
  
  // Read category URLs from existing scrape
  const ndjsonFile = resolve(DATA_DIR, 'products.ndjson');
  const lines = readFileSync(ndjsonFile, 'utf-8').split('\n').filter(Boolean);
  
  const urlMap = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
    urlMap.set(entry.url, true);
  }
  const urls = [...urlMap.keys()];
  
  // Load checkpoint
  let startIndex = 0;
  if (existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = cp.lastIndex || 0;
  }
  
  // Load existing stock data
  const stockMap = new Map();
  if (existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
    for (const item of existing) stockMap.set(item.sku, item.status);
  }
  
  console.log(`URLs: ${urls.length} | Have: ${stockMap.size} | Start: ${startIndex}\n`);
  
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < urls.length; i++) {
    const url = urls[i];
    const pct = ((i / urls.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r[${pct}%] ${i+1}/${urls.length} | Products: ${stockMap.size} | Errors: ${errors} | ${elapsed}s`);
    
    try {
      await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      
      // Extract stock status from product cards
      const products = await page.evaluate(() => {
        const cards = document.querySelectorAll('.product');
        const result = [];
        for (const card of cards) {
          const skuEl = card.querySelector('.sku');
          if (!skuEl) continue;
          const sku = skuEl.textContent.trim();
          const classes = card.className;
          let status = 0;
          if (classes.includes('instock')) status = 1;
          else if (classes.includes('outofstock')) status = -1;
          result.push({ sku, status });
        }
        return result;
      });
      
      for (const p of products) {
        if (!stockMap.has(p.sku)) stockMap.set(p.sku, p.status);
      }
      processed++;
    } catch (e) {
      errors++;
    }
    
    // Save every 50 URLs
    if ((i + 1) % 50 === 0 || i + 1 >= urls.length) {
      const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
      writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray, null, 2));
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + 1 }));
    }
  }
  
  await browser.close();
  
  const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
  writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray, null, 2));
  
  const instock = stockArray.filter(x => x.status === 1).length;
  const backorder = stockArray.filter(x => x.status === 0).length;
  const outofstock = stockArray.filter(x => x.status === -1).length;
  console.log(`\n\n✅ Done!`);
  console.log(`Total: ${stockArray.length} | In stock: ${instock} | Backorder: ${backorder} | Out: ${outofstock}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
