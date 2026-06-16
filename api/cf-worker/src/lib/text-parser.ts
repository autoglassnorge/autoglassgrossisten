/**
 * Text input parser for free-text vehicle queries.
 * Parses "BMW 5 SERIE 2024" or "VW Golf 2015" into structured vehicle data.
 */

import { normalizeBrand, getBrandAliases } from "./brand";

export interface ParsedVehicleText {
  brand: string;
  model: string;
  year: number | undefined;
  raw: string;
}

// Multi-word brands that must be matched as a phrase
const MULTI_WORD_BRANDS = [
  "LAND ROVER",
  "ALFA ROMEO",
  "ASTON MARTIN",
  "ROLLS ROYCE",
  "USA CARS",
  "DAEWOO (CHEVROLET)",
  "DFSK (SERES)",
  "JAC (CH)",
  "LYNK & CO",
  "JC INDIGO",
  "LADA / TOGLIATTI",
  "IVECO (FIAT) TRUCKS",
  "SCANIA TRUCKS",
  "MERCEDES TRUCKS",
  "VOLVO TRUCKS",
  "FORD TRUCKS",
  "TOYOTA TRUCKS",
  "PEUGEOT TRUCKS",
  "CITROEN TRUCKS",
  "AUDI TRUCKS",
  "BMW TRUCKS",
  "NISSAN TRUCKS",
  "FIAT TRUCKS",
  "RENAULT TRUCKS",
  "MITSUBISHI TRUCKS",
  "MAZDA TRUCKS",
  "ISUZU TRUCKS",
  "HINO TRUCKS",
  "MAN TRUCKS",
  "OPEL TRUCKS",
  "HYUNDAI TRUCKS",
  "KIA TRUCKS",
  "SUZUKI TRUCKS",
  "HONDA TRUCKS",
  "SUBARU TRUCKS",
  "SSANGYONG TRUCKS",
];

// Single-word brand aliases (uppercase)
const SINGLE_WORD_BRANDS = new Set([
  "BMW", "AUDI", "VW", "VOLKSWAGEN", "MERCEDES", "FORD", "TOYOTA", "HONDA",
  "NISSAN", "HYUNDAI", "KIA", "SKODA", "SEAT", "VOLVO", "PEUGEOT", "CITROEN",
  "RENAULT", "OPEL", "FIAT", "MAZDA", "MITSUBISHI", "SUBARU", "SUZUKI",
  "MINI", "SMART", "JEEP", "CHRYSLER", "DODGE", "CADILLAC", "GMC", "HUMMER",
  "CHEVROLET", "DAEWOO", "PORSCHE", "JAGUAR", "LANDROVER", "LAND ROVER",
  "LEXUS", "INFINITI", "ACURA", "TESLA", "POLESTAR", "CUPRA", "MAXUS",
  "INEOS", "JAC", "DFSK", "HONGQI", "VOYAH", "XPENG", "ZEEKR", "BYD",
  "ORA", "NIO", "FISKER", "RIVIAN", "LUCID", "TVR", "AIXAM", "AIWAYS",
  "DONGFENG", "EXLANTIX", "SAAB", "LADA", "ZASTAVA", "ROVER", "MG",
  "LOTUS", "BENTLEY", "FERRARI", "MASERATI", "LAMBORGHINI", "ALFA",
  "ABARTH", "MAN", "SCANIA", "DAF", "IVECO", "HINO", "ISUZU", "TRUCKS",
  "VETERAN", "BUS", "VW TRUCKS", "MERCEDES TRUCKS", "VOLVO TRUCKS",
  "FORD TRUCKS", "TOYOTA TRUCKS", "PEUGEOT TRUCKS", "CITROEN TRUCKS",
  "AUDI TRUCKS", "BMW TRUCKS", "NISSAN TRUCKS", "FIAT TRUCKS",
  "RENAULT TRUCKS", "MITSUBISHI TRUCKS", "MAZDA TRUCKS", "ISUZU TRUCKS",
  "HINO TRUCKS", "MAN TRUCKS", "OPEL TRUCKS", "HYUNDAI TRUCKS",
  "KIA TRUCKS", "SUZUKI TRUCKS", "HONDA TRUCKS", "SUBARU TRUCKS",
  "SSANGYONG TRUCKS",
]);

/** Check if a token is a known brand (before normalization) */
function isKnownBrand(token: string): boolean {
  const upper = token.toUpperCase();
  return SINGLE_WORD_BRANDS.has(upper) || SINGLE_WORD_BRANDS.has(normalizeBrand(upper));
}

/** Extract year from end of token array */
function extractYear(tokens: string[]): { year: number | undefined; remaining: string[] } {
  const last = tokens[tokens.length - 1];
  if (last && /^\d{4}$/.test(last)) {
    const year = parseInt(last, 10);
    if (year >= 1950 && year <= 2035) {
      return { year, remaining: tokens.slice(0, -1) };
    }
  }
  // Also check second-to-last if last is something like "modell" or "serie"
  const secondLast = tokens[tokens.length - 2];
  if (secondLast && /^\d{4}$/.test(secondLast)) {
    const year = parseInt(secondLast, 10);
    if (year >= 1950 && year <= 2035) {
      return { year, remaining: tokens.slice(0, -2).concat(tokens.slice(-1)) };
    }
  }
  return { year: undefined, remaining: tokens };
}

/** Try to match a multi-word brand at the start of the input */
function matchMultiWordBrand(input: string): { brand: string; rest: string } | null {
  const upper = input.toUpperCase();
  for (const brand of MULTI_WORD_BRANDS) {
    if (upper.startsWith(brand + " ") || upper === brand) {
      return { brand: normalizeBrand(brand), rest: input.slice(brand.length).trim() };
    }
  }
  return null;
}

/**
 * Parse free-text vehicle query into structured data.
 *
 * Examples:
 *   "BMW 5 SERIE 2024" → { brand: "BMW", model: "5 SERIE", year: 2024 }
 *   "VW Golf 2015" → { brand: "VW", model: "Golf", year: 2015 }
 *   "LAND ROVER DEFENDER 2020" → { brand: "LANDROVER", model: "DEFENDER", year: 2020 }
 *   "Skoda Superb" → { brand: "SKODA", model: "Superb", year: undefined }
 */
export function parseVehicleText(input: string): ParsedVehicleText | null {
  const raw = input.trim();
  if (!raw) return null;

  // Try multi-word brand first
  const multiMatch = matchMultiWordBrand(raw);
  if (multiMatch) {
    const tokens = multiMatch.rest.split(/\s+/).filter(Boolean);
    const { year, remaining } = extractYear(tokens);
    const model = remaining.join(" ").trim();
    return {
      brand: multiMatch.brand,
      model: model || "",
      year,
      raw,
    };
  }

  // Single-word brand: split and detect
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Check first token as brand
  let brand = normalizeBrand(tokens[0]);
  let modelTokens = tokens.slice(1);

  // If first token is not a known brand, try first two tokens
  if (!isKnownBrand(tokens[0]) && tokens.length >= 2) {
    const twoWord = (tokens[0] + " " + tokens[1]).toUpperCase();
    const normalizedTwo = normalizeBrand(twoWord);
    if (normalizedTwo !== twoWord || isKnownBrand(twoWord)) {
      brand = normalizedTwo;
      modelTokens = tokens.slice(2);
    }
  }

  // Extract year from end
  const { year, remaining } = extractYear(modelTokens);
  const model = remaining.join(" ").trim();

  return {
    brand,
    model,
    year,
    raw,
  };
}
