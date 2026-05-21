import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔐 Logging in to auto-glass.no...');

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

await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

console.log(`  Page title: ${await page.title()}`);

const errorMsg = await page.locator('.woocommerce-error').textContent().catch(() => '');
if (errorMsg) {
  console.log(`  ERROR: ${errorMsg.trim()}`);
}

const logoutLink = await page.locator('a[href*="logout"]').count();
const dashboardText = await page.locator('.woocommerce-MyAccount-content, .myaccount-content').textContent().catch(() => '');
console.log(`  Logout links: ${logoutLink}`);
console.log(`  Dashboard preview: ${dashboardText.slice(0, 200)}`);

await page.screenshot({ path: '/tmp/auto-glass-login-v4.png', fullPage: true });
console.log('  Screenshot: /tmp/auto-glass-login-v4.png');

if (logoutLink > 0) {
  console.log('\n  ✅ Logged in successfully!');
  
  // Get account nav links
  const navLinks = await page.locator('.woocommerce-MyAccount-navigation a').all();
  console.log('\n  Account menu:');
  for (const link of navLinks) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    console.log(`    - ${text.trim()}: ${href}`);
  }
  
  // Click orders
  for (const link of navLinks) {
    const text = await link.textContent();
    if (text && /ordre/i.test(text)) {
      console.log('\n  📋 Navigating to orders...');
      await link.click();
      await page.waitForLoadState('networkidle');
      
      const rows = await page.locator('.woocommerce-orders-table tbody tr').all();
      console.log(`  Orders found: ${rows.length}`);
      
      for (const row of rows.slice(0, 10)) {
        const cells = await row.locator('td').all();
        if (cells.length >= 4) {
          const orderNum = await cells[0].textContent();
          const date = await cells[1].textContent();
          const status = await cells[2].textContent();
          const total = await cells[3].textContent();
          console.log(`    #${orderNum?.trim()} | ${date?.trim()} | ${status?.trim()} | ${total?.trim()}`);
          
          // Click to view order details
          const viewLink = await cells[cells.length - 1].locator('a').getAttribute('href').catch(() => null);
          if (viewLink) {
            console.log(`      -> Detail link: ${viewLink}`);
          }
        }
      }
      
      await page.screenshot({ path: '/tmp/auto-glass-orders.png', fullPage: true });
      console.log('  Orders screenshot saved');
      break;
    }
  }
} else {
  console.log('\n  ❌ Login failed');
}

await browser.close();
console.log('\n✅ Done');
