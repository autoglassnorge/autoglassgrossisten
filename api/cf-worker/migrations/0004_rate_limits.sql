-- Migration: D1-basert rate limiting (unngår KV write-kvote)
-- Applied: 2026-05-19

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  expires_at DATETIME
);
