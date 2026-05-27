-- =============================================================================
-- Migration: 0010_vin_glass_hybrid
-- Hybrid VIN → Glass/KType resolution engine
-- Lag: gratis (vPIC) → intern cache/regler → betalt fallback (MACS VIS / AutoGlassMatch)
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1. VIN decode cache (gratis vPIC-resultater)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vin_decode_cache (
  vin              CHAR(17)     PRIMARY KEY,
  market           TEXT         NOT NULL DEFAULT 'EU',
  source           TEXT         NOT NULL, -- 'vpic' | 'manual'
  make             TEXT,
  model            TEXT,
  year             INT,
  body_style       TEXT,
  doors            INT,
  engine_type      TEXT,
  drive_type       TEXT,
  raw_payload      JSONB        NOT NULL DEFAULT '{}',
  normalized_key   TEXT,        -- e.g. 'volkswagen:golf:2020:hatchback:5'
  confidence       NUMERIC(5,4) NOT NULL DEFAULT 0,
  decoded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '60 days'
);

CREATE INDEX IF NOT EXISTS idx_vin_decode_normalized_key
  ON vin_decode_cache (normalized_key);

CREATE INDEX IF NOT EXISTS idx_vin_decode_expires_at
  ON vin_decode_cache (expires_at);

-- -----------------------------------------------------------------------
-- 2. Glassmatch-forespørsler (hoved-tabell)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_resolution_requests (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vin              CHAR(17)     NOT NULL,
  opening          TEXT         NOT NULL, -- 'windshield' | 'backglass' | 'door_glass_left_front' | ...
  market           TEXT         NOT NULL DEFAULT 'EU',
  mode             TEXT         NOT NULL DEFAULT 'auto', -- 'auto' | 'free_only' | 'paid_only'
  features         JSONB        NOT NULL DEFAULT '{}',
  feature_signature TEXT,       -- 'windshield|camera:1|hud:0|rain:1|heated:0'
  status           TEXT         NOT NULL DEFAULT 'pending', -- 'pending' | 'resolved' | 'needs_review' | 'failed'
  resolution_path  TEXT[]       NOT NULL DEFAULT '{}',
  paid_lookup_used BOOLEAN      NOT NULL DEFAULT FALSE,
  chosen_match_id  UUID,
  provider_cost    NUMERIC(10,2),
  cost_currency    TEXT         DEFAULT 'USD',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_glass_req_vin
  ON glass_resolution_requests (vin);

CREATE INDEX IF NOT EXISTS idx_glass_req_status
  ON glass_resolution_requests (status);

CREATE INDEX IF NOT EXISTS idx_glass_req_created_at
  ON glass_resolution_requests (created_at DESC);

-- -----------------------------------------------------------------------
-- 3. Kandidater fra regler/leverandører
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_match_candidates (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID         NOT NULL REFERENCES glass_resolution_requests (id) ON DELETE CASCADE,
  source           TEXT         NOT NULL, -- 'internal_rules' | 'cache' | 'macs_vis' | 'autoglass_match' | 'manual'
  ktype            TEXT,
  kba              TEXT,
  nags             TEXT,
  oem_part_number  TEXT,
  eurocode         TEXT,
  glass_part_type  TEXT,
  confidence       NUMERIC(5,4) NOT NULL,
  rank             INT          NOT NULL DEFAULT 1,
  raw_payload      JSONB        NOT NULL DEFAULT '{}',
  accepted         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_request_id
  ON glass_match_candidates (request_id);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_ktype
  ON glass_match_candidates (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_candidates_source
  ON glass_match_candidates (source);

-- -----------------------------------------------------------------------
-- 4. Intern regelbase for normaliserte kjøretøy/glass-kombinasjoner
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glass_rules (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key    TEXT         NOT NULL, -- 'volkswagen:golf:2020:hatchback:5'
  market            TEXT         NOT NULL DEFAULT 'EU',
  opening           TEXT         NOT NULL,
  feature_signature TEXT         NOT NULL DEFAULT 'default',
  ktype             TEXT,
  kba               TEXT,
  nags              TEXT,
  oem_part_number   TEXT,
  eurocode          TEXT,
  confidence        NUMERIC(5,4) NOT NULL DEFAULT 0.80,
  evidence_count    INT          NOT NULL DEFAULT 1,
  last_verified_at  TIMESTAMPTZ,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_glass_rules_key
  ON glass_rules (normalized_key, market, opening, feature_signature);

CREATE INDEX IF NOT EXISTS idx_glass_rules_ktype
  ON glass_rules (ktype);

CREATE INDEX IF NOT EXISTS idx_glass_rules_active
  ON glass_rules (active);

-- -----------------------------------------------------------------------
-- 5. Leverandørkall – observability, kost og latency
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_calls (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID         REFERENCES glass_resolution_requests (id) ON DELETE SET NULL,
  provider         TEXT         NOT NULL, -- 'vpic' | 'macs_vis' | 'autoglass_match'
  operation        TEXT         NOT NULL, -- 'decode_vin' | 'resolve_glass' | 'batch_decode'
  success          BOOLEAN      NOT NULL,
  http_status      INT,
  latency_ms       INT,
  cost_amount      NUMERIC(10,2),
  cost_currency    TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  error_message    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_calls_provider_date
  ON provider_calls (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_calls_request_id
  ON provider_calls (request_id);

-- -----------------------------------------------------------------------
-- 6. Manuell review-kø for lavkonfidenstilfeller
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_review_queue (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID         NOT NULL REFERENCES glass_resolution_requests (id) ON DELETE CASCADE,
  reason           TEXT         NOT NULL, -- 'low_confidence' | 'provider_disagreement' | 'feature_mismatch' | 'no_match'
  severity         TEXT         NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  assigned_to      TEXT,
  review_status    TEXT         NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved' | 'escalated'
  reviewed_match_id UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status
  ON manual_review_queue (review_status);

CREATE INDEX IF NOT EXISTS idx_review_queue_request_id
  ON manual_review_queue (request_id);

-- -----------------------------------------------------------------------
-- 7. Hjelpefunksjon: normaliser kjøretøynøkkel
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_vehicle_key(
  p_make       TEXT,
  p_model      TEXT,
  p_year       INT,
  p_body_style TEXT DEFAULT NULL,
  p_doors      INT  DEFAULT NULL
) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT LOWER(
    CONCAT_WS(':',
      TRIM(p_make),
      TRIM(p_model),
      p_year::TEXT,
      COALESCE(TRIM(p_body_style), 'unknown'),
      COALESCE(p_doors::TEXT, '')
    )
  )
$$;

-- -----------------------------------------------------------------------
-- 8. Hjelpefunksjon: bygg feature_signature for glassmatch
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION build_feature_signature(
  p_opening  TEXT,
  p_features JSONB
) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT p_opening || '|' ||
    'camera:'   || COALESCE((p_features->>'camera')::INT::TEXT,    '0') || '|' ||
    'hud:'      || COALESCE((p_features->>'hud')::INT::TEXT,        '0') || '|' ||
    'rain:'     || COALESCE((p_features->>'rainSensor')::INT::TEXT, '0') || '|' ||
    'heated:'   || COALESCE((p_features->>'heated')::INT::TEXT,     '0') || '|' ||
    'acoustic:' || COALESCE((p_features->>'acoustic')::INT::TEXT,   '0')
$$;

-- -----------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------
COMMENT ON TABLE vin_decode_cache IS 'Cache for gratis NHTSA vPIC VIN-dekoding';
COMMENT ON TABLE glass_resolution_requests IS 'Alle VIN→glass resolve-forespørsler';
COMMENT ON TABLE glass_match_candidates IS 'Kandidater fra regler og leverandører per forespørsel';
COMMENT ON TABLE glass_rules IS 'Intern lærende regelbase for glassmatch';
COMMENT ON TABLE provider_calls IS 'Alle leverandørkall med kost, latency og svar';
COMMENT ON TABLE manual_review_queue IS 'Lavkonfidenstilfeller som krever manuell gjennomgang';
