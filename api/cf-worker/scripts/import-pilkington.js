/**
 * Import script: Parse generated-inserts.sql and produce D1-compatible SQL
 * for Pilkington glass catalog import.
 *
 * Usage:
 *   node scripts/import-pilkington.js
 *   # Then run the generated SQL via wrangler:
 *   npx wrangler d1 execute glass-catalog-db --remote --file=migrations/0022_pilkington_data.sql
 *
 * Features:
 *   - Strips DELETE FROM glass_catalog (never deletes existing data)
 *   - Normalizes brand names to match existing catalog conventions
 *   - Converts INSERT → INSERT OR IGNORE with duplicate handling
 *   - Batches remain ~100 rows (D1 limit)
 *   - Writes detailed statistics to stdout
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Brand normalization (inline copy from src/lib/brand.ts to avoid TS import)
// ---------------------------------------------------------------------------
const BRAND_MAP = {
  VOLKSWAGEN: 'VW',
  'VW TRUCKS': 'VW',
  'MERCEDES-BENZ': 'MERCEDES',
  'MERCEDES BENZ': 'MERCEDES',
  'MERCEDES-AMG': 'MERCEDES',
  'MERCEDES AMG': 'MERCEDES',
  'LAND ROVER': 'LANDROVER',
  'ROLLS ROYCE': 'ROLLS ROYCE',
  VAUXHALL: 'OPEL',
  'VAUXHALL/OPEL': 'OPEL',
  'OPEL/VAUXHALL': 'OPEL',
  CITROËN: 'CITROEN',
  DS: 'CITROEN',
  ALFA: 'ALFA ROMEO',
  ABARTH: 'FIAT',
  'LAMBORGH.': 'LAMBORGHINI',
  'MITS.': 'MITSUBISHI',
  MITS: 'MITSUBISHI',
  NISS: 'NISSAN',
  NISSA: 'NISSAN',
  HON: 'HONDA',
  TOY: 'TOYOTA',
  TOYOT: 'TOYOTA',
  REN: 'RENAULT',
  'REN.': 'RENAULT',
  RENAU: 'RENAULT',
  HYUNADI: 'HYUNDAI',
  'HYUN.': 'HYUNDAI',
  PEUG: 'PEUGEOT',
  PEUGE: 'PEUGEOT',
  CHEV: 'CHEVROLET',
  CHEVR: 'CHEVROLET',
  'CHEVR.': 'CHEVROLET',
  CHEVROLET: 'DAEWOO (CHEVROLET)',
  DAEWOO: 'DAEWOO (CHEVROLET)',
  SUZ: 'SUZUKI',
  FOR: 'FORD',
  'FORD,': 'FORD',
  FORDA: 'FORD',
  'KIA.': 'KIA',
  'SUB.': 'SUBARU',
  'MAZ.': 'MAZDA',
  'MAZDA.': 'MAZDA',
  'LEX.': 'LEXUS',
  JAG: 'JAGUAR',
  POR: 'PORSCHE',
  PORSCH: 'PORSCHE',
  'AUDI.': 'AUDI',
  'BMW.': 'BMW',
  'MERC.': 'MERCEDES',
  MERC: 'MERCEDES',
  MERCE: 'MERCEDES',
  'VOLVO.': 'VOLVO',
  'SEAT.': 'SEAT',
  'SKODA.': 'SKODA',
  'MINI.': 'MINI',
  'SAAB.': 'SAAB',
  'DODGE.': 'DODGE',
  CHRY: 'CHRYSLER',
  CHRSYLER: 'CHRYSLER',
  HUM: 'HUMMER',
  PONT: 'PONTIAC',
  'JEEP.': 'JEEP',
  CAD: 'CADILLAC',
  'LINCOLN.': 'LINCOLN',
  'BUICK.': 'BUICK',
  'GMC,': 'GMC',
  'HOLDEN.': 'HOLDEN',
  HOLDE: 'HOLDEN',
  'ISUZU.': 'ISUZU',
  'DAIHATSU.': 'DAIHATSU',
  LADA: 'LADA / TOGLIATTI',
  ZASTAVA: 'LADA / TOGLIATTI',
  'DACIA.': 'DACIA',
  'LADA / TOGLIATTI': 'LADA / TOGLIATTI',
  SSANYONG: 'SSANGYONG',
  'SSAN.': 'SSANGYONG',
  'SMART.': 'SMART',
  'TESLA.': 'TESLA',
  'FERRARI.': 'FERRARI',
  'MASERATI.': 'MASERATI',
  'LAMBORGHINI.': 'LAMBORGHINI',
  'BENTLEY.': 'BENTLEY',
  ASTON: 'ASTON MARTIN',
  'LOTUS.': 'LOTUS',
  'MG.': 'MG',
  'ROVER.': 'ROVER',
  'MC LAREN': 'McLAREN',
  MCLAREN: 'McLAREN',
  'INEOS.': 'INEOS',
  'MAXUS.': 'MAXUS',
  'POLESTAR.': 'POLESTAR',
  'CUPRA.': 'CUPRA',
  'HONGQI.': 'HONGQI',
  'VOYAH.': 'VOYAH',
  'XPENG.': 'XPENG',
  'ZEEKR.': 'ZEEKR',
  'BYD.': 'BYD',
  'ORA.': 'ORA',
  'NIO.': 'NIO',
  'THINK.': 'THINK',
  'FISKER.': 'FISKER',
  RIVIAN: 'USA CARS',
  LUCID: 'USA CARS',
  'TVR.': 'TVR',
  TVR: 'TVR',
  'JC INDIGO': 'JC INDIGO',
  KEWET: 'KEWET',
  AIXAM: 'AIXAM',
  AIWAYS: 'AIWAYS',
  'DFSK (SERES)': 'DFSK (SERES)',
  DONGFENG: 'DONGFENG',
  EXLANTIX: 'EXLANTIX',
  'JAC (CH)': 'JAC (CH)',
  'LYNK & CO': 'LYNK & CO',
  MAN: 'MAN',
  'FORD TRUCKS': 'FORD',
  'TOYOTA TRUCKS': 'TOYOTA',
  'PEUGEOT TRUCKS': 'PEUGEOT',
  'CITROEN TRUCKS': 'CITROEN',
  'MERCEDES TRUCKS': 'MERCEDES',
  'VOLVO TRUCKS': 'VOLVO',
  'AUDI TRUCKS': 'AUDI',
  'BMW TRUCKS': 'BMW',
  'NISSAN TRUCKS': 'NISSAN',
  'FIAT TRUCKS': 'FIAT',
  'RENAULT TRUCKS': 'RENAULT',
  'MITSUBISHI TRUCKS': 'MITSUBISHI',
  'MAZDA TRUCKS': 'MAZDA',
  SCANIA: 'SCANIA TRUCKS',
  DAF: 'DAF',
  IVECO: 'IVECO (FIAT) TRUCKS',
  HINO: 'HINO TRUCKS',
  'ISUZU TRUCKS': 'ISUZU',
};

function normalizeBrand(brand) {
  const b = brand.toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const INPUT_FILE = path.join(__dirname, '..', 'generated-inserts.sql');
const OUTPUT_FILE = path.join(__dirname, '..', 'migrations', '0022_pilkington_data.sql');

// ---------------------------------------------------------------------------
// Parse SQL
// ---------------------------------------------------------------------------
const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
const lines = raw.split('\n');

let totalRows = 0;
let skippedDelete = 0;
let batchCount = 0;
let outputLines = [];

// Statistics
const stats = {
  sources: {},
  brands: {},
  categories: {},
  hasOe: 0,
  hasDimensions: 0,
  hasWeight: 0,
  hasYearFrom: 0,
  hasYearTo: 0,
  duplicateEurocodes: new Map(), // eurocode -> count
};

let currentBatch = [];
let insertPrefix = null;

function flushBatch() {
  if (currentBatch.length === 0) return;
  batchCount++;
  outputLines.push(insertPrefix);
  // Join with comma, last element gets semicolon instead of comma
  const last = currentBatch[currentBatch.length - 1];
  const rest = currentBatch.slice(0, -1);
  if (rest.length > 0) {
    outputLines.push(rest.join(',\n') + ',');
  }
  outputLines.push(last + ';');
  outputLines.push('');
  currentBatch = [];
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  if (line === '') continue;
  if (line.startsWith('--')) {
    outputLines.push(line);
    continue;
  }

  // Strip DELETE — never remove existing data
  if (line.toUpperCase().includes('DELETE FROM')) {
    skippedDelete++;
    outputLines.push('-- STRIPPED: ' + line);
    continue;
  }

  // Strip catalog_meta update (we'll do our own at the end)
  if (line.toUpperCase().includes('INSERT OR REPLACE INTO catalog_meta')) {
    outputLines.push('-- STRIPPED: ' + line);
    continue;
  }

  // Detect INSERT start
  if (line.toUpperCase().startsWith('INSERT INTO GLASS_CATALOG')) {
    if (currentBatch.length > 0) flushBatch();
    insertPrefix = line.replace('INSERT INTO', 'INSERT OR IGNORE INTO');
    continue;
  }

  // Detect value row
  if (line.startsWith('(')) {
    totalRows++;

    // Remove trailing comma or semicolon, keep the closing paren
    const cleanLine = line.replace(/\)[,;]?\s*$/, ')');

    // Parse the row to extract statistics
    // Find brand_original (last field before closing paren)
    const brandOriginalMatch = cleanLine.match(/'([^']+)'\s*\)$/);
    const brandOriginal = brandOriginalMatch ? brandOriginalMatch[1] : 'unknown';

    // Find source (second-to-last field — before brand_original)
    // We find the last two quoted strings before the closing paren
    const allQuoted = cleanLine.match(/'([^']+)'/g);
    const source = allQuoted && allQuoted.length >= 2
      ? allQuoted[allQuoted.length - 2].replace(/'/g, '')
      : 'unknown';

    stats.sources[source] = (stats.sources[source] || 0) + 1;

    // Split on comma, but be careful with JSON arrays inside quotes
    const parts = cleanLine.match(/(?:'(?:[^']|''(?:[^']|''(?:[^']|''))*')*'|NULL|\[[^\]]*\]|\{[^}]*\}|[^,()]+)/g);
    if (parts && parts.length >= 32) {
      const brand = parts[5].trim().replace(/^'|'$/g, '');
      const normBrand = normalizeBrand(brand);
      stats.brands[normBrand] = (stats.brands[normBrand] || 0) + 1;

      const category = parts[3].trim().replace(/^'|'$/g, '');
      stats.categories[category] = (stats.categories[category] || 0) + 1;

      const yearFrom = parts[7].trim();
      if (yearFrom !== 'NULL') stats.hasYearFrom++;

      const yearTo = parts[8].trim();
      if (yearTo !== 'NULL') stats.hasYearTo++;

      const oemNumbers = parts[20].trim();
      if (oemNumbers !== "'[]'") stats.hasOe++;

      const weight = parts[24].trim();
      if (weight !== 'NULL') stats.hasWeight++;

      const dimensions = parts[25].trim();
      if (dimensions !== "'[]'" && dimensions !== 'NULL' && !dimensions.includes('null')) stats.hasDimensions++;

      const eurocode = parts[0].trim().replace(/^'|'$/g, '');
      stats.duplicateEurocodes.set(eurocode, (stats.duplicateEurocodes.get(eurocode) || 0) + 1);
    }

    // Normalize brand in the row
    let normalizedLine = cleanLine;
    if (parts && parts.length >= 32) {
      const originalBrand = parts[5].trim().replace(/^'|'$/g, '');
      const normBrand = normalizeBrand(originalBrand);
      if (originalBrand !== normBrand) {
        // Replace the brand field (field index 5)
        const before = parts.slice(0, 5).join(',');
        const after = parts.slice(6).join(',');
        normalizedLine = '(' + before + ",'" + normBrand + "'," + after;
      }
    }

    currentBatch.push(normalizedLine);

    if (currentBatch.length >= 100) {
      flushBatch();
    }
  }
}

// Flush remaining
flushBatch();

// Add metadata insert at the end
outputLines.push("INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES");
outputLines.push(`('pilkington_total_rows', '${totalRows}', datetime('now')),`);
outputLines.push(`('pilkington_sources', '${JSON.stringify(stats.sources)}', datetime('now')),`);
outputLines.push(`('pilkington_brands', '${JSON.stringify(stats.brands)}', datetime('now')),`);
outputLines.push(`('pilkington_imported_at', datetime('now'), datetime('now'));`);
outputLines.push('');

// Write output
fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const uniqueEurocodes = stats.duplicateEurocodes.size;
const multiEurocodes = Array.from(stats.duplicateEurocodes.entries()).filter(([_, c]) => c > 1);

console.log('\n=== Pilkington Import Report ===\n');
console.log(`Input file:  ${INPUT_FILE}`);
console.log(`Output file: ${OUTPUT_FILE}`);
console.log(`Total rows parsed:      ${totalRows}`);
console.log(`Batches written:        ${batchCount}`);
console.log(`DELETE statements stripped: ${skippedDelete}`);
console.log(`Unique eurocodes:       ${uniqueEurocodes}`);
console.log(`Eurocodes with >1 row:  ${multiEurocodes.length}`);
console.log(`\n--- Sources ---`);
Object.entries(stats.sources)
  .sort((a, b) => b[1] - a[1])
  .forEach(([s, c]) => console.log(`  ${s}: ${c}`));
console.log(`\n--- Brand coverage (top 20) ---`);
Object.entries(stats.brands)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([b, c]) => console.log(`  ${b}: ${c}`));
console.log(`\n--- Category coverage ---`);
Object.entries(stats.categories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log(`  ${c}: ${n}`));
console.log(`\n--- Data quality ---`);
console.log(`  Rows with year_from:  ${stats.hasYearFrom} (${((stats.hasYearFrom / totalRows) * 100).toFixed(1)}%)`);
console.log(`  Rows with year_to:    ${stats.hasYearTo} (${((stats.hasYearTo / totalRows) * 100).toFixed(1)}%)`);
console.log(`  Rows with OE numbers: ${stats.hasOe} (${((stats.hasOe / totalRows) * 100).toFixed(1)}%)`);
console.log(`  Rows with weight:     ${stats.hasWeight} (${((stats.hasWeight / totalRows) * 100).toFixed(1)}%)`);
console.log(`  Rows with dimensions: ${stats.hasDimensions} (${((stats.hasDimensions / totalRows) * 100).toFixed(1)}%)`);
console.log(`\nImport SQL ready at: ${OUTPUT_FILE}`);
console.log('Run with: npx wrangler d1 execute glass-catalog-db --remote --file=migrations/0022_pilkington_data.sql');
console.log('\n=== End Report ===\n');
