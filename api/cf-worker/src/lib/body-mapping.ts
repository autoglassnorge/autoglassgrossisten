/**
 * Normalize and compare vehicle body types across SVV, Bovsoft, VIN-decode
 * and catalog description conventions.
 */

export const CANONICAL_BODIES = [
  "sedan",
  "hatchback",
  "station_wagon",
  "suv",
  "van",
  "coupe",
  "pickup",
  "convertible",
  "mpv",
] as const;

export type CanonicalBody = (typeof CANONICAL_BODIES)[number];

/** Map free-text body labels to canonical body types. */
const BODY_ALIASES: Record<string, CanonicalBody> = {
  // sedan
  sedan: "sedan",
  saloon: "sedan",
  sal: "sedan",
  "4d": "sedan",
  "4-d": "sedan",
  "4 door": "sedan",
  "4-door": "sedan",
  // hatchback
  hatch: "hatchback",
  hatchback: "hatchback",
  "3d": "hatchback",
  "3-d": "hatchback",
  "5d": "hatchback",
  "5-d": "hatchback",
  "3 door": "hatchback",
  "3-door": "hatchback",
  "5 door": "hatchback",
  "5-door": "hatchback",
  // station wagon
  wagon: "station_wagon",
  estate: "station_wagon",
  stasjons: "station_wagon",
  stasjonsvogn: "station_wagon",
  touring: "station_wagon",
  sw: "station_wagon",
  kombi: "station_wagon",
  // suv
  suv: "suv",
  jeep: "suv",
  "4x4": "suv",
  cross: "suv",
  crossover: "suv",
  offroad: "suv",
  // van
  van: "van",
  kasse: "van",
  box: "van",
  delivery: "van",
  varebil: "van",
  // coupe
  coupe: "coupe",
  "2d": "coupe",
  "2-d": "coupe",
  "2 door": "coupe",
  "2-door": "coupe",
  gt: "coupe",
  // pickup
  pickup: "pickup",
  "double cab": "pickup",
  "doble cab": "pickup",
  crew: "pickup",
  flatbed: "pickup",
  // convertible
  cabriolet: "convertible",
  convertible: "convertible",
  cab: "convertible",
  cc: "convertible",
  kabriolet: "convertible",
  open: "convertible",
  softtop: "convertible",
  hardtop: "convertible",
  // mpv
  mpv: "mpv",
  minivan: "mpv",
  multivan: "mpv",
  caravelle: "mpv",
  sharan: "mpv",
  galaxy: "mpv",
};

/**
 * Normalize a raw body string to a canonical body type.
 * Returns null if no clear mapping exists.
 */
export function normalizeBody(input: string | null | undefined): CanonicalBody | null {
  if (!input) return null;
  const key = input.toLowerCase().trim();
  return BODY_ALIASES[key] || null;
}

/** Detect canonical body types present in a description/model string. */
export function detectBodies(text: string): CanonicalBody[] {
  const found = new Set<CanonicalBody>();
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(BODY_ALIASES)) {
    if (lower.includes(alias)) {
      found.add(canonical);
    }
  }
  return Array.from(found);
}

/**
 * Check whether a vehicle body is compatible with bodies detected in a record.
 * Returns true if vehicle body is unknown, or if it matches at least one record body.
 */
export function isBodyCompatible(
  vehicleBody: string | null | undefined,
  recordText: string
): boolean {
  const canonicalVehicle = normalizeBody(vehicleBody);
  if (!canonicalVehicle) return true; // unknown vehicle body => no filter
  const recordBodies = detectBodies(recordText);
  if (recordBodies.length === 0) return true; // no body info in record => no filter
  return recordBodies.includes(canonicalVehicle);
}
