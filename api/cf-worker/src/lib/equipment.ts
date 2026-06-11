/**
 * Equipment detection from descriptions and Biluppgitter API.
 */

import type { GlassRecord, FactoryEquipment } from "../types";
import { fetchWithTimeout } from "../providers/svv";

/**
 * Check if a token is in a negated context (e.g. "IKKE ANT", "NOT HEATED", "NO CAMERA").
 * Looks for negation words within ±3 tokens of the target.
 */
function isNegated(tokens: string[], targetIndex: number): boolean {
  const negationWords = new Set(["IKKE", "NOT", "NO", "NB", "WITHOUT", "UTEN", "INGEN", "NEI"]);
  const window = 3;
  for (let i = Math.max(0, targetIndex - window); i <= Math.min(tokens.length - 1, targetIndex + window); i++) {
    if (i === targetIndex) continue;
    if (negationWords.has(tokens[i])) {
      // Check if negation is before the target (more reliable)
      if (i < targetIndex) return true;
      // If negation is after, only count if it's immediately after (e.g. "ANT, IKKE")
      if (i === targetIndex + 1) return true;
    }
  }
  return false;
}

/**
 * Check if a regex match in the description is in a negated context.
 * Finds the word position of the match and checks nearby tokens for negation.
 */
function isRegexMatchNegated(d: string, regex: RegExp, tokens: string[]): boolean {
  const match = regex.exec(d);
  if (!match) return false;
  // Find which token contains the matched text
  const matchedText = match[0];
  const beforeMatch = d.slice(0, match.index);
  const wordsBefore = beforeMatch.split(/[\s;,.\[\]()+-]+/).filter(t => t.length >= 1);
  const matchTokenIndex = wordsBefore.length;
  return isNegated(tokens, matchTokenIndex);
}

/**
 * Detect equipment flags from product description text.
 * Handles negation: "IKKE ANT" → antenna: false, "+ANT" → antenna: true.
 */
export function detectFlagsFromDescription(description: string | null): {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  hud: boolean;
} {
  if (!description) {
    return { adas: false, rainSensor: false, heated: false, acoustic: false, antenna: false, camera: false, hud: false };
  }
  const d = description.toUpperCase();

  const tokens = d.split(/[\s;,.\[\]()+-]+/).filter((t) => t.length >= 1);
  const s = new Set(tokens);

  // Helper: check if a token exists AND is not negated
  const hasToken = (token: string): boolean => {
    const idx = tokens.indexOf(token);
    if (idx === -1) return false;
    return !isNegated(tokens, idx);
  };

  // Helper: regex match that also checks for negation context
  const rx = (pattern: RegExp): boolean => {
    const m = pattern.exec(d);
    if (!m) return false;
    const before = d.slice(0, m.index);
    const wordsBefore = before.split(/[\s;,.\[\]()+-]+/).filter((t) => t.length >= 1);
    return !isNegated(tokens, wordsBefore.length);
  };

  const rainSensor =
    (s.has("RSN") && !isNegated(tokens, tokens.indexOf("RSN"))) ||
    (s.has("RSNL") && !isNegated(tokens, tokens.indexOf("RSNL"))) ||
    (s.has("RSNLSN") && !isNegated(tokens, tokens.indexOf("RSNLSN"))) ||
    (s.has("REGN") && !isNegated(tokens, tokens.indexOf("REGN"))) ||
    (s.has("REGNS") && !isNegated(tokens, tokens.indexOf("REGNS"))) ||
    (s.has("REGNSEN") && !isNegated(tokens, tokens.indexOf("REGNSEN"))) ||
    (s.has("REGNSENSOR") && !isNegated(tokens, tokens.indexOf("REGNSENSOR"))) ||
    rx(/\bRAIN\b|\bAUTOMATIC\s+WIPER\b|\bVINDRUTETORKARE\b|\bLYS\/REGN\b|\bLYS\/REGNS\b/);

  const heated =
    (s.has("HTD") && !isNegated(tokens, tokens.indexOf("HTD"))) ||
    (s.has("HT") && !isNegated(tokens, tokens.indexOf("HT"))) ||
    (s.has("UHTD") && !isNegated(tokens, tokens.indexOf("UHTD"))) ||
    (s.has("ELEK") && !isNegated(tokens, tokens.indexOf("ELEK"))) ||
    (s.has("VARM") && !isNegated(tokens, tokens.indexOf("VARM"))) ||
    rx(/\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b/) ||
    rx(/(?:^|[\s+])(EL)(?:[\s+.]|[+-]|$)/);

  const acoustic =
    (s.has("ACO") && !isNegated(tokens, tokens.indexOf("ACO"))) ||
    (s.has("AKU") && !isNegated(tokens, tokens.indexOf("AKU"))) ||
    rx(/\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bST[\u00d8O]YDEMP\b|\bSILENT\b/);

  // Antenna: check for "ANT" or "ANTENNE" token, but only if not negated
  // Also check for explicit "+ANT" (positive indicator)
  const antennaIdx = tokens.indexOf("ANT");
  const antenneIdx = tokens.indexOf("ANTENNE");
  const hasAntToken = antennaIdx !== -1 && !isNegated(tokens, antennaIdx);
  const hasAntenneToken = antenneIdx !== -1 && !isNegated(tokens, antenneIdx);
  const hasExplicitPlusAnt = /\+ANT\b/.test(d);
  const antenna = hasAntToken || hasAntenneToken || hasExplicitPlusAnt ||
    s.has("GNAG") ||
    rx(/\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b/);

  const hasCam = (s.has("CAMERA") && !isNegated(tokens, tokens.indexOf("CAMERA"))) ||
    (s.has("CAM") && !isNegated(tokens, tokens.indexOf("CAM"))) ||
    rx(/\bKAMERA\b|\bBACKUP\b|\bREVERSING\b|\b360\b/);
  const hasLdw = /\bLDW\b/.test(d);
  const hasAdasText =
    (s.has("ADAS") && !isNegated(tokens, tokens.indexOf("ADAS"))) ||
    (s.has("FILSKIFTE") && !isNegated(tokens, tokens.indexOf("FILSKIFTE"))) ||
    rx(/\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b|\bCITY\s+SAFETY\b/);
  const sensWithAdas = (s.has("SENS") || s.has("SENSOR")) && (hasLdw || hasCam || s.has("HUD") || s.has("H.U.D"));
  const camera = hasCam || hasLdw || hasAdasText || sensWithAdas;
  const adas = hasAdasText || hasLdw || hasCam || sensWithAdas;

  const hud =
    (s.has("HUD") && !isNegated(tokens, tokens.indexOf("HUD"))) ||
    (s.has("H.U.D") && !isNegated(tokens, tokens.indexOf("H.U.D"))) ||
    rx(/\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b|\bWINDSHIELD\s+DISPLAY\b/);

  return { adas, rainSensor, heated, acoustic, antenna, camera, hud };
}

/** Legacy OEM-based detection */
export function detectFlagsFromOem(oemDescriptions: string[]) {
  return {
    adas: oemDescriptions.some((d) => /adas|camera|sensor|kamera|filskifte|lane|collision/i.test(d)),
    rainSensor: oemDescriptions.some((d) => /rain|regn|wipe|vindusspor/i.test(d)),
    heated: oemDescriptions.some((d) => /heat|oppvarm|varme|defrost/i.test(d)),
    acoustic: oemDescriptions.some((d) => /acoustic|akustisk|quiet|støydemp/i.test(d)),
    antenna: oemDescriptions.some((d) => /antenna|antenne|radio|fm|dab/i.test(d)),
    camera: oemDescriptions.some((d) => /camera|kamera|sensor/i.test(d)),
    hud: oemDescriptions.some((d) => /hud|head.up|projeksjon/i.test(d)),
  };
}

/** Infer equipment from DB columns + description fallback */
export function inferRecordEquipment(record: GlassRecord): {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  hud: boolean;
  shade: boolean;
  hasList: boolean;
  listRequired: boolean;
  listIncluded: boolean;
  listType: string | null;
  hasKlips: boolean;
  klipsRequired: boolean;
  klipsType: string | null;
} {
  // Always parse description for equipment flags (with negation handling).
  // Description is the ground truth — it reflects the supplier's own labeling.
  // DB columns may be stale or incorrect (e.g. "IKKE ANT" in description
  // but antenna=1 in DB due to upstream data errors).
  const descFlags = detectFlagsFromDescription(record.description);

  // For list/klips/shade, we still rely on description parsing since
  // these are not stored in DB equipment columns.
  const d = (record.description || "").toUpperCase();
  const tokens = d.split(/[\s;,.\[\]()]+/).filter((t) => t.length >= 2);
  const s = new Set(tokens);
  const shade =
    s.has("SOLAR") || s.has("SOL") || s.has("SOLA") ||
    s.has("PRIVACY") || s.has("PRIV") || s.has("PRIVA") || s.has("PRIVAC") ||
    s.has("DARK") || s.has("TOP") || s.has("TINT") ||
    s.has("COATED") || s.has("HMSL");

  const hasList = /\b(PYNTELIST|LIST|GUMMILIST|BUNNLIST|KANTLIST|RAMMELIST|DEKORLIST)\b/.test(d);
  const listRequired = hasList && /\b(NB\b|HUSK|MÅ HA|MÅH|KUN MED|FOR LIST|FOR GUMMILIST|TA PÅ EN LIST)\b/.test(d);
  const listIncluded = hasList && /\b(INNK|INNKAPSL|INKL|INKLUDERT|MED LIST)\b/.test(d);
  const hasKlips = /\b(KLIPS)\b/.test(d);
  const klipsRequired = hasKlips && /\b(NB\b|HUSK|MÅ HA|MÅH|KUN MED)\b/.test(d);

  let listType: string | null = null;
  if (hasList) {
    if (d.includes("PYNTELIST")) listType = "pyntelister";
    else if (d.includes("GUMMILIST")) listType = "gummilister";
    else if (d.includes("BUNNLIST")) listType = "bunnlister";
    else if (d.includes("KANTLIST")) listType = "kantlister";
    else if (d.includes("RAMMELIST")) listType = "rammelister";
    else if (d.includes("DEKORLIST")) listType = "dekorlister";
    else if (/\bLIST\b/.test(d)) listType = "lister";
  }

  let klipsType: string | null = null;
  if (hasKlips) klipsType = "klips";

  return { ...descFlags, shade, hasList, listRequired, listIncluded, listType, hasKlips, klipsRequired, klipsType };
}

/**
 * Fetch factory equipment from Biluppgitter API.
 */
export async function fetchBiluppgifterEquipment(regno: string, apiKey: string): Promise<FactoryEquipment | null> {
  if (!apiKey || apiKey === "NOT_SET") return null;

  try {
    const res = await fetchWithTimeout(
      `https://api.biluppgifter.se/api/v1/vehicle-configurator/regno/${encodeURIComponent(regno)}?country_code=NO`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      },
      15000
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: {
        options?: Array<{ name?: string; description?: string }>;
      };
    };

    const options = (data.data?.options || []).map((o) =>
      `${o.name || ""} ${o.description || ""}`.toLowerCase()
    );

    return {
      rainSensor: options.some((o) => /rain|regn|vindrutetorkare|wipe/i.test(o)),
      heated: options.some((o) => /heat|varme|uppvarm/i.test(o)),
      acoustic: options.some((o) => /acoustic|akustik|akustisk/i.test(o)),
      antenna: options.some((o) => /antenna|antenn|radio/i.test(o)),
      camera: options.some((o) => /camera|kamera|sensor/i.test(o)),
      adas: options.some((o) => /adas|lane|filskifte|autonomous/i.test(o)),
      hud: options.some((o) => /hud|head.up/i.test(o)),
      source: "biluppgifter",
    };
  } catch (e) {
    console.error(`Biluppgifter equipment fetch failed for ${regno}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * User-confirmed equipment answers.
 * `true` = user confirmed this equipment is present
 * `false` = user confirmed this equipment is NOT present
 * `undefined` = user has not answered / unknown
 */
export interface UserEquipmentAnswers {
  adas?: boolean;
  rainSensor?: boolean;
  heated?: boolean;
  acoustic?: boolean;
  antenna?: boolean;
  camera?: boolean;
  hud?: boolean;
}

/**
 * Apply HARD equipment filter based on user-confirmed answers.
 *
 * Rules:
 * - If user answers `true` to a field → candidate MUST have that field
 * - If user answers `false` to a field → candidate MUST NOT have that field
 * - If user answers `undefined` → no filter applied for that field
 *
 * Returns { exact: candidates that match all confirmed fields,
 *           uncertain: candidates that violate at least one confirmed field }
 */
export function applyEquipmentFilter<
  T extends {
    adas?: boolean | number;
    rain_sensor?: boolean | number;
    rainSensor?: boolean | number;
    heated?: boolean | number;
    acoustic?: boolean | number;
    antenna?: boolean | number;
    camera?: boolean | number;
    hud?: boolean | number;
  }
>(
  candidates: T[],
  answers: UserEquipmentAnswers
): { exact: T[]; uncertain: T[] } {
  const exact: T[] = [];
  const uncertain: T[] = [];

  for (const candidate of candidates) {
    let violations = 0;

    // Helper to read boolean-ish field (supports both snake_case and camelCase)
    const has = (key: keyof UserEquipmentAnswers): boolean => {
      const val =
        key === "rainSensor"
          ? (candidate.rainSensor ?? candidate.rain_sensor)
          : candidate[key as keyof T];
      return !!val;
    };

    for (const [field, userAnswer] of Object.entries(answers) as [
      keyof UserEquipmentAnswers,
      boolean | undefined
    ][]) {
      if (userAnswer === undefined) continue;
      const candidateHas = has(field);
      if (userAnswer === true && !candidateHas) {
        violations++;
      } else if (userAnswer === false && candidateHas) {
        violations++;
      }
    }

    if (violations === 0) {
      exact.push(candidate);
    } else {
      uncertain.push(candidate);
    }
  }

  return { exact, uncertain };
}

/** Compute equipment match quality between a record and factory data */
export function computeEquipmentMatch(
  recordEquipment: {
    adas: boolean;
    rainSensor: boolean;
    heated: boolean;
    acoustic: boolean;
    antenna: boolean;
    camera: boolean;
    hud: boolean;
  },
  factoryEquipment: {
    adas: boolean;
    rainSensor: boolean;
    heated: boolean;
    acoustic: boolean;
    antenna: boolean;
    camera: boolean;
    hud: boolean;
  } | null
): { match: "perfect" | "good" | "check" | "mismatch"; diff: string[] } {
  if (!factoryEquipment) {
    return { match: "check", diff: ["no_factory_data"] };
  }

  const diff: string[] = [];
  let score = 0;
  let total = 0;

  const flags: Array<keyof typeof recordEquipment> = [
    "adas",
    "rainSensor",
    "heated",
    "acoustic",
    "antenna",
    "camera",
    "hud",
  ];

  for (const flag of flags) {
    const expected = factoryEquipment[flag];
    const got = recordEquipment[flag];
    total++;
    if (expected === got) {
      score++;
    } else {
      diff.push(`${flag}: expected=${expected}, got=${got}`);
    }
  }

  const ratio = total > 0 ? score / total : 0;

  if (diff.length === 0) return { match: "perfect", diff: [] };
  if (
    ratio >= 0.8 &&
    !diff.some((d) => d.startsWith("adas:") || d.startsWith("camera:"))
  ) {
    return { match: "good", diff };
  }
  if (ratio >= 0.5) return { match: "check", diff };
  return { match: "mismatch", diff };
}
