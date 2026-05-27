-- D1 Schema for Autoglass Catalog
-- ================================

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
CREATE INDEX IF NOT EXISTS idx_model_nocase ON glass_catalog(model COLLATE NOCASE);

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

-- Rate limiting (D1-basert, unngår KV write-kvote)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  expires_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_ktype_matches_last_seen ON ktype_matches(last_seen DESC);
