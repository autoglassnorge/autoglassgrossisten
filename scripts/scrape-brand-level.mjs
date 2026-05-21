#!/usr/bin/env node
import { parse } from 'node-html-parser';
import { readFileSync, appendFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));

// Find brands with 0 products in our data
const existingData = {};
const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-merged.ndjson', 'utf-8').trim().split('\n');
for (const line of lines) {
  const d = JSON.parse(line);
  existingData[d.brand] = (existingData[d.brand] || 0) + d.products.length;
}

const emptyBrands = categoryTree.filter(b => !existingData[b.name] || existingData[b.name] === 0);
console.log(`Checking ${emptyBrands.length} brands with 0 products...\n`);

let totalFound = 0;
for (const brand of emptyBrands) {
  const slug = brand.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const url = `https://auto-glass.no/varer/nettbutikk/autoglass/${slug}/`;
  
  try {
    const res = await fetch(url, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    
    if (!res.ok) {
      console.log(`${brand.name}: HTTP ${res.status}`);
      continue;
    }
    
    const html = await res.text();
    const root = parse(html);
    const products = root.querySelectorAll('.product');
    
    if (products.length > 0) {
      console.log(`${brand.name}: ${products.length} products at brand level`);
      totalFound += products.length;
      
      // Parse products
      const productList = [];
      for (const card of products) {
        const title = card.querySelector('.woocommerce-loop-product__title')?.textContent?.trim() || null;
        const sku = card.querySelector('.sku')?.textContent?.trim() || null;
        const typeCode = card.querySelector('.typecode')?.textContent?.trim() || null;
        const typeCodeRel = card.querySelector('.typecode')?.getAttribute('rel')?.trim() || null;
        
        let price = null;
        const priceEl = card.querySelector('.woocommerce-Price-amount');
        if (priceEl) {
          const priceText = priceEl.textContent.replace(/\s/g, '').replace(/\./g, '');
          const match = priceText.match(/(\d+)/);
          if (match) price = parseInt(match[1], 10);
        }
        
        if (title || sku) productList.push({ title, sku, typeCode, typeCodeRel, price });
      }
      
      // Save
      const record = {
        brand: brand.name,
        model: null,
        submodel: null,
        yearRange: null,
        url: url,
        products: productList,
        scrapedAt: new Date().toISOString(),
        note: 'scraped from brand-level page due to missing model-level pages'
      };
      appendFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-brand-level.ndjson', JSON.stringify(record) + '\n');
    } else {
      console.log(`${brand.name}: 0 products`);
    }
  } catch (e) {
    console.log(`${brand.name}: ERROR - ${e.message}`);
  }
  
  await new Promise(r => setTimeout(r, 300));
}

console.log(`\nTotal products found at brand level: ${totalFound}`);
