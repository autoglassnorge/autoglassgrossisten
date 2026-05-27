/**
 * Nord Glass — Validation Engine
 * Evaluerer parse-status basert på regler.
 */

import { NordGlassParsedRecord, ParseStatus } from './schema';

interface ValidationResult {
  status: ParseStatus;
  warnings: string[];
  errors: string[];
}

const KNOWN_MANUFACTURERS = new Set([
  'MERCEDES', 'BMW', 'AUDI', 'VOLKSWAGEN', 'FORD', 'OPEL', 'RENAULT',
  'PEUGEOT', 'CITROEN', 'TOYOTA', 'NISSAN', 'HONDA', 'MAZDA',
  'MITSUBISHI', 'SUBARU', 'HYUNDAI', 'KIA', 'VOLVO', 'JAGUAR',
  'LANDROVER', 'PORSCHE', 'LEXUS', 'CADILLAC', 'CHEVROLET',
  'CHRYSLER', 'DODGE', 'JEEP', 'ALFA', 'FIAT', 'MINI',
  'SMART', 'SKODA', 'SEAT', 'DS', 'DACIA', 'TESLA',
]);

const SAFE_FAMILIES = new Set(['WSWS', 'RWRW']);
const BODY_FAMILIES = new Set(['BOT', 'BOD', 'BOS', 'BOAS']);

export function validate(record: NordGlassParsedRecord): ValidationResult {
  const warnings: string[] = [...record.parse_warnings];
  const errors: string[] = [...record.parse_errors];

  // 1. Kritiske feil → HOLD
  if (!record.manufacturer_name) {
    errors.push('Missing manufacturer');
  }
  if (!record.vehicle_model_name) {
    errors.push('Missing model');
  }
  if (!record.nord_internal_code) {
    errors.push('Missing Nord Glass internal code');
  }
  if (record.product_family === 'UNKNOWN') {
    errors.push('Unknown product family');
  }

  // 2. Produsent-validering
  if (record.manufacturer_name) {
    const normalized = record.manufacturer_name.toUpperCase();
    if (!KNOWN_MANUFACTURERS.has(normalized)) {
      warnings.push(`Unknown manufacturer: ${record.manufacturer_name}`);
    }
  }

  // 3. År-validering
  if (record.production_from) {
    const year = parseInt(record.production_from.slice(0, 4), 10);
    if (year < 1950 || year > 2030) {
      warnings.push(`Suspicious production year: ${record.production_from}`);
    }
  }

  // 4. Dimensjons-validering
  if (record.width_mm && record.height_mm) {
    if (record.width_mm < 200 || record.width_mm > 3000) {
      warnings.push(`Suspicious width: ${record.width_mm}mm`);
    }
    if (record.height_mm < 200 || record.height_mm > 2000) {
      warnings.push(`Suspicious height: ${record.height_mm}mm`);
    }
    if (record.width_mm < record.height_mm) {
      warnings.push(`Width < height — unusual for automotive glass`);
    }
  }

  // 5. Feature-validering
  const unknownFeatures = record.feature_codes.filter(
    f => !['H', 'V', 'A', 'O', 'GY', 'BL', 'GR', 'GN', 'GS', 'BR', 'CL', 'sp', 'mb', 'vin', 'frame', 'rectangle', 'oval'].includes(f)
  );
  if (unknownFeatures.length > 0) {
    warnings.push(`Unknown feature codes: ${unknownFeatures.join(', ')}`);
  }

  // 6. Bestem status
  let status: ParseStatus = 'OK';

  if (errors.length > 0) {
    status = 'HOLD';
  } else if (
    BODY_FAMILIES.has(record.product_family) ||
    !record.side ||
    (record.product_family !== 'GUGU' && record.glass_position === 'UNKNOWN') ||
    warnings.length > 3
  ) {
    status = 'REVIEW';
  }

  return { status, warnings, errors };
}

/**
 * Batch-validering med statistikk.
 */
export function validateBatch(records: NordGlassParsedRecord[]): {
  ok: number;
  review: number;
  hold: number;
  total: number;
} {
  let ok = 0, review = 0, hold = 0;
  for (const r of records) {
    const v = validate(r);
    if (v.status === 'OK') ok++;
    else if (v.status === 'REVIEW') review++;
    else hold++;
  }
  return { ok, review, hold, total: records.length };
}
