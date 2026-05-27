-- =============================================================================
-- Batch-seed glass_rules med kjente kType-mappings
-- Generert: 2026-05-21T20:21:28.545Z
-- Antall mappings: 6
-- =============================================================================

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('skoda:superb_ii_stasjonsvogn_3t5:2009', 'EU', 'windshield', 'default', 32787, 0.95, 1, 1, 'regnr:BS12345', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('think:city:2010', 'EU', 'windshield', 'default', 12152, 0.95, 1, 1, 'regnr:EL12345', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:240_p242_p244:1974', 'EU', 'windshield', 'default', 6272, 0.95, 1, 1, 'regnr:PA12345', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('opel:grandland_x_a18:2019', 'EU', 'windshield', 'default', 136486, 0.95, 1, 1, 'regnr:SD98765', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('peugeot:307_cc_3b:2003', 'EU', 'windshield', 'default', 18550, 0.95, 1, 1, 'regnr:UX71699', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:caravelle_v_buss_7hb_7hj_7eb_7ej_7ef_7eg_7hf_7ec:2003', 'EU', 'windshield', 'default', 17370, 0.95, 1, 1, 'regnr:SU18018', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  updated_at = datetime('now');
