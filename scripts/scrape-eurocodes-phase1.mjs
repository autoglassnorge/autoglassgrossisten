#!/usr/bin/env node
/**
 * Phase 1: Collect all product URLs from category pages
 */
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const COOKIE_FILE = '/Users/taj/bilglass/data/autoglass-scrape/cookies.json';
const CHECKPOINT_FILE = '/Users/taj/bilglass/data/autoglass-scrape/eurocode-checkpoint.json';
const OUTPUT_URLS = '/Users/taj/bilglass/data/autoglass-scrape/product-urls.ndjson';

const RATE_LIMIT_MS = 100;
const CONCURRENCY = 10;
const FETCH_TIMEOUT = 15000;

const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

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

async function fetchCategoryPage(url) {
  const res = await fetchWithTimeout(url, {
    headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  }, FETCH_TIMEOUT);
  
  if (!res.ok) return { products: [], hasNext: false };
  
  const html = await res.text();
  const root = parse(html);
  
  const products = [];
  const cards = root.querySelectorAll('.product');
  
  for (const card of cards) {
    const linkEl = card.querySelector('a');
    const skuEl = card.querySelector('.sku');
    const titleEl = card.querySelector('.woocommerce-loop-product__title');
    
    const url = linkEl?.getAttribute('href');
    const sku = skuEl?.textContent?.trim();
    const title = titleEl?.textContent?.trim();
    
    if (url && sku) {
      products.push({ url, sku, title });
    }
  }
  
  const hasNext = root.querySelector('a.next, .next.page-numbers') !== null;
  return { products, hasNext };
}

async function main() {
  const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));
  
  // Build all category URLs
  const catUrls = [];
  for (const brand of categoryTree) {
    for (const model of brand.models) {
      for (const year of model.years) {
        catUrls.push({ brand: brand.name, model: model.name, submodel: null, yearRange: year.yearRange, url: year.url });
      }
      for (const sub of model.submodels) {
        for (const year of sub.years) {
          catUrls.push({ brand: brand.name, model: model.name, submodel: sub.name, yearRange: year.yearRange, url: year.url });
        }
      }
    }
  }
  
  // Also add brand-level URLs for the ones with 404 model pages
  // We'll handle this separately
  
  let startIndex = 0;
  if (existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = cp.lastIndex || 0;
  }
  
  console.log(`📋 Phase 1: ${catUrls.length} category URLs to scan`);
  console.log(`   Starting from: ${startIndex}`);
  console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);
  
  let totalProducts = 0;
  const startTime = Date.now();
  
  for (let i = startIndex; i < catUrls.length; i += CONCURRENCY) {
    const batch = catUrls.slice(i, Math.min(i + CONCURRENCY, catUrls.length));
    const pct = ((i / catUrls.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`\r[${pct}%] ${i+1}/${catUrls.length} | URLs: ${totalProducts} | ${elapsed}min`);
    
    const results = await Promise.allSettled(
      batch.map(async (meta) => {
        let pageNum = 1;
        let hasMore = true;
        const allProducts = [];
        
        while (hasMore) {
          const url = pageNum === 1 ? meta.url : `${meta.url}${meta.url.includes('?') ? '&' : '?'}page=${pageNum}`;
          const result = await fetchCategoryPage(url);
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
        for (const p of allProducts) {
          const record = {
            brand: meta.brand,
            model: meta.model,
            submodel: meta.submodel,
            yearRange: meta.yearRange,
            productUrl: p.url,
            sku: p.sku,
            title: p.title,
          };
          appendFileSync(OUTPUT_URLS, JSON.stringify(record) + '\n');
          totalProducts++;
        }
      }
    }
    
    if ((i + CONCURRENCY) % 500 === 0) {
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: i + CONCURRENCY, timestamp: new Date().toISOString() }, null, 2));
    }
    
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }
  
  writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex: catUrls.length, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\n\n✅ Phase 1 Done! ${totalProducts} product URLs collected`);
}

main().catch(e => { console.error(e); process.exit(1); });
