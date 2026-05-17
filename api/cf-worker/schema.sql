-- Autoglass AS — D1 Schema for glasskatalog
-- ==========================================
-- Kjør: wrangler d1 execute glass-catalog-db --file=schema.sql

DROP TABLE IF EXISTS glass_catalog;
DROP TABLE IF EXISTS prefix4_cache;

CREATE TABLE glass_catalog (
  eurocode TEXT PRIMARY KEY,
  article_number TEXT,
  scan_number TEXT,
  category TEXT NOT NULL,
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
  oem_numbers TEXT,        -- JSON array
  cross_references TEXT,   -- JSON array
  nags_codes TEXT,         -- JSON array
  weight REAL,
  width REAL,
  height REAL,
  thickness REAL,
  description TEXT,
  prefix4 TEXT,
  image_url TEXT,
  pdf_url TEXT,
  source TEXT,
  last_updated TEXT
);

CREATE INDEX idx_brand_model ON glass_catalog(brand, model);
CREATE INDEX idx_year ON glass_catalog(year_from, year_to);
CREATE INDEX idx_prefix4 ON glass_catalog(prefix4);
CREATE INDEX idx_category ON glass_catalog(category);
CREATE INDEX idx_eurocode ON glass_catalog(eurocode);

CREATE TABLE prefix4_cache (
  cache_key TEXT PRIMARY KEY,
  prefix4 TEXT NOT NULL,
  confidence REAL DEFAULT 1.0
);

CREATE INDEX idx_prefix4_key ON prefix4_cache(cache_key);
