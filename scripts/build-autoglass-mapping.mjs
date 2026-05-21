#!/usr/bin/env node
/**
 * Build auto-glass.no mapping files from scraped CSV
 * Output: data/autoglass-mapping.json + data/autoglass-by-eurocode.json
 */
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';

const CSV_PATH = 'data/autoglass-scrape/products-autoglass-no.csv';
const MAPPING_OUT = 'data/autoglass-mapping.json';
const BY_EUROCODE_OUT = 'data/autoglass-by-eurocode.json';

// Parse properties from auto-glass.no title
function parseProperties(title) {
  const t = title.toUpperCase();
  const props = {
    green: /\bGN\b/.test(t),
    blue: /\bBL\b/.test(t),
    coated: /\bCS\b/.test(t),
    tinted: /\bSOTET\b|\bYP\b/.test(t),
    heated: /\bEL\b|\bEL\.\b|\bEL,/.test(t),
    rainSensor: /\bSENSOR\b/.test(t) || /\bGNM\b|\bGYM\b|\bGBM\b|\bGNELM\b|\bGYELM\b|\bCSBLMS\b|\bGNCELM\b/.test(t),
    adas: /\bHUD\b|\bLDW\b|\bCITY\b|\bKAMERA\b|\bCAMERA\b|\bCSBLMS\b/.test(t),
    hud: /\bHUD\b/.test(t),
    laneAssist: /\bLDW\b/.test(t),
    antenna: /\bANT\b|\bANT\.\b|\bDAB\b|\bGNAG\b|\bGYAG\b/.test(t),
    acoustic: /\bAKU\b/.test(t),
    solar: /\bSOLAR\b/.test(t),
    encapsulated: /\bINNK\b/.test(t),
    laminated: /\bGNL\b|\bYPL\b/.test(t),
    aqua: /\bGNAQ\b/.test(t),
    clips: /\bK\b/.test(t),
    molding: /\bPY\b/.test(t) ? ( /\bPYB\b|\bPYK\b/.test(t) ? 'full' : 'partial' ) : null,
    darkGreen: /\bGD\b/.test(t),
  };
  return props;
}

// Simple CSV parser with quote support
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);

  const byKey = new Map();        // "BRAND:MODEL:YEAR_FROM:YEAR_END:TYPE_CODE" → product
  const byEurocode = new Map();   // "SKU" → product
  const stats = {
    total: 0,
    skippedNoType: 0,
    typeCodes: {},
    brandModelCombos: new Set(),
    propertyCounts: {},
    priceRanges: { min: Infinity, max: 0, sum: 0 },
  };

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 11) continue;

    const sku = row[0];
    const title = row[1];
    const brand = row[2]?.trim() || '';
    const model = row[3]?.trim() || '';
    const submodel = row[4]?.trim() || null;
    const yearStart = parseInt(row[5], 10) || null;
    const yearEnd = parseInt(row[6], 10) || null;
    const yearRange = row[7] || null;
    const typeCode = row[8]?.trim() || '';
    const typeCodeDesc = row[9]?.trim() || '';
    const price = parseInt(row[10], 10) || 0;
    const sourceUrl = row[11]?.trim() || '';

    if (!typeCode || !brand || !model) {
      stats.skippedNoType++;
      continue;
    }

    stats.total++;
    stats.typeCodes[typeCode] = (stats.typeCodes[typeCode] || 0) + 1;
    stats.brandModelCombos.add(`${brand}:${model}`);
    if (price > 0) {
      stats.priceRanges.min = Math.min(stats.priceRanges.min, price);
      stats.priceRanges.max = Math.max(stats.priceRanges.max, price);
      stats.priceRanges.sum += price;
    }

    const properties = parseProperties(title);
    for (const [k, v] of Object.entries(properties)) {
      if (v) {
        stats.propertyCounts[k] = (stats.propertyCounts[k] || 0) + 1;
      }
    }

    const record = {
      eurocode: sku,
      title,
      brand,
      model,
      submodel,
      yearFrom: yearStart,
      yearTo: yearEnd,
      yearRange,
      typeCode,
      typeCodeDesc,
      price,
      sourceUrl,
      properties,
    };

    // Key mapping: BRAND:MODEL:YEAR_START:YEAR_END:TYPE_CODE
    const key = `${brand}:${model}:${yearStart ?? 'null'}:${yearEnd ?? 'null'}:${typeCode}`;
    byKey.set(key, record);

    byEurocode.set(sku, record);
  }

  // Write mapping files
  await writeFile(MAPPING_OUT, JSON.stringify(Object.fromEntries(byKey), null, 0));
  await writeFile(BY_EUROCODE_OUT, JSON.stringify(Object.fromEntries(byEurocode), null, 0));

  // Report
  const avgPrice = stats.priceRanges.sum / stats.total;
  console.log('\n=== Autoglass.no Mapping Report ===');
  console.log(`Total products mapped: ${stats.total.toLocaleString()}`);
  console.log(`Unique brand:model combos: ${stats.brandModelCombos.size.toLocaleString()}`);
  console.log(`Unique mapping keys: ${byKey.size.toLocaleString()}`);
  console.log(`Price range: kr ${stats.priceRanges.min.toLocaleString()} – kr ${stats.priceRanges.max.toLocaleString()}`);
  console.log(`Average price: kr ${Math.round(avgPrice).toLocaleString()}`);
  console.log(`\nType code distribution:`);
  for (const [tc, count] of Object.entries(stats.typeCodes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tc.padEnd(6)} ${count.toString().padStart(5)} (${((count/stats.total)*100).toFixed(1)}%)`);
  }
  console.log(`\nProperty detection:`);
  for (const [prop, count] of Object.entries(stats.propertyCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${prop.padEnd(14)} ${count.toString().padStart(5)} (${((count/stats.total)*100).toFixed(1)}%)`);
  }
  console.log(`\nFiles written:`);
  console.log(`  ${MAPPING_OUT} (${(await readFile(MAPPING_OUT)).length.toLocaleString()} bytes)`);
  console.log(`  ${BY_EUROCODE_OUT} (${(await readFile(BY_EUROCODE_OUT)).length.toLocaleString()} bytes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
