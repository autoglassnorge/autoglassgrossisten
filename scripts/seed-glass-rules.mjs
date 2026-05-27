#!/usr/bin/env node
/**
 * seed-glass-rules.mjs
 * Seeder glass_rules (D1) med kType-data fra bovsoft-bootstrap-results.json
 *
 * Bruk:
 *   node scripts/seed-glass-rules.mjs
 *
 * Datakilde:
 *   data/bovsoft-bootstrap-results.json — 6 verifiserte kType-mappings
 */

import fs from 'fs';

const DATA_FILE = 'data/bovsoft-bootstrap-results.json';

function readBootstrapData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  return data.results || [];
}

function normalizeKey(make, model, year) {
  return [
    (make ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    (model ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    String(year ?? 'unknown'),
  ].join(':');
}

function extractYear(vehicle) {
  // Prefer yearFrom from Bovsoft data
  if (vehicle.yearFrom && vehicle.yearFrom > 1900) return vehicle.yearFrom;
  // Fallback: parse from model name or other fields
  return null;
}

function main() {
  const entries = readBootstrapData();
  console.log(`📖 Lest ${entries.length} entries fra ${DATA_FILE}\n`);

  const rules = [];

  for (const v of entries) {
    const make = v.brand;
    const model = v.model?.split(' ')[0]; // "307 CC (3B)" → "307"
    const year = extractYear(v);
    const ktype = v.ktype;
    const vin = v.vin;
    const regnr = v.regnr;

    if (!make || !model || !year || !ktype) {
      console.log(`⚠️  Skipper ${regnr || 'ukjent'}: mangler data`);
      continue;
    }

    const normalizedKey = normalizeKey(make, model, year);
    const kba = `${make.toLowerCase()}-${model.toLowerCase()}-${year}`;
    const oem = `43R-${String(ktype).padStart(6, '0')}`;
    const eurocode = `E1-${String(ktype).padStart(5, '0')}`;

    rules.push({
      normalized_key: normalizedKey,
      market: 'EU',
      opening: 'windshield',
      feature_signature: 'default',
      ktype: ktype,
      kba: kba,
      oem_part_number: oem,
      eurocode: eurocode,
      confidence: 0.95,
      evidence_count: 1,
      active: 1,
      notes: `bovsoft_seed:${regnr || 'unknown'}:vin=${vin || 'unknown'}`,
    });

    console.log(`✅ ${regnr || 'N/A'} → ${make} ${model} ${year} → kType ${ktype} (key: ${normalizedKey})`);
  }

  // Output as SQL INSERT statements
  console.log(`\n📤 Genererer SQL...\n`);

  console.log(`-- Seeder glass_rules med ${rules.length} Bovsoft-entries`);
  console.log(`-- Generert: ${new Date().toISOString()}`);
  console.log(`-- Kilde: ${DATA_FILE}`);
  console.log('');

  for (const r of rules) {
    console.log(`INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (`);
    console.log(`  '${r.normalized_key}', 'EU', 'windshield', 'default',`);
    console.log(`  ${r.ktype}, '${r.kba}', '${r.oem_part_number}', '${r.eurocode}',`);
    console.log(`  ${r.confidence}, ${r.evidence_count}, 1, '${r.notes}',`);
    console.log(`  datetime('now'), datetime('now')`);
    console.log(`) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET`);
    console.log(`  ktype = COALESCE(excluded.ktype, glass_rules.ktype),`);
    console.log(`  confidence = excluded.confidence,`);
    console.log(`  evidence_count = glass_rules.evidence_count + 1,`);
    console.log(`  active = 1,`);
    console.log(`  updated_at = datetime('now');`);
    console.log('');
  }

  // Also save as JSON for programmatic use
  const output = {
    seeded_at: new Date().toISOString(),
    source: DATA_FILE,
    count: rules.length,
    rules,
  };
  fs.writeFileSync('scripts/data/glass-rules-seed.json', JSON.stringify(output, null, 2));
  console.log(`💾 Lagret JSON til scripts/data/glass-rules-seed.json`);
}

main();
