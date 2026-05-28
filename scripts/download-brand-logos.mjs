#!/usr/bin/env node
/**
 * Build brand logos from Simple Icons + existing Wikimedia SVGs
 * Usage: node scripts/download-brand-logos.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as si from 'simple-icons';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'frontend', 'public', 'brands');
const BRANDS_JSON = path.join(ROOT, 'frontend', 'public', 'browse', 'brands.json');
const MAP_FILE = path.join(OUTPUT_DIR, 'brand-logo-map.json');

// Map brand names (from brands.json) → Simple Icons key
// Try exact match, then normalized match
function findSimpleIcon(brandName) {
  const keys = Object.keys(si);
  const normalized = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  // Direct match
  const direct = keys.find(k => k.toLowerCase().replace(/^si/, '') === normalized);
  if (direct) return si[direct];

  // Try without "trucks", parenthesized text, etc.
  const base = brandName
    .replace(/\s+TRUCKS$/i, '')
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\s*\/\s*.*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const baseMatch = keys.find(k => k.toLowerCase().replace(/^si/, '') === base);
  if (baseMatch) return si[baseMatch];

  // Special cases
  const specials = {
    'vw': 'volkswagen',
    'vw trucks': 'volkswagen',
    'mercedes': 'mercedes', // not in simple-icons
    'mercedes trucks': 'mercedes',
    'cupra': 'seatcupra',
    'landrover': 'landrover',
    'jaguar': 'jaguar',
    'lexus': 'lexus',
    'byd': 'byd',
    'nio': 'nio',
    'xpeng': 'xpeng',
    'zeekr': 'zeekr',
    'voyah': 'voyah',
    'hongqi': 'hongqi',
    'ineos': 'ineos',
    'fisker': 'fisker',
    'lancia': 'lancia',
    'lotus': 'lotus',
    'saab': 'saab',
    'rover': 'rover',
    'lincoln': 'lincoln',
    'genesis': 'genesis',
    'dodge': 'dodge',
    'gmc': 'gmc',
    'buick': 'buick',
    'daewoo': 'daewoo',
    'daihatsu': 'daihatsu',
    'jac motors': 'jac',
    'isuzu': 'isuzu',
    'ssangyong': 'ssangyong',
    'think': 'think',
    'kewet': null,
    'motorhomes': null,
    'usa cars': null,
    'veteran cars (not usa)': null,
  };

  const specialKey = specials[normalized];
  if (specialKey === null) return null;
  if (specialKey) {
    const match = keys.find(k => k.toLowerCase().replace(/^si/, '') === specialKey);
    if (match) return si[match];
  }

  return null;
}

function normalizeForFile(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  console.log('=== Brand Logo Builder (Simple Icons + Wikimedia) ===\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const brandsData = JSON.parse(await fs.readFile(BRANDS_JSON, 'utf8'));
  const brands = brandsData.brands || [];

  // Get existing files
  const existingFiles = new Set(await fs.readdir(OUTPUT_DIR));

  const logoMap = {};
  const results = { simpleIcons: 0, wikimedia: 0, failed: 0, skipped: 0 };

  for (const brand of brands) {
    const fileBase = normalizeForFile(brand.name);

    // Check if already have SVG from Wikimedia
    const svgName = `${fileBase}.svg`;
    const pngName = `${fileBase}.png`;
    if (existingFiles.has(svgName)) {
      console.log(`✅ WIKIMEDIA: ${brand.name}`);
      logoMap[brand.name] = svgName;
      results.wikimedia++;
      continue;
    }
    if (existingFiles.has(pngName)) {
      console.log(`✅ WIKIMEDIA (PNG): ${brand.name}`);
      logoMap[brand.name] = pngName;
      results.wikimedia++;
      continue;
    }

    // Try Simple Icons
    const icon = findSimpleIcon(brand.name);
    if (icon) {
      const svgContent = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>${icon.title}</title><path d="${icon.path}"/></svg>`;
      await fs.writeFile(path.join(OUTPUT_DIR, svgName), svgContent);
      console.log(`✅ SIMPLE ICONS: ${brand.name} → ${icon.title}`);
      logoMap[brand.name] = svgName;
      results.simpleIcons++;
      continue;
    }

    // Skip categories
    if (['MOTORHOMES', 'USA CARS', 'VETERAN CARS (NOT USA)'].includes(brand.name)) {
      console.log(`⏭️  SKIP: ${brand.name}`);
      results.skipped++;
      continue;
    }

    console.log(`❌ MISSING: ${brand.name}`);
    results.failed++;
  }

  await fs.writeFile(MAP_FILE, JSON.stringify(logoMap, null, 2));

  console.log('\n=== Results ===');
  console.log(`Simple Icons: ${results.simpleIcons}`);
  console.log(`Wikimedia:    ${results.wikimedia}`);
  console.log(`Skipped:      ${results.skipped}`);
  console.log(`Missing:      ${results.failed}`);
  console.log(`\nTotal logos: ${Object.keys(logoMap).length}/${brands.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
