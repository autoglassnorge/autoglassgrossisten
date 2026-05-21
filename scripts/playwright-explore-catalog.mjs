import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔍 Exploring auto-glass.no catalog structure...');
await page.goto('https://auto-glass.no/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Accept cookies
try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår")').first();
  if (await cookieBtn.count() > 0) await cookieBtn.click();
} catch (e) {}

// Find brand categories
console.log('\n📁 Product categories (brands):');
const catLinks = await page.locator('.product-categories a, .widget_product_categories a, .cat-item a').all();
const brands = [];
for (const link of catLinks) {
  const text = await link.textContent();
  const href = await link.getAttribute('href');
  if (text && href && href.includes('/product-category/')) {
    brands.push({ name: text.trim(), url: href });
    console.log(`  ${text.trim()}: ${href}`);
  }
}

// If no product categories found, try other selectors
if (brands.length === 0) {
  console.log('\n  No .product-categories found, trying alternative selectors...');
  
  // Check for any sidebar links
  const sidebarLinks = await page.locator('aside a, .sidebar a, .widget a').all();
  for (const link of sidebarLinks) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && href && (href.includes('category') || href.includes('bilmerke'))) {
      console.log(`  ALT: ${text.trim()}: ${href}`);
    }
  }
}

// Check if there's a shop/catalog page
console.log('\n🔍 Checking shop page...');
await page.goto('https://auto-glass.no/shop/', { timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});

const products = await page.locator('.product, .type-product').count();
console.log(`  Products on shop page: ${products}`);

// Look for filter/sidebar with brands
const filters = await page.locator('.widget, .sidebar, aside').all();
for (const f of filters) {
  const heading = await f.locator('h2, h3, .widget-title').first().textContent().catch(() => '');
  if (heading) console.log(`  Filter widget: ${heading.trim()}`);
}

await browser.close();
console.log('\n✅ Done');
