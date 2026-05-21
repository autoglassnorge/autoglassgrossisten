-- Migration 0006: Ground Truth table for verified vehicle-to-glass mappings
-- Sources: auto-glass.no, manual verification, supplier data
-- GDPR-safe: regnr is hashed (SHA-256), no personal data stored in plaintext

CREATE TABLE IF NOT EXISTS ground_truth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr_hash TEXT NOT NULL UNIQUE,
  vin TEXT,
  vin_prefix TEXT,
  k_type INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  submodel TEXT,
  frontrute_eurocode TEXT,
  bakrute_eurocode TEXT,
  sideglass_fv_eurocode TEXT,
  sideglass_fh_eurocode TEXT,
  sideglass_bv_eurocode TEXT,
  sideglass_bh_eurocode TEXT,
  dor_fv_eurocode TEXT,
  dor_fh_eurocode TEXT,
  dor_bv_eurocode TEXT,
  dor_bh_eurocode TEXT,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url TEXT,
  confidence REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_gt_regnr_hash ON ground_truth(regnr_hash);
CREATE INDEX IF NOT EXISTS idx_gt_make_model_year ON ground_truth(make, model, year);
CREATE INDEX IF NOT EXISTS idx_gt_vin_prefix ON ground_truth(vin_prefix);
