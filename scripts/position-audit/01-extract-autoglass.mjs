#!/usr/bin/env node
/**
 * 01-extract-autoglass.mjs
 * Parse products-complete.ndjson → flat array with normalized positions.
 */
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { writeFileSync } from 'fs';

const INPUT = 'data/autoglass-scrape/products-complete.ndjson';
const OUTPUT = 'data/autoglass-scrape/autoglass-flat.json';

// Canonical position mapping from auto-glass.no typeCodeRel
const POSITION_MAP = {
  // Windscreen / Frontrute
  'F':   { position: 'FR', side: null,  openingType: null, desc: 'Frontrute' },
  // Rear window / Bakrute
  'B':   { position: 'RR', side: null,  openingType: null, desc: 'Bakrute' },
  'BF':  { position: 'RR', side: 'L',   openingType: null, desc: 'Bakrute venstre' },
  'BP':  { position: 'RR', side: 'R',   openingType: null, desc: 'Bakrute høyre' },
  // Front door / Dørrute fremme
  'DFF': { position: 'FD', side: 'L',   openingType: null, desc: 'Dørrute fremre førerside' },
  'DPF': { position: 'FD', side: 'R',   openingType: null, desc: 'Dørrute fremre passasjerside' },
  // Front door vent / Ventilrute fremme
  'DFFV':{ position: 'FV', side: 'L',   openingType: null, desc: 'Ventilrute fremre førerside' },
  'DPFV':{ position: 'FV', side: 'R',   openingType: null, desc: 'Ventilrute fremre passasjerside' },
  // Rear door / Dørrute bak
  'DFB': { position: 'RD', side: 'L',   openingType: null, desc: 'Dørrute bakre førerside' },
  'DPB': { position: 'RD', side: 'R',   openingType: null, desc: 'Dørrute bakre passasjerside' },
  // Rear door vent / Ventilrute bak
  'DFBV':{ position: 'RV', side: 'L',   openingType: null, desc: 'Ventilrute bakre førerside' },
  'DPBV':{ position: 'RV', side: 'R',   openingType: null, desc: 'Ventilrute bakre passasjerside' },
  // Quarter side fixed / Siderute bak fast
  'SFB1':{ position: 'RQ', side: 'L',   openingType: 'fixed', desc: 'Siderute bakre 1 førerside' },
  'SPB1':{ position: 'RQ', side: 'R',   openingType: 'fixed', desc: 'Siderute bakre 1 passasjerside' },
  'SFB2':{ position: 'RQ', side: 'L',   openingType: 'fixed', desc: 'Siderute bakre 2 førerside' },
  'SPB2':{ position: 'RQ', side: 'R',   openingType: 'fixed', desc: 'Siderute bakre 2 passasjerside' },
  'SFB3':{ position: 'RQ', side: 'L',   openingType: 'fixed', desc: 'Siderute bakre 3 førerside' },
  'SPB3':{ position: 'RQ', side: 'R',   openingType: 'fixed', desc: 'Siderute bakre 3 passasjerside' },
  // Opening side / Åpnbar siderute
  'BOASL':{ position: 'MQ', side: 'L',  openingType: 'sliding', desc: 'Åpnbar siderute venstre' },
  'BOASR':{ position: 'MQ', side: 'R',  openingType: 'sliding', desc: 'Åpnbar siderute høyre' },
};

async function main() {
  console.log('📖 Parsing auto-glass.ndjson...');
  const flat = [];
  const stats = { totalEntries: 0, totalProducts: 0, byType: {} };

  const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    stats.totalEntries++;
    const { brand, model, submodel, yearRange, url, products } = entry;

    for (const p of products || []) {
      stats.totalProducts++;
      const mapping = POSITION_MAP[p.typeCodeRel];
      if (!mapping) {
        console.warn(`⚠️ Unknown typeCodeRel: ${p.typeCodeRel} in ${p.title}`);
      }

      const posKey = mapping ? mapping.position : 'UNKNOWN';
      stats.byType[posKey] = (stats.byType[posKey] || 0) + 1;

      flat.push({
        brand: brand?.toUpperCase() || null,
        model: model?.toUpperCase() || null,
        submodel: submodel?.toUpperCase() || null,
        yearRange: yearRange || null,
        title: p.title || null,
        sku: p.sku || null,
        typeCodeRel: p.typeCodeRel || null,
        position: mapping?.position || null,
        side: mapping?.side || null,
        openingType: mapping?.openingType || null,
        typeDesc: mapping?.desc || p.typeCode || null,
        price: p.price ?? null,
        url,
      });
    }
  }

  writeFileSync(OUTPUT, JSON.stringify({ meta: { generatedAt: new Date().toISOString(), ...stats }, products: flat }, null, 2));

  console.log(`\n✅ Extracted ${flat.length} flat products`);
  console.log(`   Entries: ${stats.totalEntries}`);
  console.log(`   By position:`, stats.byType);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
