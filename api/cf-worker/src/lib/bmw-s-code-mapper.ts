/**
 * BMW S-kode (Sonderausstattung) → glass feature mapping.
 * BMW factory equipment codes directly identify which glass features
 * a specific vehicle was built with. This is the highest-confidence
 * source we have for BMW vehicles.
 *
 * Known S-codes relevant to windshield / glass:
 *   S521A  – Rain sensor
 *   S534A  – Heated windshield
 *   S536A  – Acoustic glass (Schaum-/Akustikverglasung)
 *   S5ALA  – Acoustic glass (alternative code)
 *   S610A  – Head-up Display (HUD)
 *   S609A  – Navigation Professional (implies camera bracket)
 *   S548A  – Kerb camera / Surround View (front camera)
 *   S5A2A  – Lane Change Warning / Lane Departure Warning
 *   S5A1A  – Lane Keeping Assistant
 *   S5AT  – Active Blind Spot Detection
 *   S322A  – Comfort access (not glass, but often bundled)
 *   S403A  – Panoramic sunroof (different glass, but relevant)
 */

export interface ParsedBMWFeatures {
  rainSensor?: boolean;
  heated?: boolean;
  acoustic?: boolean;
  hud?: boolean;
  camera?: boolean;
  laneAssist?: boolean;
  antenna?: boolean;
}

/** Maps a single BMW S-code to one or more glass feature names. */
export const BMW_S_CODE_TO_FEATURES: Record<string, Array<keyof ParsedBMWFeatures>> = {
  // Rain sensor
  S521A: ["rainSensor"],
  S520A: ["rainSensor"], // fog lights (often bundled)
  // Heated windshield
  S534A: ["heated"],
  S533A: ["heated"], // heated rear window (implies heated front possible)
  // Acoustic glass
  S536A: ["acoustic"],
  S5ALA: ["acoustic"],
  S5AS: ["acoustic"], // alternative acoustic code
  // HUD
  S610A: ["hud"],
  S6AM: ["hud"], // Control Display / head-up (alternative)
  // Camera (front / surround view)
  S548A: ["camera"],
  S5DM: ["camera"], // BMW Drive Recorder
  S5A1A: ["camera", "laneAssist"], // Lane Keeping Assistant (uses camera)
  S5A2A: ["laneAssist"], // Lane Change Warning
  S5AT: ["laneAssist"], // Active Blind Spot Detection
  S609A: ["camera"], // Navigation Professional (often has camera mount)
  // Antenna (embedded in glass)
  S693A: ["antenna"], // Satellite tuner (requires antenna)
  S6AE: ["antenna"], // BMW TeleServices (often embedded antenna)
  S6AK: ["antenna"], // ConnectedDrive Services (requires antenna)
};

/**
 * Parse an array of BMW S-codes into a feature object.
 * Codes are case-insensitive. Unknown codes are ignored.
 */
export function parseBMWSCodeList(sCodes: string[]): ParsedBMWFeatures {
  const result: ParsedBMWFeatures = {};
  const seen = new Set<keyof ParsedBMWFeatures>();

  for (const raw of sCodes) {
    const code = raw.toUpperCase().trim();
    const features = BMW_S_CODE_TO_FEATURES[code];
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
 * Score how well parsed BMW features match catalog features.
 * Returns a number in the range [-0.3, 0.3] suitable for adding to a
 * candidate score bonus.
 */
export function scoreBMWFeatures(
  parsedFeatures: ParsedBMWFeatures,
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
    key: keyof ParsedBMWFeatures;
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
      score -= 0.1;
    }
  }

  // Perfect match bonus
  if (checked > 0 && matched === checked) {
    score += 0.1;
  }

  // Cap at ±0.3
  return Math.max(-0.3, Math.min(0.3, score));
}

/**
 * Extract S-codes from raw text using regex.
 * Matches BMW S-code format: S followed by 3 digits and optional letter suffix.
 */
export function extractSCodeFromText(text: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  // BMW S-codes: S + 3 digits + optional letter (A-Z)
  // Examples: S521A, S534A, S536A, S610A, S5ALA, S548A, S5A2A
  const pattern = /S\d{1,3}[A-Z]?A?\b/gi;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const code = m[0].toUpperCase().trim();
    if (code.length >= 4 && code.length <= 7 && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  // Also try alternative format with dots/spaces: S 521 A, S.521.A
  const altPattern = /S\s*\.?\s*(\d{1,3})\s*\.?\s*([A-Z])?\s*A?\b/gi;
  while ((m = altPattern.exec(text)) !== null) {
    const digits = m[1];
    const letter = m[2] || "";
    const code = `S${digits}${letter}A`.toUpperCase();
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}
