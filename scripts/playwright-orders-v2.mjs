import { chromium } from 'playwright';
import fs from 'fs';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const OUT_FILE = './data/orders-eurocode-mapping.json';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔐 Logging in...');
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
await page.waitForTimeout(2000);

const logoutLink = await page.locator('a[href*="logout"]').count();
if (logoutLink === 0) {
  console.log('❌ Login failed');
  await browser.close();
  process.exit(1);
}

console.log('✅ Logged in\n');

// Get all order view links from the current page
const orderLinks = await page.locator('table tbody tr td:last-child a, .woocommerce-orders-table tbody tr td:last-child a').all();
const orderHrefs = [];
for (const link of orderLinks) {
  const href = await link.getAttribute('href');
  const text = await link.textContent();
  if (href && text?.toLowerCase().includes('vis')) {
    orderHrefs.push(href);
  }
}

console.log(`📋 Found ${orderHrefs.length} order links\n`);

const orders = [];

for (let i = 0; i < orderHrefs.length; i++) {
  const href = orderHrefs[i];
  console.log(`Order ${i+1}/${orderHrefs.length}: ${href}`);
  
  try {
    await page.goto(href, { timeout: 15000, waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    
    // Get order number from page title or heading
    const title = await page.title();
    const orderMatch = title.match(/#(\d+)/);
    const orderNum = orderMatch ? orderMatch[1] : 'unknown';
    
    // Get order meta
    const metaText = await page.locator('.woocommerce-order-overview, .order-info').textContent().catch(() => '');
    
    // Get all product rows
    const productEls = await page.locator('table tbody tr, .wc-item-meta, .product-name').all();
    const products = [];
    
    for (const el of productEls) {
      const text = await el.textContent();
      if (text && text.trim()) {
        const clean = text.trim().replace(/\s+/g, ' ');
        if (clean.length > 10) {
          products.push(clean);
        }
      }
    }
    
    // Extract regnr from page text
    const pageText = await page.locator('body').textContent();
    const regnrMatches = [...(pageText?.match(/\b[A-Z]{2}\d{4,5}\b/g) || [])];
    const uniqueRegnr = [...new Set(regnrMatches)];
    
    // Extract year from product names
    const yearMatches = [];
    for (const p of products) {
      const m = p.match(/(\d{2,4})\s*-\s*(\d{2,4})?/);
      if (m) yearMatches.push(m[0]);
    }
    
    orders.push({
      orderNum,
      url: href,
      meta: metaText.slice(0, 200),
      products,
      regnr: uniqueRegnr,
      years: [...new Set(yearMatches)],
    });
    
    console.log(`  -> ${products.length} lines, regnr: ${uniqueRegnr.join(', ') || 'none'}`);
    
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    orders.push({ url: href, error: e.message });
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(orders, null, 2));
console.log(`\n💾 Saved ${orders.length} orders to ${OUT_FILE}`);

const totalProducts = orders.reduce((sum, o) => sum + (o.products?.length || 0), 0);
const withRegnr = orders.filter(o => o.regnr && o.regnr.length > 0).length;
console.log(`📊 Summary: ${orders.length} orders, ${totalProducts} product lines, ${withRegnr} with regnr`);

await browser.close();
console.log('\n✅ Done');
