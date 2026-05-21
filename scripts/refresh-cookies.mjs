import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

console.log('🔐 Logging in...');
await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('#username', { timeout: 10000 });
await page.fill('#username', EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[name="login"]');
await page.waitForLoadState('domcontentloaded');

try {
  await page.waitForSelector('a[href*="logout"]', { timeout: 10000 });
} catch (e) {
  console.log('❌ Login failed');
  await browser.close();
  process.exit(1);
}

const cookies = await context.cookies();
writeFileSync('/Users/taj/bilglass/data/autoglass-scrape/cookies.json', JSON.stringify(cookies, null, 2));
console.log(`✅ Refreshed ${cookies.length} cookies`);

// Verify
const cookieNames = cookies.map(c => c.name);
console.log('Cookies:', cookieNames.join(', '));

await browser.close();
