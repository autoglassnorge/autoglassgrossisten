/**
 * Nord Glass — Canonical Schema
 * Types for parsed, normalized, deduped, validated Nord Glass records.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source / Raw
// ─────────────────────────────────────────────────────────────────────────────

export interface NordGlassSourceLine {
  source_catalog: 'nord_glass_pdf';
  source_line_raw: string;
  source_page?: number;
  source_line_number?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Enums
// ─────────────────────────────────────────────────────────────────────────────

export type ProductFamily =
  | 'WSWS'
  | 'RWRW'
  | 'BOT'
  | 'BOD'
  | 'BOS'
  | 'BOAS'
  | 'GUGU'
  | 'UNKNOWN';

export type GlassCategory =
  | 'windscreen'
  | 'rear_window'
  | 'door_glass'
  | 'quarter_glass'
  | 'vent_glass'
  | 'opening_glass'
  | 'moulding'
  | 'accessory'
  | 'unknown';

export type GlassPosition =
  | 'FR'
  | 'RR'
  | 'FD'
  | 'RD'
  | 'FQ'
  | 'RQ'
  | 'FV'
  | 'RV'
  | 'MQ'
  | 'RDO'
  | 'UNKNOWN';

export type Side = 'L' | 'R' | 'BOTH' | null;

export type OpeningType = 'FIXED' | 'OPENING' | 'SLIDING' | 'HINGED' | null;

export type ParseStatus = 'OK' | 'REVIEW' | 'HOLD';

// ─────────────────────────────────────────────────────────────────────────────
// 3. Parsed Record
// ─────────────────────────────────────────────────────────────────────────────

export interface NordGlassParsedRecord {
  // Identifiers
  id: string;
  source_line_raw: string;
  nord_internal_code: string;
  sales_code?: string;

  // Vehicle
  manufacturer_name: string;
  manufacturer_name_normalized?: string;
  vehicle_model_name: string;
  vehicle_model_name_normalized?: string;
  vehicle_body_type_raw?: string;
  vehicle_body_type_normalized?: string;

  // Production years
  production_from?: string; // YYYY-MM
  production_to?: string;   // YYYY-MM or null
  production_from_raw: string;
  production_to_raw?: string;

  // Product classification
  product_family: ProductFamily;
  glass_category: GlassCategory;
  glass_position: GlassPosition;
  side: Side;
  opening_type: OpeningType;

  // Features
  tint_code?: string;
  feature_codes: string[];
  has_sensor: boolean | null;
  has_heating: boolean | null;
  has_vin_window: boolean | null;
  has_antenna: boolean | null;
  has_camera: boolean | null;
  has_rain_sensor: boolean | null;
  has_hud: boolean | null;
  has_lane_assist: boolean | null;

  // Shape / Moulding
  shape_notes?: string;
  moulding_notes?: string;

  // Dimensions
  dimensions_raw?: string;
  width_mm?: number;
  height_mm?: number;

  // Dedupe
  dedupe_key: string;

  // Parse quality
  parse_status: ParseStatus;
  parse_warnings: string[];
  parse_errors: string[];

  // Metadata
  created_at: string;
  updated_at: string;
  reviewed_by?: string;
  review_notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Variant (for deduped records)
// ─────────────────────────────────────────────────────────────────────────────

export interface NordGlassVariant {
  nord_internal_code: string;
  feature_codes: string[];
  tint_code?: string;
  has_sensor: boolean | null;
  has_heating: boolean | null;
  price?: number;
}

export interface NordGlassDedupedRecord extends NordGlassParsedRecord {
  variants: NordGlassVariant[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Staging Row (for DB insert)
// ─────────────────────────────────────────────────────────────────────────────

export interface NordGlassStagingRow {
  id: string;
  source_line_raw: string;
  nord_internal_code: string;
  sales_code?: string | null;
  manufacturer_name: string;
  vehicle_model_name: string;
  vehicle_body_type_raw?: string | null;
  production_from_raw: string;
  production_to_raw?: string | null;
  product_family: string;
  glass_category: string;
  glass_position: string;
  side?: string | null;
  opening_type?: string | null;
  tint_code?: string | null;
  feature_codes_json: string; // JSON array
  has_sensor?: boolean | null;
  has_heating?: boolean | null;
  has_vin_window?: boolean | null;
  has_antenna?: boolean | null;
  dimensions_raw?: string | null;
  width_mm?: number | null;
  height_mm?: number | null;
  dedupe_key: string;
  parse_status: ParseStatus;
  parse_warnings_json: string; // JSON array
  parse_errors_json: string;   // JSON array
  created_at: string;
}
