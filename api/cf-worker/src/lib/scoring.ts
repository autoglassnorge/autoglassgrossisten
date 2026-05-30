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

export function scoreCandidate(
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

  // Equipment matching (high weight when we know vehicle equipment)
  if (flags.adas && recordFlags.adas) score += 20;
  if (flags.camera && recordFlags.camera) score += 18;
  if (flags.rainSensor && recordFlags.rainSensor) score += 14;
  if (flags.heated && recordFlags.heated) score += 10;
  if (flags.hud && recordFlags.hud) score += 10;
  if (flags.acoustic && recordFlags.acoustic) score += 8;
  if (flags.antenna && recordFlags.antenna) score += 6;
  // Penalize if record has equipment the vehicle doesn't have
  if (!flags.adas && recordFlags.adas) score -= 8;
  if (!flags.camera && recordFlags.camera) score -= 6;
  if (!flags.hud && recordFlags.hud) score -= 4;
  if (!flags.rainSensor && recordFlags.rainSensor) score -= 3;
  if (!flags.heated && recordFlags.heated) score -= 2;
  if (!flags.acoustic && recordFlags.acoustic) score -= 1;

  // Category scoring
  const cat = c.category?.toLowerCase() || detectCategoryFromDescription(c.description);
  if (cat === "annet" || cat === "unknown" || !cat) {
    score -= 5;
  }

  // Year compatibility scoring
  const vehicleYear = vehicle.year;
  const yr = parseYearRangeFromDescription(c.description);
  if (yr.from && yr.to) {
    if (vehicleYear >= yr.from && vehicleYear <= yr.to) {
      score += 20;
    } else if (vehicleYear >= yr.from - 2 && vehicleYear <= yr.to + 2) {
      score += 5;
    } else if (vehicleYear < yr.from - 5 || vehicleYear > yr.to + 5) {
      score -= 30;
    }
  } else if (yr.from && !yr.to) {
    if (vehicleYear >= yr.from - 2) {
      score += 10;
    } else if (vehicleYear < yr.from - 10) {
      score -= 30;
    }
  }

  // Fingerprint-based model/generation scoring
  const fp = (vehicle as any)._fingerprint as { model_hint: string | null; models: string; year_from: number | null; year_to: number | null; sample_count: number } | undefined;
  if (fp && fp.model_hint) {
    const fpModel = fp.model_hint.toLowerCase();
    const desc = (c.description + " " + (c.model || "")).toLowerCase();
    if (desc.includes(fpModel)) {
      score += 15;
    }
    if (c.model && c.model.toLowerCase().includes(fpModel)) {
      score += 10;
    }
    const fpModels = JSON.parse(fp.models || "[]") as string[];
    for (const m of fpModels) {
      if (m && desc.includes(m.toLowerCase())) {
        score += 8;
        break;
      }
    }
  }

  // VIN model year verification (works for ALL makes)
  if (unifiedVin?.modelYear && c.year_from) {
    const vinYear = unifiedVin.modelYear;
    if (Math.abs(vinYear - c.year_from) <= 1) {
      score += 15;
    } else if (Math.abs(vinYear - c.year_from) <= 3) {
      score += 5;
    } else if (Math.abs(vinYear - c.year_from) > 5) {
      score -= 20;
    }
  }

  // VIN generation cross-check with description
  if (unifiedVin?.generation) {
    const descGen = parseGenerationFromDescription(c.description) || parseGenerationFromDescription(c.model);
    if (descGen && unifiedVin.generation.toUpperCase() === descGen.toUpperCase()) {
      score += 30;
    }
  }

  // VIN body type cross-check with description
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
    if (hasBodyMatch) score += 12;
  }

  // kType generation verification bonus
  if (bovsoftInfo) {
    const bovGen = inferGenerationFromYearRange(c.brand || "", c.model || "", bovsoftInfo.yearFrom, bovsoftInfo.yearTo);
    const recordGen = parseGenerationFromDescription(c.description) || parseGenerationFromDescription(c.model);
    if (bovGen && recordGen && bovGen === recordGen) {
      score += 25;
    }
  }

  // Body / chassis compatibility (VIN + SVV data + Bovsoft body)
  score += scoreBodyCompatibility(c, vehicle, vinInfo, bovsoftInfo?.body);

  // Prefix4 consensus bonus
  if (dominantPrefix4 && c.prefix4 === dominantPrefix4) {
    score += 8;
  }

  return score;
}

export function modelMatches(vehicleModel: string, recordModel: string | null, vehicleMake?: string): boolean {
  if (!recordModel || recordModel.trim() === "") return false;
  const vm = vehicleModel.toLowerCase().trim();
  const rm = recordModel.toLowerCase().trim();
  if (vm.includes(rm) || rm.includes(vm)) return true;

  const make = (vehicleMake || "").toLowerCase();
  if (make.includes("volkswagen")) {
    const vwModels = ["transporter", "multivan", "caravelle", "california"];
    const vmIsVw = vwModels.some((m) => vm.includes(m));
    const rmIsVw = vwModels.some((m) => rm.includes(m));
    if (vmIsVw && rmIsVw) {
      const vmGen = vm.match(/\b(t[456])\b/);
      const rmGen = rm.match(/\b(t[456])\b/);
      if (!vmGen || !rmGen || vmGen[1] === rmGen[1]) return true;
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

export function yearCompatible(record: GlassRecord, vehicleYear: number, vehicleMake: string, vehicleModel: string): boolean {
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
