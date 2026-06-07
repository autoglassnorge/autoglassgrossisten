/**
 * Hybrid NER for ordremottaker
 * Strategy: Fast regex extraction first, LLM fallback for complex cases
 * Much more reliable than pure LLM for structured vehicle data extraction
 */

import type { Env } from "../types";

export interface ExtractedVehicle {
  make: string | null;
  model: string | null;
  year: number | null;
  regnr: string | null;
  vin: string | null;
  position: "frontrute" | "bakrute" | "dørrute-frem" | "dørrute-bak" | "siderute" | "annet" | null;
  adas: boolean | null;
  rain_sensor: boolean | null;
  heated: boolean | null;
  intent: "bestill" | "prisforespørsel" | "support" | "kunnskap" | "uklart";
  confidence: number;
}

// Known car brands (normalized to uppercase for matching)
const KNOWN_BRANDS = [
  "AUDI", "BMW", "MERCEDES", "VW", "VOLKSWAGEN", "VOLVO", "TOYOTA",
  "FORD", "OPEL", "CITROEN", "PEUGEOT", "RENAULT", "NISSAN", "HYUNDAI",
  "KIA", "HONDA", "MAZDA", "MITSUBISHI", "SKODA", "SEAT", "PORSCHE",
  "FIAT", "SUBARU", "LAND ROVER", "LANDROVER", "JAGUAR", "LEXUS",
  "ALFA ROMEO", "ALFA", "TESLA", "SAAB", "SSANGYONG", "DACIA",
  "DAIHATSU", "ISUZU", "SMART", "BYD", "INFINITI", "MG", "POLESTAR",
  "MASERATI", "CUPRA", "MAN", "SCANIA", "IVECO", "DAF", "JAGUAR",
  "MINI", "SUZUKI", "CHEVROLET", "DAEWOO", "CHRYSLER", "JEEP",
  "DODGE", "HUMMER", "LINCOLN", "CADILLAC", "BUICK", "GMC",
];

// Common misspellings → correct brand
const BRAND_ALIASES: Record<string, string> = {
  // Peugeot
  "PEUGOT": "PEUGEOT",
  "PEUGET": "PEUGEOT",
  "PEUGEO": "PEUGEOT",
  "PEUGOET": "PEUGEOT",
  // Skoda
  "SKOODA": "SKODA",
  "SCHODA": "SKODA",
  "SKOD": "SKODA",
  // Volkswagen
  "VOLKSWAGON": "VW",
  "VOLKS.WAGEN": "VW",
  "FOLKSWAGEN": "VW",
  "VOKSWAGEN": "VW",
  // Mercedes
  "MERCEDEZ": "MERCEDES",
  "MERCEDESS": "MERCEDES",
  "MERCEDEZ-BENZ": "MERCEDES",
  "MERCEDESBENZ": "MERCEDES",
  // Hyundai
  "HUNDAI": "HYUNDAI",
  "HYNDAI": "HYUNDAI",
  "HIUNDAI": "HYUNDAI",
  // Mitsubishi
  "MITSUBISHI": "MITSUBISHI",
  "MITSUBISH": "MITSUBISHI",
  "MITSUBISI": "MITSUBISHI",
  // SsangYong
  "SSANGYONG": "SSANGYONG",
  "SANGYONG": "SSANGYONG",
  "SSANG-YONG": "SSANGYONG",
  // Chevrolet
  "CHEVROLET": "CHEVROLET",
  "CHEVY": "CHEVROLET",
  "SHEVROLET": "CHEVROLET",
  // Chrysler
  "CHRYSLER": "CHRYSLER",
  "CHRISLER": "CHRYSLER",
  // Citroen
  "CITROEN": "CITROEN",
  "CITROËN": "CITROEN",
  "CITRON": "CITROEN",
  // Renault
  "RENAUT": "RENAULT",
  "RENAULD": "RENAULT",
  // Porsche
  "PORSCH": "PORSCHE",
  "PORCHE": "PORSCHE",
  // Mazda
  "MAZDA": "MAZDA",
  "MASDA": "MAZDA",
  // Nissan
  "NISSAN": "NISSAN",
  "NISSON": "NISSAN",
  "NESSAN": "NISSAN",
  // Toyota
  "TOYATA": "TOYOTA",
  "TOYTOA": "TOYOTA",
  "TOYOYA": "TOYOTA",
  // Honda
  "HONDA": "HONDA",
  "HONDAH": "HONDA",
  // Ford
  "FORD": "FORD",
  "FORd": "FORD",
  // Opel
  "OPEL": "OPEL",
  "OOPPEL": "OPEL",
  // Kia
  "KIA": "KIA",
  "KEA": "KIA",
  // Seat
  "SEAT": "SEAT",
  "SEET": "SEAT",
  // Fiat
  "FIAT": "FIAT",
  "FIET": "FIAT",
  // Subaru
  "SUBARU": "SUBARU",
  "SUBARO": "SUBARU",
  // Land Rover
  "LANDROVER": "LAND ROVER",
  "LAND-ROVER": "LAND ROVER",
  "LANDROBER": "LAND ROVER",
  // Alfa Romeo
  "ALFAROMEO": "ALFA ROMEO",
  "ALFA-ROMEO": "ALFA ROMEO",
  // Daihatsu
  "DAIHATSU": "DAIHATSU",
  "DAIHASU": "DAIHATSU",
  // Isuzu
  "ISUZU": "ISUZU",
  "ISUSU": "ISUZU",
  // Infiniti
  "INFINITY": "INFINITI",
  "INFINITI": "INFINITI",
  // Maserati
  "MASERATTI": "MASERATI",
  "MASERATI": "MASERATI",
  // Polestar
  "POLESTAR": "POLESTAR",
  "POLSTAR": "POLESTAR",
  // Cupra
  "CUPRA": "CUPRA",
  "CUPRAH": "CUPRA",
  // Dacia
  "DACIA": "DACIA",
  "DATCHA": "DACIA",
  // Scania
  "SCANIA": "SCANIA",
  "SKANIA": "SCANIA",
  // Iveco
  "IVECO": "IVECO",
  "IVEKO": "IVECO",
  // DAF
  "DAF": "DAF",
  "DAFF": "DAF",
  // Mini
  "MINI": "MINI",
  "MINNI": "MINI",
  // Suzuki
  "SUZUKI": "SUZUKI",
  "SUZUKY": "SUZUKI",
  // Jeep
  "JEEP": "JEEP",
  "JEAP": "JEEP",
  // Dodge
  "DODGE": "DODGE",
  "DODG": "DODGE",
  // Hummer
  "HUMMER": "HUMMER",
  "HUMER": "HUMMER",
  // Lincoln
  "LINCOLN": "LINCOLN",
  "LINKOLN": "LINCOLN",
  // Cadillac
  "CADILLAC": "CADILLAC",
  "CADILAC": "CADILLAC",
  // Buick
  "BUICK": "BUICK",
  "BUIK": "BUICK",
  // GMC
  "GMC": "GMC",
  "GMV": "GMC",
  // Daewoo
  "DAEWOO": "DAEWOO",
  "DAEWU": "DAEWOO",
  // Saab
  "SAAB": "SAAB",
  "SAAHB": "SAAB",
  // Tesla
  "TESLA": "TESLA",
  "TESLAH": "TESLA",
  // Lexus
  "LEXUS": "LEXUS",
  "LEXUZ": "LEXUS",
  // Jaguar
  "JAGUAR": "JAGUAR",
  "JAGUARH": "JAGUAR",
  // Volvo
  "VOLVO": "VOLVO",
  "VOLVVO": "VOLVO",
  // Audi
  "AUDI": "AUDI",
  "AUDY": "AUDI",
  // BMW
  "BMW": "BMW",
  "BWM": "BMW",
  "BMV": "BMW",
};

/** Levenshtein distance for fuzzy matching */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const matrix: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) matrix[i][0] = i;
  for (let j = 0; j <= n; j++) matrix[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[m][n];
}

// Position keywords in Norwegian
const POSITION_KEYWORDS: Record<string, string> = {
  "frontrute": "frontrute",
  "frontruten": "frontrute",
  "vindskjerm": "frontrute",
  "bakrute": "bakrute",
  "bakruten": "bakrute",
  "bakvindu": "bakrute",
  "sidedør": "dørrute-frem",
  "sidedøren": "dørrute-frem",
  "dørrute": "dørrute-frem",
  "dørruten": "dørrute-frem",
  "siderute": "siderute",
  "sideruten": "siderute",
  "sidevindu": "siderute",
};

// Intent keywords
const ORDER_KEYWORDS = [
  "trenger", "bestill", "vil ha", "skal ha", "mangler", "bytte",
  "ny", "nytt", "bestille", "ordre", "kjøpe", "kjenner du",
];

const PRICE_KEYWORDS = [
  "pris", "hva koster", "prisen", "kostnad", "hvor mye",
];

const KNOWLEDGE_KEYWORDS = [
  "hva er", "hva betyr", "hvordan", "hvorfor", "forklar", "forskjell", "forskjellen",
  "når", "hvor", "hvilken", "hvem", "kan jeg", "får jeg", "trekker", "betyr",
  "garanti", "reklamasjon", "retur", "bytte", "levering", "lager", "sporing",
  "tracking", "faktura", "ehf", "mva", "avtale", "rabatt", "kontakt", "telefon",
  "e-post", "leveringstid", "import", "oem", "aftermarket", "pilkington",
  "glavista", "euroglass", "eurocode", "e-code", "laminert", "herdet", "akustisk",
  "hud", "adas", "kalibrering", "regnsensor", "oppvarmet", "varme", "verksted",
  "grossist", "leverandør", "b2b", "explain", "what is", "how", "why", "when",
  "where", "which", "difference", "does", "can i", "do i need",
];

/**
 * Extract Norwegian registration number (2 letters + 4-5 digits)
 */
function extractRegnr(text: string): string | null {
  const match = text.match(/\b[A-Za-z]{2}\d{4,5}\b/);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Extract VIN (17 chars, no I/O/Q)
 */
function extractVin(text: string): string | null {
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Extract year (4 digits between 1950-2030)
 */
function extractYear(text: string): number | null {
  const matches = text.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!matches) return null;
  for (const m of matches) {
    const year = parseInt(m, 10);
    if (year >= 1950 && year <= 2030) return year;
  }
  return null;
}

/**
 * Extract brand from known brands list
 * 1. Exact match on known brands
 * 2. Check BRAND_ALIASES for common misspellings
 * 3. Fuzzy match with Levenshtein distance (max 2 edits for short words)
 */
function extractBrand(text: string): string | null {
  const upper = text.toUpperCase();

  // Step 1: Exact match on known brands
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand)) {
      return normalizeBrand(brand);
    }
  }

  // Step 2: Check known misspellings/aliases
  for (const [alias, correct] of Object.entries(BRAND_ALIASES)) {
    if (upper.includes(alias)) {
      return normalizeBrand(correct);
    }
  }

  // Step 3: Fuzzy match — find words that are close to known brands
  // Extract all potential words (2-15 chars)
  const words = upper.match(/\b[A-Z]{2,15}\b/g) || [];
  for (const word of words) {
    for (const brand of KNOWN_BRANDS) {
      const brandWords = brand.split(/\s+/);
      for (const bw of brandWords) {
        if (bw.length < 3) continue; // Skip short words
        const dist = levenshtein(word, bw);
        const threshold = bw.length <= 5 ? 1 : 2;
        if (dist <= threshold) {
          return normalizeBrand(brand);
        }
      }
    }
  }

  return null;
}

/** Normalize brand to canonical form */
function normalizeBrand(brand: string): string {
  const upper = brand.toUpperCase();
  if (upper === "VW" || upper === "VOLKSWAGEN") return "VW";
  if (upper === "LAND ROVER" || upper === "LANDROVER") return "LAND ROVER";
  if (upper === "ALFA ROMEO" || upper === "ALFA") return "ALFA ROMEO";
  return upper;
}

/**
 * Extract model - words immediately following brand, or capitalized words
 */
function extractModel(text: string, brand: string | null): string | null {
  if (!brand) {
    // Try to find any capitalized word that could be a model
    const match = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z0-9]*)*\b/);
    return match ? match[0] : null;
  }

  const upperText = text.toUpperCase();
  const brandPos = upperText.indexOf(brand);
  if (brandPos === -1) return null;

  // Get text after brand
  const afterBrand = text.slice(brandPos + brand.length);
  // Match model: word(s) after brand, but STOP before year numbers
  // Pattern: match words, but exclude trailing year numbers
  const modelMatch = afterBrand.match(/^\s*([A-Za-z][A-Za-z0-9\-]*(?:\s+[A-Za-z][A-Za-z0-9\-]*){0,2})/);
  if (modelMatch) {
    let model = modelMatch[1].trim();
    // Remove trailing year if present (e.g., "Transporter 2019" → "Transporter")
    model = model.replace(/\s+(19|20)\d{2}$/, '').trim();
    // Filter out common non-model words
    if (/^(jeg|har|en|ett|trenger|med|til|år|modell|type|variant)$/i.test(model)) {
      return null;
    }
    // Filter out standalone year numbers
    if (/^(19|20)\d{2}$/.test(model)) {
      return null;
    }
    return model || null;
  }
  return null;
}

/**
 * Extract glass position from keywords
 */
function extractPosition(text: string): ExtractedVehicle["position"] {
  const lower = text.toLowerCase();
  for (const [keyword, position] of Object.entries(POSITION_KEYWORDS)) {
    if (lower.includes(keyword)) return position as ExtractedVehicle["position"];
  }
  return null;
}

/**
 * Detect equipment mentions
 */
export function extractEquipment(text: string): {
  adas: boolean | null;
  rain_sensor: boolean | null;
  heated: boolean | null;
  antenna: boolean | null;
  coated: boolean | null;
} {
  const lower = text.toLowerCase();

  // Helper: check if feature is mentioned, considering negation
  // "med X" / "har X" → true
  // "uten X" / "ikke X" / "ingen X" → false
  function detectFeature(keywords: string[]): boolean | null {
    const hasPositive = keywords.some(k => lower.includes(k));
    if (!hasPositive) return null;

    // Check for negation within 15 chars before the keyword
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      const before = lower.slice(Math.max(0, idx - 15), idx);
      if (/\b(uten|ikke|ingen|no|not)\b/.test(before)) {
        return false;
      }
    }
    return true;
  }

  return {
    adas: detectFeature(["adas", "kamera", "filskifte", "lane", "adaptiv"]),
    rain_sensor: detectFeature(["regn", "rain", "regnsensor"]),
    heated: detectFeature(["oppvarm", "varme", "heated", "varmetråder"]),
    antenna: detectFeature(["antenne", "antenna", "radio"]),
    coated: detectFeature(["coated", "coating", "akustisk", "acoustic"]),
  };
}

/**
 * Detect intent
 */
function extractIntent(text: string): ExtractedVehicle["intent"] {
  const lower = text.toLowerCase();

  // Check for knowledge questions first (they often overlap with order words)
  const hasKnowledgeKw = KNOWLEDGE_KEYWORDS.some(k => lower.includes(k));
  const hasOrderKw = ORDER_KEYWORDS.some(k => lower.includes(k));
  const hasPriceKw = PRICE_KEYWORDS.some(k => lower.includes(k));

  // Strong knowledge indicators: starts with question words or contains explanatory keywords
  const strongKnowledge =
    /^\s*(hva|hvordan|hvorfor|når|hvor|hvilken|hvem|forklar|what|how|why|when|where|which|explain|does)\b/i.test(text) ||
    /\b(garanti|reklamasjon|retur|bytte|leveringstid|lagerstatus|sporing|faktura|ehf|mva|avtalepris|kontakt|telefon|e-post|oem|aftermarket|pilkington|glavista|euroglass|eurocode|laminert|herdet|akustisk|hud|adas\s+kalibrering|regnsensor|oppvarmet|verksted|grossist|leverandør|b2b)\b/i.test(text);

  if (strongKnowledge && !hasOrderKw && !hasPriceKw) {
    return "kunnskap";
  }

  // If it has knowledge keywords but no clear order/price keywords
  if (hasKnowledgeKw && !hasOrderKw && !hasPriceKw) {
    return "kunnskap";
  }

  if (hasOrderKw) return "bestill";
  if (hasPriceKw) return "prisforespørsel";
  if (hasKnowledgeKw) return "kunnskap";
  return "uklart";
}

/**
 * Calculate confidence based on how much we extracted
 */
function calculateConfidence(extracted: Partial<ExtractedVehicle>): number {
  let score = 0;
  let maxScore = 0;

  // Regnr or VIN = very high confidence base
  if (extracted.regnr || extracted.vin) score += 3;
  maxScore += 3;

  // Brand + model = high confidence
  if (extracted.make) score += 2;
  if (extracted.model) score += 1;
  maxScore += 3;

  // Year
  if (extracted.year) score += 1;
  maxScore += 1;

  // Position
  if (extracted.position) score += 1;
  maxScore += 1;

  return maxScore > 0 ? Math.min(score / maxScore, 1.0) : 0;
}

/**
 * Main extraction function - Hybrid approach
 * 1. Fast regex extraction (always runs)
 * 2. If confidence is low (< 0.5), try LLM fallback
 */
export async function extractVehicleHybrid(
  env: Env,
  message: string
): Promise<ExtractedVehicle> {
  // Step 1: Fast regex extraction
  const regnr = extractRegnr(message);
  const vin = extractVin(message);
  const year = extractYear(message);
  const make = extractBrand(message);
  const model = extractModel(message, make);
  const position = extractPosition(message);
  const equipment = extractEquipment(message);
  const intent = extractIntent(message);

  let result: ExtractedVehicle = {
    make,
    model,
    year,
    regnr,
    vin,
    position,
    adas: equipment.adas,
    rain_sensor: equipment.rain_sensor,
    heated: equipment.heated,
    intent,
    confidence: calculateConfidence({ make, model, year, regnr, vin, position }),
  };

  // Step 2: If confidence is low and we have enough context, try LLM fallback
  if (result.confidence < 0.5 && message.length > 5) {
    try {
      const llmResult = await extractVehicleWithLLM(env, message);
      if (llmResult && llmResult.confidence > result.confidence) {
        // Merge: prefer regex for explicit data, LLM for inferred data
        result = {
          make: result.make || llmResult.make,
          model: result.model || llmResult.model,
          year: result.year || llmResult.year,
          regnr: result.regnr || llmResult.regnr,
          vin: result.vin || llmResult.vin,
          position: result.position || llmResult.position,
          adas: result.adas ?? llmResult.adas,
          rain_sensor: result.rain_sensor ?? llmResult.rain_sensor,
          heated: result.heated ?? llmResult.heated,
          intent: llmResult.intent || result.intent,
          confidence: Math.max(result.confidence, llmResult.confidence * 0.8), // Slightly penalize LLM
        };
      }
    } catch (e) {
      console.error("[NER] LLM fallback failed:", e);
    }
  }

  return result;
}

/**
 * LLM fallback for complex cases
 * Simplified schema with better prompt
 */
async function extractVehicleWithLLM(
  env: Env,
  message: string
): Promise<ExtractedVehicle | null> {
  const prompt = `Du er en erfaren bilglass-ordremottaker. Kunden har sendt denne meldingen:

"${message}"

Ekstraher følgende. Sett null hvis ukjent.
- make: Bilmerke (Jaguar, VW, Audi, osv.)
- model: Modell (E-Pace, Transporter, A4, osv.)
- year: Årsmodell som tall
- regnr: Norsk regnr (AB12345)
- vin: 17-tegns understellsnummer
- position: frontrute, bakrute, dørrute-frem, dørrute-bak, siderute, eller annet
- adas: true hvis ADAS/kamera nevnes
- rain_sensor: true hvis regnsensor nevnes  
- heated: true hvis oppvarmet frontrute nevnes
- intent: bestill, prisforespørsel, support, kunnskap, eller uklart
- confidence: 0.0-1.0

REGEL FOR INTENT:
- "kunnskap" = kunden spør OM noe (hva er..., hvordan..., forskjellen på..., garanti, levering, priser, etc.)
- "bestill" = kunden vil BESTILLE/HA et glass (trenger, skal ha, bestille, etc.)
- "prisforespørsel" = kunden spør om PRIS på et spesifikt glass
- "support" = kunden har et problem eller klage
- "uklart" = kan ikke avgjøre

Svar KUN med gyldig JSON. Eksempel:
{"make":"Jaguar","model":"E-Pace","year":2022,"regnr":null,"vin":null,"position":"frontrute","adas":null,"rain_sensor":null,"heated":null,"intent":"bestill","confidence":0.9}`;

  try {
    const result = await env.AI.run("@cf/moonshotai/kimi-k2.5", {
      messages: [
        { role: "system", content: "Du ekstraherer kjøretøydata fra tekst. Svar KUN med JSON." },
        { role: "user", content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.1,
    });

    const response = (result as { response?: string }).response || "";
    if (!response) return null;

    // Try to extract JSON from response (may have markdown or extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      make: parsed.make || null,
      model: parsed.model || null,
      year: parsed.year || null,
      regnr: parsed.regnr || null,
      vin: parsed.vin || null,
      position: parsed.position || null,
      adas: parsed.adas ?? null,
      rain_sensor: parsed.rain_sensor ?? null,
      heated: parsed.heated ?? null,
      intent: parsed.intent || "uklart",
      confidence: parsed.confidence || 0,
    };
  } catch (e) {
    console.error("[NER] LLM extraction error:", e);
    return null;
  }
}
