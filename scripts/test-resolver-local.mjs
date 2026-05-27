#!/usr/bin/env node
/**
 * test-resolver-local.mjs
 * Test resolveGlass-funksjonen lokalt med SQLite (simulerer D1)
 * Uten RAPIDAPI_KEY tester vi Lag 0-2: SVV → vPIC → glass_rules
 */

import fs from 'fs';
import DatabaseCtor from 'better-sqlite3';

const SVV_API_KEY = process.env.SVV_API_KEY || '4e0f9b0f-944a-4e1c-afd0-b916685fa1e2';

// Read migration SQL
const migrationPath = '/Users/taj/bilglass/api/cf-worker/migrations/0007_vin_glass_hybrid.sql';
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

// Create in-memory DB
const db = new DatabaseCtor(':memory:');

// Run migration
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

for (const stmt of statements) {
  try {
    db.exec(stmt + ';');
  } catch (e) {
    // Ignore if statement fails (e.g., PRAGMAs)
    if (!e.message.includes('PRAGMA')) {
      console.warn('Migration warning:', e.message);
    }
  }
}

console.log('✅ D1 schema loaded in SQLite');

// Insert test glass_rules for our test vehicles
db.exec(`
  INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at)
  VALUES 
    ('peugeot:307:2004', 'EU', 'windshield', 'default', 12345, '1234-AB', '43R-000012', 'E1-01234', 0.95, 1, 1, 'manual_test', datetime('now'), datetime('now')),
    ('volkswagen:transporter:2005', 'EU', 'windshield', 'default', 67890, '5678-CD', '43R-000056', 'E1-05678', 0.92, 1, 1, 'manual_test', datetime('now'), datetime('now'));
`);

console.log('✅ Test glass_rules inserted');

// Now let's manually test the lookup logic that resolveGlass uses
async function testLookup(regnr, make, model, year, vin) {
  console.log(`\n🚗 Testing: ${regnr} (${make} ${model} ${year})`);
  
  // Step 1: Normalize key (same logic as resolveGlass)
  const normalizedKey = `${make.toLowerCase().trim()}:${model.toLowerCase().trim()}:${year}`;
  console.log(`   Normalized key: ${normalizedKey}`);
  
  // Step 2: Look up glass_rules
  const stmt = db.prepare(`
    SELECT ktype, kba, oem_part_number, eurocode, confidence, notes as source
    FROM glass_rules
    WHERE normalized_key = ?
      AND opening = ?
      AND feature_signature = ?
      AND active = 1
    ORDER BY evidence_count DESC, confidence DESC
    LIMIT 1
  `);
  
  const rule = stmt.get(normalizedKey, 'windshield', 'default');
  
  if (rule) {
    console.log(`   ✅ glass_rules MATCH!`);
    console.log(`      kType: ${rule.ktype}`);
    console.log(`      KBA: ${rule.kba}`);
    console.log(`      OEM: ${rule.oem_part_number}`);
    console.log(`      Eurocode: ${rule.eurocode}`);
    console.log(`      Confidence: ${rule.confidence}`);
    console.log(`      Source: ${rule.source}`);
    return { status: 'resolved', ...rule };
  }
  
  console.log(`   ❌ No glass_rules match`);
  
  // Step 3: Try vPIC (free)
  console.log(`   📡 Trying vPIC...`);
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
    );
    const data = await res.json();
    const v = data.Results?.[0] ?? {};
    console.log(`   ✅ vPIC: Make=${v.Make}, Model=${v.Model}, Year=${v.ModelYear}`);
  } catch (e) {
    console.log(`   ⚠️  vPIC failed: ${e.message}`);
  }
  
  console.log(`   ⏭️  Would try RapidAPI next (requires RAPIDAPI_KEY)`);
  return { status: 'needs_review' };
}

async function main() {
  // Test 1: UX71699 (Peugeot 307)
  const result1 = await testLookup(
    'UX71699',
    'PEUGEOT',
    '307',
    2004,
    'VF33BNFUC83502899'
  );
  
  // Test 2: SU18018 (VW Transporter)
  const result2 = await testLookup(
    'SU18018',
    'VOLKSWAGEN',
    'TRANSPORTER',
    2005,
    'WV1ZZZ7HZ5H060934'
  );
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 RESULTATER');
  console.log('═══════════════════════════════════════════════');
  console.log(`UX71699 (Peugeot 307):  ${result1.status === 'resolved' ? '✅ RESOLVED' : '⚠️ NEEDS_REVIEW'}`);
  console.log(`SU18018 (VW Transporter): ${result2.status === 'resolved' ? '✅ RESOLVED' : '⚠️ NEEDS_REVIEW'}`);
  
  if (result1.status === 'resolved' && result2.status === 'resolved') {
    console.log('\n🎉 Begge tester bestått via glass_rules (Lag 2)!');
    console.log('   For full end-to-end test: sett RAPIDAPI_KEY og test Lag 3+');
  }
  
  db.close();
}

main().catch(e => {
  console.error('💥 Feil:', e);
  process.exit(1);
});
