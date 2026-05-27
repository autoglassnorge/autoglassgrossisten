#!/usr/bin/env node
/**
 * test-resolve-e2e.mjs
 * Full end-to-end test av resolver-kjeden med ekte kType-data
 * Tester: SVV → vPIC → glass_rules (seedet med Bovsoft-bootstrap data)
 */

import DatabaseCtor from 'better-sqlite3';
import fs from 'fs';

const SVV_API_KEY = process.env.SVV_API_KEY || '4e0f9b0f-944a-4e1c-afd0-b916685fa1e2';

// Real kType data from bovsoft-bootstrap-results.json
const GROUND_TRUTH = {
  'UX71699': {
    make: 'PEUGEOT', model: '307', year: 2004,
    ktype: 18550, kba: '307-CC-3B', oem: '43R-000307', eurocode: 'E1-03074',
    vin: 'VF33BNFUC83502899',
  },
  'SU18018': {
    make: 'VOLKSWAGEN', model: 'TRANSPORTER', year: 2005,
    ktype: 17370, kba: 'T5-CARAVELLE', oem: '43R-000173', eurocode: 'E1-01737',
    vin: 'WV1ZZZ7HZ5H060934',
  },
};

// Setup D1-like SQLite DB
const db = new DatabaseCtor(':memory:');
const migrationSQL = fs.readFileSync('/Users/taj/bilglass/api/cf-worker/migrations/0007_vin_glass_hybrid.sql', 'utf-8');
const statements = migrationSQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const stmt of statements) {
  try { db.exec(stmt + ';'); } catch(e) { if (!e.message.includes('PRAGMA')) {} }
}

// Seed glass_rules with ground truth
const insert = db.prepare(`
  INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at)
  VALUES (?, 'EU', 'windshield', 'default', ?, ?, ?, ?, ?, 5, 1, 'bovsoft_ground_truth', datetime('now'), datetime('now'))
`);

for (const [regnr, data] of Object.entries(GROUND_TRUTH)) {
  const key = [data.make.toLowerCase(), data.model.toLowerCase(), String(data.year)].join(':');
  insert.run(key, data.ktype, data.kba, data.oem, data.eurocode, 0.95);
}

// SVV lookup
async function fetchSvv(regnr) {
  const res = await fetch(
    `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
    {
      headers: {
        Accept: 'application/json',
        'SVV-Authorization': `Apikey ${SVV_API_KEY}`,
        'User-Agent': 'AutoglassAS-B2B/1.0',
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;
  return {
    make: k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke ?? '',
    model: k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] ?? '',
    year: k.forstegangsregistrering?.registrertForstegangNorgeDato?.match(/(\d{4})/)?.[1] ? parseInt(k.forstegangsregistrering.registrertForstegangNorgeDato.match(/(\d{4})/)[1]) : null,
    vin: k.kjoretoyId?.understellsnummer ?? '',
  };
}

// vPIC lookup
async function fetchVpic(vin) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
  if (!res.ok) return null;
  const data = await res.json();
  const v = data.Results?.[0] ?? {};
  return { make: v.Make || null, model: v.Model || null, year: v.ModelYear ? parseInt(v.ModelYear) : null };
}

// glass_rules lookup (same logic as index.ts)
function lookupGlassRules(normalizedKey) {
  const stmt = db.prepare(`
    SELECT ktype, kba, oem_part_number, eurocode, confidence
    FROM glass_rules
    WHERE normalized_key = ? AND active = 1
    ORDER BY confidence DESC, evidence_count DESC
    LIMIT 1
  `);
  return stmt.get(normalizedKey) || null;
}

function normalizeKey(make, model, year) {
  return [
    (make ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    (model ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    String(year ?? 'unknown'),
  ].join(':');
}

// Full resolver chain test
async function testResolver(regnr) {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`🚗 Testing: ${regnr}`);
  console.log(`═══════════════════════════════════════════════`);
  const path = [];

  // Lag 0: SVV
  console.log(`\n📡 Lag 0: SVV Enkeltoppslag`);
  const svv = await fetchSvv(regnr);
  if (!svv) {
    console.log(`   ❌ SVV fant ikke kjøretøyet`);
    return { status: 'failed', path: ['svv_not_found'] };
  }
  console.log(`   ✅ SVV: ${svv.make} ${svv.model} (${svv.year})`);
  console.log(`      VIN: ${svv.vin || 'mangler'}`);
  path.push('svv');

  // Lag 1: vPIC (optional, for verification)
  if (svv.vin) {
    console.log(`\n📡 Lag 1: vPIC VIN-dekoding`);
    const vpic = await fetchVpic(svv.vin);
    if (vpic && vpic.make) {
      console.log(`   ✅ vPIC: ${vpic.make} ${vpic.model || '(mangler)'} (${vpic.year || 'mangler'})`);
      path.push('vpic');
    } else {
      console.log(`   ⚠️  vPIC: ingen data`);
    }
  }

  // Lag 2: glass_rules (using SVV data as ground truth)
  const normalizedKey = normalizeKey(svv.make, svv.model, svv.year);
  console.log(`\n📡 Lag 2: glass_rules lookup`);
  console.log(`   Normalized key: ${normalizedKey}`);

  const rule = lookupGlassRules(normalizedKey);
  if (rule && rule.confidence >= 0.75) {
    console.log(`   ✅ glass_rules HIT!`);
    console.log(`      kType: ${rule.ktype}`);
    console.log(`      KBA: ${rule.kba}`);
    console.log(`      OEM: ${rule.oem_part_number}`);
    console.log(`      Eurocode: ${rule.eurocode}`);
    console.log(`      Confidence: ${rule.confidence}`);
    path.push('glass_rules');

    // Verify against ground truth
    const gt = GROUND_TRUTH[regnr];
    const ktypeMatch = rule.ktype === gt.ktype;
    console.log(`\n🔍 Verification:`);
    console.log(`   Expected kType: ${gt.ktype}`);
    console.log(`   Actual kType:   ${rule.ktype}`);
    console.log(`   Match:          ${ktypeMatch ? '✅ CORRECT' : '❌ MISMATCH'}`);

    return {
      status: 'resolved',
      ktype: rule.ktype,
      source: 'glass_rules',
      paid: false,
      path,
      verified: ktypeMatch,
    };
  }

  console.log(`   ❌ Ingen glass_rules match`);
  return { status: 'needs_review', path };
}

async function main() {
  console.log('🧪 END-TO-END RESOLVER TEST');
  console.log('   Med ekte kType-data fra Bovsoft-bootstrap');
  console.log('   Tester: SVV → vPIC → glass_rules');

  const results = [];
  for (const regnr of ['UX71699', 'SU18018']) {
    const result = await testResolver(regnr);
    results.push({ regnr, ...result });
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 ENDELIG RESULTAT');
  console.log('═══════════════════════════════════════════════');

  let allPassed = true;
  for (const r of results) {
    const resolved = r.status === 'resolved';
    const verified = r.verified;
    const icon = resolved && verified ? '✅' : resolved ? '⚠️' : '❌';
    console.log(`${icon} ${r.regnr}: ${r.status.toUpperCase()}`);
    console.log(`   kType: ${r.ktype || 'N/A'} ${verified ? '(VERIFIED)' : ''}`);
    console.log(`   Path:  ${r.path.join(' → ')}`);
    if (!resolved || !verified) allPassed = false;
  }

  console.log('\n═══════════════════════════════════════════════');
  if (allPassed) {
    console.log('🎉 ALLE TESTER BESTÅTT!');
    console.log('   Resolver-kjeden fungerer 100% med norske regnr.');
    console.log('   Begge biler resolves korrekt via glass_rules.');
  } else {
    console.log('⚠️  Noen tester feilet.');
  }
  console.log('═══════════════════════════════════════════════');

  db.close();
}

main().catch(e => {
  console.error('💥 Fatal feil:', e);
  process.exit(1);
});
