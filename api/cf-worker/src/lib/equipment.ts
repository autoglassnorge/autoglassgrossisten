/**
 * Equipment detection from descriptions and Biluppgitter API.
 */

import type { GlassRecord, FactoryEquipment } from "../types";
import { fetchWithTimeout } from "../providers/svv";

/**
 * Detect equipment flags from product description text.
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

  const rainSensor =
    s.has("RSN") || s.has("RSNL") || s.has("RSNLSN") ||
    s.has("REGN") || s.has("REGNS") || s.has("REGNSEN") || s.has("REGNSENSOR") ||
    /\bRAIN\b|\bAUTOMATIC\s+WIPER\b|\bVINDRUTETORKARE\b|\bLYS\/REGN\b|\bLYS\/REGNS\b/.test(d);

  const heated =
    s.has("HTD") || s.has("HT") || s.has("UHTD") || s.has("ELEK") || s.has("VARM") ||
    /\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b/.test(d) ||
    /(?:^|[\s+])(EL)(?:[\s+.]|[+-]|$)/.test(d);

  const acoustic =
    s.has("ACO") || s.has("AKU") ||
    /\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bST[\u00d8O]YDEMP\b|\bSILENT\b/.test(d);

  const antenna =
    s.has("ANT") || s.has("GNAG") ||
    /\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b/.test(d);

  const hasCam = s.has("CAMERA") || s.has("CAM") || /\bKAMERA\b|\bBACKUP\b|\bREVERSING\b|\b360\b/.test(d);
  const hasLdw = /\bLDW\b/.test(d);
  const hasAdasText =
    s.has("ADAS") || s.has("FILSKIFTE") ||
    /\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b|\bCITY\s+SAFETY\b/.test(d);
  const sensWithAdas = (s.has("SENS") || s.has("SENSOR")) && (hasLdw || hasCam || s.has("HUD") || s.has("H.U.D"));
  const camera = hasCam || hasLdw || hasAdasText || sensWithAdas;
  const adas = hasAdasText || hasLdw || hasCam || sensWithAdas;

  const hud =
    s.has("HUD") || s.has("H.U.D") ||
    /\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b|\bWINDSHIELD\s+DISPLAY\b/.test(d);

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
  if (record.rain_sensor || record.heated || record.acoustic || record.antenna || record.camera || record.adas || record.shade) {
    return {
      adas: !!record.adas,
      rainSensor: !!record.rain_sensor,
      heated: !!record.heated,
      acoustic: !!record.acoustic,
      antenna: !!record.antenna,
      camera: !!record.camera,
      hud: !!record.hud,
      shade: !!record.shade,
      hasList: false,
      listRequired: false,
      listIncluded: false,
      listType: null,
      hasKlips: false,
      klipsRequired: false,
      klipsType: null,
    };
  }
  const flags = detectFlagsFromDescription(record.description);
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

  return { ...flags, shade, hasList, listRequired, listIncluded, listType, hasKlips, klipsRequired, klipsType };
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
