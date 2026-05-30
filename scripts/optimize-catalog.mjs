#!/usr/bin/env node
/**
 * @fileoverview Catalog Optimizer - Strips unnecessary fields and compresses
 * Task 3 of Token Optimization Project
 * 
 * Input: data/catalog-prod.json
 * Output: data/catalog-prod.min.json + data/catalog-prod.min.json.gz
 */

import { readFile, writeFile } from 'fs/promises';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { resolve } from 'path';

const FIELDS_TO_KEEP = [
  'id',
  'eurocode',
  'article_number',
  'category',
  'brand',
  'model',
  'year_from',
  'year_to',
  'type_code',
  'price',
  'description',
  'supplier_sku'
];

const FIELDS_TO_REMOVE = [
  'source_url',
  'source',
  'created_at',
  'submodel',
  'type_description',
  'supplier'
];

const INPUT_FILE = 'data/catalog-prod.json';
const OUTPUT_FILE = 'data/catalog-prod.min.json';
const GZIP_FILE = 'data/catalog-prod.min.json.gz';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function optimizeCatalog() {
  const startTime = Date.now();
  console.log('🔧 Catalog Optimizer v1.0\n');

  // Read input
  console.log(`📖 Reading ${INPUT_FILE}...`);
  const rawData = await readFile(INPUT_FILE, 'utf8');
  const originalSize = Buffer.byteLength(rawData, 'utf8');
  console.log(`   Original size: ${formatBytes(originalSize)}\n`);

  // Parse
  console.log('📊 Parsing catalog...');
  const catalog = JSON.parse(rawData);
  const { meta, records } = catalog;
  console.log(`   Records: ${records.length.toLocaleString()}`);
  console.log(`   Categories: ${Object.keys(meta.categories || {}).join(', ')}\n`);

  // Optimize records - strip unnecessary fields
  console.log('✂️  Stripping fields...');
  console.log(`   Keeping: ${FIELDS_TO_KEEP.join(', ')}`);
  console.log(`   Removing: ${FIELDS_TO_REMOVE.join(', ')}\n`);

  const optimizedRecords = records.map(record => {
    const optimized = {};
    for (const field of FIELDS_TO_KEEP) {
      if (field in record) {
        optimized[field] = record[field];
      }
    }
    return optimized;
  });

  // Build optimized catalog with enhanced metadata
  const optimizedCatalog = {
    meta: {
      ...meta,
      optimized: true,
      optimizedAt: new Date().toISOString(),
      keptFields: FIELDS_TO_KEEP,
      removedFields: FIELDS_TO_REMOVE,
      originalSize: originalSize
    },
    records: optimizedRecords
  };

  // Write minified JSON (no pretty printing)
  console.log('💾 Writing optimized catalog...');
  const outputJson = JSON.stringify(optimizedCatalog);
  await writeFile(OUTPUT_FILE, outputJson, 'utf8');
  const optimizedSize = Buffer.byteLength(outputJson, 'utf8');
  console.log(`   Written: ${OUTPUT_FILE}`);
  console.log(`   Size: ${formatBytes(optimizedSize)}\n`);

  // Create gzip version
  console.log('🗜️  Creating gzip archive...');
  await pipeline(
    createReadStream(resolve(OUTPUT_FILE)),
    createGzip({ level: 9 }),
    createWriteStream(resolve(GZIP_FILE))
  );
  
  const gzipStats = await readFile(GZIP_FILE).then(b => b.length);
  console.log(`   Written: ${GZIP_FILE}`);
  console.log(`   Size: ${formatBytes(gzipStats)}\n`);

  // Report
  const jsonReduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
  const gzipReduction = ((originalSize - gzipStats) / originalSize * 100).toFixed(1);
  const duration = Date.now() - startTime;

  console.log('📈 Optimization Results:');
  console.log('   ╔══════════════════════════════════════════════════════╗');
  console.log(`   ║  Original:      ${formatBytes(originalSize).padEnd(38)} ║`);
  console.log(`   ║  Optimized:     ${formatBytes(optimizedSize).padEnd(38)} ║`);
  console.log(`   ║  Gzipped:       ${formatBytes(gzipStats).padEnd(38)} ║`);
  console.log('   ╠══════════════════════════════════════════════════════╣');
  console.log(`   ║  JSON reduction:  ${jsonReduction.padStart(5)}%${''.repeat(27)} ║`);
  console.log(`   ║  Gzip reduction:  ${gzipReduction.padStart(5)}%${''.repeat(27)} ║`);
  console.log('   ╚══════════════════════════════════════════════════════╝');
  console.log(`\n⏱️  Completed in ${duration}ms`);

  // Return stats for validation
  return {
    originalSize,
    optimizedSize,
    gzipSize: gzipStats,
    recordCount: records.length,
    jsonReduction: parseFloat(jsonReduction),
    gzipReduction: parseFloat(gzipReduction)
  };
}

optimizeCatalog()
  .then(stats => {
    // Write stats for validation script
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Optimization failed:', err.message);
    process.exit(1);
  });
