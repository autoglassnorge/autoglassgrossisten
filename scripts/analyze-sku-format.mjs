import { readFileSync } from 'fs';

const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson', 'utf-8').trim().split('\n');

const skus = new Set();
for (const line of lines) {
  const d = JSON.parse(line);
  if (d.sku) skus.add(d.sku);
}

const patterns = {
  '4digits+2letters': 0,
  '5digits+2letters': 0,
  '3letters+4digits': 0,
  '2letters+4digits+1letter': 0,
  'other': 0,
};

const letterSuffixes = {};

for (const sku of skus) {
  const clean = sku.trim().toUpperCase();
  
  if (/^\d{4}[A-Z]{2}$/.test(clean)) {
    patterns['4digits+2letters']++;
    const suffix = clean.slice(-2);
    letterSuffixes[suffix] = (letterSuffixes[suffix] || 0) + 1;
  } else if (/^\d{5}[A-Z]{2}$/.test(clean)) {
    patterns['5digits+2letters']++;
    const suffix = clean.slice(-2);
    letterSuffixes[suffix] = (letterSuffixes[suffix] || 0) + 1;
  } else if (/^[A-Z]{3}\d{4}$/.test(clean)) {
    patterns['3letters+4digits']++;
  } else if (/^[A-Z]{2}\d{4}[A-Z]$/.test(clean)) {
    patterns['2letters+4digits+1letter']++;
  } else {
    patterns['other']++;
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SKU FORMAT ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total unique SKUs: ${skus.size}`);
console.log();
console.log('Format breakdown:');
for (const [fmt, count] of Object.entries(patterns).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${fmt.padEnd(25)} ${count.toLocaleString().padStart(6)} (${(count/skus.size*100).toFixed(1)}%)`);
}
console.log();
console.log('Top letter suffixes (likely supplier codes):');
const sortedSuffixes = Object.entries(letterSuffixes).sort((a,b) => b[1]-a[1]);
for (const [suffix, count] of sortedSuffixes.slice(0, 20)) {
  console.log(`  ${suffix}: ${count.toLocaleString().padStart(5)} SKUs`);
}
console.log();
console.log('Sample "other" formats:');
const others = [...skus].filter(s => {
  const c = s.trim().toUpperCase();
  return !/^\d{4,5}[A-Z]{2}$/.test(c) && !/^[A-Z]{3}\d{4}$/.test(c) && !/^[A-Z]{2}\d{4}[A-Z]$/.test(c);
});
for (const s of others.slice(0, 20)) {
  console.log(`  ${s}`);
}
console.log('═══════════════════════════════════════════════════════════════');
