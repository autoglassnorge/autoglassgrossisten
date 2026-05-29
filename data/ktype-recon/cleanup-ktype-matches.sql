-- Count rows before cleanup
SELECT 'before_total' AS metric, COUNT(*) AS cnt FROM ktype_matches;
SELECT 'before_noise_1' AS metric, COUNT(*) AS cnt FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');

-- Archive low-confidence rows before deletion (run separately if needed)
-- SELECT ktype, eurocode, hit_count, first_seen, last_seen FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');

-- Remove low-frequency noise (>30 days old, single hit)
DELETE FROM ktype_matches WHERE hit_count = 1 AND last_seen < datetime('now', '-30 days');

-- D1 auto-vacuum runs periodically; manual VACUUM not needed
SELECT 'after_total' AS metric, COUNT(*) AS cnt FROM ktype_matches;