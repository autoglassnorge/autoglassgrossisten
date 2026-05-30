const { test, expect } = require('@playwright/test');

test.describe('🏠 Homepage', () => {
  test('should load with correct title and meta tags', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
    
    await expect(page).toHaveTitle(/Autoglass/);
    
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDesc).toBeTruthy();
    expect(metaDesc.length).toBeGreaterThan(20);
    
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');
    
    const navLinks = await page.locator('nav a, header a').all();
    expect(navLinks.length).toBeGreaterThan(2);
    
    for (const link of navLinks.slice(0, 5)) {
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('should have search functionality visible', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('input[type="text"], input[placeholder*="regnr"], input[placeholder*="søk"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('should load within performance budget', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(5000);
    
    const lcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const lcpEntry = entries.find(e => e.name === 'largest-contentful-paint');
      return lcpEntry ? lcpEntry.startTime : 0;
    });
    
    console.log(`Homepage LCP: ${lcp}ms, Load: ${loadTime}ms`);
  });
});
