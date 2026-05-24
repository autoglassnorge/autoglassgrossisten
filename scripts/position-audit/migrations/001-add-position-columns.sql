-- Migration: Add position columns to glass_catalog
-- Run: npx wrangler d1 execute glass-catalog-db --remote --file=scripts/position-audit/migrations/001-add-position-columns.sql

ALTER TABLE glass_catalog ADD COLUMN position TEXT;
ALTER TABLE glass_catalog ADD COLUMN side TEXT;
ALTER TABLE glass_catalog ADD COLUMN opening_type TEXT;
ALTER TABLE glass_catalog ADD COLUMN parse_status TEXT DEFAULT 'HOLD';
ALTER TABLE glass_catalog ADD COLUMN parse_source TEXT;
ALTER TABLE glass_catalog ADD COLUMN parse_confidence REAL DEFAULT 0;
