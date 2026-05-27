import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  // Test Toyota search
  const page = await context.newPage();
  await page.goto(
    "https://www.finn.no/mobility/search/car?last_search=false&registration_class=1&make=Toyota&sort=PUBLISHED_DESC",
    { waitUntil: "domcontentloaded", timeout: 30000 }
  );
  await page.waitForTimeout(2000);

  // Accept cookies
  try {
    const acceptBtn = await page.locator('button:has-text("Godta alle")').first();
    if (await acceptBtn.isVisible().catch(() => false)) await acceptBtn.click();
  } catch {}
  await page.waitForTimeout(1000);

  // Get car titles from first page
  const titles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("article, [data-testid='result-item']"))
      .map((el) => {
        const heading = el.querySelector("h3, h2, a")?.innerText?.trim();
        return heading;
      })
      .filter(Boolean)
      .slice(0, 10);
  });

  console.log("Toyota search - first 10 car titles:");
  titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

  await browser.close();
})();
