-- Migration 0009: ktype_registry staging table
-- =============================================
-- Stores verified kType data from Bovsoft/Finn.no scraping
-- Used to enrich glass_catalog matching and ADAS calibration lookup
--
-- Populated by: scripts/generate-ktype-inserts.mjs
-- Source: data/finn-no-regnr/verified-bovsoft.ndjson

CREATE TABLE IF NOT EXISTS ktype_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ktype INTEGER NOT NULL,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  body TEXT,
  source TEXT DEFAULT 'finn_bovsoft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ktype_registry_ktype ON ktype_registry(ktype);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_year ON ktype_registry(year_from, year_to);

-- Clear existing finn_bovsoft data before re-insert (idempotent)
DELETE FROM ktype_registry WHERE source = 'finn_bovsoft';
