-- =============================================================================
-- Migration 0009: extend glass_variants with sensor/fitment structure + evidence
-- Formål: strukturere sensor-konfigurasjoner (ADAS/HUD/RLS/etc) for trygg matching,
--         post-install krav og provenance/evidence på radnivå.
-- =============================================================================

ALTER TABLE glass_variants ADD COLUMN mounting_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE glass_variants ADD COLUMN post_install_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE glass_variants ADD COLUMN camera_present INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN camera_type TEXT;
ALTER TABLE glass_variants ADD COLUMN rain_sensor_present INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN rain_sensor_mount_type TEXT;
ALTER TABLE glass_variants ADD COLUMN hud_present INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN hud_compatible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN heated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN heated_wiper_park INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN acoustic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN solar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN antenna INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN encapsulation INTEGER NOT NULL DEFAULT 0;

ALTER TABLE glass_variants ADD COLUMN adas_calibration_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN adas_calibration_type TEXT;
ALTER TABLE glass_variants ADD COLUMN sensor_initialization_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glass_variants ADD COLUMN hud_verification_required INTEGER NOT NULL DEFAULT 0;

ALTER TABLE glass_variants ADD COLUMN fitment_risk TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE glass_variants ADD COLUMN match_type TEXT;
ALTER TABLE glass_variants ADD COLUMN match_score REAL;
ALTER TABLE glass_variants ADD COLUMN input_file TEXT;

CREATE INDEX IF NOT EXISTS idx_glass_variants_ktype_opening
  ON glass_variants (ktype, market, opening);

CREATE INDEX IF NOT EXISTS idx_glass_variants_oem_part_number
  ON glass_variants (oem_part_number);

CREATE INDEX IF NOT EXISTS idx_glass_variants_camera_hud
  ON glass_variants (camera_present, hud_present, opening);

CREATE INDEX IF NOT EXISTS idx_glass_variants_rain_sensor
  ON glass_variants (rain_sensor_present, rain_sensor_mount_type);

CREATE INDEX IF NOT EXISTS idx_glass_variants_calibration
  ON glass_variants (adas_calibration_required, adas_calibration_type);

CREATE INDEX IF NOT EXISTS idx_glass_variants_match_quality
  ON glass_variants (match_type, match_score, confidence);

CREATE TABLE IF NOT EXISTS glass_variant_evidence (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  glass_variant_id    INTEGER,
  ktype               INTEGER,
  source              TEXT NOT NULL,
  match_type          TEXT NOT NULL,
  match_score         REAL NOT NULL,
  matched_tokens_json TEXT NOT NULL DEFAULT '[]',
  feature_gate_passed INTEGER NOT NULL DEFAULT 0,
  input_file          TEXT,
  evidence_payload    TEXT NOT NULL DEFAULT '{}',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (glass_variant_id) REFERENCES glass_variants(id)
);

CREATE INDEX IF NOT EXISTS idx_glass_variant_evidence_variant
  ON glass_variant_evidence (glass_variant_id);

CREATE INDEX IF NOT EXISTS idx_glass_variant_evidence_ktype
  ON glass_variant_evidence (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_variant_evidence_score
  ON glass_variant_evidence (match_type, match_score);
