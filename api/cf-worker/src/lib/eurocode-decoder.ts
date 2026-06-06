/**
 * Eurocode / articleNumber dekoder for bilglass
 * Parser fargekoder og feature-koder fra eurocode/beskrivelse
 * Basert på 30 års erfaring fra Autoglass AS
 */

// Fargekoder (lengste først for å unngå delstreng-overlapp)
const COLOR_CODES: Record<string, string> = {
  GYELM: 'grønn med varmetråder og regnsensor',
  GYEL: 'grønn med varmetråder',
  GNEL: 'grønn elektrisk (oppvarmet)',
  GNZ: 'grønn z-bøy',
  GN: 'helfarget grønn',
  GB: 'grønn med blå skygge',
  BZB: 'bronse med blå skygge',
  BZ: 'bronse',
  GG: 'grønn med grønn skygge',
  GD: 'mørk grønn',
  YP: 'sotet',
  GY: 'grønn med grå skyggefelt',
  BL: 'blå',
  BB: 'blå med blå skygge',
  CL: 'klar',
};

// Feature-koder (lengste først)
const FEATURE_CODES: Record<string, string> = {
  ENC: 'innkapslet (vulkanisert list)',
  ANT: 'antenne',
  EL: 'varmetråder',
  CS: 'coated',
  P: 'Privacy',
  H: 'oppvarmet',
  M: 'regnsensor',
  Z: 'z-bøy',
  UV: 'UV-beskyttet',
  A: 'antenne',
  C: 'klar',
};

// Sideglass-posisjoner
const POSITION_CODES: Record<string, string> = {
  FV: 'foran venstre',
  FH: 'foran høyre',
  BV: 'bak venstre',
  BH: 'bak høyre',
};

/**
 * Dekodér eurocode/articleNumber til menneskelesbar beskrivelse
 * Matcher lengste koder først, unngår overlappende delstrenger.
 */
export function decodeEurocode(code: string | null): string | null {
  if (!code) return null;

  const upper = code.toUpperCase();
  const usedPositions = new Set<number>();
  const parts: string[] = [];

  function markUsed(start: number, len: number) {
    for (let i = start; i < start + len; i++) usedPositions.add(i);
  }

  function isFree(start: number, len: number): boolean {
    for (let i = start; i < start + len; i++) if (usedPositions.has(i)) return false;
    return true;
  }

  function findAndMark(codes: Record<string, string>): void {
    const sorted = Object.entries(codes).sort((a, b) => b[0].length - a[0].length);
    for (const [key, label] of sorted) {
      let idx = upper.indexOf(key);
      while (idx !== -1) {
        if (isFree(idx, key.length)) {
          parts.push(label);
          markUsed(idx, key.length);
          break;
        }
        idx = upper.indexOf(key, idx + 1);
      }
    }
  }

  // Rekkefølge: farger → posisjoner → features
  findAndMark(COLOR_CODES);
  findAndMark(POSITION_CODES);
  findAndMark(FEATURE_CODES);

  return parts.length > 0 ? parts.join(', ') : null;
}

/** Kun farge */
export function extractColor(code: string | null): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const sorted = Object.entries(COLOR_CODES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, label] of sorted) {
    if (upper.includes(key)) return label;
  }
  return null;
}

/** Kun posisjon (sideglass) */
export function extractPosition(code: string | null): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const sorted = Object.entries(POSITION_CODES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, label] of sorted) {
    if (upper.includes(key)) return label;
  }
  return null;
}
