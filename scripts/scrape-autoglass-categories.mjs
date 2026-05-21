import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const BASE_URL = 'https://auto-glass.no';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Login
console.log('🔐 Logging in...');
await page.goto(`${BASE_URL}/min-konto/`, { timeout: 20000 });
await page.waitForLoadState('networkidle');

try {
  const cookieBtn = page.locator('button:has-text("Jeg forstår")').first();
  if (await cookieBtn.count() > 0) await cookieBtn.click();
} catch (e) {}

await page.fill('#username', EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[name="login"]');
await page.waitForLoadState('networkidle');

if (await page.locator('a[href*="logout"]').count() === 0) {
  console.log('❌ Login failed');
  await browser.close();
  process.exit(1);
}
console.log('✅ Logged in');

// Parse category tree from sidebar
console.log('🗺️  Parsing category tree...');

const categories = await page.evaluate(() => {
  const result = [];
  const rootUL = document.querySelector('ul.product-categories');
  if (!rootUL) return result;
  
  const brandLIs = Array.from(rootUL.children);
  for (const brandLi of brandLIs) {
    const brandLink = brandLi.querySelector(':scope > a');
    if (!brandLink) continue;
    const brandName = brandLink.textContent.trim();
    if (!brandName) continue;
    
    const brand = { name: brandName, models: [] };
    const modelUL = brandLi.querySelector(':scope > ul.children');
    if (!modelUL) { result.push(brand); continue; }
    
    const modelLIs = Array.from(modelUL.children);
    for (const modelLi of modelLIs) {
      const modelLink = modelLi.querySelector(':scope > a');
      if (!modelLink) continue;
      const modelName = modelLink.textContent.trim();
      if (!modelName) continue;
      
      const model = { name: modelName, years: [], submodels: [] };
      const subUL = modelLi.querySelector(':scope > ul.children');
      if (!subUL) { brand.models.push(model); continue; }
      
      // Check if children are year items (no further nesting) or submodels
      const subLIs = Array.from(subUL.children);
      const isYearLevel = subLIs.every(li => li.classList.contains('last'));
      
      if (isYearLevel) {
        for (const yearLi of subLIs) {
          const yearLink = yearLi.querySelector(':scope > a');
          if (!yearLink) continue;
          model.years.push({
            yearRange: yearLink.textContent.trim(),
            url: yearLink.href
          });
        }
      } else {
        // Submodel level
        for (const subLi of subLIs) {
          const subLink = subLi.querySelector(':scope > a');
          if (!subLink) continue;
          const submodelName = subLink.textContent.trim();
          if (!submodelName) continue;
          
          const submodel = { name: submodelName, years: [] };
          const yearUL = subLi.querySelector(':scope > ul.children');
          if (yearUL) {
            const yearLIs = Array.from(yearUL.children);
            for (const yearLi of yearLIs) {
              const yearLink = yearLi.querySelector(':scope > a');
              if (!yearLink) continue;
              submodel.years.push({
                yearRange: yearLink.textContent.trim(),
                url: yearLink.href
              });
            }
          }
          model.submodels.push(submodel);
        }
      }
      brand.models.push(model);
    }
    result.push(brand);
  }
  return result;
});

console.log(`📊 Found ${categories.length} brands`);
let totalModels = 0, totalYearUrls = 0;
for (const b of categories) {
  totalModels += b.models.length;
  for (const m of b.models) {
    totalYearUrls += m.years.length;
    for (const s of m.submodels) totalYearUrls += s.years.length;
  }
}
console.log(`   ${totalModels} models, ${totalYearUrls} year-URLs to scrape`);

// Save category tree
writeFileSync('/Users/taj/bilglass/data/autoglass-category-tree.json', JSON.stringify(categories, null, 2));
console.log('💾 Saved to data/autoglass-category-tree.json');

await browser.close();
