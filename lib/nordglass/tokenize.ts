/**
 * Nord Glass — Tokenizer
 * Deler en rå PDF-linje i meningsfulle tokens.
 */

export interface NordGlassTokens {
  raw: string;
  vehicleSegment: string;        // f.eks. "MDX5RGR0101-0401"
  productFamily: string | null;  // WSWS, RWRW, BOT, BOD, BOS, BOAS, GUGU
  featuresSegment: string;       // f.eks. "GSBL - sp mbO rectangle vin frame"
  dimensionsSegment: string | null; // f.eks. "1597x954"
  internalCodeSegment: string;   // f.eks. "FW02182GBYN" eller "WS2182GBYUSA"
}

const PRODUCT_FAMILY_RE = /(WSWS|RWRW|BOT|BOD|BOS|BOAS|GUGU)/;

const DIMENSIONS_RE = /(\d{3,4})[xX](\d{3,4})/;

/**
 * Tokenize en Nord Glass PDF-linje.
 *
 * Strategi:
 * 1. Splitt på produktfamilie → vehicle | rest
 * 2. I rest: finn dimensjoner (e.g. 1597x954)
 * 3. Alt før dimensjoner = features (+ evt. internkode før dim)
 * 4. Alt etter dimensjoner = internkode
 * 5. Hvis ingen dimensjoner: finn første internkode-liknende mønster
 */
export function tokenize(line: string): NordGlassTokens {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      raw: trimmed,
      vehicleSegment: '',
      productFamily: null,
      featuresSegment: '',
      dimensionsSegment: null,
      internalCodeSegment: '',
    };
  }

  // 1. Finn produktfamilie-posisjon
  const familyMatch = trimmed.match(PRODUCT_FAMILY_RE);
  const familyIndex = familyMatch ? familyMatch.index! : -1;
  const family = familyMatch ? familyMatch[1] : null;

  if (familyIndex === -1) {
    return {
      raw: trimmed,
      vehicleSegment: trimmed,
      productFamily: null,
      featuresSegment: '',
      dimensionsSegment: null,
      internalCodeSegment: '',
    };
  }

  // 2. Splitt på produktfamilie
  const beforeFamily = trimmed.slice(0, familyIndex);
  const afterFamily = trimmed.slice(familyIndex + (family?.length || 0));

  const vehicleSegment = beforeFamily.trim();

  // 3. Finn dimensjoner i resten
  const dimMatch = afterFamily.match(DIMENSIONS_RE);
  const dimIndex = dimMatch ? dimMatch.index! : -1;

  let featuresSegment = afterFamily;
  let dimensionsSegment: string | null = null;
  let internalCodeSegment = '';

  if (dimIndex !== -1) {
    dimensionsSegment = dimMatch![0];
    featuresSegment = afterFamily.slice(0, dimIndex).trim();
    internalCodeSegment = afterFamily.slice(dimIndex + dimensionsSegment.length).trim();
  } else {
    // Ingen dimensjoner — prøv å finn internkode ved å se etter tall+mønster
    // Aksepter flere mønstre: [A-Z]{2,}\d{4,}[A-Z]{0,} eller \d+[A-Z]{2,}
    const codeMatch = afterFamily.match(/(?:[A-Z]{2,}\d{3,}[A-Z]{0,}|\d+[A-Z]{2,})/);
    if (codeMatch && codeMatch.index !== undefined) {
      featuresSegment = afterFamily.slice(0, codeMatch.index).trim();
      internalCodeSegment = afterFamily.slice(codeMatch.index).trim();
    } else {
      featuresSegment = afterFamily.trim();
    }
  }

  return {
    raw: trimmed,
    vehicleSegment,
    productFamily: family,
    featuresSegment,
    dimensionsSegment,
    internalCodeSegment,
  };
}
