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

// Get full HTML of product cards
const cards = await page.locator('.product').all();
console.log(`Found ${cards.length} product cards\n`);

for (let i = 0; i < Math.min(cards.length, 3); i++) {
  const html = await cards[i].innerHTML();
  console.log(`=== Card ${i} HTML ===`);
  console.log(html);
  console.log('\n--- Card text ---');
  console.log(await cards[i].textContent());
  console.log('\n\n');
}

await browser.close();
