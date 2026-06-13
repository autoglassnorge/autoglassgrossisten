const { test, expect } = require('@playwright/test');

/**
 * Collect uncaught JS errors on the page so every routing test can assert
 * that the route renders without crashing.
 */
function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Known public frontend routes. HomePage and BrowsePage do not expose a
 * stable <h1>, so we assert on visible text instead of a heading.
 */
const ROUTES = [
  { path: '/', text: /Fagartikler om bilglass|B2B grossist/i, expectedTitle: /Autoglass/i },
  { path: '/sok', heading: /Søk etter bilglass/i, expectedTitle: /Søk/i },
  { path: '/bla', heading: /Velg merke/i, selector: 'h2', expectedTitle: /Bla i katalogen/i },
  { path: '/bilglassguide', heading: /Bilglassguide/i, expectedTitle: /Bilglassguide/i },
  { path: '/bilglassguide/frontrute', heading: /Frontrute/i, expectedTitle: /Frontrute/i },
  { path: '/bilglassguide/frontrute-adas-kamera', heading: /ADAS-kamera/i, expectedTitle: /ADAS-kamera/i },
  { path: '/bilglassguide/variantmatching', heading: /varianter/i, expectedTitle: /varianter/i },
  { path: '/bilglassguide/produsenter', heading: /Bilglassprodusenter/i, expectedTitle: /produsenter/i },
  { path: '/kasse', heading: /Ordre|Ordren er tom/i, expectedTitle: /Ordre/i },
  { path: '/konto', heading: /Min konto/i, expectedTitle: /.+/ },
  { path: '/om-oss', heading: /Om Autoglass/i, expectedTitle: /Om oss/i },
  { path: '/kontakt', heading: /Kontakt oss/i, expectedTitle: /Kontakt/i },
  { path: '/personvern', heading: /Personvernerklæring/i, expectedTitle: /Personvern/i },
  { path: '/vilkar', heading: /Vilkår/i, expectedTitle: /Vilkår/i },
  { path: '/admin', heading: /Innlogging kreves|Tilbudsforespørsler/i, expectedTitle: /Admin/i },
];

test.describe('@routing Frontend route rendering', () => {
  for (const route of ROUTES) {
    test(`${route.path} renders without JS errors and has content`, async ({ page }) => {
      const errors = collectPageErrors(page);

      await page.goto(route.path);
      await expect(page).toHaveTitle(route.expectedTitle);

      if (route.heading) {
        const tag = route.selector || 'h1';
        const heading = page.locator(tag).filter({ hasText: route.heading }).first();
        await expect(heading).toBeVisible();
        await expect(heading).not.toBeEmpty();
      } else if (route.text) {
        await expect(page.getByText(route.text).first()).toBeVisible();
      }

      expect(errors, `JS errors on ${route.path}: ${errors.join('; ')}`).toHaveLength(0);
    });
  }
});

test.describe('@routing SPA fallback on direct navigation', () => {
  test('/sok direct navigation serves React app', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/sok');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).toHaveText(/Søk etter bilglass/i);
    expect(errors).toHaveLength(0);
  });

  test('/bla direct navigation serves React app', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/bla');
    await expect(page.locator('h2').filter({ hasText: /Velg merke/i }).first()).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('/vilkar direct navigation serves React app', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/vilkar');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).toHaveText(/Vilkår/i);
    expect(errors).toHaveLength(0);
  });
});

test.describe('@routing Cloudflare Pages redirects', () => {
  /**
   * Cloudflare Pages returns 301/302 with a Location header for these rules.
   * We disable redirect following so we can assert the redirect status and target.
   */
  const redirectCases = [
    { from: '/vilkar-betingelser', to: '/vilkar', status: 301 },
    { from: '/kundeservice', to: '/kontakt', status: 301 },
    { from: '/kontakt-oss', to: '/kontakt', status: 301 },
    { from: '/shop', to: '/produkter', status: 301 },
    { from: '/produkt/foo', to: '/produkter', status: 301 },
  ];

  for (const { from, to, status } of redirectCases) {
    test(`${from} redirects to ${to} (${status})`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(status);
      expect(response.headers()['location']).toBe(to);
    });
  }
});

test.describe('@routing 404 behavior', () => {
  test('unknown route renders 404 page', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/denne-finnes-ikke-12345');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).toHaveText(/404/i);
    await expect(page.getByText('Siden finnes ikke', { exact: false })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});

test.describe('@routing API passthrough', () => {
  test('GET /api/health returns { status: "ok" }', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});
