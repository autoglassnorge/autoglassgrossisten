#!/usr/bin/env node
/**
 * Phase 2: Scrape eurocodes from product detail pages
 * Reads product-urls.ndjson, fetches each detail page, extracts eurocode
 */
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const COOKIE_FILE = '/Users/taj/bilglass/data/autoglass-scrape/cookies.json';
const CHECKPOINT_FILE = '/Users/taj/bilglass/data/autoglass-scrape/eurocode-checkpoint.json';
const INPUT_URLS = '/Users/taj/bilglass/data/autoglass-scrape/product-urls.ndjson';
const OUTPUT_FILE = '/Users/taj/bilglass/data/autoglass-scrape/eurocodes.ndjson';
const LOG_FILE = '/Users/taj/bilglass/data/autoglass-scrape/phase2.log';

const RATE_LIMIT_MS = 150;
const CONCURRENCY = 8;
const FETCH_TIMEOUT = 15000;

const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
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

async function fetchProductPage(url) {
  const res = await fetchWithTimeout(url, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow',
  }, FETCH_TIMEOUT);
  
  if (!res.ok) {
    return { ok: false, status: res.status, eurocode: null, sku: null };
  }
  
  const html = await res.text();
  const root = parse(html);
  
  // Look for eurocode in product-meta-row
  const metaRows = root.querySelectorAll('.product-meta-row');
  let eurocode = null;
  for (const row of metaRows) {
    const text = row.textContent || '';
    const match = text.match(/Eurokode[:\s]+([A-Z0-9]+)/i);
    if (match) {
      eurocode = match[1].toUpperCase();
      break;
    }
  }
  
  // Fallback: search entire page text
  if (!eurocode) {
    const bodyText = root.textContent || '';
    const match = bodyText.match(/Eurokode[:\s]+([A-Z0-9]+)/i);
    if (match) eurocode = match[1].toUpperCase();
  }
  
  // Get SKU from page
  const skuEl = root.querySelector('.sku');
  const sku = skuEl?.textContent?.trim() || null;
  
  // Get title
  const titleEl = root.querySelector('h1.product-title, h1.entry-title');
  const title = titleEl?.textContent?.trim() || null;
  
  return { ok: true, status: 200, eurocode, sku, title };
}

async function main() {
  // Read all product URLs and deduplicate
  log('📋 Phase 2: Reading product URLs...');
  const lines = readFileSync(INPUT_URLS, 'utf-8').trim().split('\n');
  
  const seenUrls = new Set();
  const products = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (!seenUrls.has(rec.productUrl)) {
        seenUrls.add(rec.productUrl);
        products.push(rec);
      }
    } catch (e) {}
  }
  
  log(`📋 ${products.length} unique product URLs to scrape`);
  
  // Load checkpoint
  let startIndex = 0;
  if (existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = cp.lastIndex || 0;
    log(`   Resuming from index ${startIndex}`);
  }
  
  log(`⚡ Concurrency: ${CONCURRENCY}, Rate limit: ${RATE_LIMIT_MS}ms`);
  
  let successCount = 0;
  let failCount = 0;
  let eurocodeCount = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, Math.min(i + CONCURRENCY, products.length));
    const pct = ((i / products.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = elapsed > 0 ? (i / elapsed).toFixed(1) : '0';
    process.stdout.write(`\r[${pct}%] ${i+1}/${products.length} | OK:${successCount} FAIL:${failCount} EURO:${eurocodeCount} | ${elapsed}min | ${rate}/min`);
    
    const results = await Promise.allSettled(
      batch.map(async (product) => {
        try {
          const result = await fetchProductPage(product.productUrl);
          return { status: 'ok', product, result };
        } catch (err) {
          return { status: 'err', product, error: err.message };
        }
      })
    );
    
    for (const r of results) {
      if (r.status !== 'fulfilled') {
        failCount++;
        continue;
      }
      const { status, product, result, error } = r.value;
      if (status === 'err') {
        failCount++;
        appendFileSync(OUTPUT_FILE + '.failed', JSON.stringify({ url: product.productUrl, error, sku: product.sku }) + '\n');
        continue;
      }
      if (result.ok) {
        successCount++;
        if (result.eurocode) {
          eurocodeCount++;
          const record = {
            url: product.productUrl,
            sku: product.sku,
            eurocode: result.eurocode,
            title: result.title || product.title,
            brand: product.brand,
            model: product.model,
            yearRange: product.yearRange,
          };
          appendFileSync(OUTPUT_FILE, JSON.stringify(record) + '\n');
        }
      } else {
        failCount++;
        appendFileSync(OUTPUT_FILE + '.failed', JSON.stringify({ url: product.productUrl, status: result.status, sku: product.sku }) + '\n');
      }
    }
    
    // Save checkpoint every 100 items
    if ((i + CONCURRENCY) % 100 === 0) {
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + CONCURRENCY, timestamp: new Date().toISOString() }, null, 2));
    }
    
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }
  
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: products.length, timestamp: new Date().toISOString() }, null, 2));
  log(`\n\n✅ Phase 2 Done!`);
  log(`   Total products: ${products.length}`);
  log(`   Success: ${successCount}`);
  log(`   Failed: ${failCount}`);
  log(`   Eurocodes found: ${eurocodeCount}`);
  log(`   Output: ${OUTPUT_FILE}`);
}

main().catch(e => { log(`ERROR: ${e.message}`); process.exit(1); });
