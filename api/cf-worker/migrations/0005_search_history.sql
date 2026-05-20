-- Migration 0005: Search History for Learning Engine
-- GDPR-safe: regnr is hashed (SHA-256), no personal data stored
-- This table learns from every search to improve future matching

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

CREATE INDEX IF NOT EXISTS idx_search_regnr_hash ON search_history(regnr_hash);
CREATE INDEX IF NOT EXISTS idx_search_make_model ON search_history(make, model);
CREATE INDEX IF NOT EXISTS idx_search_vin_prefix ON search_history(vin_prefix);
CREATE INDEX IF NOT EXISTS idx_search_generation ON search_history(generation);
