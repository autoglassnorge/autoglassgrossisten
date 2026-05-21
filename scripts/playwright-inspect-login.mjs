import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://auto-glass.no/min-konto/', { timeout: 20000 });
await page.waitForLoadState('networkidle');

// Inspect login form
const forms = await page.locator('form').all();
console.log(`Forms found: ${forms.length}`);

for (let i = 0; i < forms.length; i++) {
  const form = forms[i];
  const html = await form.innerHTML();
  console.log(`\n=== Form ${i} ===`);
  console.log(html.slice(0, 2000));
  
  // Find all inputs
  const inputs = await form.locator('input').all();
  for (const input of inputs) {
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const id = await input.getAttribute('id');
    console.log(`  input[type=${type}] name=${name} id=${id}`);
  }
}

await browser.close();
