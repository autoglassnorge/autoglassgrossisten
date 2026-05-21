import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));

// Find brands with 0 products in our scrape
const existingData = new Set();
const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-merged.ndjson', 'utf-8').trim().split('\n');
for (const line of lines) {
  existingData.add(JSON.parse(line).brand);
}

const emptyBrands = categoryTree.filter(b => !existingData.has(b.name));
console.log(`Checking ${emptyBrands.length} "empty" brands for missed products...\n`);

for (const brand of emptyBrands.slice(0, 5)) {
  // Get first URL for this brand
  let firstUrl = null;
  for (const model of brand.models) {
    if (model.years.length > 0) { firstUrl = model.years[0].url; break; }
    for (const sub of model.submodels) {
      if (sub.years.length > 0) { firstUrl = sub.years[0].url; break; }
    }
    if (firstUrl) break;
  }
  if (!firstUrl) {
    console.log(`${brand.name}: No URLs at all`);
    continue;
  }
  
  try {
    const res = await fetch(firstUrl, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    const html = await res.text();
    const root = parse(html);
    const products = root.querySelectorAll('.product');
    const titles = products.map(p => p.querySelector('.woocommerce-loop-product__title')?.textContent?.trim()).filter(Boolean);
    console.log(`${brand.name}: ${products.length} products on ${firstUrl.split('/').slice(-3).join('/')}`);
    if (titles.length > 0) console.log(`  Sample: ${titles[0]}`);
  } catch (e) {
    console.log(`${brand.name}: ERROR - ${e.message}`);
  }
  
  await new Promise(r => setTimeout(r, 300));
}
