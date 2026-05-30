import { webkit } from "playwright";
const browser = await webkit.launch({ headless: false });
const context = await browser.newContext({ locale: "de-DE" });
const page = await context.newPage();
page.on("response", r => {
  if (r.url().includes("autodoc") && r.status() === 200) {
    console.log("OK:", r.url().slice(0,100), "status:", r.status());
  }
});
try {
  await page.goto("https://www.autodoc.de/pilkington/6689658", { waitUntil: "networkidle", timeout: 30000 });
  const title = await page.title();
  console.log("TITLE:", title);
  const html = await page.content();
  console.log("HTML snippet:", html.slice(0,500));
  await page.screenshot({ path: "data/autodoc-probe/webkit-test.png" });
} catch(e) {
  console.error("ERROR:", e.message);
}
await browser.close();
