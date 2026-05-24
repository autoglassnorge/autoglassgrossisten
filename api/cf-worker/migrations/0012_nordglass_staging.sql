-- Nord Glass Staging Table
-- Created: 2026-05-24
-- Source: 659486770-Nord-Glass.pdf via pdfplumber extraction

CREATE TABLE IF NOT EXISTS nordglass_staging (
  id TEXT PRIMARY KEY,
  source_line_raw TEXT,
  nord_internal_code TEXT,
  sales_code TEXT,
  manufacturer_name TEXT NOT NULL,
  vehicle_model_name TEXT NOT NULL,
  vehicle_body_type_raw TEXT,
  production_from_raw TEXT NOT NULL,
  production_to_raw TEXT,
  product_family TEXT NOT NULL,
  glass_category TEXT NOT NULL,
  glass_position TEXT NOT NULL,
  side TEXT,
  opening_type TEXT,
  tint_code TEXT,
  feature_codes_json TEXT,
  has_sensor INTEGER,
  has_heating INTEGER,
  has_vin_window INTEGER,
  has_antenna INTEGER,
  dimensions_raw TEXT,
  width_mm INTEGER,
  height_mm INTEGER,
  dedupe_key TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'HOLD',
  parse_warnings_json TEXT,
  parse_errors_json TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  review_notes TEXT,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_nordglass_dedupe ON nordglass_staging(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_nordglass_status ON nordglass_staging(parse_status);
CREATE INDEX IF NOT EXISTS idx_nordglass_mfr ON nordglass_staging(manufacturer_name);
CREATE INDEX IF NOT EXISTS idx_nordglass_model ON nordglass_staging(vehicle_model_name);
CREATE INDEX IF NOT EXISTS idx_nordglass_family ON nordglass_staging(product_family);
CREATE INDEX IF NOT EXISTS idx_nordglass_position ON nordglass_staging(glass_position);
