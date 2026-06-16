/**
 * body-class-mapper.ts
 * Maps vPIC bodyClass to Sekurit body_type for improved VIN matching.
 */

export interface BodyClassMapping {
  vpics: string[];        // vPIC bodyClass values (e.g. "Sedan/Saloon")
  sekuritTypes: string[];   // Sekurit body_type values (e.g. "4 D SED")
  confidence: number;     // How confident this mapping is (0-1)
}

const BODY_CLASS_MAPPINGS: BodyClassMapping[] = [
  // Sedan / 4-door
  {
    vpics: ["Sedan/Saloon", "Sedan", "Saloon", "4 Door"],
    sekuritTypes: ["4 D SED", "4D SED", "SED"],
    confidence: 0.90,
  },
  // Station Wagon / Estate
  {
    vpics: ["Station Wagon", "Wagon", "Estate", "5 Door"],
    sekuritTypes: ["5 D STV", "5D STV", "STV", "5 D KOMBI KUPE", "KOMBI KUPE"],
    confidence: 0.85,
  },
  // SUV / Crossover
  {
    vpics: ["SUV", "Sport Utility", "Crossover", "CUV"],
    sekuritTypes: ["5 D SUV", "5D SUV", "SUV", "5 D KOMBI KUPE"],
    confidence: 0.80,
  },
  // Hatchback
  {
    vpics: ["Hatchback", "5 Door Hatchback", "3 Door Hatchback"],
    sekuritTypes: ["5 D KOMBI KUPE", "3 D KOMBI KUPE", "KOMBI KUPE"],
    confidence: 0.85,
  },
  // Sport Activity Coupe (must be checked before generic Coupe)
  {
    vpics: ["Sport Activity Coupe", "SAC", "Coupe SUV"],
    sekuritTypes: ["5 D KOMBI KUPE", "5 D SUV"],
    confidence: 0.70,
  },
  // Coupe
  {
    vpics: ["Coupe", "2 Door Coupe"],
    sekuritTypes: ["2D KUPE", "2 D KUPE", "KUPE", "2 D KOMBI KUPE"],
    confidence: 0.90,
  },
  // Convertible / Cabriolet
  {
    vpics: ["Convertible", "Cabriolet", "Roadster", "Spider", "Spyder"],
    sekuritTypes: ["2D KABRIOLET", "2 D KABRIOLET", "KABRIOLET", "KUPE/KABRIOLET"],
    confidence: 0.90,
  },
  // Pickup
  {
    vpics: ["Pickup", "Truck", "Pickup Truck"],
    sekuritTypes: ["2D PICKUP", "4D PICKUP", "PICKUP", "VAREBIL"],
    confidence: 0.85,
  },
  // Van / Minivan
  {
    vpics: ["Van", "Minivan", "MPV", "Multi-Purpose"],
    sekuritTypes: ["VAREBIL", "MPV", "5 D KOMBI KUPE"],
    confidence: 0.75,
  },
];

/**
 * Map vPIC bodyClass to Sekurit body_type.
 * Returns the best matching Sekurit type(s) and confidence.
 */
export function mapBodyClassToSekurit(vpicBodyClass: string): { types: string[]; confidence: number } {
  if (!vpicBodyClass) return { types: [], confidence: 0 };

  const normalized = vpicBodyClass.toLowerCase().trim();

  for (const mapping of BODY_CLASS_MAPPINGS) {
    for (const vpic of mapping.vpics) {
      if (normalized.includes(vpic.toLowerCase())) {
        return { types: mapping.sekuritTypes, confidence: mapping.confidence };
      }
    }
  }

  return { types: [], confidence: 0 };
}

/**
 * Check if a Sekurit body_type matches a vPIC bodyClass.
 */
export function bodyTypeMatchesBodyClass(
  sekuritBodyType: string,
  vpicBodyClass: string
): { matches: boolean; confidence: number } {
  const mapping = mapBodyClassToSekurit(vpicBodyClass);
  if (mapping.types.length === 0) return { matches: false, confidence: 0 };

  const normalizedSekurit = sekuritBodyType.toLowerCase().trim();
  for (const type of mapping.types) {
    if (normalizedSekurit.includes(type.toLowerCase())) {
      return { matches: true, confidence: mapping.confidence };
    }
  }

  return { matches: false, confidence: 0 };
}

/**
 * Score a product match based on bodyClass matching.
 * Returns a bonus score (0-1) to add to the confidence score.
 */
export function bodyClassMatchScore(
  sekuritBodyType: string,
  vpicBodyClass: string
): number {
  const { matches, confidence } = bodyTypeMatchesBodyClass(sekuritBodyType, vpicBodyClass);
  if (!matches) return 0;
  return confidence * 0.15; // Up to 0.15 bonus for bodyClass match
}

/**
 * Extract body_type from Sekurit product_title.
 * Examples:
 *   "BMW 5 SER G60 4S 23- Frontr..." → "4 D SED" (4S = 4-door sedan)
 *   "VW AMAROK 4D 10-23 Frontr..." → "4 D PICKUP"
 */
export function extractBodyTypeFromTitle(title: string): string | null {
  if (!title) return null;
  const t = title.toUpperCase();

  // Direct body type mentions in title
  const patterns: [RegExp, string][] = [
    [/\b4D\s+SED\b/, "4 D SED"],
    [/\b5D\s+STV\b/, "5 D STV"],
    [/\b5D\s+SUV\b/, "5 D SUV"],
    [/\b5D\s+KOMBI\s+KUPE\b/, "5 D KOMBI KUPE"],
    [/\b3D\s+KOMBI\s+KUPE\b/, "3 D KOMBI KUPE"],
    [/\b2D\s+KUPE\b/, "2D KUPE"],
    [/\b2D\s+KABRIOLET\b/, "2D KABRIOLET"],
    [/\b4D\s+PICKUP\b/, "4 D PICKUP"],
    [/\b2D\s+PICKUP\b/, "2 D PICKUP"],
    [/\bMPV\b/, "MPV"],
    [/\bVAREBIL\b/, "VAREBIL"],
    [/\b4S\b/, "4 D SED"],  // 4S = 4-door sedan (BMW shorthand)
    [/\b5S\b/, "5 D STV"],  // 5S = 5-door station wagon
    [/\b4D\b/, "4 D SED"],  // Generic 4-door
    [/\b5D\b/, "5 D STV"],  // Generic 5-door
  ];

  for (const [regex, bodyType] of patterns) {
    if (regex.test(t)) return bodyType;
  }

  return null;
}
