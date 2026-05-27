/**
 * Nord Glass — Line Parser
 * Parser tokens til felter.
 */

import { tokenize } from './tokenize';
import {
  NordGlassParsedRecord,
  ProductFamily,
  GlassCategory,
  GlassPosition,
  Side,
  OpeningType,
  ParseStatus,
} from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist: kjente produsenter
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_MANUFACTURERS = new Set([
  'MERCEDES', 'BMW', 'AUDI', 'VW', 'VOLKSWAGEN', 'FORD', 'OPEL', 'VAUXHALL',
  'RENAULT', 'PEUGEOT', 'CITROEN', 'TOYOTA', 'NISSAN', 'HONDA', 'MAZDA',
  'MITSUBISHI', 'SUBARU', 'SUZUKI', 'HYUNDAI', 'KIA', 'VOLVO', 'SAAB',
  'JAGUAR', 'LANDROVER', 'LAND ROVER', 'RANGE ROVER', 'PORSCHE', 'LEXUS',
  'INFINITI', 'ACURA', 'CADILLAC', 'CHEVROLET', 'CHRYSLER', 'DODGE',
  'JEEP', 'LINCOLN', 'MERCURY', 'GMC', 'HUMMER', 'PONTIAC', 'SATURN',
  'BUICK', 'OLDSMOBILE', 'PLYMOUTH', 'EAGLE', 'GEO', 'SUZUKI', 'DAIHATSU',
  'ISUZU', 'HINO', 'FUSO', 'IVECO', 'MAN', 'SCANIA', 'DAF', 'VOLVO TRUCK',
  'MERCEDES TRUCK', 'MERCEDES-BENZ', 'MERCEDES BENZ',
  'ALFA ROMEO', 'ALFA', 'FIAT', 'LANCIA', 'ABARTH',
  'SMART', 'MINI', 'BENTLEY', 'ROLLS ROYCE', 'ROLLS-ROYCE',
  'ASTON MARTIN', 'ASTONMARTIN', 'LOTUS', 'MCLAREN', 'TVR',
  'MG', 'ROVER', 'TRIUMPH', 'AUSTIN', 'MORRIS', 'WOLSELEY',
  'SKODA', 'SEAT', 'CUPRA', 'DS', 'DS AUTOMOBILES',
  'DACIA', 'LADA', 'GAZ', 'UAZ', 'MOSKVICH', 'ZAZ',
  'GREAT WALL', 'GREATWALL', 'HAVAL', 'CHERY', 'GEELY',
  'BYD', 'LIXIANG', 'LIXIANG AUTO', 'NIO', 'XPENG',
  'TESLA', 'RIVIAN', 'LUCID', 'POLESTAR',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Produktfamilie → kategori + posisjon
// ─────────────────────────────────────────────────────────────────────────────

const FAMILY_MAP: Record<ProductFamily, { category: GlassCategory; position: GlassPosition }> = {
  WSWS: { category: 'windscreen', position: 'FR' },
  RWRW: { category: 'rear_window', position: 'RR' },
  BOT:  { category: 'door_glass', position: 'FD' },      // fallback, refined later
  BOD:  { category: 'quarter_glass', position: 'RQ' },   // fallback
  BOS:  { category: 'quarter_glass', position: 'RQ' },   // fixed side
  BOAS: { category: 'opening_glass', position: 'RQ' },   // opening side
  GUGU: { category: 'moulding', position: 'UNKNOWN' },
  UNKNOWN: { category: 'unknown', position: 'UNKNOWN' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature-markører
// ─────────────────────────────────────────────────────────────────────────────

const TINT_CODES = new Set(['GY', 'BL', 'GR', 'GN', 'GS', 'BR', 'CL']);

const KNOWN_FEATURE_CODES = new Set([
  'H', 'V', 'M', 'A', 'Z', 'O',          // funksjonskoder
  'GY', 'BL', 'GR', 'GN', 'GS', 'BR', 'CL', // tint
  'sp', 'mb', 'vin', 'frame',             // spesialkoder
  'rectangle', 'oval',                     // form
]);

// ─────────────────────────────────────────────────────────────────────────────
// Parse kjøretøy-segment
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleParseResult {
  manufacturer?: string;
  model?: string;
  bodyType?: string;
  productionFromRaw: string;
  productionToRaw?: string;
}

/**
 * Parse kjøretøy-segment.
 *
 * Format: `SPRINTER II3VAN0605-WSWS` → MERCEDES SPRINTER II, 3VAN, 2006-05, pågående
 * Format: `MDX5RGR0101-0401WSWS` → BMW MDX5? RGR?, 0101-0401
 *
 * Mønster: [MERKE][MODELL][BODYTYPE][ÅRFRA]-[ÅRTIL]
 */
export function parseVehicleSegment(segment: string): VehicleParseResult {
  const result: VehicleParseResult = {
    productionFromRaw: '',
  };

  // Finn år-intervall: YYMM-YYMM, YYMM-, YYYY-YYYY, eller YYYY
  const yearMatch = segment.match(/(\d{2,4})(\d{2})?-?(\d{2,4})?(\d{2})?/);
  if (yearMatch) {
    const [, startYear, startMonth, endYear, endMonth] = yearMatch;
    result.productionFromRaw = startYear + (startMonth || '');
    if (endYear) {
      result.productionToRaw = endYear + (endMonth || '');
    }
  }

  // Fjern år fra segment for å isolere merke/modell/body
  let remaining = segment;
  if (yearMatch) {
    remaining = segment.slice(0, yearMatch.index) + segment.slice(yearMatch.index! + yearMatch[0].length);
  }

  // Prøv å gjenkjenne merke fra whitelist
  const upperRemaining = remaining.toUpperCase();
  for (const mfr of KNOWN_MANUFACTURERS) {
    if (upperRemaining.startsWith(mfr)) {
      result.manufacturer = mfr;
      remaining = remaining.slice(mfr.length);
      break;
    }
  }

  // Hvis ingen merke-match, prøv å finn første uppercase sekvens
  if (!result.manufacturer) {
    const mfrMatch = remaining.match(/^[A-Z]+/);
    if (mfrMatch) {
      result.manufacturer = mfrMatch[0];
      remaining = remaining.slice(mfrMatch[0].length);
    }
  }

  // Resten er modell + body type
  // Body type mønstre: 3VAN, 5D SUV, 2D CPE, 4D SED, 5D HBK, etc.
  const bodyMatch = remaining.match(/(\d[DVCH]\s?[A-Z]{2,})/);
  if (bodyMatch) {
    result.bodyType = bodyMatch[1].trim();
    result.model = remaining.slice(0, bodyMatch.index).trim();
  } else {
    result.model = remaining.trim();
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse features
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureParseResult {
  tintCode?: string;
  featureCodes: string[];
  hasSensor: boolean | null;
  hasHeating: boolean | null;
  hasVinWindow: boolean | null;
  hasAntenna: boolean | null;
  hasCamera: boolean | null;
  shapeNotes?: string;
  mouldingNotes?: string;
}

export function parseFeatures(segment: string): FeatureParseResult {
  const result: FeatureParseResult = {
    featureCodes: [],
    hasSensor: null,
    hasHeating: null,
    hasVinWindow: null,
    hasAntenna: null,
    hasCamera: null,
  };

  const tokens = segment.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const upper = token.toUpperCase();

    // Tint
    if (TINT_CODES.has(upper)) {
      result.tintCode = upper;
      result.featureCodes.push(token);
      continue;
    }

    // Known features
    if (KNOWN_FEATURE_CODES.has(token.toLowerCase()) || KNOWN_FEATURE_CODES.has(upper)) {
      result.featureCodes.push(token);

      if (upper === 'H') result.hasHeating = true;
      if (upper === 'V') result.hasVinWindow = true;
      if (upper === 'A') result.hasAntenna = true;
      continue;
    }

    // Shape notes
    if (['RECTANGLE', 'OVAL', 'ROUND', 'SQUARE', 'FRAME'].includes(upper)) {
      result.shapeNotes = (result.shapeNotes ? result.shapeNotes + ' ' : '') + upper.toLowerCase();
      result.featureCodes.push(token);
      continue;
    }

    // VIN
    if (upper === 'VIN') {
      result.hasVinWindow = true;
      result.featureCodes.push(token);
      continue;
    }

    // Moulding / frame notes
    if (['FRAME', 'MOULDING', 'MOULD', 'GASKET', 'GUIDE', 'CHANNEL'].includes(upper)) {
      result.mouldingNotes = (result.mouldingNotes ? result.mouldingNotes + ' ' : '') + upper.toLowerCase();
      result.featureCodes.push(token);
      continue;
    }

    // Special codes (unknown but tracked)
    result.featureCodes.push(token);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse internkode-segment
// ─────────────────────────────────────────────────────────────────────────────

interface CodeParseResult {
  internalCode: string;
  positionCode?: string; // FD, RD, RQ, FV, RV, MQ, etc.
  side?: Side;
}

const POSITION_CODES = ['FD', 'RD', 'RQ', 'FV', 'RV', 'MQ', 'RDO'];
const SIDE_CODES: Record<string, Side> = { L: 'L', R: 'R', LG: 'L', RG: 'R', LO: 'L', RO: 'R' };

export function parseInternalCode(segment: string): CodeParseResult {
  const result: CodeParseResult = {
    internalCode: segment,
  };

  // Look for position code
  for (const pos of POSITION_CODES) {
    if (segment.includes(pos)) {
      result.positionCode = pos;
      break;
    }
  }

  // Look for side code
  for (const [code, side] of Object.entries(SIDE_CODES)) {
    if (segment.includes(code)) {
      result.side = side;
      break;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse dimensjoner
// ─────────────────────────────────────────────────────────────────────────────

export function parseDimensions(raw: string): { width_mm?: number; height_mm?: number } {
  const match = raw.match(/(\d{3,4})[xX](\d{3,4})/);
  if (match) {
    return {
      width_mm: parseInt(match[1], 10),
      height_mm: parseInt(match[2], 10),
    };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse årstall
// ─────────────────────────────────────────────────────────────────────────────

export function parseYear(raw: string): { from?: string; to?: string; warnings: string[] } {
  const warnings: string[] = [];

  // YYMM-YYMM
  const fullMatch = raw.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (fullMatch) {
    const [, y1, m1, y2, m2] = fullMatch;
    const year1 = parseInt(y1, 10) >= 50 ? 1900 + parseInt(y1, 10) : 2000 + parseInt(y1, 10);
    const year2 = parseInt(y2, 10) >= 50 ? 1900 + parseInt(y2, 10) : 2000 + parseInt(y2, 10);
    return {
      from: `${year1}-${m1}`,
      to: `${year2}-${m2}`,
      warnings,
    };
  }

  // YYMM-
  const openMatch = raw.match(/^(\d{2})(\d{2})-$/);
  if (openMatch) {
    const [, y1, m1] = openMatch;
    const year1 = parseInt(y1, 10) >= 50 ? 1900 + parseInt(y1, 10) : 2000 + parseInt(y1, 10);
    return {
      from: `${year1}-${m1}`,
      warnings,
    };
  }

  // YYMM (kun fra)
  const singleMatch = raw.match(/^(\d{2})(\d{2})$/);
  if (singleMatch) {
    const [, y1, m1] = singleMatch;
    const year1 = parseInt(y1, 10) >= 50 ? 1900 + parseInt(y1, 10) : 2000 + parseInt(y1, 10);
    return {
      from: `${year1}-${m1}`,
      warnings: ['Single year-month, assumed open-ended'],
    };
  }

  warnings.push(`Unknown year format: ${raw}`);
  return { warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hovedparser: en rå linje → parsed record
// ─────────────────────────────────────────────────────────────────────────────

export function parseLine(rawLine: string, lineNumber?: number): NordGlassParsedRecord {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Tokenize
  const tokens = tokenize(rawLine);

  if (!tokens.productFamily) {
    errors.push('No product family found (WSWS/RWRW/BOT/BOD/BOS/BOAS/GUGU)');
  }

  // 2. Parse vehicle
  const vehicle = parseVehicleSegment(tokens.vehicleSegment);

  if (!vehicle.manufacturer) {
    errors.push('Could not extract manufacturer');
  }
  if (!vehicle.model) {
    errors.push('Could not extract model');
  }
  if (!vehicle.productionFromRaw) {
    errors.push('Could not extract production year');
  }

  // 3. Parse years
  let productionFrom: string | undefined;
  let productionTo: string | undefined;
  if (vehicle.productionFromRaw) {
    const yearResult = parseYear(vehicle.productionFromRaw + (vehicle.productionToRaw ? '-' + vehicle.productionToRaw : ''));
    productionFrom = yearResult.from;
    productionTo = yearResult.to;
    warnings.push(...yearResult.warnings);
  }

  // 4. Parse features
  const features = parseFeatures(tokens.featuresSegment);

  // 5. Parse dimensions
  const dims = tokens.dimensionsSegment ? parseDimensions(tokens.dimensionsSegment) : {};

  // 6. Parse internal code
  const codeResult = parseInternalCode(tokens.internalCodeSegment);

  // 7. Determine family, category, position
  const family: ProductFamily = (tokens.productFamily as ProductFamily) || 'UNKNOWN';
  const mapped = FAMILY_MAP[family] || FAMILY_MAP.UNKNOWN;

  // Override position if found in internal code
  let position: GlassPosition = mapped.position;
  if (codeResult.positionCode) {
    position = codeResult.positionCode as GlassPosition;
  }

  // Override side if found in internal code
  let side: Side = null;
  if (family === 'WSWS' || family === 'RWRW') {
    side = 'BOTH';
  } else if (codeResult.side) {
    side = codeResult.side;
  }

  // Opening type
  let openingType: OpeningType = null;
  if (family === 'BOAS') {
    openingType = 'OPENING';
  } else if (family === 'BOS') {
    openingType = 'FIXED';
  }

  // 8. Determine parse status
  let parseStatus: ParseStatus = 'OK';
  if (errors.length > 0) {
    parseStatus = 'HOLD';
  } else if (
    family === 'BOT' ||
    family === 'BOD' ||
    family === 'BOS' ||
    family === 'BOAS' ||
    !side ||
    warnings.length > 2
  ) {
    parseStatus = 'REVIEW';
  }

  // 9. Build dedupe key
  const dedupeKey = [
    (vehicle.manufacturer || '').toLowerCase(),
    (vehicle.model || '').toLowerCase(),
    (vehicle.bodyType || '*').toLowerCase(),
    productionFrom || '*',
    productionTo || '*',
    position,
    side || '*',
    openingType || '*',
    features.hasHeating ? 'H' : '*',
    features.hasSensor ? 'S' : '*',
    features.tintCode || '*',
  ].join('|');

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `ng-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    source_line_raw: rawLine,
    nord_internal_code: codeResult.internalCode,
    manufacturer_name: vehicle.manufacturer || '',
    vehicle_model_name: vehicle.model || '',
    vehicle_body_type_raw: vehicle.bodyType,
    production_from: productionFrom,
    production_to: productionTo,
    production_from_raw: vehicle.productionFromRaw,
    production_to_raw: vehicle.productionToRaw,
    product_family: family,
    glass_category: mapped.category,
    glass_position: position,
    side,
    opening_type: openingType,
    tint_code: features.tintCode,
    feature_codes: features.featureCodes,
    has_sensor: features.hasSensor,
    has_heating: features.hasHeating,
    has_vin_window: features.hasVinWindow,
    has_antenna: features.hasAntenna,
    has_camera: features.hasCamera,
    has_rain_sensor: null,
    has_hud: null,
    has_lane_assist: null,
    shape_notes: features.shapeNotes,
    moulding_notes: features.mouldingNotes,
    dimensions_raw: tokens.dimensionsSegment || undefined,
    width_mm: dims.width_mm,
    height_mm: dims.height_mm,
    dedupe_key: dedupeKey,
    parse_status: parseStatus,
    parse_warnings: warnings,
    parse_errors: errors,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
