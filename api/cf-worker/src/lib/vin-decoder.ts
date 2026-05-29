/**
 * VIN decoding for multiple makes + SVV body inference + body compatibility scoring.
 */

import type { GlassRecord } from "../types";
import type { TecdocVehicle } from "../providers/svv";

export function decodeVwTransporterBody(vin: string, lengthMm?: number): { generation: string; body: string; wheelbase: string; roof?: string } | null {
  if (!vin || vin.length < 8) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (wmi !== "WV1" && wmi !== "WV2") return null;
  const bodyCode = vin[7].toUpperCase();
  const bodyMap: Record<string, { body: string; wheelbase: string }> = {
    "E": { body: "double_cab", wheelbase: "swb" },
    "F": { body: "caravelle", wheelbase: "swb" },
    "H": { body: "van", wheelbase: "swb" },
    "J": { body: "van", wheelbase: "lwb" },
    "L": { body: "california", wheelbase: "swb" },
  };
  const info = bodyMap[bodyCode];
  if (!info) return null;
  const yearChar = vin.length >= 10 ? vin[9].toUpperCase() : "";
  let generation = "T5";
  if (yearChar >= "G" && yearChar <= "L") generation = "T5";
  if (yearChar >= "M") generation = "T6";

  let wheelbase = info.wheelbase;
  let roof: string | undefined;
  if (lengthMm && lengthMm > 1000) {
    if (lengthMm >= 5100) wheelbase = "lwb";
    else if (lengthMm <= 5000) wheelbase = "swb";
  }

  return { generation, body: info.body, wheelbase, roof };
}

/** Decode BMW VIN (WBA/WBS prefix) to model series */
export function decodeBmwVin(vin: string): { series: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WB")) return null;
  const modelCode = vin.slice(3, 7).toUpperCase();
  const series = modelCode[0];
  if (series === "3") {
    const gen = modelCode[1];
    if (gen === "V" || gen === "W") return { series: "3", generation: "F30", body: "sedan" };
    if (gen === "X" || gen === "Y") return { series: "3", generation: "G20", body: "sedan" };
    return { series: "3", generation: "E90", body: "sedan" };
  }
  if (series === "5") {
    return { series: "5", generation: "F10", body: "sedan" };
  }
  return { series, generation: "unknown", body: "sedan" };
}

/** Decode Mercedes VIN (WDB/WDD prefix) */
export function decodeMercedesVin(vin: string): { class: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WD")) return null;
  const classCode = vin.slice(3, 6).toUpperCase();
  if (classCode.startsWith("205")) return { class: "C", generation: "W205", body: "sedan" };
  if (classCode.startsWith("206")) return { class: "C", generation: "W206", body: "sedan" };
  if (classCode.startsWith("204")) return { class: "C", generation: "W204", body: "sedan" };
  if (classCode.startsWith("213")) return { class: "E", generation: "W213", body: "sedan" };
  if (classCode.startsWith("212")) return { class: "E", generation: "W212", body: "sedan" };
  return { class: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Audi VIN (WAU/WAU prefix) */
export function decodeAudiVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WA")) return null;
  const modelCode = vin.slice(3, 7).toUpperCase();
  if (modelCode.startsWith("8L")) return { model: "A3", generation: "8L", body: "hatch" };
  if (modelCode.startsWith("8P")) return { model: "A3", generation: "8P", body: "hatch" };
  if (modelCode.startsWith("8V")) return { model: "A3", generation: "8V", body: "hatch" };
  if (modelCode.startsWith("8Y")) return { model: "A3", generation: "8Y", body: "hatch" };
  if (modelCode.startsWith("8D")) return { model: "A4", generation: "B5", body: "sedan" };
  if (modelCode.startsWith("8E")) return { model: "A4", generation: "B6/B7", body: "sedan" };
  if (modelCode.startsWith("8K")) return { model: "A4", generation: "B8", body: "sedan" };
  if (modelCode.startsWith("8W")) return { model: "A4", generation: "B9", body: "sedan" };
  if (modelCode.startsWith("4A")) return { model: "A6", generation: "C4", body: "sedan" };
  if (modelCode.startsWith("4B")) return { model: "A6", generation: "C5", body: "sedan" };
  if (modelCode.startsWith("4F")) return { model: "A6", generation: "C6", body: "sedan" };
  if (modelCode.startsWith("4G")) return { model: "A6", generation: "C7", body: "sedan" };
  if (modelCode.startsWith("4K")) return { model: "A6", generation: "C8", body: "sedan" };
  if (modelCode.startsWith("8R")) return { model: "Q5", generation: "8R", body: "suv" };
  if (modelCode.startsWith("FY")) return { model: "Q5", generation: "FY", body: "suv" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Ford VIN (WF0 prefix) */
export function decodeFordVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (wmi !== "WF0" && wmi !== "1FT" && wmi !== "3FA" && wmi !== "MAJ" && wmi !== "ML1") return null;
  const modelCode = vin.slice(5, 7).toUpperCase();
  if (modelCode === "P1" || modelCode.startsWith("CB")) return { model: "Focus", generation: "Mk3", body: "hatch" };
  if (modelCode === "H1" || modelCode.startsWith("CE")) return { model: "Focus", generation: "Mk4", body: "hatch" };
  if (modelCode.startsWith("JA")) return { model: "Fiesta", generation: "Mk7", body: "hatch" };
  if (modelCode.startsWith("JH")) return { model: "Fiesta", generation: "Mk8", body: "hatch" };
  if (modelCode.startsWith("BA")) return { model: "Mondeo", generation: "Mk4", body: "sedan" };
  if (modelCode.startsWith("CD")) return { model: "Mondeo", generation: "Mk5", body: "sedan" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Hyundai/Kia VIN */
export function decodeHyundaiVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("KM") && !wmi.startsWith("KN") && !wmi.startsWith("ME") && !wmi.startsWith("NL") && !wmi.startsWith("TMA") && !wmi.startsWith("XWB")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  if (modelCode === "FD") return { model: "i30", generation: "FD", body: "hatch" };
  if (modelCode === "HD" || modelCode === "GD") return { model: "i30", generation: "GD", body: "hatch" };
  if (modelCode === "PD") return { model: "i30", generation: "PD", body: "hatch" };
  if (modelCode === "PB") return { model: "i20", generation: "PB", body: "hatch" };
  if (modelCode === "GB") return { model: "i20", generation: "GB", body: "hatch" };
  if (modelCode === "TL") return { model: "Tucson", generation: "TL", body: "suv" };
  return { model: "unknown", generation: "unknown", body: "hatch" };
}

/** Decode Toyota VIN */
export function decodeToyotaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("JT") && !wmi.startsWith("NMT") && !wmi.startsWith("SB1")) return null;
  const modelCode = vin.slice(3, 6).toUpperCase();
  if (modelCode.startsWith("ZRE21") || modelCode.startsWith("ZWE21")) return { model: "Corolla", generation: "E210", body: "sedan" };
  if (modelCode.startsWith("ZRE18")) return { model: "Corolla", generation: "E180", body: "sedan" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Volvo VIN (YV1, YV2, YV3, LVY, MHY) */
export function decodeVolvoVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("YV") && !wmi.startsWith("LVY") && !wmi.startsWith("MHY")) return null;
  const seriesCode = vin.slice(3, 5).toUpperCase();
  const modelMap: Record<string, { model: string; gen: string; body: string }> = {
    "RS": { model: "S60", gen: "P3", body: "sedan" },
    "TS": { model: "S80", gen: "P3", body: "sedan" },
    "SW": { model: "V70", gen: "P3", body: "wagon" },
    "DZ": { model: "XC60", gen: "SPA", body: "suv" },
    "CZ": { model: "XC90", gen: "SPA", body: "suv" },
  };
  const info = modelMap[seriesCode];
  if (!info) return { model: "unknown", generation: "unknown", body: "sedan" };
  return { model: info.model, generation: info.gen, body: info.body };
}

/** Decode Nissan VIN (SJN, MNT, MLH, MMB) */
export function decodeNissanVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("SJN") && !wmi.startsWith("MNT") && !wmi.startsWith("MLH") && !wmi.startsWith("MMB") && !wmi.startsWith("JN")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  if (modelCode === "J1") return { model: "Qashqai", generation: "J11", body: "suv" };
  if (modelCode === "ZE") return { model: "Leaf", generation: "ZE1", body: "hatch" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Mazda VIN (JM1, JM6, JM7, JM0, 3MZ) */
export function decodeMazdaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("JM") && !wmi.startsWith("3MZ")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  if (modelCode === "BM" || modelCode === "BN") return { model: "3", generation: "BM", body: "hatch" };
  if (modelCode === "GJ") return { model: "6", generation: "GJ", body: "sedan" };
  if (modelCode === "KE" || modelCode === "KF") return { model: "CX-5", generation: "KE", body: "suv" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Skoda VIN (TMB, TMJ, TMK, WVW) */
export function decodeSkodaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("TM") && !wmi.startsWith("WVW")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  if (modelCode === "5E" || modelCode === "NX") return { model: "Octavia", generation: "3", body: "wagon" };
  if (modelCode === "3V" || modelCode === "3T") return { model: "Superb", generation: "3", body: "sedan" };
  return { model: "unknown", generation: "unknown", body: "hatch" };
}

/** Extract model year from VIN position 10 (valid for all manufacturers, 1980+) */
export function decodeVinModelYear(vin: string): number | null {
  if (!vin || vin.length < 10) return null;
  const yearChar = vin[9].toUpperCase();
  const yearMap: Record<string, number> = {
    "A": 2010, "B": 2011, "C": 2012, "D": 2013, "E": 2014, "F": 2015,
    "G": 2016, "H": 2017, "J": 2018, "K": 2019, "L": 2020, "M": 2021,
    "N": 2022, "P": 2023, "R": 2024, "S": 2025, "T": 2026, "V": 2027,
    "W": 2028, "X": 2029, "Y": 2030, "1": 2001, "2": 2002, "3": 2003,
    "4": 2004, "5": 2005, "6": 2006, "7": 2007, "8": 2008, "9": 2009,
  };
  return yearMap[yearChar] || null;
}

/** Unified VIN decoder — tries all known makes */
export function decodeVin(vin: string, lengthMm?: number): { make: string; generation: string; body: string; wheelbase?: string; modelYear?: number } | null {
  if (!vin || vin.length < 8) return null;
  const wmi = vin.slice(0, 3).toUpperCase();

  if (wmi === "WV1" || wmi === "WV2") {
    const result = decodeVwTransporterBody(vin, lengthMm);
    if (result) return { make: "volkswagen", generation: result.generation, body: result.body, wheelbase: result.wheelbase, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("WB")) {
    const result = decodeBmwVin(vin);
    if (result) return { make: "bmw", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("WD")) {
    const result = decodeMercedesVin(vin);
    if (result) return { make: "mercedes", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("WA")) {
    const result = decodeAudiVin(vin);
    if (result) return { make: "audi", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi === "WF0" || wmi.startsWith("1FT") || wmi.startsWith("3FA")) {
    const result = decodeFordVin(vin);
    if (result) return { make: "ford", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("KM") || wmi.startsWith("KN") || wmi.startsWith("ME") || wmi.startsWith("NL") || wmi.startsWith("TMA")) {
    const result = decodeHyundaiVin(vin);
    if (result) return { make: "hyundai", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("JT") || wmi.startsWith("NMT") || wmi.startsWith("SB1")) {
    const result = decodeToyotaVin(vin);
    if (result) return { make: "toyota", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("YV") || wmi.startsWith("LVY") || wmi.startsWith("MHY")) {
    const result = decodeVolvoVin(vin);
    if (result) return { make: "volvo", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("SJN") || wmi.startsWith("MNT") || wmi.startsWith("MLH") || wmi.startsWith("MMB") || wmi.startsWith("JN")) {
    const result = decodeNissanVin(vin);
    if (result) return { make: "nissan", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("JM") || wmi.startsWith("3MZ")) {
    const result = decodeMazdaVin(vin);
    if (result) return { make: "mazda", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }
  if (wmi.startsWith("TM") || wmi.startsWith("WVW")) {
    const result = decodeSkodaVin(vin);
    if (result) return { make: "skoda", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  return null;
}

/** Infer body variant from SVV data (length, seats, GVWR) */
export function inferBodyFromSvvData(vehicle: TecdocVehicle): { wheelbase?: string; bodyType?: string; variant?: string } {
  const result: { wheelbase?: string; bodyType?: string; variant?: string } = {};

  if (vehicle.length && vehicle.length > 1000) {
    if (vehicle.length >= 5100) result.wheelbase = "lwb";
    else if (vehicle.length <= 5000) result.wheelbase = "swb";
  }

  if (vehicle.seats) {
    if (vehicle.seats <= 3) result.bodyType = "van";
    else if (vehicle.seats <= 6) result.bodyType = "kombi";
    else if (vehicle.seats >= 7) result.bodyType = "passenger";
  }

  if (vehicle.gvwr) {
    if (vehicle.gvwr >= 3000) result.variant = "heavy";
    else if (vehicle.gvwr <= 2800) result.variant = "light";
  }

  return result;
}

/** Score body compatibility between record description and vehicle data */
export function scoreBodyCompatibility(
  record: GlassRecord,
  vehicle: TecdocVehicle,
  vinInfo: ReturnType<typeof decodeVwTransporterBody>
): number {
  let score = 0;
  const desc = (record.description + " " + (record.model || "")).toLowerCase();
  const svvBody = inferBodyFromSvvData(vehicle);

  if (svvBody.wheelbase || vinInfo?.wheelbase) {
    const wb = svvBody.wheelbase || vinInfo?.wheelbase;
    if (wb === "lwb") {
      if (desc.includes("lwb") || desc.includes("lang")) score += 15;
      else if (desc.includes("swb") || desc.includes("kort")) score -= 15;
    } else if (wb === "swb") {
      if (desc.includes("swb") || desc.includes("kort")) score += 10;
      else if (desc.includes("lwb") || desc.includes("lang")) score -= 15;
    }
  }

  if (svvBody.bodyType) {
    if (svvBody.bodyType === "van" && (desc.includes("van") || desc.includes("kasse"))) score += 10;
    if (svvBody.bodyType === "passenger" && (desc.includes("multivan") || desc.includes("caravelle"))) score += 10;
    if (svvBody.bodyType === "kombi" && desc.includes("kombi")) score += 10;
  }

  if (vehicle.seats && vehicle.seats >= 5 && vehicle.seats <= 6) {
    if (desc.includes("double cab") || desc.includes("doble cab") || desc.includes("crew")) score += 12;
    if ((desc.includes("van") || desc.includes("kasse")) && !desc.includes("double") && !desc.includes("crew")) score -= 5;
  }

  if (vinInfo?.roof === "high" || desc.includes("high")) {
    if (desc.includes("high") && vinInfo?.roof === "high") score += 10;
    else if (desc.includes("high") && vinInfo?.roof !== "high") score -= 8;
  }

  if (desc.includes("multivan") && svvBody.bodyType === "van") score -= 5;
  if (desc.includes("transporter") && svvBody.bodyType === "passenger") score -= 3;

  return score;
}
