-- Migration 0024: VIN → kType mapping cache
-- =============================================================================
-- Stores resolved kType for VINs already seen via SVV. This lets regnr search
-- short-circuit to the exact kType without going through brand/model/year
-- fallbacks every time.
--
-- GDPR note: VIN is stored because it is the canonical lookup key. Treat this
-- table like other SVV-derived data: apply retention limits, avoid logging VIN
-- in plaintext, and use regnr_hash only when a reverse lookup is needed.

CREATE TABLE IF NOT EXISTS vin_ktype_map (
  vin TEXT PRIMARY KEY,
  ktype INTEGER NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  confidence REAL CHECK(confidence BETWEEN 0.0 AND 1.0),
  source TEXT NOT NULL DEFAULT 'unknown'
    CHECK(source IN ('svv_tecdoc','svv_bovsoft','glass_rules','vincario','macs_vis','vpic','manual','unknown')),
  regnr_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- Fast lookup by VIN (primary key already covers this, but be explicit)
CREATE INDEX IF NOT EXISTS idx_vin_ktype_map_vin ON vin_ktype_map(vin);

-- Reverse lookup if we only have a regnr hash
CREATE INDEX IF NOT EXISTS idx_vin_ktype_map_regnr_hash ON vin_ktype_map(regnr_hash);

-- Maintenance: find stale entries
CREATE INDEX IF NOT EXISTS idx_vin_ktype_map_expires ON vin_ktype_map(expires_at) WHERE expires_at IS NOT NULL;
