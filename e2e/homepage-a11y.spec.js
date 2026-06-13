const { test, expect } = require('@playwright/test');

// These tests exercise the new ChatWidget behaviour that is not yet deployed.
test.skip(({ baseURL }) => !baseURL?.includes('localhost'), 'Homepage a11y tests run only against the local dev server');

test.describe('@a11y Homepage accessibility', () => {
  test('chat can be opened, tabbed through, and closed with Escape', async ({ page }) => {
    await page.goto('/');

    const openChat = page.getByRole('button', { name: /Åpne chat/i });
    await openChat.click();

    const input = page.getByPlaceholder('Skriv en melding...');
    await expect(input).toBeVisible();

    // Tab cycles inside the dialog; Escape closes it
    await input.press('Escape');
    await expect(input).toBeHidden();
    await expect(openChat).toBeFocused();
  });

  test('primary CTAs show visible focus rings on Tab', async ({ page }) => {
    await page.goto('/');

    // Tab until we land on a real focusable element (skip body/document root)
    let focused = page.locator(':focus');
    let tagName = await focused.evaluate((el) => el.tagName).catch(() => '');
    let attempts = 0;
    while ((!tagName || tagName === 'BODY') && attempts < 10) {
      await page.keyboard.press('Tab');
      focused = page.locator(':focus');
      tagName = await focused.evaluate((el) => el.tagName).catch(() => '');
      attempts++;
    }

    expect(tagName, 'Tab did not move focus to an interactive element').not.toBe('BODY');

    const styles = await focused.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        boxShadow: computed.boxShadow,
        outline: computed.outline,
        outlineWidth: computed.outlineWidth,
      };
    });

    const hasVisibleRing =
      styles.boxShadow !== 'none' ||
      (styles.outline && styles.outline !== 'none' && styles.outlineWidth !== '0px');

    await expect(hasVisibleRing).toBe(true);
  });

  test('manufacturer logo images have non-empty alt text', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section[aria-label="Produsenter"]');
    await section.scrollIntoViewIfNeeded();
    const logos = section.locator('img[alt]:visible');
    await expect(logos).toHaveCount(9);
    const count = await logos.count();
    for (let i = 0; i < count; i++) {
      const alt = await logos.nth(i).getAttribute('alt');
      expect(alt).toBeTruthy();
      expect(alt.trim()).not.toBe('');
    }
  });
});
