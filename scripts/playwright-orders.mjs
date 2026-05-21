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

// Check if logged in
const logoutLink = await page.locator('a[href*="logout"]').count();
if (logoutLink === 0) {
  console.log('❌ Login failed');
  await browser.close();
  process.exit(1);
}

console.log('✅ Logged in as ALFA GLASS AS\n');

// Collect all order links from the orders table
const orderRows = await page.locator('table tbody tr, .woocommerce-orders-table tbody tr').all();
console.log(`📋 Found ${orderRows.length} orders\n`);

const orders = [];

for (let i = 0; i < orderRows.length; i++) {
  const row = orderRows[i];
  const cells = await row.locator('td').all();
  if (cells.length < 5) continue;
  
  const orderNum = (await cells[0].textContent())?.trim() || '';
  const date = (await cells[1].textContent())?.trim() || '';
  const status = (await cells[2].textContent())?.trim() || '';
  const total = (await cells[3].textContent())?.trim() || '';
  
  // Get view order link
  const viewLink = await cells[cells.length - 1].locator('a').getAttribute('href').catch(() => null);
  
  console.log(`Order ${i+1}/${orderRows.length}: ${orderNum} | ${date} | ${status}`);
  
  if (!viewLink) {
    orders.push({ orderNum, date, status, total, products: [], error: 'No view link' });
    continue;
  }
  
  // Navigate to order detail
  try {
    await page.goto(viewLink, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Extract product info from order
    const productRows = await page.locator('.woocommerce-table__product-name, .order_item, .product-name').all();
    const products = [];
    
    for (const prod of productRows) {
      const text = await prod.textContent();
      if (text) {
        products.push(text.trim());
      }
    }
    
    // Try to find vehicle/regnr info in order
    const pageText = await page.locator('body').textContent();
    const regnrMatch = pageText?.match(/\b[A-Z]{2}\d{4,5}\b/g);
    const vinMatch = pageText?.match(/\b[A-HJ-NPR-Z0-9]{17}\b/gi);
    
    orders.push({
      orderNum,
      date,
      status,
      total,
      viewLink,
      products,
      regnr: regnrMatch || [],
      vin: vinMatch || [],
    });
    
    console.log(`  -> ${products.length} products, regnr: ${regnrMatch?.join(', ') || 'none'}`);
    
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    orders.push({ orderNum, date, status, total, viewLink, error: e.message });
  }
}

// Save results
fs.writeFileSync(OUT_FILE, JSON.stringify(orders, null, 2));
console.log(`\n💾 Saved ${orders.length} orders to ${OUT_FILE}`);

// Summary
const totalProducts = orders.reduce((sum, o) => sum + (o.products?.length || 0), 0);
const withRegnr = orders.filter(o => o.regnr && o.regnr.length > 0).length;
console.log(`📊 Summary: ${orders.length} orders, ${totalProducts} products, ${withRegnr} with regnr`);

await browser.close();
console.log('\n✅ Done');
