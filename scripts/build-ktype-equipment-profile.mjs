#!/usr/bin/env node
/**
 * Build compact equipment profiles per vehicle identity from catalog data.
 *
 * Output: data/ktype-equipment-profiles.json
 * Keys:   "BRAND:MODEL:YEAR", "BRAND:MODEL", "BRAND"
 * Values: per-category equipment statistics derived from matching prefix4s.
 */

import fs from 'fs';

const CATALOG_PATH = './data/catalog-prod.json';
const PREFIX4_CACHE_PATH = './data/ktype-prefix4-cache.json';
const OUTPUT_PATH = './data/ktype-equipment-profiles.json';

const FEATURE_KEYS = [
  'adas', 'rainSensor', 'heated', 'acoustic', 'antenna', 'camera',
  'hud', 'solar', 'tinted', 'coated', 'laneAssist', 'shade',
];

const CATEGORIES = [
  'frontrute', 'bakrute', 'dørglass', 'dørglass-frem', 'dørglass-bak',
  'sideglass', 'bakluke', 'spesialglass', 'tilbehør', 'annet',
];

function buildProfile(products, maxCombinations = 8) {
  const total = products.length;
  if (total === 0) return null;

  const counts = {};
  FEATURE_KEYS.forEach((key) => {
    counts[key] = products.filter((p) => p.properties?.[key] === true).length;
  });

  const comboMap = new Map();
  products.forEach((p) => {
    const combo = FEATURE_KEYS.filter((k) => p.properties?.[k] === true).sort();
    const key = combo.join(',');
    comboMap.set(key, (comboMap.get(key) || 0) + 1);
  });

  const combinations = Array.from(comboMap.entries())
    .map(([featuresKey, count]) => ({
      f: featuresKey ? featuresKey.split(',') : [],
      c: count,
      p: Number((count / total).toFixed(3)),
    }))
    .sort((a, b) => b.c - a.c)
    .slice(0, maxCombinations);

  const likely = {};
  FEATURE_KEYS.forEach((k) => {
    likely[k] = Number((counts[k] / total).toFixed(3));
  });

  return {
    n: total,
    pos: FEATURE_KEYS.filter((k) => counts[k] > 0),
    neg: FEATURE_KEYS.filter((k) => counts[k] === 0),
    p: likely,
    comb: combinations,
  };
}

function finalizeAgg(aggMap) {
  const result = {};
  aggMap.forEach((agg, key) => {
    const categories = {};
    Object.entries(agg.categories).forEach(([cat, data]) => {
      const ap = data.profile;
      const total = ap.total;
      if (total === 0) return;

      const combinations = Array.from(ap.comboCounts.entries())
        .map(([featuresKey, count]) => ({
          f: featuresKey ? featuresKey.split(',') : [],
          c: count,
          p: Number((count / total).toFixed(3)),
        }))
        .sort((a, b) => b.c - a.c)
        .slice(0, 8);

      const likely = {};
      FEATURE_KEYS.forEach((k) => {
        likely[k] = ap.possible.has(k) ? 0.5 : 0;
      });

      categories[cat] = {
        n: total,
        pos: Array.from(ap.possible),
        neg: FEATURE_KEYS.filter((k) => !ap.possible.has(k)),
        p: likely,
        comb: combinations,
      };
    });

    result[key] = { n: agg.totalProducts, cat: categories };
  });
  return result;
}

async function main() {
  console.log('📊 Building equipment profiles from catalog...');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const recs = catalog.records || [];
  console.log(`   Catalog records: ${recs.length.toLocaleString()}`);

  // 1. Group products by prefix4 (use properties if available, else infer)
  const productsByPrefix4 = new Map();
  recs.forEach((r) => {
    if (!r.eurocode || r.eurocode.length < 4) return;
    const prefix4 = r.eurocode.slice(0, 4).toUpperCase();
    if (!productsByPrefix4.has(prefix4)) {
      productsByPrefix4.set(prefix4, []);
    }
    // Normalize minimal properties if missing
    if (!r.properties) {
      r.properties = {
        adas: !!r.adas,
        rainSensor: !!r.rain_sensor,
        heated: !!r.heated,
        acoustic: !!r.acoustic,
        antenna: !!r.antenna,
        camera: !!r.camera,
        hud: !!r.hud,
        solar: !!r.solar,
        tinted: !!r.tinted,
        coated: !!r.coated,
        laneAssist: !!r.lane_assist,
        shade: !!r.shade,
      };
    }
    productsByPrefix4.get(prefix4).push(r);
  });
  console.log(`   Unique prefix4 values: ${productsByPrefix4.size.toLocaleString()}`);

  // 2. Load prefix4 cache
  const cacheRaw = JSON.parse(fs.readFileSync(PREFIX4_CACHE_PATH, 'utf8'));
  const cacheEntries = cacheRaw.entries || cacheRaw;
  console.log(`   Cache keys: ${Object.keys(cacheEntries).length.toLocaleString()}`);

  // 3. Build profiles keyed by brand:model:year
  const profiles = new Map();

  Object.entries(cacheEntries).forEach(([cacheKey, prefix4List]) => {
    const parts = cacheKey.split(':');
    if (parts.length < 2) return;

    const brand = parts[0];
    const model = parts[1];
    const year = parts[2] || null;

    const products = [];
    prefix4List.forEach((entry) => {
      const list = productsByPrefix4.get(entry.prefix4) || [];
      products.push(...list);
    });

    if (products.length === 0) return;

    const byCategory = new Map();
    products.forEach((p) => {
      const cat = p.category || 'annet';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(p);
    });

    const categoryProfiles = {};
    byCategory.forEach((catProducts, cat) => {
      categoryProfiles[cat] = buildProfile(catProducts);
    });
    categoryProfiles.all = buildProfile(products);

    profiles.set(cacheKey, {
      n: products.length,
      cat: categoryProfiles,
    });
  });

  // 4. Aggregate brand:model and brand profiles
  const brandModelProfiles = new Map();
  const brandProfiles = new Map();

  profiles.forEach((profile, key) => {
    const parts = key.split(':');
    const brand = parts[0];
    const model = parts[1];
    const bmKey = `${brand}:${model}`;
    const bKey = brand;

    [bmKey, bKey].forEach((aggKey) => {
      const existing = aggKey === bmKey ? brandModelProfiles : brandProfiles;
      if (!existing.has(aggKey)) {
        existing.set(aggKey, { totalProducts: 0, categories: {} });
      }
      const agg = existing.get(aggKey);
      agg.totalProducts += profile.n;

      Object.entries(profile.cat).forEach(([cat, catProfile]) => {
        if (!agg.categories[cat]) {
          agg.categories[cat] = {};
        }
        if (!agg.categories[cat].profile) {
          agg.categories[cat].profile = {
            total: 0,
            possible: new Set(),
            comboCounts: new Map(),
          };
        }
        const ap = agg.categories[cat].profile;
        ap.total += catProfile.n;
        catProfile.pos.forEach((k) => ap.possible.add(k));
        catProfile.comb.forEach((c) => {
          const k = c.f.join(',');
          ap.comboCounts.set(k, (ap.comboCounts.get(k) || 0) + c.c);
        });
      });
    });
  });

  // 5. Merge into final compact output
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      records: recs.length,
      features: FEATURE_KEYS,
      categories: CATEGORIES,
    },
    profiles: Object.fromEntries(profiles),
    brandModel: finalizeAgg(brandModelProfiles),
    brand: finalizeAgg(brandProfiles),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`\n✅ Wrote ${Object.keys(output.profiles).length.toLocaleString()} exact profiles`);
  console.log(`   + ${Object.keys(output.brandModel).length.toLocaleString()} brand:model profiles`);
  console.log(`   + ${Object.keys(output.brand).length.toLocaleString()} brand profiles`);
  console.log(`   to ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
