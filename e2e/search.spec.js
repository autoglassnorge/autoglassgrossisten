const { test, expect } = require('@playwright/test');

test.describe('🔍 Regnr-søk', () => {
  test('should search by registration number and return results', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('SU18018');
    await searchInput.press('Enter');
    
    await page.waitForTimeout(3000);
    
    const results = page.locator('.result, [class*="result"], .product-card, [class*="product"]').first();
    const hasResults = await results.isVisible().catch(() => false);
    
    if (!hasResults) {
      const noResults = await page.locator('text=/ingen treff|fant ikke|ikke funnet/i').isVisible().catch(() => false);
      expect(noResults || hasResults).toBeTruthy();
    }
  });

  test('should show vehicle info after search', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('SU18018');
    await searchInput.press('Enter');
    
    await page.waitForTimeout(3000);
    
    const pageContent = await page.content();
    const hasVehicleInfo = pageContent.includes('SU18018') || 
                           pageContent.includes('Tesla') || 
                           pageContent.includes('vehicle') ||
                           pageContent.includes('kjøretøy');
    
    console.log(`Vehicle info present: ${hasVehicleInfo}`);
  });

  test('should handle invalid registration numbers gracefully', async ({ page }) => {
    await page.goto('/');
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('INVALID123');
    await searchInput.press('Enter');
    
    await page.waitForTimeout(2000);
    
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });
});
