import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const categoryTree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));

const existingData = new Set();
const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-merged.ndjson', 'utf-8').trim().split('\n');
for (const line of lines) {
  existingData.add(JSON.parse(line).brand);
}

const emptyBrands = categoryTree.filter(b => !existingData.has(b.name));
console.log(`Checking ${emptyBrands.length} "empty" brands...\n`);

let foundProducts = 0;
for (const brand of emptyBrands) {
  let firstUrl = null;
  for (const model of brand.models) {
    if (model.years.length > 0) { firstUrl = model.years[0].url; break; }
    for (const sub of model.submodels) {
      if (sub.years.length > 0) { firstUrl = sub.years[0].url; break; }
    }
    if (firstUrl) break;
  }
  if (!firstUrl) {
    console.log(`${brand.name}: No URLs in category tree`);
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
    console.log(`${brand.name}: ${products.length} products`);
    foundProducts += products.length;
  } catch (e) {
    console.log(`${brand.name}: ERROR`);
  }
  
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\nTotal products found in "empty" brands: ${foundProducts}`);
