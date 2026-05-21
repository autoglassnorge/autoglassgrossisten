import { readFileSync, writeFileSync } from 'fs';

const lines = readFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-normalized.ndjson', 'utf-8').trim().split('\n');

// CSV headers
const headers = ['sku', 'title', 'brand', 'model', 'submodel', 'year_start', 'year_end', 'year_range', 'type_code', 'type_code_desc', 'price', 'source_url'];

let csv = headers.join(',') + '\n';

for (const line of lines) {
  const d = JSON.parse(line);
  
  // Escape fields for CSV
  const escape = (s) => {
    if (s === null || s === undefined) return '';
    const str = String(s);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  
  const row = [
    escape(d.sku),
    escape(d.title),
    escape(d.brand),
    escape(d.model),
    escape(d.submodel),
    escape(d.yearStart),
    escape(d.yearEnd),
    escape(d.yearRange),
    escape(d.typeCode),
    escape(d.typeCodeDesc),
    escape(d.price),
    escape(d.sourceUrl),
  ];
  
  csv += row.join(',') + '\n';
}

writeFileSync('/Users/taj/bilglass/data/autoglass-scrape/products-autoglass-no.csv', csv);

// Also create a summary CSV by brand/model
const brandSummary = {};
for (const line of lines) {
  const d = JSON.parse(line);
  const key = `${d.brand}|${d.model || 'N/A'}|${d.typeCode || 'N/A'}`;
  if (!brandSummary[key]) {
    brandSummary[key] = { brand: d.brand, model: d.model || 'N/A', typeCode: d.typeCode || 'N/A', count: 0, skus: new Set() };
  }
  brandSummary[key].count++;
  brandSummary[key].skus.add(d.sku);
}

let summaryCsv = 'brand,model,type_code,product_count,unique_skus\n';
for (const [key, data] of Object.entries(brandSummary).sort((a,b) => b[1].count - a[1].count)) {
  summaryCsv += `${data.brand},${data.model},${data.typeCode},${data.count},${data.skus.size}\n`;
}

writeFileSync('/Users/taj/bilglass/data/autoglass-scrape/summary-by-brand-model.csv', summaryCsv);

console.log('✅ CSV files created:');
console.log(`  products-autoglass-no.csv         (${lines.length} rows, ${(csv.length/1024/1024).toFixed(1)} MB)`);
console.log(`  summary-by-brand-model.csv        (${Object.keys(brandSummary).length} rows)`);
