#!/usr/bin/env node
/**
 * Explore TecDoc articles_linkages to find direct article→kType mappings.
 * Also scans article_informations for product codes that match our catalog.
 */
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';
import { join } from 'path';
import { writeFile } from 'fs/promises';

const DATA_DIR = join(process.cwd(), 'data', 'tecdoc-import');

async function readTsv(filename, gz = false) {
  const path = join(DATA_DIR, filename);
  const stream = gz
    ? createReadStream(path).pipe(createGunzip())
    : createReadStream(path, 'utf-8');
  const lines = [];
  const rl = createInterface({ input: stream });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    lines.push(line.split('\t'));
  }
  return lines;
}

async function main() {
  console.log('=== Exploring TecDoc Article Linkages ===\n');

  // 1. Analyze linkage types
  console.log('Reading articles_linkages.csv...');
  const linkages = await readTsv('articles_linkages.csv');
  console.log(`  Total linkages: ${linkages.length}`);

  const typeCounts = new Map();
  const type1Samples = [];
  for (const row of linkages) {
    const type = parseInt(row[3], 10);
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (type === 1 && type1Samples.length < 10) {
      type1Samples.push({ articleId: row[0], type, value: row[4] });
    }
  }

  console.log('\nLinkage type distribution:');
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  Type ${type}: ${count}`);
  }

  console.log('\nSample type-1 (vehicle) linkages:');
  for (const s of type1Samples) {
    console.log(`  article_id=${s.articleId} → value=${s.value}`);
  }

  // 2. Check if type-1 values are kTypes (numeric) or something else
  const type1Values = linkages.filter(r => parseInt(r[3], 10) === 1).map(r => r[4]);
  const numericCount = type1Values.filter(v => /^\d+$/.test(v)).length;
  console.log(`\nType-1 values: ${numericCount}/${type1Values.length} are numeric (likely kTypes)`);

  // 3. Scan article_informations for product codes
  console.log('\nScanning article_informations for product codes...');
  const articleCodes = new Map(); // article_id → { oem, ean, etc. }

  const infoFiles = [];
  for (let i = 0; i <= 28; i++) {
    const num = i.toString().padStart(3, '0');
    infoFiles.push(`article_informations.csv.${num}.gz`);
  }

  let scanned = 0;
  for (const file of infoFiles) {
    try {
      const rows = await readTsv(file, true);
      for (const row of rows) {
        const articleId = row[0];
        const articleNo = row[3]?.trim();
        const mfrId = row[4];
        if (articleNo && articleNo.length >= 5) {
          articleCodes.set(articleId, { articleNo, mfrId });
          scanned++;
        }
      }
      if (scanned % 50000 === 0) {
        console.log(`  Scanned ${scanned} articles with codes...`);
      }
    } catch (e) {
      console.log(`  Skipped ${file}: ${e.message}`);
    }
  }

  console.log(`\nTotal articles with codes: ${articleCodes.size}`);

  // 4. Cross-reference: find linkages for articles that have codes
  const matchedLinkages = [];
  for (const row of linkages) {
    const articleId = row[0];
    const type = parseInt(row[3], 10);
    const value = row[4];
    const articleInfo = articleCodes.get(articleId);
    if (articleInfo && type === 1 && /^\d+$/.test(value)) {
      matchedLinkages.push({
        articleId,
        articleNo: articleInfo.articleNo,
        ktype: parseInt(value, 10),
      });
    }
  }

  console.log(`\nArticles with BOTH code AND kType linkage: ${matchedLinkages.length}`);

  // 5. Sample output
  console.log('\nSample matched linkages:');
  for (const m of matchedLinkages.slice(0, 10)) {
    console.log(`  article_no=${m.articleNo} → ktype=${m.ktype}`);
  }

  // Save results
  await writeFile('data/article-ktype-mappings.json', JSON.stringify({
    linkageTypeDistribution: Object.fromEntries(typeCounts),
    matchedLinkages: matchedLinkages.slice(0, 5000), // limit file size
    stats: {
      totalLinkages: linkages.length,
      articlesWithCodes: articleCodes.size,
      matchedLinkages: matchedLinkages.length,
    }
  }, null, 2));

  console.log('\nResults saved to: data/article-ktype-mappings.json');
}

main().catch(e => { console.error(e); process.exit(1); });
