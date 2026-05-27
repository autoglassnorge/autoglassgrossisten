/**
 * Nord Glass — Importer
 * Staging + import-pipeline for D1 / SQL.
 */

import { NordGlassParsedRecord, NordGlassStagingRow, NordGlassDedupedRecord } from './schema';
import { dedupe } from './dedupe';
import { validate } from './validate';

/**
 * Konverter parsed record til staging row (klar for SQL INSERT).
 * Forutsetter at record allerede er validert (parse_status, parse_warnings, parse_errors satt).
 */
export function toStagingRow(record: NordGlassParsedRecord): NordGlassStagingRow {
  return {
    id: record.id,
    source_line_raw: record.source_line_raw,
    nord_internal_code: record.nord_internal_code,
    sales_code: record.sales_code || null,
    manufacturer_name: record.manufacturer_name,
    vehicle_model_name: record.vehicle_model_name,
    vehicle_body_type_raw: record.vehicle_body_type_raw || null,
    production_from_raw: record.production_from_raw,
    production_to_raw: record.production_to_raw || null,
    product_family: record.product_family,
    glass_category: record.glass_category,
    glass_position: record.glass_position,
    side: record.side,
    opening_type: record.opening_type,
    tint_code: record.tint_code || null,
    feature_codes_json: JSON.stringify(record.feature_codes),
    has_sensor: record.has_sensor,
    has_heating: record.has_heating,
    has_vin_window: record.has_vin_window,
    has_antenna: record.has_antenna,
    dimensions_raw: record.dimensions_raw || null,
    width_mm: record.width_mm || null,
    height_mm: record.height_mm || null,
    dedupe_key: record.dedupe_key,
    parse_status: record.parse_status,
    parse_warnings_json: JSON.stringify(record.parse_warnings),
    parse_errors_json: JSON.stringify(record.parse_errors),
    created_at: record.created_at,
  };
}

/**
 * Generer SQL INSERT for staging-tabell.
 */
export function generateStagingSQL(rows: NordGlassStagingRow[]): string {
  if (rows.length === 0) return '-- No rows to insert\n';

  let sql = `-- Nord Glass staging insert: ${rows.length} rows\n`;
  sql += `INSERT INTO nordglass_staging (
    id, source_line_raw, nord_internal_code, sales_code,
    manufacturer_name, vehicle_model_name, vehicle_body_type_raw,
    production_from_raw, production_to_raw,
    product_family, glass_category, glass_position, side, opening_type,
    tint_code, feature_codes_json,
    has_sensor, has_heating, has_vin_window, has_antenna,
    dimensions_raw, width_mm, height_mm,
    dedupe_key, parse_status, parse_warnings_json, parse_errors_json,
    created_at
  ) VALUES\n`;

  const values = rows.map(r => {
    const esc = (s: string | null | undefined) =>
      s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

    return `  (
      ${esc(r.id)}, ${esc(r.source_line_raw)}, ${esc(r.nord_internal_code)}, ${esc(r.sales_code)},
      ${esc(r.manufacturer_name)}, ${esc(r.vehicle_model_name)}, ${esc(r.vehicle_body_type_raw)},
      ${esc(r.production_from_raw)}, ${esc(r.production_to_raw)},
      ${esc(r.product_family)}, ${esc(r.glass_category)}, ${esc(r.glass_position)}, ${esc(r.side)}, ${esc(r.opening_type)},
      ${esc(r.tint_code)}, ${esc(r.feature_codes_json)},
      ${r.has_sensor === null ? 'NULL' : r.has_sensor}, ${r.has_heating === null ? 'NULL' : r.has_heating},
      ${r.has_vin_window === null ? 'NULL' : r.has_vin_window}, ${r.has_antenna === null ? 'NULL' : r.has_antenna},
      ${esc(r.dimensions_raw)}, ${r.width_mm ?? 'NULL'}, ${r.height_mm ?? 'NULL'},
      ${esc(r.dedupe_key)}, ${esc(r.parse_status)}, ${esc(r.parse_warnings_json)}, ${esc(r.parse_errors_json)},
      ${esc(r.created_at)}
    )`;
  });

  sql += values.join(',\n') + ';\n';
  return sql;
}

/**
 * Full pipeline: rå linjer → staging SQL.
 */
export function pipeline(
  rawLines: string[],
  parseFn: (line: string) => NordGlassParsedRecord
): { stagingSQL: string; stats: { ok: number; review: number; hold: number; total: number } } {
  const parsed = rawLines.map(parseFn);
  const validated = parsed.map(r => {
    const v = validate(r);
    return { ...r, parse_status: v.status, parse_warnings: v.warnings, parse_errors: v.errors };
  });

  const staging = validated.map(toStagingRow);
  const sql = generateStagingSQL(staging);

  const stats = {
    ok: validated.filter(r => r.parse_status === 'OK').length,
    review: validated.filter(r => r.parse_status === 'REVIEW').length,
    hold: validated.filter(r => r.parse_status === 'HOLD').length,
    total: validated.length,
  };

  return { stagingSQL: sql, stats };
}

/**
 * D1 staging table schema (for reference).
 */
export const STAGING_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS nordglass_staging (
  id TEXT PRIMARY KEY,
  source_line_raw TEXT,
  nord_internal_code TEXT NOT NULL,
  sales_code TEXT,
  manufacturer_name TEXT NOT NULL,
  vehicle_model_name TEXT NOT NULL,
  vehicle_body_type_raw TEXT,
  production_from_raw TEXT NOT NULL,
  production_to_raw TEXT,
  product_family TEXT NOT NULL,
  glass_category TEXT NOT NULL,
  glass_position TEXT NOT NULL,
  side TEXT,
  opening_type TEXT,
  tint_code TEXT,
  feature_codes_json TEXT,
  has_sensor INTEGER,
  has_heating INTEGER,
  has_vin_window INTEGER,
  has_antenna INTEGER,
  dimensions_raw TEXT,
  width_mm INTEGER,
  height_mm INTEGER,
  dedupe_key TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'HOLD',
  parse_warnings_json TEXT,
  parse_errors_json TEXT,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  review_notes TEXT,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_nordglass_dedupe ON nordglass_staging(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_nordglass_status ON nordglass_staging(parse_status);
CREATE INDEX IF NOT EXISTS idx_nordglass_mfr ON nordglass_staging(manufacturer_name);
CREATE INDEX IF NOT EXISTS idx_nordglass_model ON nordglass_staging(vehicle_model_name);
`;
