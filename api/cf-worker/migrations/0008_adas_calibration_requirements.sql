-- Migration 0008: Add ADAS calibration requirements table (Hella Gutmann CSC)
-- ============================================================================
-- This table stores post-installation calibration requirements for vehicles
-- with ADAS sensors. Data sourced from Hella Gutmann CSC Coverage List.
--
-- When a windshield is replaced on a vehicle with ADAS, the sensors behind
-- the glass often require recalibration. This table tells workshops:
--   - WHICH sensors need calibration (front camera, radar, etc.)
--   - WHAT type of calibration (static = target plate, dynamic = road test)
--   - WHEN calibration is triggered (#1-#6: windshield replacement, trouble code, etc.)
--   - WHICH CSC target plate is needed (CSC 1-01, CSC 1-05, etc.)

CREATE TABLE IF NOT EXISTS adas_calibration_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  sensor_type TEXT NOT NULL,  -- front_camera, rear_camera, area_camera, front_radar, rear_radar, laser_sensor, front_corner_radar
  sensor_label TEXT NOT NULL, -- human-readable label
  calibration_triggers TEXT,  -- JSON array ["#1","#2",...]
  calibration_type TEXT,      -- static, dynamic, both
  csc_tool_supported INTEGER DEFAULT 0,
  target_plate TEXT,
  notes TEXT,
  source TEXT DEFAULT 'hella_gutmann_v78',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cal_brand_model ON adas_calibration_requirements(brand, model);
CREATE INDEX IF NOT EXISTS idx_cal_year ON adas_calibration_requirements(year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_cal_sensor ON adas_calibration_requirements(sensor_type);
