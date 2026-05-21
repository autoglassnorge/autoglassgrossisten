#!/usr/bin/env node
/**
 * Login to auto-glass.no via Playwright and save cookies.
 * Run this manually when cookies expire (every ~3 months).
 *
 * Usage:
 *   node scripts/login-autoglass.mjs
 *   node scripts/login-autoglass.mjs --output=./data/autoglass-scrape/cookies.json
 */
import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const EMAIL = process.env.AUTO_GLASS_EMAIL || 'post@alfadrift.no';
const PASSWORD = process.env.AUTO_GLASS_PASSWORD || 'Viking123';
const BASE_URL = 'https://auto-glass.no';
const DEFAULT_OUTPUT = resolve('/Users/taj/bilglass/data/autoglass-scrape/cookies.json');

const args = process.argv.slice(2);
const outputArg = args.find(a => a.startsWith('--output='));
const OUTPUT_FILE = outputArg ? resolve(outputArg.split('=')[1]) : DEFAULT_OUTPUT;

async function main() {
  console.log('🔐 Logging in to auto-glass.no...');
  console.log(`   Email: ${EMAIL}`);
  console.log(`   Output: ${OUTPUT_FILE}`);

  const dir = dirname(OUTPUT_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto(`${BASE_URL}/min-konto/`, { waitUntil: 'networkidle', timeout: 30000 });

    // Fill login form
    await page.fill('input[name="username"], input[type="email"], #username', EMAIL);
    await page.fill('input[name="password"], input[type="password"], #password', PASSWORD);

    // Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"], .woocommerce-form-login__submit'),
    ]);

    // Check if login succeeded
    const currentUrl = page.url();
    if (currentUrl.includes('min-konto') || currentUrl.includes('my-account')) {
      console.log('✅ Login successful');
    } else {
      console.warn('⚠️  Unexpected redirect:', currentUrl);
    }

    // Visit a protected page to ensure cookies work
    await page.goto(`${BASE_URL}/varer/nettbutikk/autoglass/bmw/3-serie/`, { waitUntil: 'networkidle', timeout: 30000 });
    const products = await page.locator('.product').count();
    console.log(`   Products visible: ${products}`);

    if (products === 0) {
      console.warn('⚠️  No products visible — login may have failed');
    }

    // Save cookies
    const cookies = await context.cookies();
    writeFileSync(OUTPUT_FILE, JSON.stringify(cookies, null, 2));
    console.log(`💾 Cookies saved to ${OUTPUT_FILE}`);
    console.log(`   ${cookies.length} cookies, expires: ${new Date(cookies.find(c => c.name.includes('wordpress_sec'))?.expires * 1000 || Date.now()).toISOString()}`);

  } catch (e) {
    console.error('❌ Login failed:', e.message);
    await page.screenshot({ path: resolve(dir, 'login-error.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
