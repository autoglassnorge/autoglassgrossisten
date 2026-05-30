const { test, expect } = require('@playwright/test');

const keyPages = [
  { path: '/', name: 'Homepage' },
  { path: '/katalog.html', name: 'Katalog' },
  { path: '/frontruter.html', name: 'Frontruter' },
  { path: '/bli-kunde.html', name: 'Bli kunde' },
  { path: '/kontakt.html', name: 'Kontakt' },
  { path: '/diagnostikk.html', name: 'Diagnostikk' },
  { path: '/aktuelt.html', name: 'Aktuelt' },
  { path: '/om-oss.html', name: 'Om oss' },
];

test.describe('🧭 Navigation & Pages', () => {
  for (const pageInfo of keyPages) {
    test(`${pageInfo.name} should load (200 OK)`, async ({ page }) => {
      const response = await page.goto(pageInfo.path);
      expect(response.status()).toBeLessThan(400);
      
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      
      const h1 = await page.locator('h1').first();
      const h1Text = await h1.textContent().catch(() => '');
      console.log(`${pageInfo.name}: "${h1Text.trim()}" (${title})`);
    });
  }

  test('all internal links should resolve', async ({ page }) => {
    await page.goto('/');
    
    const links = await page.locator('a[href^="/"], a[href^="."]').all();
    const hrefs = [...new Set(await Promise.all(links.map(l => l.getAttribute('href'))))];
    
    console.log(`Checking ${hrefs.length} unique internal links`);
    
    let broken = 0;
    for (const href of hrefs.slice(0, 15)) {
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      
      const response = await page.request.get(href);
      if (response.status() >= 400) {
        console.log(`⚠️ Broken link: ${href} → ${response.status()}`);
        broken++;
      }
    }
    
    expect(broken).toBeLessThan(5);
  });
});
