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

// Go to product list
await page.goto('https://auto-glass.no/varer/nettbutikk/autoglass/alfa-romeo/145/1995-2000/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Click first product link
const productLinks = await page.locator('.product a').all();
if (productLinks.length > 0) {
  const href = await productLinks[0].getAttribute('href');
  console.log('First product URL:', href);
  await page.goto(href, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  
  console.log('\n=== Product detail page ===');
  console.log('Title:', await page.title());
  
  // Look for SKU, meta, description, tables
  const sku = await page.locator('.sku').textContent().catch(() => null);
  console.log('SKU:', sku);
  
  // Check all table data cells for eurocode-like patterns
  const allText = await page.content();
  const eurocodePatterns = [
    /\b([A-Z]{2,3}\d{3,4}[A-Z]?)\b/g,
    /\bEurokode\s*[:\-]?\s*([A-Z0-9\-]+)/gi,
    /\bArt\.?\s*Nr\.?\s*[:\-]?\s*([A-Z0-9\-]+)/gi,
    /\bSKU\s*[:\-]?\s*([A-Z0-9\-]+)/gi,
    /\bOEM\s*[:\-]?\s*([A-Z0-9\-]+)/gi,
  ];
  
  for (const pat of eurocodePatterns) {
    const matches = [...allText.matchAll(pat)];
    const unique = [...new Set(matches.map(m => m[1]))].slice(0, 10);
    if (unique.length > 0) {
      console.log(`\nPattern ${pat.source}:`);
      for (const u of unique) console.log(`  ${u}`);
    }
  }
  
  // Check product attributes / additional info table
  const attrLabels = await page.locator('.woocommerce-product-attributes-item__label, th').allTextContents();
  const attrValues = await page.locator('.woocommerce-product-attributes-item__value, td').allTextContents();
  console.log('\n=== Product attributes ===');
  for (let i = 0; i < Math.min(attrLabels.length, attrValues.length); i++) {
    console.log(`  ${attrLabels[i]?.trim()}: ${attrValues[i]?.trim()}`);
  }
  
  // Check description
  const desc = await page.locator('.woocommerce-product-details__short-description, .product-description').textContent().catch(() => null);
  if (desc) console.log('\nDescription:', desc.slice(0, 300));
}

await browser.close();
