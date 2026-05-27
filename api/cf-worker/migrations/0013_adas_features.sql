-- Migration 0013: Add adas_features column to glass_catalog
-- Stores detailed ADAS feature list as JSON array (e.g. ["Lane Keep Assist", "Adaptive Cruise"])

ALTER TABLE glass_catalog ADD COLUMN adas_features TEXT;
