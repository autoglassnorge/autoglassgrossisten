-- Migration: Add kType support for statistical learning
-- Applied: 2026-05-19

-- Add ktype column to glass_catalog for direct TecDoc type matching
ALTER TABLE glass_catalog ADD COLUMN ktype INTEGER;

-- Index for fast ktype lookups
CREATE INDEX IF NOT EXISTS idx_ktype ON glass_catalog(ktype);

-- Table for statistical learning: regnr → ktype → eurocode mapping
CREATE TABLE IF NOT EXISTS ktype_matches (
  regnr TEXT PRIMARY KEY,
  ktype INTEGER NOT NULL,
  eurocode TEXT NOT NULL,
  matched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ktype_matches_ktype ON ktype_matches(ktype);
CREATE INDEX IF NOT EXISTS idx_ktype_matches_eurocode ON ktype_matches(eurocode);
