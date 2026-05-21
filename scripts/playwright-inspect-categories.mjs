import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://auto-glass.no/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår")').first();
  if (await cookieBtn.count() > 0) await cookieBtn.click();
} catch (e) {}

// Dump all sidebar/widget HTML
console.log('=== Sidebar HTML ===');
const sidebars = await page.locator('aside, .sidebar, #secondary').all();
for (let i = 0; i < sidebars.length; i++) {
  const html = await sidebars[i].innerHTML();
  console.log(`\n--- Sidebar ${i} (first 3000 chars) ---`);
  console.log(html.slice(0, 3000));
}

// Also check for any menu/list that contains car brands
const allLists = await page.locator('ul').all();
console.log(`\n\n=== Found ${allLists.length} <ul> elements ===`);
for (let i = 0; i < Math.min(allLists.length, 20); i++) {
  const items = await allLists[i].locator('li').all();
  if (items.length > 5) {
    const firstTexts = [];
    for (let j = 0; j < Math.min(items.length, 5); j++) {
      const t = await items[j].textContent();
      if (t) firstTexts.push(t.trim().slice(0, 40));
    }
    console.log(`\n  UL ${i} (${items.length} items): ${firstTexts.join(' | ')}`);
  }
}

await browser.close();
