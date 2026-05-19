#!/usr/bin/env node
/**
 * Download all WordPress media files from scraped JSON
 */

import fs from 'fs';
import path from 'path';

const MEDIA_JSON = './data/wp-scrape/media.json';
const OUT_DIR = './data/wp-scrape/media-files';

const media = JSON.parse(fs.readFileSync(MEDIA_JSON, 'utf-8'));
console.log(`📥 Laster ned ${media.length} media-filer...\n`);

fs.mkdirSync(OUT_DIR, { recursive: true });

let success = 0;
let failed = 0;

for (const item of media) {
  const url = item.source_url;
  if (!url) continue;

  const filename = path.basename(new URL(url).pathname);
  const outPath = path.join(OUT_DIR, filename);

  // Skip if already downloaded
  if (fs.existsSync(outPath)) {
    success++;
    continue;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    success++;
    process.stdout.write(`  ✓ ${filename}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`  ✗ ${filename}: ${e.message}\n`);
  }
}

console.log(`\n✅ Ferdig! ${success} OK, ${failed} feilet. Lagret i ${OUT_DIR}`);
