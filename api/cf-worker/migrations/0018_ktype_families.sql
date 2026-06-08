-- Migration 0018: kType Families for High-Accuracy Auto-Matching
-- ========================================================================
-- TecDoc har 80k+ kTyper der mange deler samme glass (samme karosseri,
-- ulike motorer). Vi grupperer dem i "families" og matcher katalog-produkter
-- mot familien, ikke individuelle kTyper.

-- Family = gruppe kTyper med samme renset modell + brand + overlappende år
CREATE TABLE IF NOT EXISTS ktype_families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_brand TEXT NOT NULL,        -- Normalisert brand (fra brand.ts)
  canonical_model TEXT NOT NULL,        -- Renset modellnavn (ingen motor/body)
  year_from INTEGER,                    -- MIN(alle kTyper i familien)
  year_to INTEGER,                      -- MAX(alle kTyper i familien)
  ktype_count INTEGER NOT NULL DEFAULT 0, -- Antall kTyper i familien
  source TEXT DEFAULT 'tecdoc',         -- 'tecdoc' eller 'manual'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Medlemskap: hvilke kTyper tilhører hvilken family
CREATE TABLE IF NOT EXISTS ktype_family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  ktype INTEGER NOT NULL,               -- TecDoc kType
  tecdoc_brand TEXT,                    -- Original TecDoc-brand
  tecdoc_model TEXT,                    -- Original TecDoc-modell (med motor)
  tecdoc_year_from INTEGER,
  tecdoc_year_to INTEGER,
  FOREIGN KEY (family_id) REFERENCES ktype_families(id)
);

-- Tabell for medium-confidence matches som trenger manuell review
CREATE TABLE IF NOT EXISTS pending_ktype_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  glass_catalog_id INTEGER NOT NULL,
  family_id INTEGER NOT NULL,
  score REAL NOT NULL,                  -- Confidence-score (0.0–1.0)
  score_reason TEXT,                    -- Hvorfor scoren ble som den ble
  status TEXT DEFAULT 'pending',        -- pending, approved, rejected
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES ktype_families(id)
);

-- Indekser for performance
CREATE INDEX IF NOT EXISTS idx_kf_brand_model ON ktype_families(canonical_brand, canonical_model);
CREATE INDEX IF NOT EXISTS idx_kf_year ON ktype_families(year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_kfm_family ON ktype_family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_kfm_ktype ON ktype_family_members(ktype);
CREATE INDEX IF NOT EXISTS idx_pkm_status ON pending_ktype_matches(status);
