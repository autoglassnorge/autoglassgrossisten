#!/usr/bin/env node
/**
 * Probe auto-glass.no product pages for eurocode presence.
 * Checks multiple locations: HTML content, meta tags, structured data, tables.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const COOKIES = JSON.parse(readFileSync('data/autoglass-scrape/cookies.json', 'utf-8'));

// Sample SKUs from different categories
const SKUS = [
  '1276BZ',    // Fiat Panda
  '10025C',    // Fiat Panda (older)
  '1299GGENC', // Volvo
  '6542AGSMVZ1B', // PEUGEOT 307 (eurocode as SKU?)
  'DW01AGNCMV',   // BMW (eurocode as SKU?)
];

async function probe() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(COOKIES);

  console.log('🔍 Probing auto-glass.no product pages for eurocodes...\n');

  for (const sku of SKUS) {
    const page = await context.newPage();
    const url = `https://auto-glass.no/vare/${sku.toLowerCase()}/`;
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const html = await page.content();
      const title = await page.title().catch(() => 'unknown');

      console.log(`\n${'='.repeat(60)}`);
      console.log(`SKU: ${sku}`);
      console.log(`URL: ${url}`);
      console.log(`Title: ${title}`);

      // Check 1: Direct eurocode regex in HTML
      const eurocodeMatches = [...html.matchAll(/\b(\d{4}[A-Z]{4,}[A-Z0-9]*)\b/g)];
      const uniqueEurocodes = [...new Set(eurocodeMatches.map(m => m[1]))].slice(0, 20);
      console.log(`\n📋 Regex matches (\d{4}[A-Z]{4,}): ${uniqueEurocodes.length}`);
      console.log('   Sample:', uniqueEurocodes.slice(0, 10));

      // Check 2: Look for "eurokode" or "eurocode" text nearby
      const euroContext = [...html.matchAll(/(eurokode|eurocode|euro)[\s:]*([A-Z0-9]{6,})/gi)];
      console.log(`\n📋 Context matches (eurokode near code): ${euroContext.length}`);
      euroContext.slice(0, 5).forEach(m => console.log('   ', m[0]));

      // Check 3: Meta description
      const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => null);
      console.log(`\n📋 Meta description: ${metaDesc ? metaDesc.substring(0, 100) + '...' : 'none'}`);

      // Check 4: JSON-LD structured data
      const jsonLd = await page.$$eval('script[type="application/ld+json"]', scripts =>
        scripts.map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).filter(Boolean)
      );
      console.log(`\n📋 JSON-LD entries: ${jsonLd.length}`);
      jsonLd.forEach((data, i) => {
        const skuField = data.sku || data.mpn || data.gtin || data.identifier;
        if (skuField) console.log(`   [${i}] SKU/MPN: ${skuField}`);
      });

      // Check 5: Product meta table (WooCommerce)
      const metaRows = await page.$$eval('.woocommerce-product-attributes tr, .product-meta tr', rows =>
        rows.map(r => {
          const label = r.querySelector('th, td:first-child')?.textContent?.trim();
          const value = r.querySelector('td:last-child')?.textContent?.trim();
          return { label, value };
        }).filter(r => r.label)
      );
      console.log(`\n📋 Product meta rows: ${metaRows.length}`);
      metaRows.forEach(r => console.log(`   ${r.label}: ${r.value}`));

      // Check 6: Check if the SKU itself IS the eurocode
      const isEurocodeFormat = /^\d{4}[A-Z]{4,}[A-Z0-9]*$/.test(sku);
      console.log(`\n📋 SKU matches eurocode format: ${isEurocodeFormat}`);

    } catch (e) {
      console.log(`\n❌ Error for ${sku}: ${e.message}`);
    }

    await page.close();
  }

  await browser.close();
  console.log('\n\n✅ Probe complete');
}

probe().catch(console.error);
