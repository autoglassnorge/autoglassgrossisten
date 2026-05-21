import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

// Check Tesla category page
const teslaUrls = [
  'https://auto-glass.no/varer/nettbutikk/autoglass/tesla/',
  'https://auto-glass.no/produktkategori/tesla/',
];

for (const url of teslaUrls) {
  console.log(`\n=== ${url} ===`);
  try {
    const res = await fetch(url, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    const root = parse(html);
    const products = root.querySelectorAll('.product');
    console.log(`Products: ${products.length}`);
    for (const p of products.slice(0, 3)) {
      const title = p.querySelector('.woocommerce-loop-product__title')?.textContent?.trim();
      const link = p.querySelector('a')?.getAttribute('href');
      console.log(`  - ${title}`);
      console.log(`    ${link}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 500));
}

// Also check what the correct Tesla model URL looks like
console.log('\n=== Checking Tesla model links from category tree ===');
const tree = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', 'utf-8'));
const tesla = tree.find(b => b.name === 'TESLA');
if (tesla) {
  for (const model of tesla.models) {
    for (const year of model.years) {
      console.log(`URL: ${year.url}`);
    }
    for (const sub of model.submodels) {
      for (const year of sub.years) {
        console.log(`URL: ${year.url}`);
      }
    }
  }
}
