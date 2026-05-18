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

-- Metadata table for tracking
CREATE TABLE IF NOT EXISTS catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
