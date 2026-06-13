-- Mitsubishi Space Star / Mirage generation cleanup
-- =================================================
-- The model name "SPACE STAR (MIRAGE)" is used for two unrelated
-- generations in the catalog:
--   - 1999–2011 (older body/generation)
--   - 2013–     (Space Star A0_A / Mirage 6. gen)
-- This migration pins the old generation to 2011 and removes the
-- 2012+ kType mapping from those rows so year/generation gating can
-- distinguish them reliably.

-- 1. Cap the old generation at 2011.
UPDATE glass_catalog
SET year_to = 2011
WHERE UPPER(brand) = 'MITSUBISHI'
  AND UPPER(model) LIKE '%SPACE STAR (MIRAGE)%'
  AND year_from < 2013
  AND (year_to IS NULL OR year_to > 2011);

-- 2. Remove the A0_A (2012+) kType from old-generation records.
UPDATE glass_catalog
SET ktype = NULL
WHERE UPPER(brand) = 'MITSUBISHI'
  AND UPPER(model) LIKE '%SPACE STAR (MIRAGE)%'
  AND year_from < 2013
  AND ktype IN (53372, 53373, 53374, 53375, 53376, 53377, 53378, 53379);

-- 3. Ensure new-generation records start at 2013.
UPDATE glass_catalog
SET year_from = 2013
WHERE UPPER(brand) = 'MITSUBISHI'
  AND UPPER(model) LIKE '%SPACE STAR (MIRAGE)%'
  AND (year_from IS NULL OR year_from < 2013)
  AND (year_to IS NULL OR year_to >= 2013);
