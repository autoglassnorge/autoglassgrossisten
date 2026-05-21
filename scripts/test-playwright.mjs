import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
});
const page = await context.newPage();

// Test: Search for a eurocode on auto-glass.no
const testCodes = ['2048AGAMVZ', 'EI04AGRCMVZGLAVISTA', '9450AGNOE'];

for (const code of testCodes) {
  console.log(`\n🔍 Searching: ${code}`);
  try {
    await page.goto('https://auto-glass.no/?s=' + encodeURIComponent(code), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Check if there are search results
    const results = await page.locator('.product, .type-product, .search-result').count();
    const title = await page.title();
    console.log(`  Page title: ${title}`);
    console.log(`  Results found: ${results}`);
    
    // Try to find any product links
    const links = await page.locator('a[href*="product"]').all();
    console.log(`  Product links: ${links.length}`);
    
    if (links.length > 0) {
      const firstLink = await links[0].getAttribute('href');
      console.log(`  First link: ${firstLink}`);
    }
    
    // Check page content for vehicle info keywords
    const content = await page.content();
    const hasVehicle = /(bil|kjøretøy|merke|modell|passer til|kompatibel)/i.test(content);
    console.log(`  Has vehicle keywords: ${hasVehicle}`);
    
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

await browser.close();
console.log('\n✅ Done');
