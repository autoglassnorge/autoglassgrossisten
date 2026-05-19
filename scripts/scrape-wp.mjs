#!/usr/bin/env node
/**
 * Scrape WordPress REST API from auto-glass.no
 * Saves pages, posts, and media as JSON
 */

const WP_BASE = 'https://auto-glass.no';
const OUT_DIR = './data/wp-scrape';

async function fetchJson(path) {
  const url = `${WP_BASE}${path}`;
  console.log(`  → ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function writeJson(filename, data) {
  const fs = await import('fs');
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename}`);
}

// ── PAGES ──
console.log('\n📄 Scraper pages...');
const pages = await fetchJson('/wp-json/wp/v2/pages?per_page=100');
await writeJson(`${OUT_DIR}/pages.json`, pages);
for (const p of pages) {
  await writeJson(`${OUT_DIR}/pages/page-${p.id}.json`, p);
}
console.log(`  📊 ${pages.length} pages`);

// ── POSTS ──
console.log('\n📝 Scraper posts...');
const posts = await fetchJson('/wp-json/wp/v2/posts?per_page=100');
await writeJson(`${OUT_DIR}/posts.json`, posts);
for (const p of posts) {
  await writeJson(`${OUT_DIR}/posts/post-${p.id}.json`, p);
}
console.log(`  📊 ${posts.length} posts`);

// ── MEDIA ──
console.log('\n🖼️  Scraper media...');
try {
  const media = await fetchJson('/wp-json/wp/v2/media?per_page=100');
  await writeJson(`${OUT_DIR}/media.json`, media);
  console.log(`  📊 ${media.length} media items`);
} catch (e) {
  console.log(`  ⚠️  Media scrape failed: ${e.message}`);
}

// ── USERS ──
console.log('\n👤 Scraper users...');
try {
  const users = await fetchJson('/wp-json/wp/v2/users?per_page=100');
  await writeJson(`${OUT_DIR}/users.json`, users);
  console.log(`  📊 ${users.length} users`);
} catch (e) {
  console.log(`  ⚠️  Users scrape failed: ${e.message}`);
}

// ── WOO PRODUCTS (fallback) ──
console.log('\n🛒 Sjekker WooCommerce...');
try {
  const products = await fetchJson('/wp-json/wc/v3/products?per_page=1');
  await writeJson(`${OUT_DIR}/products.json`, products);
  console.log(`  📊 ${products.length} products (sample)`);
} catch (e) {
  console.log(`  ⚠️  WooCommerce API krever auth: ${e.message}`);
}

console.log('\n✅ Scrape ferdig! Data lagret i', OUT_DIR);
