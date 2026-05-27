-- =============================================================================
-- Migration 0007: Hybrid VIN → Glass/KType resolution engine
-- Oversatt fra PostgreSQL til SQLite/D1 av glass-worker-agent
-- =============================================================================
-- Lag: gratis (SVV-cache) → intern regelbase → betalt fallback (MACS VIS / AGM)
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1. VIN decode cache (gratis SVV-resultater, unngår gjentatte kall)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vin_decode_cache (
  vin              TEXT         PRIMARY KEY,
  market           TEXT         NOT NULL DEFAULT 'EU',
  source           TEXT         NOT NULL DEFAULT 'svv', -- 'svv' | 'vpic' | 'manual'
  make             TEXT,
  model            TEXT,
  year             INTEGER,
  body_style       TEXT,
  doors            INTEGER,
  engine_type      TEXT,
  drive_type       TEXT,
  raw_payload      TEXT         NOT NULL DEFAULT '{}', -- JSON som TEXT
  normalized_key   TEXT,        -- f.eks. 'volkswagen:golf:2020:hatchback:5'
  confidence       REAL         NOT NULL DEFAULT 0,
  decoded_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vin_decode_normalized_key
  ON vin_decode_cache (normalized_key);

CREATE INDEX IF NOT EXISTS idx_vin_decode_expires_at
  ON vin_decode_cache (expires_at);

-- -----------------------------------------------------------------------
-- 2. Glass-rules: lærende regelbase for normaliserte kjøretøy/glass
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_rules (
  id                INTEGER      PRIMARY KEY AUTOINCREMENT,
  normalized_key    TEXT         NOT NULL, -- 'make:model:year:body:doors'
  market            TEXT         NOT NULL DEFAULT 'EU',
  opening           TEXT         NOT NULL DEFAULT 'windshield', -- 'windshield' | 'backglass' | 'door_glass_left_front' | ...
  feature_signature TEXT         NOT NULL DEFAULT 'default', -- 'windshield|camera:1|hud:0|rain:1|heated:0'
  ktype             INTEGER,
  kba               TEXT,
  nags              TEXT,
  oem_part_number   TEXT,
  eurocode          TEXT,
  confidence        REAL         NOT NULL DEFAULT 0.80,
  evidence_count    INTEGER      NOT NULL DEFAULT 1,
  last_verified_at  DATETIME,
  active            INTEGER      NOT NULL DEFAULT 1, -- SQLite boolean: 0/1
  notes             TEXT,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unik index på (normalized_key, market, opening, feature_signature)
CREATE UNIQUE INDEX IF NOT EXISTS uq_glass_rules_key
  ON glass_rules (normalized_key, market, opening, feature_signature);

CREATE INDEX IF NOT EXISTS idx_glass_rules_ktype
  ON glass_rules (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_rules_active
  ON glass_rules (active);

-- -----------------------------------------------------------------------
-- 3. Provider calls — observability, kost og latency
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_calls (
  id               INTEGER      PRIMARY KEY AUTOINCREMENT,
  request_id       TEXT,        -- fritekst-referanse, ikke FK (D1 har ikke strict FK)
  provider         TEXT         NOT NULL, -- 'svv' | 'vpic' | 'macs_vis' | 'autoglass_match' | 'bovsoft' | 'biluppgifter'
  operation        TEXT         NOT NULL, -- 'decode_vin' | 'resolve_glass' | 'batch_decode'
  success          INTEGER      NOT NULL DEFAULT 0, -- 0/1
  http_status      INTEGER,
  latency_ms       INTEGER,
  cost_amount      REAL,
  cost_currency    TEXT,
  request_payload  TEXT,        -- JSON som TEXT
  response_payload TEXT,        -- JSON som TEXT
  error_message    TEXT,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_calls_provider_date
  ON provider_calls (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_calls_request_id
  ON provider_calls (request_id);

-- -----------------------------------------------------------------------
-- 4. Resolution requests — spor hver VIN→glass forespørsel
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_resolution_requests (
  id                INTEGER      PRIMARY KEY AUTOINCREMENT,
  vin               TEXT         NOT NULL,
  opening           TEXT         NOT NULL DEFAULT 'windshield',
  market            TEXT         NOT NULL DEFAULT 'EU',
  mode              TEXT         NOT NULL DEFAULT 'auto', -- 'auto' | 'free_only' | 'paid_only'
  features          TEXT         NOT NULL DEFAULT '{}', -- JSON som TEXT
  feature_signature TEXT,
  status            TEXT         NOT NULL DEFAULT 'pending', -- 'pending' | 'resolved' | 'needs_review' | 'failed'
  resolution_path   TEXT         NOT NULL DEFAULT '[]', -- JSON array som TEXT
  paid_lookup_used  INTEGER      NOT NULL DEFAULT 0, -- 0/1
  chosen_match_id   INTEGER,
  provider_cost     REAL,
  cost_currency     TEXT         DEFAULT 'USD',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME
);

CREATE INDEX IF NOT EXISTS idx_glass_req_vin
  ON glass_resolution_requests (vin);

CREATE INDEX IF NOT EXISTS idx_glass_req_status
  ON glass_resolution_requests (status);

-- -----------------------------------------------------------------------
-- 5. Match candidates — kandidater fra regler og leverandører
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_match_candidates (
  id               INTEGER      PRIMARY KEY AUTOINCREMENT,
  request_id       INTEGER      NOT NULL,
  source           TEXT         NOT NULL, -- 'internal_rules' | 'cache' | 'macs_vis' | 'autoglass_match' | 'manual'
  ktype            INTEGER,
  kba              TEXT,
  nags             TEXT,
  oem_part_number  TEXT,
  eurocode         TEXT,
  glass_part_type  TEXT,
  confidence       REAL         NOT NULL,
  rank_            INTEGER      NOT NULL DEFAULT 1, -- 'rank' er reservert ord i SQLite
  raw_payload      TEXT         NOT NULL DEFAULT '{}', -- JSON som TEXT
  accepted         INTEGER      NOT NULL DEFAULT 0, -- 0/1
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_request_id
  ON glass_match_candidates (request_id);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_ktype
  ON glass_match_candidates (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_source
  ON glass_match_candidates (source);

-- -----------------------------------------------------------------------
-- 6. Hjelpefunksjon: normaliser kjøretøynøkkel (inline i app-kode, ikke stored proc)
-- SQLite/D1 støtter ikke CREATE FUNCTION. Bruk app-kode istedenfor:
--   LOWER(REPLACE(TRIM(make)||':'||TRIM(model)||':'||year||':'||
--                 COALESCE(TRIM(body_style),'unknown')||':'||
--                 COALESCE(doors,''), ' ', '_'))
-- -----------------------------------------------------------------------

-- -----------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------
