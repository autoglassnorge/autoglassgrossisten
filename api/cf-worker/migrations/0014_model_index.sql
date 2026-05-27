-- Migration 0014: Add model NOCASE index for faster model searches
-- Also add prefix4 index population helper

CREATE INDEX IF NOT EXISTS idx_model_nocase ON glass_catalog(model COLLATE NOCASE);

-- Populate prefix4 from eurocode where missing (eurocode first 4 chars are often the prefix4)
UPDATE glass_catalog
SET prefix4 = UPPER(SUBSTR(eurocode, 1, 4))
WHERE (prefix4 IS NULL OR prefix4 = '') AND LENGTH(eurocode) >= 4;
