import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

// Pick a random sample of 20 products from our data
const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson', 'utf-8').trim().split('\n');
const allProducts = lines.map(l => JSON.parse(l));

// Pick diverse sample: different brands, different SKU formats
const sample = [];
const brands = new Set();
for (const p of allProducts) {
  if (!brands.has(p.brand) && sample.length < 20) {
    sample.push(p);
    brands.add(p.brand);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Login
await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000 });
await page.waitForLoadState('networkidle');
try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår")').first();
  if (await cookieBtn.count() > 0) await cookieBtn.click();
} catch (e) {}
await page.fill('#username', EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[name="login"]');
await page.waitForLoadState('networkidle');

console.log('Verifying SKU vs Eurocode for 20 sample products...\n');
console.log('SKU from list'.padEnd(15), '|', 'Eurocode from detail'.padEnd(20), '|', 'Match?'.padEnd(8), '|', 'Brand Model');
console.log('-'.repeat(90));

let matchCount = 0;
let totalChecked = 0;

for (const p of sample) {
  // Construct product URL from source URL and SKU/title
  // We need to find the actual product URL - let's search by SKU
  try {
    // Try to find product by searching the category page
    const catUrl = p.sourceUrl;
    await page.goto(catUrl, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    
    // Find product card with matching SKU
    const cards = await page.locator('.product').all();
    let productUrl = null;
    
    for (const card of cards) {
      const cardSku = await card.locator('.sku').textContent().catch(() => '');
      if (cardSku.trim() === p.sku) {
        productUrl = await card.locator('a').first().getAttribute('href');
        break;
      }
    }
    
    if (!productUrl) {
      console.log(p.sku.padEnd(15), '|', 'PRODUCT NOT FOUND'.padEnd(20), '|', 'N/A'.padEnd(8), '|', p.brand, p.model);
      continue;
    }
    
    // Go to product detail page
    await page.goto(productUrl, { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    
    // Extract eurocode from product-meta-row
    const metaRows = await page.locator('.product-meta-row').allTextContents();
    let eurocode = null;
    for (const row of metaRows) {
      const match = row.match(/Eurokode[:\s]+([A-Z0-9]+)/i);
      if (match) {
        eurocode = match[1].trim().toUpperCase();
        break;
      }
    }
    
    // Also get SKU from detail page
    const detailSku = await page.locator('.sku').textContent().catch(() => '');
    
    const skuMatches = p.sku === (detailSku?.trim()?.toUpperCase());
    const euroMatches = p.sku === eurocode;
    
    if (euroMatches) matchCount++;
    totalChecked++;
    
    const status = euroMatches ? '✅ SKU=EURO' : (eurocode ? '❌ DIFFERENT' : '❌ NO EURO');
    console.log(
      p.sku.padEnd(15), '|',
      (eurocode || 'N/A').padEnd(20), '|',
      status.padEnd(12), '|',
      p.brand, p.model
    );
    
  } catch (e) {
    console.log(p.sku.padEnd(15), '|', 'ERROR'.padEnd(20), '|', 'N/A'.padEnd(8), '|', p.brand, p.model);
  }
  
  await new Promise(r => setTimeout(r, 300));
}

console.log('\n' + '='.repeat(90));
console.log(`Result: ${matchCount}/${totalChecked} products have SKU = Eurocode (${totalChecked > 0 ? (matchCount/totalChecked*100).toFixed(1) : 0}%)`);

await browser.close();
