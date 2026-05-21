import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
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

const logoutLink = await page.locator('a[href*="logout"]').count();
if (logoutLink === 0) {
  console.log('❌ Login failed');
  await browser.close();
  process.exit(1);
}
console.log('✅ Logged in\n');

// Now explore sidebar with brand categories
console.log('=== Inspecting sidebar (logged in) ===');
const sidebars = await page.locator('aside, .sidebar, #secondary').all();
for (let i = 0; i < sidebars.length; i++) {
  const html = await sidebars[i].innerHTML();
  console.log(`\n--- Sidebar ${i} (first 5000 chars) ---`);
  console.log(html.slice(0, 5000));
}

// Check all ULs on page
const allLists = await page.locator('ul').all();
console.log(`\n\n=== Found ${allLists.length} <ul> elements ===`);
for (let i = 0; i < allLists.length; i++) {
  const items = await allLists[i].locator('li').all();
  if (items.length > 3) {
    const firstTexts = [];
    for (let j = 0; j < Math.min(items.length, 8); j++) {
      const t = await items[j].textContent();
      if (t) firstTexts.push(t.trim().slice(0, 50));
    }
    console.log(`\n  UL ${i} (${items.length} items):`);
    for (const t of firstTexts) console.log(`    - ${t}`);
  }
}

await browser.close();
