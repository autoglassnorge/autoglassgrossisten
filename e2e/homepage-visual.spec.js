const { test, expect } = require('@playwright/test');

// Visual baselines are generated locally; production renders may differ.
test.skip(({ baseURL }) => !baseURL?.includes('localhost'), 'Homepage visual tests run only against the local dev server');

test.describe('@visual Homepage', () => {
  test('homepage matches baseline', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixels: 100 });
  });

  test('homepage mobile matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage-mobile.png', { maxDiffPixels: 100 });
  });
});
