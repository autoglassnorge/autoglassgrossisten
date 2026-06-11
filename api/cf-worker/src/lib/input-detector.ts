export type InputType = 'regnr' | 'vin' | 'oem' | 'eurocode' | 'sku' | 'text';

export interface DetectedInput {
  type: InputType;
  normalized: string;
  confidence: number;
}

export const REGNR_PATTERN = /^[A-Z]{2}\d{4,5}$/;
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeRegnr(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s.-]+/g, '');
}

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function detectInputType(raw: string): DetectedInput {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { type: 'text', normalized: '', confidence: 0.5 };
  }

  // If input contains separators, only strict patterns (regnr / vin) may match
  // after separator removal. Everything else with whitespace remains natural language.
  if (/[\s.-]/.test(trimmed)) {
    const compact = trimmed.toUpperCase().replace(/[\s.-]+/g, '');

    if (REGNR_PATTERN.test(compact)) {
      return { type: 'regnr', normalized: compact, confidence: 1.0 };
    }

    if (VIN_PATTERN.test(compact)) {
      return { type: 'vin', normalized: compact, confidence: 1.0 };
    }

    if (/\s/.test(trimmed)) {
      return { type: 'text', normalized: trimmed, confidence: 0.5 };
    }
    // Hyphenated catalog identifiers can still be SKUs.
    const normalizedWithSeparators = trimmed.toUpperCase();
    if (/^[A-Z0-9\-]{4,30}$/.test(normalizedWithSeparators)) {
      return { type: 'sku', normalized: normalizedWithSeparators, confidence: 0.8 };
    }
    return { type: 'text', normalized: trimmed, confidence: 0.5 };
  }

  // No whitespace: classify based on normalized uppercase value
  const normalized = trimmed.toUpperCase();

  // regnr
  if (REGNR_PATTERN.test(normalized)) {
    return { type: 'regnr', normalized, confidence: 1.0 };
  }

  // vin
  if (VIN_PATTERN.test(normalized)) {
    return { type: 'vin', normalized, confidence: 1.0 };
  }

  // eurocode — common patterns
  if (
    /^\d{3,4}[A-Z]{1,2}\d{1,4}[A-Z]?$/.test(normalized) ||
    /^[A-Z]{2}\d{4,6}$/.test(normalized)
  ) {
    return { type: 'eurocode', normalized, confidence: 1.0 };
  }

  // oem — pure alphanumeric 5–20 chars
  if (/^[A-Z0-9]{5,20}$/.test(normalized)) {
    return { type: 'oem', normalized, confidence: 0.8 };
  }

  // sku — alphanumeric with hyphens 4–30 chars
  if (/^[A-Z0-9\-]{4,30}$/.test(normalized)) {
    return { type: 'sku', normalized, confidence: 0.8 };
  }

  // text — fallback (preserve original casing)
  return { type: 'text', normalized: trimmed, confidence: 0.5 };
}

export function validateInput(detected: DetectedInput): { valid: boolean; error?: string } {
  switch (detected.type) {
    case 'regnr': {
      if (!REGNR_PATTERN.test(detected.normalized)) {
        return {
          valid: false,
          error: 'Invalid Norwegian registration number format. Expected 2 letters followed by 4-5 digits.',
        };
      }
      return { valid: true };
    }

    case 'vin': {
      if (detected.normalized.length !== 17) {
        return { valid: false, error: 'Invalid VIN format. Must be exactly 17 characters.' };
      }
      if (!VIN_PATTERN.test(detected.normalized)) {
        return { valid: false, error: 'Invalid VIN format. Must not contain I, O, or Q.' };
      }
      return { valid: true };
    }

    case 'text':
    case 'eurocode':
    case 'oem':
    case 'sku':
      return { valid: true };

    default:
      return { valid: true };
  }
}
