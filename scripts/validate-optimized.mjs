#!/usr/bin/env node
/**
 * @fileoverview Validate Optimized Catalog
 * Task 3 of Token Optimization Project
 * 
 * Compares original vs optimized catalog for integrity
 */

import { readFile } from 'fs/promises';

const ORIGINAL_FILE = 'data/catalog-prod.json';
const OPTIMIZED_FILE = 'data/catalog-prod.min.json';
const GZIP_FILE = 'data/catalog-prod.min.json.gz';

const CRITICAL_FIELDS = ['eurocode', 'brand', 'model', 'price'];
const MIN_REDUCTION_PERCENT = 20;

let exitCode = 0;

function error(msg) {
  console.error(`   ❌ ${msg}`);
  exitCode = 1;
}

function success(msg) {
  console.log(`   ✅ ${msg}`);
}

function warn(msg) {
  console.log(`   ⚠️  ${msg}`);
}

async function validate() {
  console.log('🔍 Validating Optimized Catalog\n');

  // Check files exist
  try {
    await readFile(ORIGINAL_FILE);
    success(`Original file exists: ${ORIGINAL_FILE}`);
  } catch (e) {
    error(`Original file missing: ${ORIGINAL_FILE}`);
    process.exit(1);
  }

  try {
    await readFile(OPTIMIZED_FILE);
    success(`Optimized file exists: ${OPTIMIZED_FILE}`);
  } catch (e) {
    error(`Optimized file missing: ${OPTIMIZED_FILE}`);
    process.exit(1);
  }

  try {
    await readFile(GZIP_FILE);
    success(`Gzip file exists: ${GZIP_FILE}`);
  } catch (e) {
    error(`Gzip file missing: ${GZIP_FILE}`);
  }

  console.log('');

  // Parse catalogs
  let original, optimized;
  try {
    original = JSON.parse(await readFile(ORIGINAL_FILE, 'utf8'));
    success('Original catalog parses successfully');
  } catch (e) {
    error(`Original catalog parse failed: ${e.message}`);
    process.exit(1);
  }

  try {
    optimized = JSON.parse(await readFile(OPTIMIZED_FILE, 'utf8'));
    success('Optimized catalog parses successfully');
  } catch (e) {
    error(`Optimized catalog parse failed: ${e.message}`);
    process.exit(1);
  }

  console.log('');

  // Record count check
  const origCount = original.records.length;
  const optCount = optimized.records.length;
  
  if (origCount === optCount) {
    success(`Record count matches: ${origCount.toLocaleString()}`);
  } else {
    error(`Record count mismatch! Original: ${origCount}, Optimized: ${optCount}`);
  }

  console.log('');

  // Critical fields check
  console.log('🔐 Checking critical fields preserved...');
  const sample = optimized.records.slice(0, 100);
  let allFieldsPresent = true;
  
  for (const field of CRITICAL_FIELDS) {
    const present = sample.every(r => field in r);
    if (present) {
      success(`Field '${field}' present in all sampled records`);
    } else {
      error(`Field '${field}' missing in some records`);
      allFieldsPresent = false;
    }
  }

  // Check that removed fields are actually gone
  console.log('\n🧹 Checking removed fields are absent...');
  const removedFields = optimized.meta?.removedFields || [];
  let allRemoved = true;
  
  for (const field of removedFields) {
    const absent = sample.every(r => !(field in r));
    if (absent) {
      success(`Field '${field}' successfully removed`);
    } else {
      warn(`Field '${field}' still present in some records`);
      allRemoved = false;
    }
  }

  console.log('');

  // Size reduction check
  const origSize = JSON.stringify(original).length;
  const optSize = JSON.stringify(optimized).length;
  const reduction = ((origSize - optSize) / origSize * 100).toFixed(1);
  
  console.log('📊 Size Analysis:');
  console.log(`   Original:  ${origSize.toLocaleString()} bytes`);
  console.log(`   Optimized: ${optSize.toLocaleString()} bytes`);
  console.log(`   Reduction: ${reduction}%`);
  
  if (parseFloat(reduction) >= MIN_REDUCTION_PERCENT) {
    success(`Size reduction meets minimum ${MIN_REDUCTION_PERCENT}% threshold`);
  } else {
    error(`Size reduction ${reduction}% below minimum ${MIN_REDUCTION_PERCENT}%`);
  }

  // Metadata check
  console.log('\n📝 Checking metadata...');
  if (optimized.meta?.optimized) {
    success('Metadata flag "optimized" is true');
  } else {
    error('Metadata missing "optimized" flag');
  }

  if (optimized.meta?.optimizedAt) {
    success(`Optimized at: ${optimized.meta.optimizedAt}`);
  } else {
    error('Metadata missing "optimizedAt" timestamp');
  }

  if (optimized.meta?.keptFields?.length > 0) {
    success(`Tracked ${optimized.meta.keptFields.length} kept fields`);
  } else {
    error('Metadata missing "keptFields"');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (exitCode === 0) {
    console.log('🎉 All validations passed!');
    console.log(`   Records: ${optCount.toLocaleString()}`);
    console.log(`   Size reduction: ${reduction}%`);
    console.log(`   Output: ${OPTIMIZED_FILE}`);
    console.log(`   Gzipped: ${GZIP_FILE}`);
  } else {
    console.log('❌ Validation failed - see errors above');
  }
  console.log('='.repeat(50));

  process.exit(exitCode);
}

validate().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
