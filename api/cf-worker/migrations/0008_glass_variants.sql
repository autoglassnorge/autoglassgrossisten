-- =============================================================================
-- Migration 0008: glass_variants per kType
-- Formål: lagre alle kjente glassvarianter per kType fra ekstern katalog/provider
-- =============================================================================

CREATE TABLE IF NOT EXISTS glass_variants (
  id                INTEGER      PRIMARY KEY AUTOINCREMENT,
  ktype             INTEGER      NOT NULL,
  market            TEXT         NOT NULL DEFAULT 'EU',
  source            TEXT         NOT NULL, -- 'macs_vis' | 'tecdoc' | 'manual' | ...
  opening           TEXT         NOT NULL, -- 'windshield' | 'backglass' | 'sideglass' | ...
  opening_raw       TEXT,
  eurocode          TEXT,
  oem_part_number   TEXT,
  article_number    TEXT,
  description       TEXT,
  feature_signature TEXT         NOT NULL DEFAULT 'default',
  features_json     TEXT         NOT NULL DEFAULT '{}',
  raw_payload       TEXT         NOT NULL DEFAULT '{}',
  confidence        REAL         NOT NULL DEFAULT 0.80,
  active            INTEGER      NOT NULL DEFAULT 1,
  first_seen_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_glass_variants_identity
  ON glass_variants (ktype, market, source, opening, COALESCE(eurocode, ''), COALESCE(oem_part_number, ''), COALESCE(article_number, ''));

CREATE INDEX IF NOT EXISTS idx_glass_variants_ktype
  ON glass_variants (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_variants_opening
  ON glass_variants (opening);

CREATE INDEX IF NOT EXISTS idx_glass_variants_source
  ON glass_variants (source);

CREATE INDEX IF NOT EXISTS idx_glass_variants_active
  ON glass_variants (active);

CREATE INDEX IF NOT EXISTS idx_glass_variants_eurocode
  ON glass_variants (eurocode);
