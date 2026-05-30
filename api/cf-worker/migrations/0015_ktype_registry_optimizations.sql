-- Migration 0015: Optimize ktype_registry indexes for TecDoc D1 resolver
-- ===================================================================
-- The resolveTecDocFromD1() query filters on:
--   source = 'tecdoc_1q2019'
--   brand IN (...)
--   year_from <= ? AND year_to >= ?
--
-- A composite index on (source, brand, year_from, year_to) is optimal
-- for this access pattern with 80K+ rows.

CREATE INDEX IF NOT EXISTS idx_ktype_registry_source_brand_year ON ktype_registry(source, brand, year_from, year_to);

-- Also add a covering index for brand+model lookups (if not already present)
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand_model ON ktype_registry(brand, model);

-- Add source index for efficient DELETE/INSERT of tecdoc batches
CREATE INDEX IF NOT EXISTS idx_ktype_registry_source ON ktype_registry(source);
