import { readFileSync, writeFileSync } from 'fs';

const RU_NO_MAP = {
  'правой передней двери': 'høyre forreste dør',
  'левой передней двери': 'venstre forreste dør',
  'правой задней двери': 'høyre bakre dør',
  'левой задней двери': 'venstre bakre dør',
  'правой передней': 'høyre forreste',
  'левой передней': 'venstre forreste',
  'правой задней': 'høyre bakre',
  'левой задней': 'venstre bakre',
  'передней двери': 'forreste dør',
  'задней двери': 'bakre dør',
  'боковой двери': 'sidedør',
  'левой': 'venstre',
  'правой': 'høyre',
  'передней': 'forreste',
  'задней': 'bakre',
  'двери': 'dør',
  'ветрового': 'frontrute',
  'заднего': 'bakre',
  'стекла': 'glass',
  'бокового': 'side',
  'переднего': 'forreste',
};

const russianRegex = /[А-Яа-яЁё]/g;

function cleanRussian(text) {
  if (!text) return text;
  // Sort by longest first
  const entries = Object.entries(RU_NO_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [ru, no] of entries) {
    text = text.split(ru).join(no);
  }
  // Remove remaining Cyrillic
  text = text.replace(russianRegex, '');
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();
  return text;
}

// Load catalog
console.log('Loading catalog-prod.json...');
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records || catalog;

let cleanedCount = 0;
const beforeAfter = [];

for (const r of records) {
  const fields = ['description', 'model', 'title'];
  let changed = false;
  for (const field of fields) {
    const val = r[field] || '';
    if (russianRegex.test(val)) {
      const cleaned = cleanRussian(val);
      if (cleaned !== val) {
        if (beforeAfter.length < 5) {
          beforeAfter.push({ field, before: val, after: cleaned });
        }
        r[field] = cleaned;
        changed = true;
      }
    }
  }
  if (changed) cleanedCount++;
}

console.log(`Cleaned ${cleanedCount} records`);
console.log('\nExamples:');
for (const ex of beforeAfter) {
  console.log(`  [${ex.field}]`);
  console.log(`    BEFORE: ${ex.before}`);
  console.log(`    AFTER:  ${ex.after}`);
}

// Save cleaned catalog
writeFileSync('data/catalog-prod-cleaned.json', JSON.stringify(catalog, null, 2));
console.log('\nSaved to data/catalog-prod-cleaned.json');

// Generate SQL updates
const sqlLines = [];
for (const r of records) {
  const updates = [];
  for (const field of ['description', 'model']) {
    const val = r[field];
    if (val !== undefined && val !== null) {
      const safe = val.replace(/'/g, "''");
      updates.push(`${field} = '${safe}'`);
    }
  }
  if (updates.length > 0) {
    sqlLines.push(`UPDATE glass_catalog SET ${updates.join(', ')} WHERE eurocode = '${r.eurocode.replace(/'/g, "''")}';`);
  }
}

writeFileSync('data/clean-russian-updates.sql', sqlLines.join('\n'));
console.log(`Generated ${sqlLines.length} SQL update statements`);
console.log('Saved to data/clean-russian-updates.sql');
