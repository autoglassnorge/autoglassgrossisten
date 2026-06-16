-- Migration 0021: Volvo variant codes table + VIN cache column
-- =============================================================
-- Date: 2026-06-13
-- Purpose: Store known Volvo factory variant codes and cache
--          scraped variant codes per VIN for glass feature inference.

-- ---------------------------------------------------------------------------
-- volvo_variant_codes: known factory variant code → feature mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volvo_variant_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_code TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  feature_value INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed known variant codes from research
INSERT OR IGNORE INTO volvo_variant_codes (variant_code, feature_name, feature_value, description) VALUES
-- Windshield / glass variants
('FW01', 'windshield_variant', 1, 'Windshield variant code'),
('FW03', 'windshield_variant', 1, 'Windshield variant code'),
('FW04', 'windshield_variant', 1, 'Windshield variant code'),
-- Camera / stripe variants
('FX02', 'camera', 1, 'Camera/stripe variant'),
('FX04', 'camera', 1, 'Camera/stripe variant'),
-- Equipment packages
('T702', 'equipment_package', 1, 'Equipment package'),
('T801', 'equipment_package', 1, 'Equipment package'),
-- Rain sensor
('SENS', 'rain_sensor', 1, 'Rain sensor'),
('SENSOR', 'rain_sensor', 1, 'Rain sensor'),
('REGN', 'rain_sensor', 1, 'Rain sensor'),
('RSN', 'rain_sensor', 1, 'Rain sensor'),
-- Heated
('EL', 'heated', 1, 'Heated (electric)'),
('ELE', 'heated', 1, 'Heated (electric)'),
('HTB', 'heated', 1, 'Heated'),
('VARM', 'heated', 1, 'Heated'),
('UHTD', 'heated', 1, 'Heated'),
-- Acoustic
('AKU', 'acoustic', 1, 'Acoustic glass'),
('AKO', 'acoustic', 1, 'Acoustic glass'),
('ACO', 'acoustic', 1, 'Acoustic glass'),
('COAT', 'acoustic', 1, 'Acoustic coating'),
('QUIET', 'acoustic', 1, 'Acoustic / quiet'),
-- HUD
('HUD', 'hud', 1, 'Head-up display'),
('H.U.D', 'hud', 1, 'Head-up display'),
-- Camera
('CAM', 'camera', 1, 'Camera'),
('CAMERA', 'camera', 1, 'Camera'),
('KAMERA', 'camera', 1, 'Camera'),
-- Lane assist / ADAS
('LDW', 'lane_assist', 1, 'Lane departure warning'),
('ADAS', 'lane_assist', 1, 'ADAS / lane assist'),
('FILSKIFTE', 'lane_assist', 1, 'Lane assist'),
('CITY SAFETY', 'lane_assist', 1, 'City safety / collision assist'),
-- Antenna
('ANT', 'antenna', 1, 'Antenna'),
('ANTENNE', 'antenna', 1, 'Antenna'),
('GNAG', 'antenna', 1, 'Antenna');

CREATE INDEX IF NOT EXISTS idx_volvo_variant_code ON volvo_variant_codes(variant_code);
CREATE INDEX IF NOT EXISTS idx_volvo_variant_feature ON volvo_variant_codes(feature_name);

-- ---------------------------------------------------------------------------
-- vin_decode_cache: add volvo_variant_codes JSON column
-- ---------------------------------------------------------------------------
ALTER TABLE vin_decode_cache ADD COLUMN volvo_variant_codes TEXT;
