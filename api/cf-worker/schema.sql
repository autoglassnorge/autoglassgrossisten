-- D1 Schema for Autoglass Catalog
-- ================================
-- Canonical schema — apply via: wrangler d1 execute glass-catalog-db --file=schema.sql

CREATE TABLE IF NOT EXISTS glass_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eurocode TEXT NOT NULL UNIQUE,
  article_number TEXT,
  scan_number TEXT,
  category TEXT,
  supplier TEXT,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  adas INTEGER DEFAULT 0,
  rain_sensor INTEGER DEFAULT 0,
  heated INTEGER DEFAULT 0,
  acoustic INTEGER DEFAULT 0,
  antenna INTEGER DEFAULT 0,
  hud INTEGER DEFAULT 0,
  shade INTEGER DEFAULT 0,
  camera INTEGER DEFAULT 0,
  lane_assist INTEGER DEFAULT 0,
  price REAL,
  stock_status INTEGER DEFAULT 0,
  warehouse_location TEXT,
  oem_numbers TEXT,        -- JSON array as string
  cross_references TEXT,   -- JSON array as string
  weight REAL,
  dimensions TEXT,         -- JSON object as string
  description TEXT,
  prefix4 TEXT,
  image_url TEXT,
  pdf_url TEXT,
  source TEXT,
  nags_codes TEXT,         -- JSON array as string
  brand_original TEXT,
  ktype INTEGER,              -- TecDoc type ID (for exact matching)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_brand ON glass_catalog(brand);
CREATE INDEX IF NOT EXISTS idx_category ON glass_catalog(category);
CREATE INDEX IF NOT EXISTS idx_prefix4 ON glass_catalog(prefix4);
CREATE INDEX IF NOT EXISTS idx_year_from ON glass_catalog(year_from);
CREATE INDEX IF NOT EXISTS idx_year_to ON glass_catalog(year_to);
CREATE INDEX IF NOT EXISTS idx_supplier ON glass_catalog(supplier);
CREATE INDEX IF NOT EXISTS idx_eurocode ON glass_catalog(eurocode);
CREATE INDEX IF NOT EXISTS idx_ktype ON glass_catalog(ktype);

-- Composite indexes for hot query paths (added 2026-05-29)
CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_year ON glass_catalog(brand, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_model ON glass_catalog(brand, model);
CREATE INDEX IF NOT EXISTS idx_glass_catalog_brand_category ON glass_catalog(brand, category);

-- Metadata table for tracking
CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Statistical learning: (ktype, eurocode) frequency aggregation
-- ----------------------------------------------------------------------
-- GDPR-safe: NO regnr stored. Each successful match increments hit_count.
-- Layer 0 in the matching algorithm only trusts mappings with hit_count >= 3
-- (see KTYPE_CONFIDENCE_THRESHOLD in src/index.ts) to prevent cache poisoning.
CREATE TABLE IF NOT EXISTS ktype_matches (
  ktype       INTEGER  NOT NULL,
  eurocode    TEXT     NOT NULL,
  hit_count   INTEGER  NOT NULL DEFAULT 1,
  first_seen  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ktype, eurocode)
);

CREATE INDEX IF NOT EXISTS idx_ktype_matches_eurocode ON ktype_matches(eurocode);
CREATE INDEX IF NOT EXISTS idx_ktype_matches_last_seen ON ktype_matches(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_ktype_matches_cleanup ON ktype_matches(hit_count, last_seen)
  WHERE hit_count <= 2;

-- Rate limiting (D1-basert, unngår KV write-kvote)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  expires_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_expires ON rate_limits(key, expires_at);

-- Statistical learning: user feedback (GDPR-safe, no regnr stored)
-- ----------------------------------------------------------------------
-- Tracks which products users view/add to cart for each search.
-- Used to weight ktype_matches and improve scoreCandidate over time.
CREATE TABLE IF NOT EXISTS search_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr_hash TEXT NOT NULL,        -- SHA-256 of regnr (GDPR-safe)
  ktype INTEGER,
  eurocode TEXT NOT NULL,
  layer INTEGER,
  score INTEGER,
  action TEXT,                      -- 'view', 'cart', 'order'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_ktype_eurocode ON search_feedback(ktype, eurocode);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON search_feedback(created_at DESC);

-- Statistical learning: make/model/year -> ktype mapping rules
-- ----------------------------------------------------------------------
-- Learned from Bovsoft API and validated by search feedback.
-- normalized_key format: "make:model:year"
CREATE TABLE IF NOT EXISTS glass_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_key TEXT NOT NULL,
  market TEXT,
  opening TEXT,
  feature_signature TEXT,
  ktype INTEGER,
  kba TEXT,
  nags TEXT,
  oem_part_number TEXT,
  eurocode TEXT,
  confidence REAL NOT NULL DEFAULT 0.75,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_verified_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_glass_rules_key ON glass_rules(normalized_key);
CREATE INDEX IF NOT EXISTS idx_glass_rules_ktype ON glass_rules(ktype);
CREATE INDEX IF NOT EXISTS idx_glass_rules_active ON glass_rules(active);
CREATE INDEX IF NOT EXISTS idx_glass_rules_key_active ON glass_rules(normalized_key, active);

-- ktype_registry: learned/populated kType → vehicle mapping
-- ----------------------------------------------------------------------
-- Populated from Bovsoft API, TecDoc imports, or manual verification.
-- Used by Worker for kType → vehicle info lookups.
CREATE TABLE IF NOT EXISTS ktype_registry (
  ktype INTEGER PRIMARY KEY,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  body TEXT,
  source TEXT,
  confidence TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_model ON ktype_registry(model);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand_model ON ktype_registry(brand, model);

-- Search history for Learning Engine (GDPR-safe)
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr_hash TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  generation TEXT,
  body TEXT,
  chosen_eurocode TEXT,
  chosen_score INTEGER,
  equipment_adas INTEGER DEFAULT 0,
  equipment_rain_sensor INTEGER DEFAULT 0,
  equipment_heated INTEGER DEFAULT 0,
  equipment_acoustic INTEGER DEFAULT 0,
  equipment_antenna INTEGER DEFAULT 0,
  equipment_hud INTEGER DEFAULT 0,
  equipment_camera INTEGER DEFAULT 0,
  equipment_shade INTEGER DEFAULT 0,
  layer INTEGER DEFAULT 4,
  confidence TEXT DEFAULT 'none',
  source TEXT DEFAULT 'unknown',
  vin_prefix TEXT,
  search_count INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_search_make_model ON search_history(make, model);
CREATE INDEX IF NOT EXISTS idx_search_vin_prefix ON search_history(vin_prefix);
CREATE INDEX IF NOT EXISTS idx_search_generation ON search_history(generation);
CREATE INDEX IF NOT EXISTS idx_search_history_vehicle ON search_history(make, model, year);

-- Ground truth table for verified vehicle-to-glass mappings
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
  adas INTEGER NOT NULL DEFAULT 0,
  rain_sensor INTEGER NOT NULL DEFAULT 0,
  heated INTEGER NOT NULL DEFAULT 0,
  acoustic INTEGER NOT NULL DEFAULT 0,
  antenna INTEGER NOT NULL DEFAULT 0,
  hud INTEGER NOT NULL DEFAULT 0,
  camera INTEGER NOT NULL DEFAULT 0,
  shade INTEGER NOT NULL DEFAULT 0,
  properties TEXT,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url TEXT,
  confidence REAL NOT NULL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_gt_make_model_year ON ground_truth(make, model, year);
CREATE INDEX IF NOT EXISTS idx_gt_vin_prefix ON ground_truth(vin_prefix);
CREATE INDEX IF NOT EXISTS idx_gt_equipment ON ground_truth(make, model, year, adas, rain_sensor, heated, acoustic, antenna, hud, camera);

-- ADAS calibration requirements (Hella Gutmann CSC)
CREATE TABLE IF NOT EXISTS adas_calibration_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  sensor_type TEXT NOT NULL,
  sensor_label TEXT NOT NULL,
  calibration_triggers TEXT,
  calibration_type TEXT,
  csc_tool_supported INTEGER DEFAULT 0,
  target_plate TEXT,
  notes TEXT,
  source TEXT DEFAULT 'hella_gutmann_v78',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cal_brand_model ON adas_calibration_requirements(brand, model);
CREATE INDEX IF NOT EXISTS idx_cal_year ON adas_calibration_requirements(year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_cal_sensor ON adas_calibration_requirements(sensor_type);

-- Nord Glass staging table
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

-- ---------------------------------------------------------------------------
-- Tables referenced in code but previously missing from canonical schema
-- ---------------------------------------------------------------------------

-- VIN decode cache (used by vin-glass-resolver.ts)
CREATE TABLE IF NOT EXISTS vin_decode_cache (
  vin TEXT PRIMARY KEY,
  market TEXT,
  source TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  body_style TEXT,
  doors INTEGER,
  engine_type TEXT,
  drive_type TEXT,
  raw_payload TEXT,
  normalized_key TEXT,
  confidence REAL,
  expires_at DATETIME,
  decoded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vin_decode_cache_expires ON vin_decode_cache(expires_at);

-- Glass resolution requests (used by vin-glass-resolver.ts)
CREATE TABLE IF NOT EXISTS glass_resolution_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vin TEXT NOT NULL,
  opening TEXT,
  market TEXT,
  mode TEXT,
  features TEXT,
  feature_signature TEXT,
  status TEXT DEFAULT 'pending',
  resolution_path TEXT,
  paid_lookup_used INTEGER DEFAULT 0,
  provider_cost REAL,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resolution_vin ON glass_resolution_requests(vin);
CREATE INDEX IF NOT EXISTS idx_resolution_status ON glass_resolution_requests(status);

-- Provider call logs (used by vin-glass-resolver.ts)
CREATE TABLE IF NOT EXISTS provider_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  provider TEXT,
  operation TEXT,
  success INTEGER,
  http_status INTEGER,
  latency_ms INTEGER,
  cost_amount REAL,
  cost_currency TEXT,
  response_payload TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_provider_calls_request ON provider_calls(request_id);
CREATE INDEX IF NOT EXISTS idx_provider_calls_provider ON provider_calls(provider, created_at);

-- Glass match candidates (used by vin-glass-resolver.ts)
CREATE TABLE IF NOT EXISTS glass_match_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER,
  source TEXT,
  ktype INTEGER,
  kba TEXT,
  nags TEXT,
  oem_part_number TEXT,
  eurocode TEXT,
  confidence REAL,
  rank_ INTEGER,
  raw_payload TEXT,
  accepted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_candidates_request ON glass_match_candidates(request_id);

-- Quote requests (used by index.ts)
CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  eurocode TEXT NOT NULL,
  regnr TEXT,
  quantity INTEGER DEFAULT 1,
  message TEXT,
  status TEXT DEFAULT 'new',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quote_requests(created_at);

-- Vehicle fingerprints (used by index.ts for typeCode matching)
CREATE TABLE IF NOT EXISTS vehicle_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  make TEXT NOT NULL,
  type_code TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  model_hint TEXT,
  models TEXT,
  engine_codes TEXT,
  fuel_codes TEXT,
  sample_count INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_vehicle_fp_make_type ON vehicle_fingerprints(make, type_code);
CREATE INDEX IF NOT EXISTS idx_vf_make_typecode_year ON vehicle_fingerprints(make, type_code, year_from, year_to);
