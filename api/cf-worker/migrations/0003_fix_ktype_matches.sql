-- Migration 0003: GDPR-fix for ktype_matches + frequency-based statistical learning
-- ===================================================================================
-- Replaces the v2.1 design which used regnr as PRIMARY KEY (overwrites history,
-- stores personal data) with a (ktype, eurocode) aggregate counter.
--
-- Safe to run because migration 0002 has not been deployed to prod yet
-- (or if it has, the table is empty - we built it for the v2.1 launch).
-- ===================================================================================

DROP TABLE IF EXISTS ktype_matches;

CREATE TABLE ktype_matches (
  ktype       INTEGER  NOT NULL,
  eurocode    TEXT     NOT NULL,
  hit_count   INTEGER  NOT NULL DEFAULT 1,
  first_seen  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ktype, eurocode)
);

-- Lookup pattern: "give me top eurocode for this ktype" → covered by PK
-- Reverse lookup: "which ktypes map to this eurocode" → needs separate index
CREATE INDEX IF NOT EXISTS idx_ktype_matches_eurocode ON ktype_matches(eurocode);

-- Monitor learning curve: "show me hot ktypes today"
CREATE INDEX IF NOT EXISTS idx_ktype_matches_last_seen ON ktype_matches(last_seen DESC);
