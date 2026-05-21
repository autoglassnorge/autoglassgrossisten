import { chromium } from 'playwright';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const PRODUCT_URL = 'https://auto-glass.no/produkt/ac-cobra-sportsbil-62-frontrute-nb-store-utgaven-glass/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

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

await page.goto(PRODUCT_URL, { timeout: 20000 });
await page.waitForLoadState('networkidle');

const html = await page.content();

// Search for "Eurokode" in HTML with surrounding context
const eurokodeIndices = [];
let idx = html.indexOf('Eurokode');
while (idx !== -1) {
  eurokodeIndices.push(idx);
  idx = html.indexOf('Eurokode', idx + 1);
}

console.log(`Found "Eurokode" ${eurokodeIndices.length} times in HTML`);
for (const pos of eurokodeIndices) {
  const snippet = html.slice(Math.max(0, pos - 100), pos + 200);
  console.log(`\n--- Snippet ---\n${snippet}`);
}

// Also check for any element containing "Eurokode"
const euroElements = await page.locator('*:has-text("Eurokode")').all();
console.log(`\nFound ${euroElements.length} elements with "Eurokode" text`);
for (const el of euroElements.slice(0, 3)) {
  const tag = await el.evaluate(e => e.tagName);
  const text = await el.textContent();
  const className = await el.getAttribute('class').catch(() => '');
  console.log(`\n<${tag} class="${className}">`);
  console.log(`  ${text?.trim()}`);
}

await browser.close();
