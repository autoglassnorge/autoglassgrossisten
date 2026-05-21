import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const endpoints = [
  'https://auto-glass.no/wp-json/wp/v2/posts/187261',
  'https://auto-glass.no/wp-json/wc/v3/products/187261',
  'https://auto-glass.no/wp-json/wc/v3/products?include=187261,31235,31236',
];

for (const url of endpoints) {
  console.log(`\n=== ${url} ===`);
  try {
    const res = await fetch(url, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
    });
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log('Response type:', typeof data, Array.isArray(data) ? '(array)' : '');
      
      // Look for eurocode, sku, meta fields
      const searchObj = Array.isArray(data) ? data[0] : data;
      console.log('\nKeys:', Object.keys(searchObj).slice(0, 20));
      
      if (searchObj.meta) console.log('Meta:', JSON.stringify(searchObj.meta).slice(0, 500));
      if (searchObj.sku) console.log('SKU:', searchObj.sku);
      if (searchObj.eurocode) console.log('Eurocode:', searchObj.eurocode);
      if (searchObj.attributes) console.log('Attributes:', JSON.stringify(searchObj.attributes).slice(0, 500));
    } else {
      const text = await res.text();
      console.log('Error:', text.slice(0, 200));
    }
  } catch (e) {
    console.log('Fetch error:', e.message);
  }
}
