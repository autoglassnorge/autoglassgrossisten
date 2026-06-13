const { test, expect } = require('@playwright/test');

// Visual baselines are generated locally; production renders may differ.
test.skip(({ baseURL }) => !baseURL?.includes('localhost'), 'Homepage visual tests run only against the local dev server');

test.describe('@visual Homepage', () => {
  test.setTimeout(30000);

  async function revealManufacturerSection(page) {
    // Disable scroll-reveal transitions so the section is stable for screenshots.
    await page.addStyleTag({
      content: 'section[aria-label="Produsenter"] { transition: none !important; transform: none !important; opacity: 1 !important; }',
    });
    const section = page.locator('section[aria-label="Produsenter"]');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    return section;
  }

  test('manufacturer section desktop matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const section = await revealManufacturerSection(page);
    await expect(section).toHaveScreenshot('manufacturer-section.png', { maxDiffPixels: 50, timeout: 10000 });
  });

  test('manufacturer section mobile matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const section = await revealManufacturerSection(page);
    await expect(section).toHaveScreenshot('manufacturer-section-mobile.png', { maxDiffPixels: 50, timeout: 10000 });
  });

  test('manufacturer logos are visible', async ({ page }) => {
    await page.goto('/');
    await revealManufacturerSection(page);
    for (const name of ['Pilkington', 'Saint-Gobain Sekurit', 'AGC Automotive', 'PGW Auto Glass', 'Glavista', 'Fuyao', 'XYG', 'NordGlass', 'Euroglass']) {
      const logo = page.locator(`section[aria-label="Produsenter"] img[alt="${name}"]:visible`);
      await expect(logo).toBeVisible();
    }
  });
});
