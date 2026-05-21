#!/usr/bin/env node
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve('/Users/taj/bilglass/data/autoglass-scrape');
const OUTPUT_FILE = resolve(DATA_DIR, 'products-final.ndjson');
const COOKIE_FILE = resolve(DATA_DIR, 'cookies.json');

const RATE_LIMIT_MS = 150;
const CONCURRENCY = 5;
const FETCH_TIMEOUT = 15000;

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

async function fetchCategoryPage(url, cookieHeader) {
  const res = await fetchWithTimeout(url, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  }, FETCH_TIMEOUT);
  
  if (!res.ok) {
    if (res.status === 404) return { products: [], hasNext: false, status: 404 };
    throw new Error(`HTTP ${res.status}`);
  }
  
  const html = await res.text();
  const root = parse(html);
  
  const products = [];
  const cards = root.querySelectorAll('.product');
  
  for (const card of cards) {
    const titleEl = card.querySelector('.woocommerce-loop-product__title');
    const skuEl = card.querySelector('.sku');
    const typeCodeEl = card.querySelector('.typecode');
    const priceEl = card.querySelector('.woocommerce-Price-amount');
    
    const title = titleEl?.textContent?.trim() || null;
    const sku = skuEl?.textContent?.trim() || null;
    const typeCode = typeCodeEl?.textContent?.trim() || null;
    const typeCodeRel = typeCodeEl?.getAttribute('rel')?.trim() || null;
    
    let price = null;
    if (priceEl) {
      const priceText = priceEl.textContent.replace(/\s/g, '').replace(/\./g, '');
      const match = priceText.match(/(\d+)/);
      if (match) price = parseInt(match[1], 10);
    }
    
    if (title || sku) {
      products.push({ title, sku, typeCode, typeCodeRel, price });
    }
  }
  
  const hasNext = root.querySelector('a.next, .next.page-numbers') !== null;
  return { products, hasNext, status: res.status };
}

async function main() {
  const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  
  const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));
  
  // Build all URLs
  const allUrls = [];
  for (const brand of categoryTree) {
    for (const model of brand.models) {
      for (const year of model.years) {
        allUrls.push({ brand: brand.name, model: model.name, submodel: null, yearRange: year.yearRange, url: year.url });
      }
      for (const sub of model.submodels) {
        for (const year of sub.years) {
          allUrls.push({ brand: brand.name, model: model.name, submodel: sub.name, yearRange: year.yearRange, url: year.url });
        }
      }
    }
  }
  
  // Load already scraped URLs
  const existingUrls = new Set();
  if (existsSync('/Users/taj/bilglass/data/autoglass-scrape/products-merged.ndjson')) {
    const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-merged.ndjson', 'utf-8').trim().split('\n');
    for (const line of lines) existingUrls.add(JSON.parse(line).url);
  }
  
  const urlsToScrape = allUrls.filter(u => !existingUrls.has(u.url));
  
  console.log(`📋 Final pass: ${urlsToScrape.length} missing URLs to scrape`);
  console.log(`⚡ Using fetch() with ${CONCURRENCY} concurrent requests\n`);
  
  let totalProducts = 0;
  let processed = 0;
  let emptyUrls = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < urlsToScrape.length; i += CONCURRENCY) {
    const batch = urlsToScrape.slice(i, Math.min(i + CONCURRENCY, urlsToScrape.length));
    const pct = ((i / urlsToScrape.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`\r[${pct}%] ${i+1}/${urlsToScrape.length} | Products: ${totalProducts} | Empty: ${emptyUrls} | Errors: ${errors} | ${elapsed}min`);
    
    const results = await Promise.allSettled(
      batch.map(async (meta) => {
        let pageNum = 1;
        let hasMore = true;
        const allProducts = [];
        
        while (hasMore) {
          const url = pageNum === 1 ? meta.url : `${meta.url}${meta.url.includes('?') ? '&' : '?'}page=${pageNum}`;
          const result = await fetchCategoryPage(url, cookieHeader);
          
          if (result.status === 404) {
            hasMore = false;
            break;
          }
          
          allProducts.push(...result.products);
          hasMore = result.hasNext;
          pageNum++;
          
          if (hasMore) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
        }
        
        return { meta, allProducts };
      })
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { meta, allProducts } = result.value;
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
      } else {
        errors++;
      }
    }
    
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }
  
  console.log(`\n\n✅ Done! ${processed} URLs, ${totalProducts} products, ${emptyUrls} empty, ${errors} errors`);
}

main().catch(e => { console.error(e); process.exit(1); });
