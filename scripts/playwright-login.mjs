import { chromium } from 'playwright';

const EMAIL = 'post@klarpakke.no';
const PASSWORD = 'Viking123???';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

console.log('🔐 Logging in to auto-glass.no...');

// Navigate to login page
try {
  await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  console.log(`  Page title: ${await page.title()}`);
  
  // Check if already logged in
  const logoutLink = await page.locator('a:has-text("Logg ut"), .logout, a[href*="logout"]').count();
  if (logoutLink > 0) {
    console.log('  Already logged in!');
  } else {
    // Find and fill login form
    const emailField = await page.locator('input[name="username"], input[type="email"], #username').first();
    const passField = await page.locator('input[name="password"], input[type="password"], #password').first();
    
    if (await emailField.count() > 0 && await passField.count() > 0) {
      await emailField.fill(EMAIL);
      await passField.fill(PASSWORD);
      
      // Click login button
      const loginBtn = await page.locator('button[name="login"], input[type="submit"], .login-button, button:has-text("Logg inn")').first();
      await loginBtn.click();
      
      await page.waitForLoadState('networkidle');
      console.log(`  After login title: ${await page.title()}`);
    } else {
      console.log('  Login form not found, checking page content...');
    }
  }
  
  // Take screenshot for analysis
  await page.screenshot({ path: '/tmp/auto-glass-account.png', fullPage: true });
  console.log('  Screenshot saved to /tmp/auto-glass-account.png');
  
  // Check for order history
  const orderLinks = await page.locator('a[href*="order"], a[href*="view-order"], .order-number').all();
  console.log(`  Order links found: ${orderLinks.length}`);
  
  // Check for any useful sections
  const sections = await page.locator('.woocommerce-MyAccount-navigation a, .my-account-menu a, nav a').all();
  console.log('\n  Account sections:');
  for (const section of sections) {
    const text = await section.textContent();
    const href = await section.getAttribute('href');
    if (text && text.trim()) {
      console.log(`    - ${text.trim()}: ${href}`);
    }
  }
  
  // Check page for orders table
  const ordersTable = await page.locator('table, .woocommerce-orders-table, .shop_table').count();
  console.log(`\n  Orders tables: ${ordersTable}`);
  
} catch (e) {
  console.log(`  Error: ${e.message}`);
}

await browser.close();
console.log('\n✅ Done');
