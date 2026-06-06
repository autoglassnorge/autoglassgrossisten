/**
 * Eurocode / articleNumber dekoder for bilglass
 * Parser fargekoder og feature-koder fra eurocode/beskrivelse
 */

const COLOR_CODES: Record<string, string> = {
  GN: 'helfarget grønn',
  GB: 'grønn med blå skygge',
  BZ: 'bronse',
  BZB: 'bronse med blå skygge',
  GG: 'grønn med grønn skygge',
  GD: 'mørk grønn',
  YP: 'sotet',
  GNEL: 'grønn elektrisk (oppvarmet)',
  GY: 'grønn med grå skyggefelt',
  GYEL: 'grønn med el/speil',
  GNZ: 'grønn z-bøy',
  GYELM: 'grønn med el/speil og antenne',
};

const FEATURE_CODES: Record<string, string> = {
  EL: 'elektrisk/oppvarmet',
  E: 'elektrisk/oppvarmet',
  ANT: 'antenne',
  A: 'antenne',
  H: 'oppvarmet',
  M: 'regnsensor',
  Z: 'z-bøy',
  UV: 'UV-beskyttet',
};

/**
 * Dekodér eurocode/articleNumber til menneskelesbar beskrivelse
 * Eksempler:
 *   "2525GYA" → "Grønn med grå skyggefelt, antenne"
 *   "3393GNELM" → "Grønn elektrisk (oppvarmet), monteringsklosser"
 *   "1570AGB" → "Grønn med blå skygge"
 */
export function decodeEurocode(code: string | null): string | null {
  if (!code) return null;

  const upper = code.toUpperCase();
  const parts: string[] = [];

  // Finn fargekoder (prioritet: lengste match først)
  const colorMatches = Object.keys(COLOR_CODES)
    .filter((k) => upper.includes(k))
    .sort((a, b) => b.length - a.length);

  if (colorMatches.length > 0) {
    // Bruk lengste match (f.eks. GYELM før GY)
    const colorKey = colorMatches[0];
    parts.push(COLOR_CODES[colorKey]);
  }

  // Finn feature-koder (unngå duplikater med farge)
  const used = new Set(colorMatches.length > 0 ? [colorMatches[0]] : []);
  for (const [key, label] of Object.entries(FEATURE_CODES)) {
    if (used.has(key)) continue;
    if (upper.includes(key)) {
      parts.push(label);
      used.add(key);
    }
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Hurtig-farge fra eurocode (kun farge, ikke features)
 */
export function extractColor(code: string | null): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const colorMatches = Object.keys(COLOR_CODES)
    .filter((k) => upper.includes(k))
    .sort((a, b) => b.length - a.length);
  return colorMatches.length > 0 ? COLOR_CODES[colorMatches[0]] : null;
}
