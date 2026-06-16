-- Migration: BMW S-code features table + VIN cache column
-- ==========================================================
-- Date: 2026-06-13
-- Purpose: Store known BMW factory S-codes and cache scraped
--          S-codes per VIN for glass feature inference.

-- ---------------------------------------------------------------------------
-- bmw_s_code_features: known factory S-code → feature mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bmw_s_code_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  s_code TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  feature_value INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed known BMW S-codes from research
INSERT OR IGNORE INTO bmw_s_code_features (s_code, feature_name, feature_value, description) VALUES
-- Rain sensor
('S521A', 'rain_sensor', 1, 'Rain sensor'),
('S520A', 'rain_sensor', 1, 'Fog lights / rain sensor bundle'),
-- Heated windshield
('S534A', 'heated', 1, 'Heated windshield'),
('S533A', 'heated', 1, 'Heated rear window'),
-- Acoustic glass
('S536A', 'acoustic', 1, 'Acoustic glass (Schaumverglasung)'),
('S5ALA', 'acoustic', 1, 'Acoustic glass (alternative)'),
('S5AS', 'acoustic', 1, 'Acoustic glass (alternative)'),
-- HUD
('S610A', 'hud', 1, 'Head-up Display'),
('S6AM', 'hud', 1, 'Control Display / head-up'),
-- Camera / Surround View
('S548A', 'camera', 1, 'Kerb camera / Surround View'),
('S5DM', 'camera', 1, 'BMW Drive Recorder'),
('S5A1A', 'lane_assist', 1, 'Lane Keeping Assistant'),
('S5A2A', 'lane_assist', 1, 'Lane Change Warning'),
('S5AT', 'lane_assist', 1, 'Active Blind Spot Detection'),
('S609A', 'camera', 1, 'Navigation Professional (camera mount)'),
-- Antenna
('S693A', 'antenna', 1, 'Satellite tuner (embedded antenna)'),
('S6AE', 'antenna', 1, 'BMW TeleServices'),
('S6AK', 'antenna', 1, 'ConnectedDrive Services');

CREATE INDEX IF NOT EXISTS idx_bmw_s_code ON bmw_s_code_features(s_code);
CREATE INDEX IF NOT EXISTS idx_bmw_s_feature ON bmw_s_code_features(feature_name);

-- ---------------------------------------------------------------------------
-- vin_decode_cache: add bmw_s_codes JSON column
-- ---------------------------------------------------------------------------
ALTER TABLE vin_decode_cache ADD COLUMN bmw_s_codes TEXT;
