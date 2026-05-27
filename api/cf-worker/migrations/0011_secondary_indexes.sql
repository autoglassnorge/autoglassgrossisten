-- Migration 0011: Sekundære indekser for glass_catalog
-- Formål: Ytelsesoptimalisering av de vanligste D1-spørringene
-- Analysert fra api/cf-worker/src/index.ts query-patterns

-- 1. eurocode COLLATE NOCASE — queryByEurocode() bruker COLLATE NOCASE for case-insensitive oppslag
--    Eksisterende idx_eurocode dekker IKKE NOCASE; SQLite kan ikke bruke den for ? COLLATE NOCASE
CREATE INDEX IF NOT EXISTS idx_eurocode_nocase ON glass_catalog(eurocode COLLATE NOCASE);

-- 2. brand + category — searchCatalog() filtrerer på begge; getCategoriesWithCount() grupperer
--    Eksisterende idx_brand og idx_category er separate; sammensatt indeks gir bedre selectivity
CREATE INDEX IF NOT EXISTS idx_brand_category ON glass_catalog(brand, category);

-- 3. brand + year_from + year_to — queryByBrandModelYear() bruker alle tre kolonner
--    Eksisterende idx_year_from og idx_year_to er separate og hjelper lite med range-spørringer
CREATE INDEX IF NOT EXISTS idx_brand_year_from_year_to ON glass_catalog(brand, year_from, year_to);

-- Note: følgende indekser finnes allerede og er ikke endret:
--   - idx_prefix4 ON glass_catalog(prefix4)           [schema.sql]
--   - idx_ktype ON glass_catalog(ktype)               [schema.sql]
--   - idx_gt_make_model_year ON ground_truth(make, model, year)  [0006_ground_truth.sql]
