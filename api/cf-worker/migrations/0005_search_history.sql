-- Migration 0005: Search History for Learning Engine
-- GDPR-safe: regnr is hashed (SHA-256), no personal data stored
-- This table learns from every search to improve future matching

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr_hash TEXT NOT NULL,           -- SHA-256 hash of regnr (GDPR-safe)
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
  layer INTEGER DEFAULT 4,             -- Which matching layer found the result
  confidence TEXT DEFAULT 'none',
  source TEXT DEFAULT 'unknown',        -- biluppgifter, catalog_guess, none
  vin_prefix TEXT,                      -- First 6 chars of VIN (anonymized)
  search_count INTEGER DEFAULT 1,       -- How many times this regnr was searched
  created_at TEXT DEFAULT datetime('now'),
  updated_at TEXT DEFAULT datetime('now')
);

CREATE INDEX IF NOT EXISTS idx_search_regnr_hash ON search_history(regnr_hash);
CREATE INDEX IF NOT EXISTS idx_search_make_model ON search_history(make, model);
CREATE INDEX IF NOT EXISTS idx_search_vin_prefix ON search_history(vin_prefix);
CREATE INDEX IF NOT EXISTS idx_search_generation ON search_history(generation);

-- Aggregate view: equipment frequency per (make, model, year)
CREATE VIEW IF NOT EXISTS v_equipment_by_vehicle AS
SELECT
  make,
  model,
  year,
  generation,
  COUNT(*) as search_count,
  AVG(equipment_adas) as adas_prob,
  AVG(equipment_rain_sensor) as rain_sensor_prob,
  AVG(equipment_heated) as heated_prob,
  AVG(equipment_acoustic) as acoustic_prob,
  AVG(equipment_antenna) as antenna_prob,
  AVG(equipment_hud) as hud_prob,
  AVG(equipment_camera) as camera_prob,
  AVG(equipment_shade) as shade_prob,
  GROUP_CONCAT(DISTINCT chosen_eurocode) as known_eurocodes
FROM search_history
WHERE search_count >= 3
GROUP BY make, model, year, generation;
