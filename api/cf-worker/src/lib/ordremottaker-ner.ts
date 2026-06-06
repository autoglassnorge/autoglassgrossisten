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
  intent: "bestill" | "prisforespørsel" | "support" | "uklart";
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
 */
function extractBrand(text: string): string | null {
  const upper = text.toUpperCase();
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand)) {
      // Normalize common variants
      if (brand === "VW" || brand === "VOLKSWAGEN") return "VW";
      if (brand === "LAND ROVER" || brand === "LANDROVER") return "LAND ROVER";
      if (brand === "ALFA ROMEO" || brand === "ALFA") return "ALFA ROMEO";
      return brand;
    }
  }
  return null;
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
function extractEquipment(text: string): { adas: boolean | null; rain_sensor: boolean | null; heated: boolean | null } {
  const lower = text.toLowerCase();
  return {
    adas: lower.includes("adas") || lower.includes("kamera") || lower.includes("filskifte") || lower.includes("lane") ? true : null,
    rain_sensor: lower.includes("regn") || lower.includes("rain") ? true : null,
    heated: lower.includes("oppvarm") || lower.includes("varme") || lower.includes("heated") ? true : null,
  };
}

/**
 * Detect intent
 */
function extractIntent(text: string): ExtractedVehicle["intent"] {
  const lower = text.toLowerCase();
  if (ORDER_KEYWORDS.some(k => lower.includes(k))) return "bestill";
  if (PRICE_KEYWORDS.some(k => lower.includes(k))) return "prisforespørsel";
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
- intent: bestill, prisforespørsel, support, eller uklart
- confidence: 0.0-1.0

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
