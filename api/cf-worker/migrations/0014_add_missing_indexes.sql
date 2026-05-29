-- Migration 0014: Add Missing Indexes
-- ======================================
-- Generated: 2026-05-29T19:53:53.093Z
-- Idempotent: all CREATE INDEX use IF NOT EXISTS

-- glass_catalog: idx_catalog_prefix4 (prefix4)
CREATE INDEX IF NOT EXISTS idx_catalog_prefix4 ON glass_catalog(prefix4);

-- glass_catalog: idx_catalog_eurocode (eurocode)
CREATE INDEX IF NOT EXISTS idx_catalog_eurocode ON glass_catalog(eurocode);

-- glass_catalog: idx_catalog_brand (brand)
CREATE INDEX IF NOT EXISTS idx_catalog_brand ON glass_catalog(brand);

-- glass_catalog: idx_catalog_ktype (ktype)
CREATE INDEX IF NOT EXISTS idx_catalog_ktype ON glass_catalog(ktype);

-- glass_rules: idx_rules_key (normalized_key, active)
CREATE INDEX IF NOT EXISTS idx_rules_key ON glass_rules(normalized_key, active);

-- vin_decode_cache: idx_vin (vin)
CREATE INDEX IF NOT EXISTS idx_vin ON vin_decode_cache(vin);

-- rate_limits: idx_rate (key, expires_at)
CREATE INDEX IF NOT EXISTS idx_rate ON rate_limits(key, expires_at);

-- search_history: idx_search_vin (vin_prefix)
CREATE INDEX IF NOT EXISTS idx_search_vin ON search_history(vin_prefix);

-- Index health check (run manually to verify coverage)
-- SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('glass_catalog', 'glass_rules', 'vin_decode_cache', 'rate_limits', 'search_history', 'ktype_matches', 'ktype_registry') ORDER BY tbl_name, name;