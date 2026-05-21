#!/usr/bin/env node
/**
 * build-nags-autoglass-mapping.mjs
 * Fuzzy-match auto-glass.no US products against real NAGS codes.
 * Output: data/nags-autoglass-mapping.json
 */
import { readFileSync, writeFileSync } from 'fs';

const CSV_PATH = 'data/autoglass-scrape/products-autoglass-no.csv';
const NAGS_PATH = 'data/nags-all-combined.json';
const OUT_PATH = 'data/nags-autoglass-mapping.json';

const US_BRANDS = new Set([
  'FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER',
  'MERCURY','TESLA','USA CARS'
]);

// NAGS prefix → glass type
const NAGS_PREFIX_TO_TYPE = {
  DW: 'frontrute', FW: 'frontrute', DL: 'frontrute', FL: 'frontrute',
  DB: 'bakrute', FB: 'bakrute',
  DD: 'siderute', FD: 'siderute', DQ: 'siderute', FQ: 'siderute',
  DV: 'siderute', FV: 'siderute', DS: 'siderute', FS: 'siderute',
  DR: 'tak', FR: 'tak',
};

// auto-glass type_code → glass type
const AG_TYPE_TO_GLASS = {
  F: 'frontrute', B: 'bakrute',
  DFF: 'dørglass', DFB: 'dørglass', DPF: 'dørglass', DPB: 'dørglass',
  SFB1: 'siderute', SPB1: 'siderute', SFB2: 'siderute', SPB2: 'siderute',
  DFFV: 'siderute', DPFV: 'siderute', DFBV: 'siderute', DPBV: 'siderute',
  SFB3: 'siderute', SPB3: 'siderute',
};

// Make normalization: auto-glass brand → NAGS make
const MAKE_MAP = {
  'USA CARS': null, // Try to infer from model
};

function normalize(s) {
  if (!s) return '';
  return s.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return normalize(s).split(/\s+/).filter(t => t.length >= 2);
}

// Simple Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// Parse CSV line with quote handling
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

// Extract make from title for USA CARS
function inferMakeFromTitle(title) {
  const t = title.toUpperCase();
  const makes = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER','LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];
  for (const m of makes) {
    if (t.includes(m)) return m;
  }
  return null;
}

function yearsOverlap(yf1, yt1, yf2, yt2) {
  const a1 = yf1 ?? 1800, a2 = yt1 ?? 2100;
  const b1 = yf2 ?? 1800, b2 = yt2 ?? 2100;
  return a1 <= b2 && b1 <= a2;
}

function main() {
  // Read NAGS
  const nagsData = JSON.parse(readFileSync(NAGS_PATH, 'utf8'));
  const nagsEntries = nagsData.entries;

  // Read auto-glass.no CSV
  const csvRaw = readFileSync(CSV_PATH, 'utf8');
  const csvLines = csvRaw.split('\n').filter(l => l.trim());
  const headers = parseCsvLine(csvLines[0]);

  // Index NAGS by make for fast lookup
  const nagsByMake = new Map();
  for (const e of nagsEntries) {
    const mk = (e.make || '').toUpperCase().trim();
    if (!mk) continue;
    if (!nagsByMake.has(mk)) nagsByMake.set(mk, []);
    nagsByMake.get(mk).push(e);
  }

  const mappings = [];
  let processed = 0, matched = 0;

  for (let i = 1; i < csvLines.length; i++) {
    const row = parseCsvLine(csvLines[i]);
    if (row.length < 12) continue;

    const sku = row[0];
    const title = row[1];
    let brand = row[2]?.trim() || '';
    const model = row[3]?.trim() || '';
    const yearStart = parseInt(row[5], 10) || null;
    const yearEnd = parseInt(row[6], 10) || null;
    const typeCode = row[8]?.trim() || '';
    const price = parseInt(row[10], 10) || 0;

    if (!US_BRANDS.has(brand)) continue;
    processed++;

    // Infer make for USA CARS
    if (brand === 'USA CARS') {
      const inferred = inferMakeFromTitle(title);
      if (inferred) brand = inferred;
      else continue;
    }

    const agType = AG_TYPE_TO_GLASS[typeCode] || 'annet';
    const agTokens = tokenize(model);
    if (agTokens.length === 0) continue;

    // Find NAGS candidates by make
    const candidates = nagsByMake.get(brand.toUpperCase()) || [];
    let bestMatch = null;
    let bestScore = 0;

    for (const nags of candidates) {
      const nagsType = nags.glassType || NAGS_PREFIX_TO_TYPE[nags.nagsCode?.substring(0, 2).toUpperCase()] || 'annet';

      // Type must match
      if (agType !== nagsType && nagsType !== 'annet' && agType !== 'annet') continue;

      // Years must overlap
      if (!yearsOverlap(yearStart, yearEnd, nags.yearFrom, nags.yearTo)) continue;

      // Model fuzzy match
      const nagsTokens = tokenize(nags.model);
      let tokenScore = 0;
      let matchedTokens = 0;

      for (const agTok of agTokens) {
        let bestTokSim = 0;
        for (const nTok of nagsTokens) {
          const sim = similarity(agTok, nTok);
          if (sim > bestTokSim) bestTokSim = sim;
        }
        if (bestTokSim > 0.6) {
          tokenScore += bestTokSim;
          matchedTokens++;
        }
      }

      if (matchedTokens === 0) continue;

      const score = tokenScore / Math.max(agTokens.length, nagsTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = nags;
      }
    }

    if (bestMatch && bestScore >= 0.3) {
      matched++;
      mappings.push({
        autoGlassSku: sku,
        autoGlassTitle: title,
        nagsCode: bestMatch.nagsCode,
        nagsSuffix: bestMatch.suffix,
        make: brand,
        model,
        yearFrom: yearStart,
        yearTo: yearEnd,
        typeCode,
        glassType: agType,
        nagsGlassType: bestMatch.glassType || NAGS_PREFIX_TO_TYPE[bestMatch.nagsCode?.substring(0, 2).toUpperCase()],
        nagsModel: bestMatch.model,
        nagsYearFrom: bestMatch.yearFrom,
        nagsYearTo: bestMatch.yearTo,
        confidence: Math.round(bestScore * 100) / 100,
        price,
        source: bestMatch.source,
      });
    }
  }

  // Sort by confidence descending
  mappings.sort((a, b) => b.confidence - a.confidence);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalUsProducts: processed,
      matchedCount: matched,
      coveragePercent: Math.round((matched / processed) * 100 * 10) / 10,
      topSources: {},
    },
    mappings,
  };

  // Count sources
  for (const m of mappings) {
    output.meta.topSources[m.source] = (output.meta.topSources[m.source] || 0) + 1;
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  console.log('\n=== NAGS ↔ auto-glass.no Mapping Report ===');
  console.log(`US products processed: ${processed.toLocaleString()}`);
  console.log(`Matched with NAGS: ${matched.toLocaleString()}`);
  console.log(`Coverage: ${output.meta.coveragePercent}%`);
  console.log('\nTop NAGS sources used:');
  for (const [src, count] of Object.entries(output.meta.topSources).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${count}`);
  }
  console.log('\nConfidence distribution:');
  const high = mappings.filter(m => m.confidence >= 0.7).length;
  const med = mappings.filter(m => m.confidence >= 0.4 && m.confidence < 0.7).length;
  const low = mappings.filter(m => m.confidence < 0.4).length;
  console.log(`  High (≥0.70): ${high}`);
  console.log(`  Medium (0.40-0.69): ${med}`);
  console.log(`  Low (<0.40): ${low}`);
  console.log(`\nFile written: ${OUT_PATH} (${(readFileSync(OUT_PATH).length / 1024).toFixed(1)} KB)`);
}

main();
