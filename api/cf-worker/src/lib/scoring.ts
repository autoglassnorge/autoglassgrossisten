/**
 * Candidate scoring, model matching, year compatibility, and equipment guessing.
 */

import type { GlassRecord, GuessedEquipment } from "../types";
import type { TecdocVehicle } from "../providers/svv";
import type { BovsoftVehicle } from "../types";
import { inferRecordEquipment, detectFlagsFromOem } from "./equipment";
import { parseYearRangeFromDescription, parseGenerationFromDescription, expectedGeneration, inferGenerationFromYearRange } from "./generation";
import { decodeVwTransporterBody, decodeVin, scoreBodyCompatibility } from "./vin-decoder";
import { detectCategoryFromDescription } from "./ground-truth";
import { queryVehicleFingerprint } from "./db";
import { memoizeSync } from "./memo";

/**
 * Equipment signatures learned from catalog statistics.
 */
export const CATALOG_EQUIPMENT_SIGNATURES: Record<string, Record<string, number>> = {
  // BMW
  "BMW:X5 5D SUV G05": { camera: 0.67, adas: 0.67, rainSensor: 0.33, acoustic: 0.33 },
  "BMW:X2 (XCITE) F39": { camera: 0.40, adas: 0.40, rainSensor: 0.40, acoustic: 0.40 },
  "BMW:6 SERIES GT G32": { camera: 0.40, adas: 0.40, acoustic: 0.40 },
  "BMW:Z4 G29 2D CAB": { camera: 0.33, adas: 0.33 },
  "BMW:5 SERIES F10": { hud: 0.44 },
  "BMW:X5 (F15) 5D SUV": { acoustic: 0.33 },
  "BMW:7 SERIES E38 94-01-": { heated: 0.75, rainSensor: 0.38 },
  "BMW:5 SERIES GT": { rainSensor: 0.36, hud: 0.36 },
  "BMW:5 SERIES GT 2009-": { rainSensor: 0.43 },
  "BMW:5 SERIES SAL+EST": { rainSensor: 0.33 },
  "BMW:X3 SUV": { rainSensor: 0.62 },
  // VW
  "VW:UP 3D/5D HBK": { camera: 0.56, adas: 0.56 },
  "VW:PASSAT CC": { camera: 0.33, adas: 0.33, rainSensor: 0.33, acoustic: 0.33 },
  "VW:SHARAN II MPV": { acoustic: 0.60 },
  "VW:GOLF VII SPORTSVAN MPV": { acoustic: 0.33 },
  "VW:CRAFTER": { camera: 0.31, adas: 0.31 },
  "VW:T ROC 5D SUV": { camera: 0.40, adas: 0.40 },
  "VW:TRANSPORTER T4 90-03-": { antenna: 0.50 },
  // Audi
  "AUDI:A4": { adas: 0.38, rainSensor: 0.38 },
  "AUDI:A6/C7 4D SAL 09/": { acoustic: 0.40 },
  "AUDI:A7 5D HBK": { camera: 0.33 },
  "AUDI:Q7 5D JEEP": { camera: 0.57 },
  // Skoda
  "SKODA:KAROQ 5D SUV": { camera: 0.33, adas: 0.33, acoustic: 0.33 },
  "SKODA:SCALA 5D HBK": { camera: 0.50, adas: 0.30 },
  "SKODA:KAMIQ 5D SUV": { camera: 0.60, adas: 0.60 },
  // Mazda
  "MAZDA:6 4D SAL/5D EST RHD": { acoustic: 0.71 },
  "MAZDA:3 HBK SAL LHD": { rainSensor: 0.80, heated: 0.40 },
  "MAZDA:CX 5 LHD": { adas: 0.46 },
  // Volvo
  "VOLVO:XC60 5D SUV": { acoustic: 0.42 },
  "VOLVO:XC40 5D SUV": { camera: 0.33, adas: 0.33, antenna: 0.33 },
  // Ford
  "FORD:TRANSIT 86-00-": { heated: 1.00 },
  "FORD:GALAXY 03/": { heated: 0.40, acoustic: 0.40 },
  "FORD:GALAXY": { rainSensor: 0.33, acoustic: 0.33 },
  "FORD:TOURNEO CONNECT": { heated: 0.32 },
  "FORD:MONDEO 07-": { rainSensor: 0.40 },
  // Jaguar / Land Rover
  "JAGUAR:E PACE 5D SUV": { camera: 0.71, acoustic: 0.47 },
  "RANGE:ROVER L405 R5": { acoustic: 0.44 },
  "LAND ROVER:DISCOVERY 5D": { camera: 0.38, adas: 0.38 },
  // Others
  "CITROEN:BERLINGO 96-": { heated: 0.67 },
  "RENAULT:MASTER 97-": { heated: 0.33 },
  "HYUNDAI:SANTA FE LHD 2006-": { heated: 0.40 },
  "KIA:PRO-CEE": { heated: 0.50 },
  "MITSUBISHI:OUTLANDER 2007-": { rainSensor: 0.33 },
  "VOLVO:FH12 FH16 93- FM 98-": { antenna: 1.00 },
  "HONDA:CIVIC 5D HBK RHD": { acoustic: 0.40 },
  "MAZDA:5 MPV LHD": { rainSensor: 0.40 },
};

/** Generation → equipment signatures (from catalog statistics) */
export const GENERATION_EQUIPMENT_SIGNATURES: Record<string, Record<string, number>> = {
  "B6": { shade: 0.90, adas: 0.02, rainSensor: 0.10, acoustic: 0.02 },
  "BL": { shade: 0.51, antenna: 0.08, heated: 0.04 },
  "E46": { rainSensor: 0.10, antenna: 0.03, shade: 0.22 },
  "W203": { rainSensor: 0.02, shade: 0.44 },
  "MK4": { heated: 0.04, shade: 0.06 },
  "W210": { rainSensor: 0.07, antenna: 0.09, shade: 0.16 },
  "MK3": { heated: 0.05, antenna: 0.10 },
  "E36": { antenna: 0.15, shade: 0.08 },
  "T4": { heated: 0.11, antenna: 0.18, shade: 0.11 },
  "E90": { rainSensor: 0.03, antenna: 0.06, shade: 0.18 },
};

/**
 * Guess equipment based on catalog statistics + VIN/generation data.
 */
export function guessEquipment(
  brand: string,
  model: string,
  year: number,
  generation?: string | null
): GuessedEquipment {
  const empty: GuessedEquipment = {
    adas: 0, rainSensor: 0, heated: 0, acoustic: 0,
    antenna: 0, camera: 0, hud: 0, shade: 0,
    confidence: "none", source: "none",
  };

  const b = brand.toUpperCase().trim();
  const m = model.toUpperCase().trim();

  // Try exact brand:model match
  const exactKey = `${b}:${m}`;
  let sig = CATALOG_EQUIPMENT_SIGNATURES[exactKey];
  let source: GuessedEquipment["source"] = "catalog_signature";

  // Try generation match as fallback
  if (!sig && generation) {
    const gen = generation.toUpperCase();
    sig = GENERATION_EQUIPMENT_SIGNATURES[gen];
    source = "generation_signature";
  }

  if (!sig) return empty;

  // Calculate confidence based on signature strength
  const maxProb = Math.max(...Object.values(sig));
  const confidence: GuessedEquipment["confidence"] =
    maxProb >= 0.6 ? "high" : maxProb >= 0.3 ? "medium" : "low";

  return {
    adas: sig.adas || 0,
    rainSensor: sig.rainSensor || 0,
    heated: sig.heated || 0,
    acoustic: sig.acoustic || 0,
    antenna: sig.antenna || 0,
    camera: sig.camera || 0,
    hud: sig.hud || 0,
    shade: sig.shade || 0,
    confidence,
    source,
  };
}

function _scoreCandidate(
  c: GlassRecord,
  flags: ReturnType<typeof detectFlagsFromOem>,
  vehicle: TecdocVehicle,
  vinInfo: ReturnType<typeof decodeVwTransporterBody>,
  bovsoftInfo?: BovsoftVehicle,
  unifiedVin?: ReturnType<typeof decodeVin>,
  dominantPrefix4?: string
): number {
  let score = 0;

  // Infer equipment from DB columns + description parsing
  const recordFlags = inferRecordEquipment(c);

  // === kType GATE — dominates everything ===
  // If we know the vehicle's kType, exact kType match is the strongest signal
  const vehicleKtype = (vehicle as any).k_type as number | undefined;
  if (vehicleKtype && vehicleKtype > 0 && c.ktype) {
    if (c.ktype === vehicleKtype) {
      score += 1000; // Same kType — massive boost
    } else {
      score -= 1000; // Different kType — massive penalty
    }
  }

  // === Equipment matching — primary discriminator within same kType ===
  // These weights are intentionally high because equipment determines the exact glass variant
  if (flags.adas && recordFlags.adas) score += 50;
  if (flags.camera && recordFlags.camera) score += 40;
  if (flags.rainSensor && recordFlags.rainSensor) score += 30;
  if (flags.hud && recordFlags.hud) score += 25;
  if (flags.heated && recordFlags.heated) score += 20;
  if (flags.acoustic && recordFlags.acoustic) score += 15;
  if (flags.antenna && recordFlags.antenna) score += 10;
  // Penalize if record has equipment the vehicle doesn't have (avoids wrong variant)
  if (!flags.adas && recordFlags.adas) score -= 50;
  if (!flags.camera && recordFlags.camera) score -= 30;
  if (!flags.hud && recordFlags.hud) score -= 20;
  if (!flags.rainSensor && recordFlags.rainSensor) score -= 15;
  if (!flags.heated && recordFlags.heated) score -= 10;
  if (!flags.acoustic && recordFlags.acoustic) score -= 5;
  if (!flags.antenna && recordFlags.antenna) score -= 3;

  // === Year compatibility — hard gate + graded penalty ===
  // A glass must be year-compatible; if not, it's massively penalized.
  // Graduated penalty: closer mismatch = smaller penalty.
  const vehicleYear = vehicle.year;
  const yr = parseYearRangeFromDescription(c.description);
  let yearCompatible = true;
  let yearPenalty = 0;
  if (yr.from && yr.to) {
    const rangeMid = (yr.from + yr.to) / 2;
    const rangeHalf = (yr.to - yr.from) / 2;
    const yearDiff = Math.abs(vehicleYear - rangeMid);
    if (yearDiff > rangeHalf + 5) {
      // Far outside range: massive penalty
      yearCompatible = false;
      yearPenalty = 500;
    } else if (yearDiff > rangeHalf + 2) {
      // Slightly outside range: moderate penalty
      yearPenalty = 200;
    } else if (yearDiff > rangeHalf) {
      // Just outside range: small penalty
      yearPenalty = 50;
    }
  } else if (yr.from && !yr.to) {
    if (vehicleYear < yr.from - 10) {
      yearCompatible = false;
      yearPenalty = 500;
    } else if (vehicleYear < yr.from - 5) {
      yearPenalty = 200;
    } else if (vehicleYear < yr.from - 2) {
      yearPenalty = 50;
    }
  }
  if (!yearCompatible) {
    score -= yearPenalty;
  } else if (yearPenalty > 0) {
    score -= yearPenalty;
  }
  // Bonus for exact year match
  if (c.year_from === vehicleYear || c.year_to === vehicleYear) {
    score += 10;
  }

  // === Category scoring — small boost for windshields ===
  const cat = c.category?.toLowerCase() || detectCategoryFromDescription(c.description);
  if (cat === "frontrute") {
    score += 5;
  } else if (cat === "annet" || cat === "unknown" || !cat) {
    score -= 3;
  }

  // === Fingerprint-based model/generation scoring (secondary) ===
  const fp = (vehicle as any)._fingerprint as { model_hint: string | null; models: string; year_from: number | null; year_to: number | null; sample_count: number } | undefined;
  if (fp && fp.model_hint) {
    const fpModel = fp.model_hint.toLowerCase();
    const desc = (c.description + " " + (c.model || "")).toLowerCase();
    if (desc.includes(fpModel)) {
      score += 5;
    }
    if (c.model && c.model.toLowerCase().includes(fpModel)) {
      score += 3;
    }
    const fpModels = JSON.parse(fp.models || "[]") as string[];
    for (const m of fpModels) {
      if (m && desc.includes(m.toLowerCase())) {
        score += 2;
        break;
      }
    }
  }

  // === VIN cross-checks (secondary) ===
  if (unifiedVin?.modelYear && c.year_from) {
    const vinYear = unifiedVin.modelYear;
    if (Math.abs(vinYear - c.year_from) <= 1) {
      score += 5;
    } else if (Math.abs(vinYear - c.year_from) > 5) {
      score -= 20;
    }
  }

  if (unifiedVin?.generation) {
    const descGen = parseGenerationFromDescription(c.description) || parseGenerationFromDescription(c.model);
    if (descGen && unifiedVin.generation.toUpperCase() === descGen.toUpperCase()) {
      score += 10;
    }
  }

  if (unifiedVin?.body) {
    const desc = (c.description + " " + (c.model || "")).toLowerCase();
    const vinBody = unifiedVin.body.toLowerCase();
    const bodyKeywords: Record<string, string[]> = {
      "sedan": ["sedan", "4d", "4-d", "saloon"],
      "hatch": ["hatch", "5d", "5-d", "hatchback", "3d", "3-d"],
      "wagon": ["wagon", "stasjons", "estate", "touring", "sw", " kombi"],
      "suv": ["suv", "cross", "xc", "4x4"],
      "van": ["van", "varebil", "box"],
      "coupe": ["coupe", "2d", "2-d"],
    };
    const keywords = bodyKeywords[vinBody] || [];
    const hasBodyMatch = keywords.some((k) => desc.includes(k));
    if (hasBodyMatch) score += 5;
  }

  // kType generation verification bonus (small)
  if (bovsoftInfo) {
    const bovGen = inferGenerationFromYearRange(c.brand || "", c.model || "", bovsoftInfo.yearFrom, bovsoftInfo.yearTo);
    const recordGen = parseGenerationFromDescription(c.description) || parseGenerationFromDescription(c.model);
    if (bovGen && recordGen && bovGen === recordGen) {
      score += 5;
    }
  }

  // Body / chassis compatibility (VIN + SVV data + Bovsoft body)
  score += scoreBodyCompatibility(c, vehicle, vinInfo, bovsoftInfo?.body);

  // Prefix4 consensus bonus (small)
  if (dominantPrefix4 && c.prefix4 === dominantPrefix4) {
    score += 3;
  }

  return score;
}
export const scoreCandidate = memoizeSync(_scoreCandidate, 1000);

function _modelMatches(vehicleModel: string, recordModel: string | null, vehicleMake?: string): boolean {
  if (!recordModel || recordModel.trim() === "") return false;
  const vm = vehicleModel.toLowerCase().trim();
  const rm = recordModel.toLowerCase().trim();

  // Top-level substring match with guard against short-code traps (A3 inside A30)
  if (vm.includes(rm) || rm.includes(vm)) {
    const shorter = vm.length <= rm.length ? vm : rm;
    const longer = vm.length <= rm.length ? rm : vm;
    // If one is contained in the other, require good length ratio or safe boundary
    if (longer.includes(shorter)) {
      const ratio = shorter.length / longer.length;
      if (ratio >= 0.8 || shorter.length >= 4) return true;
      // Reject if shorter ends with a digit and longer continues with a digit
      // (e.g. "A3" inside "A30", "CX5" inside "CX50") — different models
      const idx = longer.indexOf(shorter);
      const after = longer.slice(idx + shorter.length);
      if (/\d$/.test(shorter) && /^\d/.test(after)) {
        // Fall through to brand-specific / token logic below
      } else {
        return true;
      }
    } else {
      return true;
    }
  }

  const make = (vehicleMake || "").toLowerCase();

  // ── VW T-family variants (Transporter/Multivan/Caravelle/California)
  if (make.includes("volkswagen") || make === "vw") {
    const vwModels = ["transporter", "multivan", "caravelle", "california"];
    const vmIsVw = vwModels.some((m) => vm.includes(m));
    const rmIsVw = vwModels.some((m) => rm.includes(m));
    if (vmIsVw && rmIsVw) {
      const vmGen = vm.match(/\b(t[456])\b/);
      const rmGen = rm.match(/\b(t[456])\b/);
      if (vmGen && rmGen && vmGen[1] !== rmGen[1]) return false;
      if (!vmGen || !rmGen || vmGen[1] === rmGen[1]) return true;
    }
  }

  // ── Volvo XC/S/V/C models: D1 uses space ("XC 60"), SVV sends no space ("XC60")
  // Also handles 700/800/900 series: "740_760-80 SERIE" → match 740, 760, 780
  if (make === "volvo") {
    const volvoPatterns = [
      /^xc\s?(\d+)$/,
      /^s\s?(\d+)$/,
      /^v\s?(\d+)$/,
      /^c\s?(\d+)$/,
    ];
    for (const pattern of volvoPatterns) {
      const vmMatch = vm.match(pattern);
      const rmMatch = rm.match(pattern);
      if (vmMatch && rmMatch && vmMatch[1] === rmMatch[1]) return true;
    }
    // Volvo 700/800/900 series: D1 uses "740_760-80 SERIE", SVV sends "780"
    const vmNum = vm.match(/^(\d{3})$/);
    if (vmNum) {
      const n = vmNum[1];
      // Check if the 3-digit number appears literally in the D1 model string
      if (rm.includes(n)) return true;
      // Extract all 2-3 digit numbers from D1 model
      const allNums = (rm.match(/\d{2,3}/g) || []) as string[];
      if (allNums.includes(n)) return true;
      // Special case: Volvo range notation like "740_760-80" means 740, 760, 780, 940, 960
      // Match by last 2 digits + first digit prefix validation
      const lastTwo = n.slice(1);
      if (rm.includes(lastTwo) && rm.includes(n[0])) return true;
    }
  }

  // ── Mercedes W-series vs class name (e.g. "C-Klasse" vs "SERIE W203/W204/W205/W206")
  if (make === "mercedes" || make.includes("mercedes")) {
    const mercedesSeries: Record<string, string[]> = {
      "a-klasse": ["w168", "w169", "w176", "w177"],
      "b-klasse": ["w245", "w246", "w247"],
      "c-klasse": ["w203", "w204", "w205", "w206"],
      "e-klasse": ["w210", "w211", "w212", "w213", "w214"],
      "s-klasse": ["w220", "w221", "w222", "w223"],
      "m-klasse": ["w163", "w164", "w166"],
      "gle-klasse": ["w166", "w167"],
      "gle": ["w166", "w167"],
      "glc": ["x253", "c253", "x254", "c254"],
      "glb": ["x247"],
      "gla": ["x156", "h247"],
      "cla": ["c117", "c118"],
      "slk": ["r170", "r171", "r172", "w170"],
      "sl": ["r129", "r230", "r231", "w230"],
      "clk": ["c208", "c209", "w208", "w209"],
      "cls": ["c218", "c219", "c257", "w219"],
      "g-klasse": ["w463", "w464"],
    };
    // Extract class name from vehicle model
    const vmClass = Object.keys(mercedesSeries).find((cls) => vm.includes(cls));
    const rmClass = Object.keys(mercedesSeries).find((cls) => rm.includes(cls));
    // Special case: G-Klasse vs GELANDEWAGEN (D1 uses German name)
    if ((vm.includes("g-klasse") || vm.includes("gelandewagen")) &&
        (rm.includes("g-klasse") || rm.includes("gelandewagen"))) {
      return true;
    }
    // If one side has a class name and the other has a W-code, check compatibility
    if (vmClass || rmClass) {
      const extractWcodes = (s: string) => {
        const matches = s.match(/\b(w|x|c|r)\d{3}[a-z]?\b/g);
        return matches ? matches.map((m) => m.replace(/[a-z]$/, "")) : [];
      };
      const vmCodes = extractWcodes(vm);
      const rmCodes = extractWcodes(rm);
      // Direct class match (both mention same class)
      if (vmClass && rmClass && vmClass === rmClass) return true;
      // Class + W-code match
      if (vmClass && rmCodes.length > 0) {
        const allowedCodes = mercedesSeries[vmClass];
        if (allowedCodes && rmCodes.some((c) => allowedCodes.includes(c))) return true;
      }
      if (rmClass && vmCodes.length > 0) {
        const allowedCodes = mercedesSeries[rmClass];
        if (allowedCodes && vmCodes.some((c) => allowedCodes.includes(c))) return true;
      }
    }
  }

  // ── General fuzzy match: ignore spaces and hyphens for alphanumeric model codes
  // This catches: "XC 60" vs "XC60", "3 SERIE" vs "3-SERIE", "F-150" vs "F150"
  const normalizeModelCode = (s: string) => s.replace(/[^a-z0-9]+/g, "").toLowerCase();
  const vmNorm = normalizeModelCode(vm);
  const rmNorm = normalizeModelCode(rm);
  if (vmNorm.length >= 3 && rmNorm.length >= 3 && (vmNorm.includes(rmNorm) || rmNorm.includes(vmNorm))) {
    // Guard against short-code substring traps: A3 matching A30, A4 matching A40, etc.
    // Require that the matched substring is at least 80% of the longer string's length,
    // OR that the shorter string is >= 4 chars, OR that there's a digit boundary.
    const shorter = vmNorm.length <= rmNorm.length ? vmNorm : rmNorm;
    const longer = vmNorm.length <= rmNorm.length ? rmNorm : vmNorm;
    const isContained = longer.includes(shorter);
    if (isContained) {
      const ratio = shorter.length / longer.length;
      // Allow if ratio is good, or shorter is long enough, or there's a clear digit boundary
      const hasDigitBoundary = /\d/.test(shorter) && longer.replace(shorter, "").match(/^\d/);
      if (ratio >= 0.8 || shorter.length >= 4 || hasDigitBoundary) return true;
    } else {
      return true; // overlapping but not contained (e.g. "transporter" vs "caravelle")
    }
  }

  const tokenize = (s: string) => s.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const vTokens = tokenize(vm);
  const rTokens = tokenize(rm);
  const common = rTokens.filter((t) => vTokens.includes(t));
  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 4) return true;
  if (rTokens.length === 1 && vTokens.includes(rTokens[0]) && rTokens[0].length >= 3) return true;
  return false;
}
export const modelMatches = memoizeSync(_modelMatches, 2000);

function _yearCompatible(record: GlassRecord, vehicleYear: number, vehicleMake: string, vehicleModel: string): boolean {
  const expectedGen = expectedGeneration(vehicleMake, vehicleModel, vehicleYear);
  const recordGen = parseGenerationFromDescription(record.description) || parseGenerationFromDescription(record.model);
  if (expectedGen && recordGen) {
    return expectedGen === recordGen;
  }

  if (expectedGen && !recordGen) {
    const yr = parseYearRangeFromDescription(record.description);
    if (yr.from && yr.to) {
      const inferredGen = inferGenerationFromYearRange(vehicleMake, vehicleModel, yr.from, yr.to);
      if (inferredGen && inferredGen !== expectedGen) {
        return false;
      }
      return vehicleYear >= yr.from && vehicleYear <= yr.to;
    }
    if (yr.from && !yr.to) {
      const inferredGen = inferGenerationFromYearRange(vehicleMake, vehicleModel, yr.from, yr.from + 10);
      if (inferredGen && inferredGen !== expectedGen) {
        return false;
      }
      return vehicleYear >= yr.from;
    }
  }

  if (record.year_from !== null && record.year_to !== null) {
    return vehicleYear >= record.year_from && vehicleYear <= record.year_to;
  }

  const yr = parseYearRangeFromDescription(record.description);
  if (yr.from && yr.to) {
    return vehicleYear >= yr.from && vehicleYear <= yr.to;
  }
  if (yr.from && !yr.to) {
    return vehicleYear >= yr.from;
  }

  return true;
}
export const yearCompatible = memoizeSync(_yearCompatible, 2000);
