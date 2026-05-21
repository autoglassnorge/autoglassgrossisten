import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

// Test a known URL that SHOULD have products
const testUrls = [
  'https://auto-glass.no/varer/nettbutikk/autoglass/tesla/3/2017-2023-3/',
  'https://auto-glass.no/varer/nettbutikk/autoglass/alfa-romeo/145/1995-2000/',
  'https://auto-glass.no/varer/nettbutikk/autoglass/vw/golf/',
];

for (const url of testUrls) {
  console.log(`\n=== Testing: ${url} ===`);
  try {
    const res = await fetch(url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });
    console.log(`Status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    
    const root = parse(html);
    const products = root.querySelectorAll('.product');
    console.log(`Products found: ${products.length}`);
    
    if (products.length > 0) {
      const firstTitle = products[0].querySelector('.woocommerce-loop-product__title')?.textContent?.trim();
      const firstSku = products[0].querySelector('.sku')?.textContent?.trim();
      console.log(`First: ${firstTitle} / SKU: ${firstSku}`);
    } else {
      // Check for common error patterns
      const title = root.querySelector('title')?.textContent;
      console.log(`Page title: ${title}`);
      const bodyText = root.querySelector('body')?.textContent?.slice(0, 200);
      console.log(`Body start: ${bodyText}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 500));
}
