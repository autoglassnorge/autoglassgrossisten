-- Migration 0022: Pilkington data import preparation
-- Date: 2026-06-13
-- Purpose: Add unique index for duplicate handling and optimize OE number lookups
-- before importing ~33,215 Pilkington glass products.

-- Unique index to prevent exact duplicate imports from the same source.
-- Note: SQLite UNIQUE allows multiple NULLs, so rows with NULL year_from/year_to
-- will not conflict with each other. This is intentional — different model
-- variants for the same eurocode are expected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_glass_catalog_pilkington_dedupe
  ON glass_catalog(eurocode, brand, model, year_from, year_to, category, source);

-- Index for OE number exact-match lookups (complements the LIKE-based search).
CREATE INDEX IF NOT EXISTS idx_glass_catalog_oem_numbers ON glass_catalog(oem_numbers);

-- Table for normalized OE → eurocode mappings (extracted from glass_catalog.oem_numbers).
-- This enables fast exact OE lookups instead of scanning the whole catalog with LIKE.
CREATE TABLE IF NOT EXISTS oe_eurocode_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oe_number TEXT NOT NULL COLLATE NOCASE,
  eurocode TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oe_mapping_unique ON oe_eurocode_mapping(oe_number, eurocode, source);
CREATE INDEX IF NOT EXISTS idx_oe_mapping_eurocode ON oe_eurocode_mapping(eurocode);
CREATE INDEX IF NOT EXISTS idx_oe_mapping_brand ON oe_eurocode_mapping(brand);

-- Metadata tracking
INSERT OR REPLACE INTO catalog_meta (key, value, updated_at) VALUES
  ('pilkington_import_started', '1', datetime('now'));
