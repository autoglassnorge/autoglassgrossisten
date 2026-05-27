ALTER TABLE glass_variants ADD COLUMN dedupe_key TEXT;

UPDATE glass_variants
SET dedupe_key =
  CAST(ktype AS TEXT) || '|' ||
  COALESCE(market, '') || '|' ||
  COALESCE(source, '') || '|' ||
  COALESCE(opening, '') || '|' ||
  COALESCE(feature_signature, 'default')
WHERE dedupe_key IS NULL OR dedupe_key = '';

DELETE FROM glass_variants
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY dedupe_key
        ORDER BY COALESCE(match_score, -1) DESC,
                 COALESCE(confidence, -1) DESC,
                 id DESC
      ) AS rn
    FROM glass_variants
    WHERE dedupe_key IS NOT NULL AND dedupe_key <> ''
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_glass_variants_dedupe_key
ON glass_variants(dedupe_key);

CREATE INDEX IF NOT EXISTS idx_glass_variants_dedupe_key
ON glass_variants(dedupe_key);
