import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

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
console.log('Logged in');

// Test a product category URL
const testUrl = 'https://auto-glass.no/varer/nettbutikk/autoglass/alfa-romeo/145/1995-2000/';
await page.goto(testUrl, { timeout: 20000 });
await page.waitForLoadState('networkidle');

console.log('\n=== Page title:', await page.title());

// Check for products
const productCount = await page.locator('.product').count();
console.log('Products found:', productCount);

// Check various product selectors
const selectors = [
  '.product',
  '.products .product',
  '[class*="product"]',
  'ul.products li',
  '.woocommerce-loop-product__title',
  '.product-title',
  'h2.woocommerce-loop-product__title',
];
for (const sel of selectors) {
  const count = await page.locator(sel).count();
  if (count > 0) console.log(`  ${sel}: ${count}`);
}

// Get first few product titles and links
const titles = await page.locator('.woocommerce-loop-product__title').all();
console.log('\n=== First product titles ===');
for (const t of titles.slice(0, 5)) {
  const text = await t.textContent();
  console.log(`  - ${text?.trim()}`);
}

// Get eurocodes from titles
const titleTexts = await page.locator('.woocommerce-loop-product__title').allTextContents();
console.log('\n=== Extracting eurocodes from titles ===');
const eurocodePattern = /\b([A-Z]{2,3}[0-9]{3,4}[A-Z]?)\b/g;
for (const t of titleTexts.slice(0, 10)) {
  const matches = t.match(eurocodePattern);
  console.log(`  "${t.trim().slice(0,60)}" → ${matches ? matches.join(', ') : 'none'}`);
}

await browser.close();
