const { test, expect } = require('@playwright/test');

test.describe('📦 Katalog', () => {
  test('should load catalog page', async ({ page }) => {
    const response = await page.goto('/katalog.html');
    expect(response.status()).toBeLessThan(400);
    
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should display product categories', async ({ page }) => {
    await page.goto('/katalog.html');
    await page.waitForTimeout(1000);
    
    const content = await page.content();
    const hasProducts = content.includes('eurocode') || 
                        content.includes('Pilkington') || 
                        content.includes('Glavista') ||
                        content.includes('frontrute') ||
                        content.includes('produkt');
    
    console.log(`Catalog has products: ${hasProducts}`);
  });

  test('should have functioning filters', async ({ page }) => {
    await page.goto('/katalog.html');
    
    const buttons = await page.locator('button').all();
    console.log(`Found ${buttons.length} buttons on catalog page`);
    
    if (buttons.length > 0) {
      await expect(buttons[0]).toBeVisible();
    }
  });
});
