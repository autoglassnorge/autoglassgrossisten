/**
 * Intelligent input classification for unified product search.
 * Detects whether user input is a regnr, eurocode, SKU, OE-number, VIN, or free text.
 */

export type InputType =
  | 'regnr'
  | 'eurocode'
  | 'sku'
  | 'oe'
  | 'vin'
  | 'text'
  | 'empty';

export interface DetectedInput {
  type: InputType;
  raw: string;
  normalized: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Norwegian registration number: 2 letters + 4-5 digits (e.g., AB12345, CV1234) */
const REGNR_REGEX = /^[A-ZÆØÅ]{2}\d{4,5}$/i;

/** Eurocode: alphanumeric, typically 8-20 chars, often starts with letter (e.g., M0080AGNCMV) */
const EUROCODE_REGEX = /^[A-Z]\d{3,}[A-Z0-9]{3,}$/i;

/** SKU / Article number: alphanumeric, often with dashes, 6-20 chars */
const SKU_REGEX = /^[A-Z0-9]{6,20}$/i;

/** OE number: typically numeric or alphanumeric, often 7-15 digits/chars */
const OE_REGEX = /^\d{7,15}$/;

/** VIN: exactly 17 chars, no I, O, Q */
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

/**
 * Detect input type from raw user input.
 * Returns the most likely type with confidence level.
 */
export function detectInputType(raw: string): DetectedInput {
  const trimmed = raw.trim();
  const normalized = trimmed.toUpperCase();

  if (!normalized) {
    return { type: 'empty', raw: trimmed, normalized, confidence: 'high' };
  }

  // VIN: exact 17 chars, very specific
  if (VIN_REGEX.test(normalized)) {
    return { type: 'vin', raw: trimmed, normalized, confidence: 'high' };
  }

  // Regnr: Norwegian format, very specific
  if (REGNR_REGEX.test(normalized)) {
    return { type: 'regnr', raw: trimmed, normalized, confidence: 'high' };
  }

  // Eurocode: starts with letter, has numbers, then more alphanumeric
  // Distinctive: usually starts with manufacturer code letter
  if (EUROCODE_REGEX.test(normalized) && normalized.length >= 8 && normalized.length <= 20) {
    return { type: 'eurocode', raw: trimmed, normalized, confidence: 'high' };
  }

  // Pure numeric = likely OE number
  if (OE_REGEX.test(normalized)) {
    return { type: 'oe', raw: trimmed, normalized, confidence: 'high' };
  }

  // SKU: alphanumeric, no spaces, reasonable length
  if (SKU_REGEX.test(normalized) && !normalized.includes(' ')) {
    // If it has both letters and numbers, it's more likely a SKU than OE
    if (/[A-Z]/i.test(normalized) && /\d/.test(normalized)) {
      return { type: 'sku', raw: trimmed, normalized, confidence: 'medium' };
    }
    // All numbers at this point could be OE or SKU
    return { type: 'oe', raw: trimmed, normalized, confidence: 'medium' };
  }

  // Free text: contains spaces, or doesn't match any pattern
  return { type: 'text', raw: trimmed, normalized, confidence: 'high' };
}

/**
 * Get a human-readable label for the detected input type.
 */
export function getInputTypeLabel(type: InputType): string {
  const labels: Record<InputType, string> = {
    regnr: 'Registreringsnummer',
    eurocode: 'Eurocode',
    sku: 'Artikkelnummer',
    oe: 'OE-nummer',
    vin: 'VIN',
    text: 'Fritekst',
    empty: '',
  };
  return labels[type] || '';
}

/**
 * Get placeholder text based on expected input type.
 */
export function getPlaceholderForType(type: InputType): string {
  const placeholders: Record<InputType, string> = {
    regnr: 'AB12345',
    eurocode: 'M0080AGNCMV',
    sku: '2304ACDCMUVZ2L',
    oe: '5N0845011D',
    vin: 'WVWZZZ3CZLE123456',
    text: 'F.eks. frontrute VW Transporter 2005',
    empty: 'Regnr, Eurocode, OE-nummer, VIN, eller beskriv glasset...',
  };
  return placeholders[type] || placeholders.empty;
}
