#!/usr/bin/env node
/**
 * test-resolve-glass-free.mjs
 * Simuler resolveGlass i "free_only" mode for UX71699 og SU18018
 * Tester hele kjeden: SVV → vPIC → glass_rules → needs_review fallback
 */

import DatabaseCtor from 'better-sqlite3';
import fs from 'fs';

const SVV_API_KEY = process.env.SVV_API_KEY || '4e0f9b0f-944a-4e1c-afd0-b916685fa1e2';

// Load D1 schema
const db = new DatabaseCtor(':memory:');
const migrationSQL = fs.readFileSync('/Users/taj/bilglass/api/cf-worker/migrations/0007_vin_glass_hybrid.sql', 'utf-8');
const statements = migrationSQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const stmt of statements) {
  try { db.exec(stmt + ';'); } catch(e) { if (!e.message.includes('PRAGMA')) console.warn(e.message); }
}

// Insert a pre-learned rule for Peugeot 307 (simulating a previous successful paid lookup)
db.exec(`
  INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at)
  VALUES ('peugeot:307:2004', 'EU', 'windshield', 'default', 12837, '307-WIND', '43R-000307', 'E1-03074', 0.94, 5, 1, 'learned_from_paid_api', datetime('now'), datetime('now'));
`);

// NO rule for VW Transporter — this will test the fallback path

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

async function fetchVpic(vin) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
  if (!res.ok) return null;
  const data = await res.json();
  const v = data.Results?.[0] ?? {};
  return {
    make: v.Make || null,
    model: v.Model || null,
    year: v.ModelYear ? parseInt(v.ModelYear) : null,
  };
}

function normalizeKey(make, model, year) {
  return [
    (make ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    (model ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    String(year ?? 'unknown'),
  ].join(':');
}

async function simulateResolveGlass(regnr) {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`🚗 Simulerer resolveGlass for: ${regnr}`);
  console.log(`═══════════════════════════════════════════════`);
  const path = [];

  // Lag 0: SVV
  console.log(`\n📡 Lag 0: SVV Enkeltoppslag`);
  const svv = await fetchSvv(regnr);
  if (!svv) {
    console.log(`   ❌ SVV fant ikke kjøretøyet`);
    return { status: 'failed', path: [...path, 'svv_not_found'] };
  }
  console.log(`   ✅ SVV: ${svv.make} ${svv.model} (${svv.year}) — VIN: ${svv.vin || 'mangler'}`);
  path.push('svv');

  // Lag 1: vPIC
  let vpicData = null;
  if (svv.vin) {
    console.log(`\n📡 Lag 1: vPIC VIN-dekoding`);
    vpicData = await fetchVpic(svv.vin);
    if (vpicData && vpicData.make) {
      console.log(`   ✅ vPIC: ${vpicData.make} ${vpicData.model || '(mangler)'} (${vpicData.year || 'mangler'})`);
      path.push('vpic');
    } else {
      console.log(`   ⚠️  vPIC returnerte ingen data`);
    }
  }

  // Prefer SVV data over vPIC for normalized key (vPIC is unreliable for EU cars)
  const trustedMake = svv.make || vpicData?.make || null;
  const trustedModel = svv.model || vpicData?.model || null;
  const trustedYear = svv.year || vpicData?.year || null;
  console.log(`\n🔑 Trusted vehicle data: ${trustedMake} ${trustedModel} (${trustedYear}) [SVV prioritized]`);

  // Lag 2: glass_rules
  const normalizedKey = normalizeKey(trustedMake, trustedModel, trustedYear);
  console.log(`\n📡 Lag 2: glass_rules lookup`);
  console.log(`   Normalized key: ${normalizedKey}`);

  const stmt = db.prepare(`
    SELECT ktype, kba, oem_part_number, eurocode, confidence, evidence_count
    FROM glass_rules
    WHERE normalized_key = ? AND market = ? AND opening = ?
      AND feature_signature IN (?, 'default')
      AND active = 1
    ORDER BY confidence DESC, evidence_count DESC
    LIMIT 1
  `);
  const rule = stmt.get(normalizedKey, 'EU', 'windshield', 'default');

  if (rule && rule.confidence >= 0.75) {
    console.log(`   ✅ glass_rules HIT!`);
    console.log(`      kType: ${rule.ktype}`);
    console.log(`      Confidence: ${rule.confidence}`);
    console.log(`      Evidence: ${rule.evidence_count}`);
    path.push('glass_rules');
    return {
      status: 'resolved',
      ktype: rule.ktype,
      source: 'glass_rules',
      paid: false,
      path,
    };
  }

  console.log(`   ❌ Ingen glass_rules match`);
  path.push('no_rule');

  // Lag 3: Would try RapidAPI here
  console.log(`\n📡 Lag 3: RapidAPI K-Type Finder / VIN Decoder TECDOC`);
  console.log(`   ⏭️  HOPPES OVER — RAPIDAPI_KEY ikke satt`);
  path.push('rapidapi_skipped');

  console.log(`\n📋 Resultat: needs_review`);
  return { status: 'needs_review', path };
}

async function main() {
  console.log('🧪 Simulerer resolveGlass (free_only mode)');
  console.log('   Tester SVV → vPIC → glass_rules → fallback');

  const results = [];
  for (const regnr of ['UX71699', 'SU18018']) {
    const result = await simulateResolveGlass(regnr);
    results.push({ regnr, ...result });
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 SAMMENDRAG');
  console.log('═══════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'resolved' ? '✅' : r.status === 'needs_review' ? '⚠️' : '❌';
    console.log(`${icon} ${r.regnr}: ${r.status.toUpperCase()} ${r.ktype ? `(kType=${r.ktype})` : ''}`);
    console.log(`   Path: ${r.path.join(' → ')}`);
  }

  const resolved = results.filter(r => r.status === 'resolved').length;
  const needsReview = results.filter(r => r.status === 'needs_review').length;

  console.log(`\n📈 Oppsummering:`);
  console.log(`   ✅ Resolved: ${resolved}/${results.length}`);
  console.log(`   ⚠️  Needs review: ${needsReview}/${results.length}`);

  if (needsReview > 0) {
    console.log(`\n💡 For å resolve alle:`);
    console.log(`   1. Sett RAPIDAPI_KEY i Cloudflare secrets`);
    console.log(`   2. Kjør test på nytt — Lag 3 vil dekode nye kjøretøy`);
    console.log(`   3. Etter første oppslag lagres regelen i glass_rules (gratis fremover)`);
  }

  db.close();
}

main().catch(e => {
  console.error('💥 Feil:', e);
  process.exit(1);
});
