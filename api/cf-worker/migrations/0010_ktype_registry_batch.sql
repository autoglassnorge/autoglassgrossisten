-- Migration 0010: Batch insert template for ktype_registry
-- =========================================================
-- Usage: Replace the VALUES section with generated inserts
--        from scripts/generate-ktype-inserts.mjs
--
-- This is a template - the actual data comes from Bovsoft verification

-- Create table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS ktype_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ktype INTEGER NOT NULL,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  body TEXT,
  source TEXT DEFAULT 'finn_bovsoft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ktype_registry_ktype ON ktype_registry(ktype);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);

-- Placeholder for batch inserts
-- INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source)
-- VALUES (...);
