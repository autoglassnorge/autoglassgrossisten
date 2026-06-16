-- Migration 0021: Ground Truth Feedback System
-- Adds tracking for installer (montør) selections and a dedicated ground truth log.
-- This enables the system to learn VIN→eurocode mappings from manual selections
-- and improve future lookup confidence.

-- ---------------------------------------------------------------------------
-- 1. Add selected/feedback columns to glass_resolution_requests
-- ---------------------------------------------------------------------------
ALTER TABLE glass_resolution_requests ADD COLUMN selected_eurocode TEXT;
ALTER TABLE glass_resolution_requests ADD COLUMN selected_ktype INTEGER;
ALTER TABLE glass_resolution_requests ADD COLUMN selected_confidence REAL;
ALTER TABLE glass_resolution_requests ADD COLUMN selection_method TEXT;
ALTER TABLE glass_resolution_requests ADD COLUMN feedback_at DATETIME;
ALTER TABLE glass_resolution_requests ADD COLUMN verified INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_resolution_selected_eurocode ON glass_resolution_requests(selected_eurocode);

-- ---------------------------------------------------------------------------
-- 2. Create ground_truth_log table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ground_truth_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vin TEXT NOT NULL,
  eurocode TEXT NOT NULL,
  ktype INTEGER,
  features TEXT,
  source TEXT,
  confidence REAL NOT NULL DEFAULT 0.99,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ground_truth_log_vin ON ground_truth_log(vin);
CREATE INDEX IF NOT EXISTS idx_ground_truth_log_eurocode ON ground_truth_log(eurocode);
CREATE INDEX IF NOT EXISTS idx_ground_truth_log_created ON ground_truth_log(created_at);
