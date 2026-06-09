export type InputType = 'regnr' | 'vin' | 'oem' | 'eurocode' | 'sku' | 'text';

export interface DetectedInput {
  type: InputType;
  normalized: string;
  confidence: number;
}

export function detectInputType(raw: string): DetectedInput {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { type: 'text', normalized: '', confidence: 0.5 };
  }

  // If input contains whitespace, only strict patterns (regnr / vin) may match
  // after whitespace removal. Everything else with whitespace is natural language.
  if (/\s/.test(trimmed)) {
    const noSpaces = trimmed.toUpperCase().replace(/\s+/g, '');

    if (/^[A-Z]{2}\d{4,5}$/.test(noSpaces)) {
      return { type: 'regnr', normalized: noSpaces, confidence: 1.0 };
    }

    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(noSpaces)) {
      return { type: 'vin', normalized: noSpaces, confidence: 1.0 };
    }

    return { type: 'text', normalized: trimmed, confidence: 0.5 };
  }

  // No whitespace: classify based on normalized uppercase value
  const normalized = trimmed.toUpperCase();

  // regnr
  if (/^[A-Z]{2}\d{4,5}$/.test(normalized)) {
    return { type: 'regnr', normalized, confidence: 1.0 };
  }

  // vin
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) {
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
      if (!/^[A-Z]{2}\d{4,5}$/.test(detected.normalized)) {
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
      if (/[IOQ]/.test(detected.normalized)) {
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
