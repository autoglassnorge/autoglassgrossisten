📖 Lest 6 entries fra data/bovsoft-bootstrap-results.json

✅ BS12345 → SKODA SUPERB 2009 → kType 32787 (key: skoda:superb:2009)
✅ EL12345 → THINK CITY 2010 → kType 12152 (key: think:city:2010)
✅ PA12345 → VOLVO 240 1974 → kType 6272 (key: volvo:240:1974)
✅ SD98765 → OPEL GRANDLAND 2019 → kType 136486 (key: opel:grandland:2019)
✅ UX71699 → PEUGEOT 307 2003 → kType 18550 (key: peugeot:307:2003)
✅ SU18018 → VW CARAVELLE 2003 → kType 17370 (key: vw:caravelle:2003)

📤 Genererer SQL...

-- Seeder glass_rules med 6 Bovsoft-entries
-- Generert: 2026-05-21T19:45:40.090Z
-- Kilde: data/bovsoft-bootstrap-results.json

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'skoda:superb:2009', 'EU', 'windshield', 'default',
  32787, 'skoda-superb-2009', '43R-032787', 'E1-32787',
  0.95, 1, 1, 'bovsoft_seed:BS12345:vin=TMBJE73T7B9015131',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'think:city:2010', 'EU', 'windshield', 'default',
  12152, 'think-city-2010', '43R-012152', 'E1-12152',
  0.95, 1, 1, 'bovsoft_seed:EL12345:vin=YYCFT26B38J005067',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'volvo:240:1974', 'EU', 'windshield', 'default',
  6272, 'volvo-240-1974', '43R-006272', 'E1-06272',
  0.95, 1, 1, 'bovsoft_seed:PA12345:vin=unknown',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'opel:grandland:2019', 'EU', 'windshield', 'default',
  136486, 'opel-grandland-2019', '43R-136486', 'E1-136486',
  0.95, 1, 1, 'bovsoft_seed:SD98765:vin=W0VZ45GB7MS073060',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'peugeot:307:2003', 'EU', 'windshield', 'default',
  18550, 'peugeot-307-2003', '43R-018550', 'E1-18550',
  0.95, 1, 1, 'bovsoft_seed:UX71699:vin=VF33BNFUC83502899',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, kba, oem_part_number, eurocode, confidence, evidence_count, active, notes, created_at, updated_at) VALUES (
  'vw:caravelle:2003', 'EU', 'windshield', 'default',
  17370, 'vw-caravelle-2003', '43R-017370', 'E1-17370',
  0.95, 1, 1, 'bovsoft_seed:SU18018:vin=unknown',
  datetime('now'), datetime('now')
) ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = COALESCE(excluded.ktype, glass_rules.ktype),
  confidence = excluded.confidence,
  evidence_count = glass_rules.evidence_count + 1,
  active = 1,
  updated_at = datetime('now');

💾 Lagret JSON til scripts/data/glass-rules-seed.json
