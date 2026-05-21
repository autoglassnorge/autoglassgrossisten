import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const PRODUCT_URL = 'https://auto-glass.no/produkt/ac-cobra-sportsbil-62-frontrute-nb-store-utgaven-glass/';

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

// Go to specific product
await page.goto(PRODUCT_URL, { timeout: 20000 });
await page.waitForLoadState('networkidle');

console.log('Title:', await page.title());
console.log('URL:', page.url());

// Get ALL text content
const fullText = await page.textContent('body');
const html = await page.content();

// Search for eurocode patterns
console.log('\n=== Searching for eurocode patterns ===');

// Pattern 1: Eurokode: XXX
const eurokodeMatches = [...fullText.matchAll(/Eurokode[:\s]+([A-Z0-9\-/]+)/gi)];
console.log(`\n1. "Eurokode:" pattern: ${eurokodeMatches.length} matches`);
for (const m of eurokodeMatches.slice(0, 5)) {
  console.log(`   ${m[1]}`);
}

// Pattern 2: Any 2-3 letters + 3-4 digits + optional letter
const standardEurocodes = [...fullText.matchAll(/\b([A-Z]{2,3}\d{3,4}[A-Z]?)\b/g)];
const uniqueEurocodes = [...new Set(standardEurocodes.map(m => m[1]))].filter(e => e.length >= 5);
console.log(`\n2. Standard eurocode pattern (LLNNNN): ${uniqueEurocodes.length} unique`);
for (const e of uniqueEurocodes.slice(0, 20)) {
  console.log(`   ${e}`);
}

// Pattern 3: Look in product meta, attributes, tables
console.log('\n3. Product meta/attributes:');
const sku = await page.locator('.sku').textContent().catch(() => null);
console.log(`   SKU: ${sku?.trim()}`);

const attrLabels = await page.locator('.woocommerce-product-attributes-item__label, .product_meta th').allTextContents();
const attrValues = await page.locator('.woocommerce-product-attributes-item__value, .product_meta td').allTextContents();
for (let i = 0; i < Math.min(attrLabels.length, attrValues.length); i++) {
  console.log(`   ${attrLabels[i]?.trim()}: ${attrValues[i]?.trim()}`);
}

// Pattern 4: Check for hidden/meta fields
console.log('\n4. Checking meta tags:');
const metaDesc = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
console.log(`   Meta description: ${metaDesc?.slice(0, 200)}`);

// Pattern 5: Check WooCommerce structured data
const jsonLd = await page.locator('script[type="application/ld+json"]').textContent().catch(() => null);
if (jsonLd) {
  try {
    const data = JSON.parse(jsonLd);
    console.log(`\n5. JSON-LD sku: ${data.sku || 'N/A'}`);
    console.log(`   JSON-LD mpn: ${data.mpn || 'N/A'}`);
    console.log(`   JSON-LD name: ${data.name?.slice(0, 60)}`);
    if (data.identifier) console.log(`   JSON-LD identifier: ${JSON.stringify(data.identifier)}`);
  } catch (e) {}
}

// Pattern 6: Check all data-* attributes in product area
console.log('\n6. Product area HTML snippets:');
const productArea = await page.locator('.product, .single-product, [class*="product"]').first().innerHTML().catch(() => '');
const dataAttrs = [...productArea.matchAll(/data-[a-z-]+="([^"]+)"/gi)];
for (const m of dataAttrs.slice(0, 10)) {
  console.log(`   ${m[0]}`);
}

await browser.close();
