import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Open a specific ad
  const adUrl = "https://www.finn.no/mobility/item/464429901";
  console.log("Opening ad:", adUrl);

  await page.goto(adUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Accept cookies if present
  try {
    const acceptBtn = await page.locator('button:has-text("Godta alle")').first();
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}

  const text = await page.evaluate(() => document.body.innerText);

  // Search for regnr
  const matches = text.match(/[A-Z]{2}\d{4,5}/g) || [];
  console.log("Regnr-like strings:", [...new Set(matches)].slice(0, 20));

  // Check for "registreringsnummer" text
  console.log("Mentions 'registreringsnummer':", text.includes("registreringsnummer"));
  console.log("Mentions 'Reg.nr':", text.includes("Reg.nr"));
  console.log("Mentions 'Regnr':", text.includes("Regnr"));
  console.log("Mentions 'Skilt':", text.includes("Skilt"));

  // Look for specific patterns
  const regnrMatch = text.match(/Reg\.?\s*nr\.?\s*:?\s*([A-Z]{2}\d{4,5})/i);
  console.log("Regnr regex match:", regnrMatch ? regnrMatch[1] : null);

  // Look for table/data fields
  const dataFields = await page.evaluate(() => {
    const fields = [];
    document.querySelectorAll("dl dt, table tr td:first-child, .specs dt, [data-testid]").forEach((el) => {
      const label = el.innerText?.trim();
      if (label && (label.toLowerCase().includes("reg") || label.toLowerCase().includes("skilt"))) {
        const next = el.nextElementSibling;
        fields.push({ label, value: next?.innerText?.trim() });
      }
    });
    return fields;
  });
  console.log("Data fields with reg/skilt:", dataFields);

  await page.screenshot({ path: "/Users/taj/bilglass/data/finn-ad-detail.png", fullPage: true });
  console.log("Screenshot saved to data/finn-ad-detail.png");

  await browser.close();
})();
