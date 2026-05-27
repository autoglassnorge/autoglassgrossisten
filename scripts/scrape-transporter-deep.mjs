#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, createWriteStream } from 'fs';
import { resolve } from 'path';
import https from 'https';

const EMAIL = 'post@alfadrift.no';
const PASSWORD = 'Viking123';
const TARGET_URL = 'https://auto-glass.no/varer/nettbutikk/autoglass/vw-last/transporter/2003-2015/';
const OUTPUT_DIR = resolve('/Users/taj/bilglass/data/transporter-deep');
mkdirSync(OUTPUT_DIR, { recursive: true });

function download(url, path) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      if (r.statusCode === 301 || r.statusCode === 302) {
        https.get(r.headers.location, (r2) => r2.pipe(createWriteStream(path)).on('finish', res)).on('error', rej);
        return;
      }
      r.pipe(createWriteStream(path)).on('finish', res);
    }).on('error', rej);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  console.log('🔐 Logging in...');
  await page.goto('https://auto-glass.no/min-konto/', { timeout: 30000, waitUntil: 'networkidle' });
  await page.fill('#username', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[name="login"]');
  await page.waitForLoadState('networkidle');
  console.log('✅ Logged in');

  // Navigate to target page with full rendering
  console.log(`🌐 Loading ${TARGET_URL}`);
  await page.goto(TARGET_URL, { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Extract ALL images after JS rendering
  const products = await page.evaluate(() => {
    const items = [];
    const productEls = document.querySelectorAll('li.product, .product');
    for (const el of productEls) {
      const img = el.querySelector('img');
      const titleEl = el.querySelector('.woocommerce-loop-product__title, h2, h3');
      const title = titleEl ? titleEl.innerText.trim() : '';
      const linkEl = el.querySelector('a');
      const link = linkEl ? linkEl.href : '';
      
      // Try multiple image sources
      let imgSrc = null;
      if (img) {
        imgSrc = img.src || img.dataset.src || img.dataset.lazySrc || 
                 img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      }
      
      // Also check for background images
      const bgEl = el.querySelector('.product-image, .inside-wrap, .image-wrapper');
      let bgImage = null;
      if (bgEl) {
        const style = window.getComputedStyle(bgEl);
        bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          bgImage = bgImage.replace(/url\(["']?/, '').replace(/["']?\)/, '');
        }
      }
      
      items.push({ title, imgSrc, bgImage, link, html: el.outerHTML.substring(0, 200) });
    }
    return items;
  });

  console.log(`\n📦 Found ${products.length} products`);
  
  // Save raw data for analysis
  writeFileSync(resolve(OUTPUT_DIR, 'products.json'), JSON.stringify(products, null, 2));

  // Analyze images
  const uniqueImages = new Set();
  for (const p of products) {
    if (p.imgSrc) uniqueImages.add(p.imgSrc);
    if (p.bgImage && p.bgImage !== 'none') uniqueImages.add(p.bgImage);
  }
  
  console.log(`\n🖼️  Unique image URLs: ${uniqueImages.size}`);
  for (const url of uniqueImages) {
    console.log(`  ${url}`);
  }

  // Check a single product page for gallery images
  if (products.length > 0 && products[0].link) {
    console.log(`\n🔍 Checking product page: ${products[0].link}`);
    await page.goto(products[0].link, { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    const galleryImages = await page.evaluate(() => {
      const imgs = [];
      // WooCommerce gallery
      const gallery = document.querySelectorAll('.woocommerce-product-gallery__image img, .flex-active-slide img, .wp-post-image');
      for (const img of gallery) {
        imgs.push({
          src: img.src,
          dataSrc: img.dataset.src,
          dataLarge: img.dataset.large_image,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
      return imgs;
    });
    
    console.log(`  Gallery images found: ${galleryImages.length}`);
    for (const img of galleryImages) {
      console.log(`    ${img.src} (${img.width}x${img.height})`);
    }
    
    writeFileSync(resolve(OUTPUT_DIR, 'gallery.json'), JSON.stringify(galleryImages, null, 2));
  }

  await browser.close();
  console.log(`\n✅ Data saved to ${OUTPUT_DIR}`);
}

main().catch(console.error);
