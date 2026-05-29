SELECT
  tbl_name AS table_name,
  COUNT(CASE WHEN type = 'index' THEN 1 END) AS index_count,
  COUNT(CASE WHEN type = 'table' THEN 1 END) AS table_count
FROM sqlite_master
WHERE tbl_name IN ('glass_catalog', 'glass_rules', 'vin_decode_cache', 'rate_limits', 'search_history', 'ktype_matches', 'ktype_registry')
GROUP BY tbl_name;