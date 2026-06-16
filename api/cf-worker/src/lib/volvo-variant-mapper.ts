/**
 * Volvo variant code → glass feature mapping.
 * Volvo uses factory variant codes (e.g. FW01, SENS, HUD) to identify
 * equipment. This module maps those codes to our canonical feature flags.
 */

export interface ParsedVolvoFeatures {
  rainSensor?: boolean;
  heated?: boolean;
  acoustic?: boolean;
  hud?: boolean;
  camera?: boolean;
  laneAssist?: boolean;
  antenna?: boolean;
}

/** Maps a single variant code to one or more feature names. */
export const VOLVO_VARIANT_TO_FEATURES: Record<string, Array<keyof ParsedVolvoFeatures>> = {
  // Rain sensor
  SENS: ["rainSensor"],
  SENSOR: ["rainSensor"],
  RSN: ["rainSensor"],
  REGN: ["rainSensor"],
  REGNSEN: ["rainSensor"],
  REGNSENSOR: ["rainSensor"],
  // Heated
  EL: ["heated"],
  ELE: ["heated"],
  HTB: ["heated"],
  VARM: ["heated"],
  UHTD: ["heated"],
  HTD: ["heated"],
  HT: ["heated"],
  // Acoustic
  AKU: ["acoustic"],
  AKO: ["acoustic"],
  ACO: ["acoustic"],
  COAT: ["acoustic"],
  QUIET: ["acoustic"],
  // HUD
  HUD: ["hud"],
  "H.U.D": ["hud"],
  // Camera
  CAM: ["camera"],
  CAMERA: ["camera"],
  KAMERA: ["camera"],
  FX02: ["camera"],
  FX04: ["camera"],
  // Lane assist / ADAS
  LDW: ["laneAssist"],
  ADAS: ["laneAssist", "camera"],
  FILSKIFTE: ["laneAssist"],
  "CITY SAFETY": ["laneAssist", "camera"],
  // Antenna
  ANT: ["antenna"],
  ANTENNE: ["antenna"],
  GNAG: ["antenna"],
  // Windshield variants (no direct feature, but used for differentiation)
  FW01: [],
  FW03: [],
  FW04: [],
  // Equipment packages (no direct feature)
  T702: [],
  T801: [],
};

/**
 * Parse a list of Volvo variant codes into a feature object.
 * Codes are case-insensitive. Unknown codes are ignored.
 */
export function parseVolvoVariantCodes(codes: string[]): ParsedVolvoFeatures {
  const result: ParsedVolvoFeatures = {};
  const seen = new Set<keyof ParsedVolvoFeatures>();

  for (const raw of codes) {
    const code = raw.toUpperCase().trim();
    const features = VOLVO_VARIANT_TO_FEATURES[code];
    if (!features) continue;

    for (const f of features) {
      if (!seen.has(f)) {
        seen.add(f);
        result[f] = true;
      }
    }
  }

  return result;
}

/**
 * Score how well parsed Volvo features match catalog features.
 * Returns a number in the range [-1, 1] suitable for adding to a
 * candidate score bonus.
 */
export function scoreVolvoFeatures(
  parsedFeatures: ParsedVolvoFeatures,
  catalogFeatures: {
    rainSensor?: boolean | number | null;
    heated?: boolean | number | null;
    acoustic?: boolean | number | null;
    hud?: boolean | number | null;
    camera?: boolean | number | null;
    laneAssist?: boolean | number | null;
    antenna?: boolean | number | null;
  }
): number {
  let score = 0;
  let checked = 0;
  let matched = 0;

  const fields: Array<{
    key: keyof ParsedVolvoFeatures;
    catalogKey: keyof typeof catalogFeatures;
  }> = [
    { key: "rainSensor", catalogKey: "rainSensor" },
    { key: "heated", catalogKey: "heated" },
    { key: "acoustic", catalogKey: "acoustic" },
    { key: "hud", catalogKey: "hud" },
    { key: "camera", catalogKey: "camera" },
    { key: "laneAssist", catalogKey: "laneAssist" },
    { key: "antenna", catalogKey: "antenna" },
  ];

  for (const { key, catalogKey } of fields) {
    const parsed = parsedFeatures[key];
    if (parsed === undefined) continue;

    const catalogRaw = catalogFeatures[catalogKey];
    const catalogHas = !!(catalogRaw === true || catalogRaw === 1);

    checked++;
    if (parsed === catalogHas) {
      matched++;
      score += 0.2;
    } else {
      score -= 0.15;
    }
  }

  // Small confidence boost when we have variant data and at least something matched
  if (checked > 0 && matched === checked) {
    score += 0.1; // perfect match bonus
  }

  return score;
}
