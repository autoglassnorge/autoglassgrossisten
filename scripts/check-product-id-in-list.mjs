import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const cookies = JSON.parse(readFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', 'utf-8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

// Check if product cards have data-product-id
const testUrl = 'https://auto-glass.no/varer/nettbutikk/autoglass/alfa-romeo/145/1995-2000/';
const res = await fetch(testUrl, {
  headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
});
const html = await res.text();
const root = parse(html);

const cards = root.querySelectorAll('.product');
console.log(`Found ${cards.length} product cards`);

for (const card of cards.slice(0, 3)) {
  const id = card.getAttribute('data-product-id') || card.getAttribute('id');
  const classes = card.getAttribute('class');
  const link = card.querySelector('a')?.getAttribute('href');
  const sku = card.querySelector('.sku')?.textContent?.trim();
  console.log(`\nCard:`);
  console.log(`  ID/attr: ${id || 'none'}`);
  console.log(`  Classes: ${classes?.slice(0, 80)}`);
  console.log(`  Link: ${link?.slice(0, 60)}`);
  console.log(`  SKU: ${sku}`);
  
  // Check for any data-* attributes
  const attrs = Object.entries(card.attributes);
  for (const [k, v] of attrs) {
    if (k.startsWith('data-')) console.log(`  ${k}=${v}`);
  }
}

// Also check if there's a WooCommerce AJAX endpoint
console.log('\n=== Checking for WooCommerce AJAX ===');
const ajaxMatch = html.match(/wc_ajax_url["']?\s*[:=]\s*["']([^"']+)/);
if (ajaxMatch) console.log('Found wc_ajax_url:', ajaxMatch[1]);

const ajaxUrlMatch = html.match(/ajax_url["']?\s*[:=]\s*["']([^"']+)/);
if (ajaxUrlMatch) console.log('Found ajax_url:', ajaxUrlMatch[1]);
