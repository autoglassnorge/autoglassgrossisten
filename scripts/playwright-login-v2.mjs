import { chromium } from 'playwright';

const EMAIL = 'post@klarpakke.no';
const PASSWORD = 'Viking123???';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔐 Logging in to auto-glass.no...');

await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Accept cookies if present
try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår"), .moove-gdpr-accept-btn, .accept-cookies').first();
  if (await cookieBtn.count() > 0) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }
} catch (e) {}

// Wait for login form and fill it
await page.waitForSelector('#username', { timeout: 10000 });
await page.fill('#username', EMAIL);
await page.fill('#password', PASSWORD);

// Click login
await page.click('button[name="login"]');

// Wait for navigation
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

console.log(`  Page title after login: ${await page.title()}`);

// Check for error message
const errorMsg = await page.locator('.woocommerce-error').textContent().catch(() => '');
if (errorMsg) {
  console.log(`  ERROR: ${errorMsg.trim()}`);
}

// Check if logged in
const logoutLink = await page.locator('a[href*="logout"], a:has-text("Logg ut")').count();
const dashboardText = await page.locator('text=Hei ').count();
console.log(`  Logout links: ${logoutLink}`);
console.log(`  Dashboard greeting: ${dashboardText}`);

// Screenshot
await page.screenshot({ path: '/tmp/auto-glass-after-login.png', fullPage: true });
console.log('  Screenshot: /tmp/auto-glass-after-login.png');

// If logged in, try to find order history
if (logoutLink > 0) {
  console.log('\n  ✅ Successfully logged in!');
  
  // Check for orders
  const orderTable = await page.locator('.woocommerce-orders-table, table.shop_table').count();
  console.log(`  Order tables: ${orderTable}`);
  
  // Get account navigation links
  const navLinks = await page.locator('.woocommerce-MyAccount-navigation a').all();
  console.log('\n  Account menu:');
  for (const link of navLinks) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    console.log(`    - ${text.trim()}: ${href}`);
  }
  
  // If there's an orders link, click it
  const ordersLink = navLinks.find(async l => {
    const t = await l.textContent();
    return t && /(ordre|bestilling|orders)/i.test(t);
  });
  
  if (ordersLink) {
    console.log('\n  📋 Navigating to orders...');
    await ordersLink.click();
    await page.waitForLoadState('networkidle');
    
    // Get all order rows
    const rows = await page.locator('.woocommerce-orders-table tbody tr, table tbody tr').all();
    console.log(`  Order rows: ${rows.length}`);
    
    for (const row of rows.slice(0, 5)) {
      const text = await row.textContent();
      console.log(`    ${text.trim().slice(0, 100)}`);
    }
    
    await page.screenshot({ path: '/tmp/auto-glass-orders.png', fullPage: true });
    console.log('  Orders screenshot: /tmp/auto-glass-orders.png');
  }
} else {
  console.log('\n  ❌ Login failed');
}

await browser.close();
console.log('\n✅ Done');
