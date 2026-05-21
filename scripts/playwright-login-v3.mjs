import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123???';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔐 Logging in to auto-glass.no...');
console.log(`  Email: ${EMAIL}`);

await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Accept cookies
try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår"), .moove-gdpr-accept-btn').first();
  if (await cookieBtn.count() > 0) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }
} catch (e) {}

// Fill login form
await page.waitForSelector('#username', { timeout: 10000 });
await page.fill('#username', EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[name="login"]');

// Wait for result
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

console.log(`  Page title: ${await page.title()}`);

const errorMsg = await page.locator('.woocommerce-error').textContent().catch(() => '');
if (errorMsg) {
  console.log(`  ERROR: ${errorMsg.trim()}`);
}

const logoutLink = await page.locator('a[href*="logout"]').count();
console.log(`  Logout links: ${logoutLink}`);

await page.screenshot({ path: '/tmp/auto-glass-login-v3.png', fullPage: true });
console.log('  Screenshot: /tmp/auto-glass-login-v3.png');

if (logoutLink > 0) {
  console.log('\n  ✅ Logged in successfully!');
  
  // Check account menu
  const navLinks = await page.locator('.woocommerce-MyAccount-navigation a').all();
  console.log('\n  Account menu:');
  for (const link of navLinks) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    console.log(`    - ${text.trim()}: ${href}`);
  }
  
  // Look for orders
  const orderLink = navLinks.find(l => {
    const t = l.textContentSync ? l.textContentSync() : '';
    return t && /ordre|bestilling/i.test(t);
  });
  
  if (orderLink) {
    console.log('\n  📋 Going to orders...');
    await orderLink.click();
    await page.waitForLoadState('networkidle');
    
    const rows = await page.locator('.woocommerce-orders-table tbody tr').all();
    console.log(`  Orders found: ${rows.length}`);
    
    for (const row of rows) {
      const cells = await row.locator('td').all();
      const orderNum = cells.length > 0 ? await cells[0].textContent() : '?';
      const date = cells.length > 1 ? await cells[1].textContent() : '?';
      const status = cells.length > 2 ? await cells[2].textContent() : '?';
      const total = cells.length > 3 ? await cells[3].textContent() : '?';
      console.log(`    Order ${orderNum.trim()} | ${date?.trim()} | ${status?.trim()} | ${total?.trim()}`);
    }
    
    await page.screenshot({ path: '/tmp/auto-glass-orders.png', fullPage: true });
  }
} else {
  console.log('\n  ❌ Login failed');
}

await browser.close();
console.log('\n✅ Done');
