-- Migration 0019: SVV → TecDoc fuzzy match results (Fase 1 MemPalace)
-- =============================================================================
-- Stores every SVV lookup → normalized vehicle → TecDoc kType resolution.
-- GDPR: regnr_hash (SHA-256) is the canonical lookup key; raw regnr is stored
--       for debugging only and should be purged by retention policy.

CREATE TABLE IF NOT EXISTS svv_tecdoc_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr TEXT, -- nullable: store raw regnr only for debug; production lookups use regnr_hash
  regnr_hash TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  normalized_make TEXT NOT NULL,
  normalized_model TEXT NOT NULL,
  ktype INTEGER,
  tecdoc_brand TEXT,
  tecdoc_model TEXT,
  tecdoc_year_from INTEGER,
  tecdoc_year_to INTEGER,
  confidence_score REAL CHECK(confidence_score BETWEEN 0.0 AND 1.0),
  confidence_level TEXT DEFAULT 'none' CHECK(confidence_level IN ('exact','high','medium','low','none')),
  match_reasons TEXT, -- JSON array of strings
  svv_status TEXT NOT NULL DEFAULT 'ok'
    CHECK(svv_status IN ('ok','not_found','auth_error','upstream_error','parse_error','not_configured')),
  svv_source TEXT DEFAULT 'svv.enkeltoppslag',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- Primary lookups (composite index on regnr_hash+created_at covers single hash lookups)
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_ktype ON svv_tecdoc_matches(ktype) WHERE ktype IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_make_model ON svv_tecdoc_matches(normalized_make, normalized_model);
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_expires ON svv_tecdoc_matches(expires_at) WHERE expires_at IS NOT NULL;

-- Time-series ordering + composite for "latest match for regnr_hash" queries
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_created ON svv_tecdoc_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_svv_tecdoc_hash_created ON svv_tecdoc_matches(regnr_hash, created_at DESC);
