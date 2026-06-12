-- Migration 0020: Add accessory_skus column to glass_catalog
-- Links glass products to their accessory article_numbers (JSON array string)

ALTER TABLE glass_catalog ADD COLUMN accessory_skus TEXT;
