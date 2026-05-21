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

// Check a brand with likely many products - e.g. VW Golf
await page.goto('https://auto-glass.no/varer/nettbutikk/autoglass/vw/golf/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

console.log('Title:', await page.title());
console.log('Products:', await page.locator('.product').count());

// Check for pagination
const pagination = await page.locator('.woocommerce-pagination, .pagination, nav[aria-label*="pagination"]').count();
console.log('Pagination elements:', pagination);

const nextLink = await page.locator('a.next, .next.page-numbers').count();
console.log('Next links:', nextLink);

// Check page numbers
const pageNums = await page.locator('.page-numbers').allTextContents();
if (pageNums.length > 0) console.log('Page numbers:', pageNums.filter(Boolean));

await browser.close();
