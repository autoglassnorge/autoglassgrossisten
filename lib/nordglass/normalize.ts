/**
 * Nord Glass — Normalization Helpers
 * Normaliserer produsentnavn, modellnavn, body type, etc.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturer normalization
// ─────────────────────────────────────────────────────────────────────────────

const MANUFACTURER_ALIASES: Record<string, string> = {
  'MERCEDES-BENZ': 'MERCEDES',
  'MERCEDES BENZ': 'MERCEDES',
  'BENZ': 'MERCEDES',
  'VW': 'VOLKSWAGEN',
  'VAUXHALL': 'OPEL',
  'LAND ROVER': 'LANDROVER',
  'LAND-ROVER': 'LANDROVER',
  'RANGE ROVER': 'LANDROVER',
  'ROLLS ROYCE': 'ROLLSROYCE',
  'ROLLS-ROYCE': 'ROLLSROYCE',
  'ASTON MARTIN': 'ASTONMARTIN',
  'ASTON-MARTIN': 'ASTONMARTIN',
  'ALFA ROMEO': 'ALFA',
  'ALFA-ROMEO': 'ALFA',
  'GREAT WALL': 'GREATWALL',
};

export function normalizeManufacturer(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return MANUFACTURER_ALIASES[upper] || upper;
}

// ─────────────────────────────────────────────────────────────────────────────
// Body type normalization
// ─────────────────────────────────────────────────────────────────────────────

const BODY_TYPE_MAP: Record<string, string> = {
  '3VAN': 'VAN',
  '5VAN': 'VAN',
  '2VAN': 'VAN',
  '3HBK': 'HATCHBACK',
  '5HBK': 'HATCHBACK',
  '3DHBK': 'HATCHBACK',
  '5DHBK': 'HATCHBACK',
  '4DSED': 'SEDAN',
  '4DSAL': 'SEDAN',
  '2DCPE': 'COUPE',
  '2DCAB': 'CONVERTIBLE',
  '5DEST': 'ESTATE',
  '5DSTV': 'ESTATE',
  '5DSUV': 'SUV',
  '3DCC': 'COUPE',
  '4DCC': 'COUPE',
  'MPV': 'MPV',
  '2DPICKUP': 'PICKUP',
  '4DPICKUP': 'PICKUP',
};

export function normalizeBodyType(raw: string): string | undefined {
  const upper = raw.toUpperCase().replace(/\s/g, '');
  return BODY_TYPE_MAP[upper] || upper;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model normalization
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeModel(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s+$/g, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Production year normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Konverter rå Nord Glass år-token til YYYY-MM.
 *
 * Format:
 *   YYMM   → 19xx/20xx-MM (cutoff 50)
 *   YYYY   → YYYY-01
 *   YY     → 19xx/20xx-01
 */
export function normalizeYear(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // YYYY
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  // YYMM
  if (/^\d{4}$/.test(trimmed)) {
    const yy = parseInt(trimmed.slice(0, 2), 10);
    const mm = trimmed.slice(2, 4);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-${mm}`;
  }

  // YY
  if (/^\d{2}$/.test(trimmed)) {
    const yy = parseInt(trimmed, 10);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${year}-01`;
  }

  return undefined;
}
