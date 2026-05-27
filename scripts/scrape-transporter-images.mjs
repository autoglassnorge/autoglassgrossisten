#!/usr/bin/env node
/**
 * Scrape VW Transporter images from auto-glass.no
 * Logs in, navigates to the page, extracts product images with eurocodes
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, createWriteStream } from 'fs';
import { resolve } from 'path';
import https from 'https';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const TARGET_URL = 'https://auto-glass.no/varer/nettbutikk/autoglass/vw-last/transporter/2003-2015/';
const OUTPUT_DIR = resolve('/Users/taj/bilglass/data/transporter-images');
const IMAGE_MAP_FILE = resolve('/Users/taj/bilglass/data/transporter-image-map.json');

mkdirSync(OUTPUT_DIR, { recursive: true });

function downloadImage(url, filepath) {
  return new Promise((res, rej) => {
    const file = createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (r2) => {
          r2.pipe(file);
          file.on('finish', () => { file.close(); res(); });
        }).on('error', rej);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); res(); });
    }).on('error', rej);
  });
}

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  console.log('🔐 Logging in...');
  await page.goto('https://auto-glass.no/min-konto/', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('domcontentloaded');

  // Verify login
  try {
    await page.waitForSelector('a[href*="logout"]', { timeout: 15000 });
    console.log('✅ Login successful');
  } catch (e) {
    console.log('⚠️  Could not verify login, continuing anyway...');
  }

  // Navigate to target page
  console.log(`🌐 Navigating to ${TARGET_URL}`);
  await page.goto(TARGET_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000); // Let images load

  // Extract products with images
  console.log('📸 Extracting product images...');
  const products = await page.evaluate(() => {
    const items = [];
    // Try multiple WooCommerce selectors
    const productElements = document.querySelectorAll('.product, .woocommerce-loop-product__link, .product-type-simple, li.product');
    
    for (const el of productElements) {
      // Try to find image
      const img = el.querySelector('img');
      const imgSrc = img ? img.src || img.dataset.src || img.dataset.lazySrc : null;
      
      // Try to find title/description
      const titleEl = el.querySelector('.woocommerce-loop-product__title, .product-title, h2, h3');
      const title = titleEl ? titleEl.textContent.trim() : '';
      
      // Try to find SKU/eurocode
      const skuEl = el.querySelector('.sku, .product-sku, [data-product_id]');
      const sku = skuEl ? (skuEl.dataset.product_id || skuEl.textContent.trim()) : '';
      
      // Try to find price
      const priceEl = el.querySelector('.price, .woocommerce-Price-amount');
      const price = priceEl ? priceEl.textContent.trim() : '';
      
      if (imgSrc && title) {
        items.push({ title, sku, price, imgSrc });
      }
    }
    return items;
  });

  console.log(`📦 Found ${products.length} products with images`);

  if (products.length === 0) {
    // Try alternative approach - get all images on page
    console.log('⚠️  No products found with standard selectors, trying fallback...');
    const allImages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })).filter(img => img.src && img.src.includes('wp-content') && img.width > 100);
    });
    console.log(`Found ${allImages.length} content images`);
    for (const img of allImages.slice(0, 10)) {
      console.log(`  ${img.src} (${img.width}x${img.height}) alt="${img.alt}"`);
    }
  }

  // Download images
  const imageMap = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const filename = `transporter_${String(i + 1).padStart(3, '0')}.jpg`;
    const filepath = resolve(OUTPUT_DIR, filename);
    
    try {
      console.log(`⬇️  Downloading: ${p.title.substring(0, 50)}...`);
      await downloadImage(p.imgSrc, filepath);
      imageMap.push({
        title: p.title,
        sku: p.sku,
        price: p.price,
        originalUrl: p.imgSrc,
        localPath: filepath,
        filename,
      });
    } catch (e) {
      console.log(`  ❌ Failed: ${e.message}`);
    }
  }

  writeFileSync(IMAGE_MAP_FILE, JSON.stringify(imageMap, null, 2));
  console.log(`\n✅ Done! Downloaded ${imageMap.length} images to ${OUTPUT_DIR}`);
  console.log(`📝 Image map saved to ${IMAGE_MAP_FILE}`);

  await browser.close();
}

main().catch(console.error);
