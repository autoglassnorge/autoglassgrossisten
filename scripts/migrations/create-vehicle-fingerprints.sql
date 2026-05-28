-- Vehicle Fingerprint Table
-- Maps SVV typeCode + make + year → known models/generations
-- Used to improve regnr search accuracy

CREATE TABLE IF NOT EXISTS vehicle_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  make TEXT NOT NULL,
  type_code TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  model_hint TEXT,
  models TEXT, -- JSON array of observed models
  engine_codes TEXT, -- JSON array
  fuel_codes TEXT, -- JSON array
  sample_count INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(make, type_code, year_from, year_to)
);

CREATE INDEX IF NOT EXISTS idx_fp_make_type ON vehicle_fingerprints(make, type_code);
CREATE INDEX IF NOT EXISTS idx_fp_make_model ON vehicle_fingerprints(make, model_hint);
CREATE INDEX IF NOT EXISTS idx_fp_year ON vehicle_fingerprints(year_from, year_to);
