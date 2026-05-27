-- Migration 0007: Add equipment columns to ground_truth
-- Enables exact matching by equipment configuration, not just regnr.
-- This allows building equipment signatures per make:model:year over time.

ALTER TABLE ground_truth ADD COLUMN adas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN rain_sensor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN heated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN acoustic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN antenna INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN hud INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN camera INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN shade INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ground_truth ADD COLUMN properties TEXT; -- JSON blob for extra metadata

-- Index for equipment-based lookups (e.g. "find all BMW 320d 2020 with ADAS")
CREATE INDEX IF NOT EXISTS idx_gt_equipment ON ground_truth(make, model, year, adas, rain_sensor, heated, acoustic, antenna, hud, camera);
