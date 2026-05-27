#!/usr/bin/env node
/**
 * Scrape stock status from auto-glass.no category pages
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = 'https://auto-glass.no';
const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const COOKIE_FILE = resolve(DATA_DIR, 'cookies.json');
const CHECKPOINT_FILE = resolve(DATA_DIR, 'stock-checkpoint.json');
const OUTPUT_FILE = resolve(DATA_DIR, 'stock-status.json');

const RATE_LIMIT_MS = 100;
const CONCURRENCY = 8;
const FETCH_TIMEOUT = 15000;

function buildCookieHeader() {
  const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchStockForCategory(url, cookieHeader) {
  const res = await fetchWithTimeout(url, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en-US;q=0.7,en;q=0.6',
    },
    redirect: 'follow',
  }, FETCH_TIMEOUT);
  
  if (!res.ok) {
    if (res.status === 404) return { products: [], status: 404 };
    throw new Error(`HTTP ${res.status}`);
  }
  
  const html = await res.text();
  
  // Quick regex extraction of product cards - faster than HTML parsing
  const products = [];
  // Match: <span class="sku" itemprop="sku">SKU</span> ... class="... instock|onbackorder|outofstock ..."
  const cardRegex = /<li[^>]*class="[^"]*product[^"]*(?:instock|onbackorder|outofstock)[^"]*"[^>]*>/gi;
  const skuRegex = /<span class="sku" itemprop="sku">([^<]+)<\/span>/;
  
  // Split by product list items
  const items = html.split('<li class="post-');
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const skuMatch = item.match(skuRegex);
    if (!skuMatch) continue;
    
    const sku = skuMatch[1].trim();
    let status = 0; // default = backorder
    if (item.includes('instock')) status = 1;
    else if (item.includes('onbackorder')) status = 0;
    else if (item.includes('outofstock')) status = -1;
    
    products.push({ sku, status });
  }
  
  return { products, status: res.status };
}

async function main() {
  console.log('📦 Scraping stock status from auto-glass.no...\n');
  
  const cookieHeader = buildCookieHeader();
  
  // Read all unique category URLs from existing scrape
  const ndjsonFile = resolve(DATA_DIR, 'products.ndjson');
  const lines = readFileSync(ndjsonFile, 'utf-8').split('\n').filter(Boolean);
  
  const urlMap = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
    urlMap.set(entry.url, { brand: entry.brand, model: entry.model, yearRange: entry.yearRange });
  }
  
  const urls = [...urlMap.entries()];
  console.log(`Total unique category URLs: ${urls.length}`);
  
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
    for (const item of existing) {
      stockMap.set(item.sku, item.status);
    }
  }
  
  console.log(`Already have stock data for: ${stockMap.size} products`);
  console.log(`Starting from URL index: ${startIndex}\n`);
  
  let totalProducts = stockMap.size;
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, Math.min(i + CONCURRENCY, urls.length));
    const pct = ((i / urls.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`\r[${pct}%] ${i+1}/${urls.length} | Products: ${totalProducts} | Errors: ${errors} | ${elapsed}min`);
    
    const results = await Promise.allSettled(
      batch.map(async ([url, meta]) => {
        const result = await fetchStockForCategory(url, cookieHeader);
        return { url, meta, result };
      })
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { result: data } = result.value;
        for (const p of data.products) {
          if (!stockMap.has(p.sku)) {
            stockMap.set(p.sku, p.status);
            totalProducts++;
          }
        }
        processed++;
      } else {
        errors++;
      }
    }
    
    // Save progress every 100 URLs
    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= urls.length) {
      const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
      writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray, null, 2));
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + CONCURRENCY, totalProducts, errors }));
    }
    
    if (i + CONCURRENCY < urls.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }
  
  console.log(`\n\n✅ Done!`);
  console.log(`Total products with stock status: ${stockMap.size}`);
  
  const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
  writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray, null, 2));
  
  // Summary
  const instock = stockArray.filter(x => x.status === 1).length;
  const backorder = stockArray.filter(x => x.status === 0).length;
  const outofstock = stockArray.filter(x => x.status === -1).length;
  console.log(`  In stock: ${instock}`);
  console.log(`  Backorder: ${backorder}`);
  console.log(`  Out of stock: ${outofstock}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
