import { readFileSync, writeFileSync } from 'fs';

// Fields to enrich from Pilkington
const ENRICH_FIELDS = [
  'imageUrl', 'pdfUrl', 'adas', 'rainSensor', 'heated', 'acoustic',
  'antenna', 'hud', 'shade', 'camera', 'laneAssist', 'oemNumbers',
  'crossReferences', 'weight', 'dimensions', 'prefix4', 'supplier',
  'warehouseLocation', 'nagsCodes', 'stockStatus'
];

console.log('Loading Pilkington catalog...');
const pilkington = JSON.parse(readFileSync('data/catalog-prod-enriched.json', 'utf-8'));
const pilkRecords = pilkington.records || pilkington;

// Build eurocode -> Pilkington data map
const pilkMap = new Map();
for (const r of pilkRecords) {
  const ec = r.eurocode?.toUpperCase();
  if (ec) {
    pilkMap.set(ec, r);
  }
}
console.log(`Pilkington records: ${pilkRecords.length}`);
console.log(`Unique eurocodes: ${pilkMap.size}`);

console.log('\nLoading auto-glass catalog...');
const agCatalog = JSON.parse(readFileSync('data/catalog-autoglass-no.json', 'utf-8'));
const agRecords = agCatalog.records;

let enriched = 0;
let notFound = 0;
const enrichStats = {};

for (const r of agRecords) {
  const ec = r.eurocode?.toUpperCase();
  const pilk = pilkMap.get(ec);
  
  if (pilk) {
    enriched++;
    for (const field of ENRICH_FIELDS) {
      const val = pilk[field];
      if (val !== undefined && val !== null) {
        // Don't overwrite if auto-glass already has a value (except imageUrl)
        if (field === 'imageUrl' || r[field] === undefined || r[field] === null) {
          r[field] = val;
          enrichStats[field] = (enrichStats[field] || 0) + 1;
        }
      }
    }
  } else {
    notFound++;
  }
}

console.log(`\nEnrichment results:`);
console.log(`  Matched with Pilkington: ${enriched}`);
console.log(`  Not found in Pilkington: ${notFound}`);
console.log(`\nFields enriched:`);
for (const [field, count] of Object.entries(enrichStats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${field}: ${count}`);
}

// Save enriched catalog
writeFileSync('data/catalog-autoglass-enriched.json', JSON.stringify({records: agRecords, meta: {source: 'auto-glass.no + Pilkington', count: agRecords.length, generatedAt: new Date().toISOString()}}, null, 2));
console.log('\nSaved to data/catalog-autoglass-enriched.json');
