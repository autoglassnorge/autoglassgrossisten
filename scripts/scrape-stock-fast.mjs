#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const COOKIE_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/cookies.json');
const OUTPUT_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/stock-status.json');
const CHECKPOINT_FILE = resolve('/Users/taj/bilglass/data/autoglass-scrape/stock-checkpoint.json');

const CONCURRENCY = 20;
const FETCH_TIMEOUT = 8000;

function buildCookieHeader() {
  const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function fetchStock(url, cookieHeader) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const html = await res.text();
    const items = html.split('<li class="post-');
    const products = [];
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      const skuMatch = item.match(/<span class="sku" itemprop="sku">([^<]+)<\/span>/);
      if (!skuMatch) continue;
      const sku = skuMatch[1].trim();
      let status = 0;
      if (item.includes('instock')) status = 1;
      else if (item.includes('outofstock')) status = -1;
      products.push({ sku, status });
    }
    return products;
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

async function main() {
  const cookieHeader = buildCookieHeader();
  const ndjsonFile = resolve('/Users/taj/bilglass/data/autoglass-scrape/products.ndjson');
  const lines = readFileSync(ndjsonFile, 'utf-8').split('\n').filter(Boolean);
  
  const urlMap = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
    urlMap.set(entry.url, true);
  }
  const urls = [...urlMap.keys()];
  
  let startIndex = 0;
  if (existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = cp.lastIndex || 0;
  }
  
  const stockMap = new Map();
  if (existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
    for (const item of existing) stockMap.set(item.sku, item.status);
  }
  
  console.log(`URLs: ${urls.length} | Have: ${stockMap.size} | Start: ${startIndex}`);
  
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, Math.min(i + CONCURRENCY, urls.length));
    const pct = ((i / urls.length) * 100).toFixed(0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    if (i % 100 === 0) {
      console.log(`[${pct}%] ${i}/${urls.length} | Products: ${stockMap.size} | Errors: ${errors} | ${elapsed}s`);
    }
    
    const results = await Promise.allSettled(
      batch.map(url => fetchStock(url, cookieHeader))
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        for (const p of result.value) {
          if (!stockMap.has(p.sku)) stockMap.set(p.sku, p.status);
        }
        processed++;
      } else {
        errors++;
      }
    }
    
    if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= urls.length) {
      const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
      writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray));
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + CONCURRENCY }));
    }
  }
  
  const stockArray = [...stockMap.entries()].map(([sku, status]) => ({ sku, status }));
  writeFileSync(OUTPUT_FILE, JSON.stringify(stockArray, null, 2));
  
  const instock = stockArray.filter(x => x.status === 1).length;
  const backorder = stockArray.filter(x => x.status === 0).length;
  const outofstock = stockArray.filter(x => x.status === -1).length;
  console.log(`\nDone! Total: ${stockArray.length} | In stock: ${instock} | Backorder: ${backorder} | Out: ${outofstock}`);
}

main().catch(e => console.error('Error:', e));
