import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

// Try Pilkington search
console.log('\n🔍 Trying Pilkington...');
try {
  await page.goto('https://www.pilkington.com/no/no/products/automotive', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  console.log(`  Title: ${await page.title()}`);
  
  // Check for search functionality
  const hasSearch = await page.locator('input[type="search"], .search, #search').count();
  console.log(`  Search inputs found: ${hasSearch}`);
  
  // Check for catalog links
  const links = await page.locator('a').all();
  const catalogLinks = [];
  for (const link of links) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && /(catalog|katalog|søk|search|finder)/i.test(text)) {
      catalogLinks.push({ text: text.trim().slice(0, 50), href });
    }
  }
  console.log(`  Catalog/search links: ${catalogLinks.length}`);
  for (const l of catalogLinks.slice(0, 5)) {
    console.log(`    - ${l.text}: ${l.href}`);
  }
} catch (e) {
  console.log(`  Error: ${e.message}`);
}

await browser.close();
console.log('\n✅ Done');
