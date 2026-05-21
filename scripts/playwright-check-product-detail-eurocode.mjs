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

// Get first product detail URL from our data
const productListUrl = 'https://auto-glass.no/varer/nettbutikk/autoglass/vw/golf/';
await page.goto(productListUrl, { timeout: 20000 });
await page.waitForLoadState('networkidle');

const productLink = await page.locator('.product a').first().getAttribute('href');
console.log('Product URL:', productLink);

await page.goto(productLink, { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Extract ALL text content for eurocode patterns
const pageText = await page.textContent('body');
const html = await page.content();

// Look for eurocode-like patterns
const patterns = [
  /Eurokode[:\s]*([A-Z0-9\-/]+)/gi,
  /Art\.?\s*Nr\.?[:\s]*([A-Z0-9\-/]+)/gi,
  /Typekode[:\s]*([A-Z0-9\-/]+)/gi,
  /\b([A-Z]{2,3}\d{3,4}[A-Z]?)\b/g,
  /\b(\d{4,5}[A-Z]{2})\b/g,
];

console.log('\n=== Eurocode patterns found on product detail page ===');
for (const pat of patterns) {
  const matches = [...pageText.matchAll(pat)];
  const unique = [...new Set(matches.map(m => m[1]))].filter(m => m.length >= 4).slice(0, 10);
  if (unique.length > 0) {
    console.log(`\nPattern: ${pat.source}`);
    for (const u of unique) console.log(`  ${u}`);
  }
}

// Check for custom fields, meta data, attributes
console.log('\n=== Product attributes table ===');
const attrRows = await page.locator('.woocommerce-product-attributes tr, .product-attributes tr').all();
for (const row of attrRows.slice(0, 10)) {
  const text = await row.textContent();
  console.log(`  ${text?.trim()}`);
}

// Check SKU from detail page vs list page
const detailSku = await page.locator('.sku').textContent().catch(() => null);
console.log('\n=== SKU from detail page:', detailSku?.trim(), '===');

await browser.close();
