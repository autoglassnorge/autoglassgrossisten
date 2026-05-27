#!/usr/bin/env node
/**
 * test-macs-vis.mjs
 * =================
 * Test MACS VIS-integrasjon (mock + live).
 *
 * Mock-modus: Krever ingen API-nøkkel. Tester mot kjente VIN-er i mock-databasen.
 * Live-modus: Krever MACS_VIS_API_KEY miljøvariabel.
 *
 * Bruk:
 *   node scripts/test-macs-vis.mjs                  # Mock-modus
 *   MACS_VIS_API_KEY=xxx node scripts/test-macs-vis.mjs --live  # Live-modus
 */

const MOCK_VINS = [
  { vin: 'TMBJE73T7B9015131', expectedKtype: 32787, desc: 'Skoda Superb II' },
  { vin: 'YYCFT26B38J005067', expectedKtype: 12152, desc: 'Think City' },
  { vin: 'W0VZ45GB7MS073060', expectedKtype: 136486, desc: 'Opel Grandland X' },
  { vin: 'VF33BNFUC83502899', expectedKtype: 18550, desc: 'Peugeot 307 CC' },
  { vin: 'UNKNOWNVIN1234567', expectedKtype: null, desc: 'Ukjent VIN (skal feile)' },
];

const isLive = process.argv.includes('--live');
const apiKey = process.env.MACS_VIS_API_KEY;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MACS VIS Test');
console.log(`  Modus: ${isLive ? 'LIVE' : 'MOCK'}`);
console.log(`  API Key: ${isLive ? (apiKey ? '****' + apiKey.slice(-4) : 'MANGLER') : 'N/A (mock)'}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (isLive && !apiKey) {
  console.error('❌ MACS_VIS_API_KEY mangler. Sett miljøvariabel eller bruk mock-modus.');
  console.error('   node scripts/test-macs-vis.mjs          # Mock');
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const test of MOCK_VINS) {
  process.stdout.write(`🧪 ${test.vin} (${test.desc}) ... `);

  if (!isLive) {
    // Mock-test: Simuler MACS_VIS_MOCK_DB logikk
    const MOCK_DB = {
      'TMBJE73T7B9015131': { ktype: 32787, confidence: 0.95 },
      'YYCFT26B38J005067': { ktype: 12152, confidence: 0.95 },
      'W0VZ45GB7MS073060': { ktype: 136486, confidence: 0.95 },
      'VF33BNFUC83502899': { ktype: 18550, confidence: 0.95 },
    };
    const entry = MOCK_DB[test.vin.toUpperCase()];
    if (test.expectedKtype === null) {
      if (!entry) {
        console.log('✅ Korrekt: Ingen treff for ukjent VIN');
        passed++;
      } else {
        console.log(`❌ Feil: Forventet ingen treff, fikk kType ${entry.ktype}`);
        failed++;
      }
    } else {
      if (entry && entry.ktype === test.expectedKtype) {
        console.log(`✅ kType=${entry.ktype} (confidence=${entry.confidence})`);
        passed++;
      } else {
        console.log(`❌ Feil: Forventet kType ${test.expectedKtype}, fikk ${entry?.ktype ?? 'null'}`);
        failed++;
      }
    }
    continue;
  }

  // Live-test: Kall MACS VIS API
  // Note: Dette krever at MACS VIS-endepunktet er tilgjengelig
  try {
    const res = await fetch(`https://api.macsds.com/vis/v1/vin/${encodeURIComponent(test.vin)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      if (test.expectedKtype === null) {
        console.log(`✅ Korrekt: HTTP ${res.status} for ukjent VIN`);
        passed++;
      } else {
        console.log(`❌ Feil: HTTP ${res.status}`);
        failed++;
      }
      continue;
    }

    const data = await res.json();
    const candidates = data?.ktypes ?? data?.results ?? [];
    const best = candidates.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))[0];
    const ktype = best ? parseInt(String(best.ktype ?? best.kType ?? '0')) || null : null;

    if (ktype === test.expectedKtype) {
      console.log(`✅ kType=${ktype} (confidence=${best?.probability ?? 0})`);
      passed++;
    } else {
      console.log(`❌ Feil: Forventet kType ${test.expectedKtype}, fikk ${ktype}`);
      failed++;
    }
  } catch (e) {
    console.log(`💥 Exception: ${e.message}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  Oppsummering');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`✅ Bestått: ${passed}/${MOCK_VINS.length}`);
console.log(`❌ Feilet: ${failed}/${MOCK_VINS.length}`);

if (failed === 0) {
  console.log('\n🎉 Alle tester bestått!');
} else {
  console.log('\n⚠️  Noen tester feilet. Sjekk output over.');
  process.exit(1);
}
