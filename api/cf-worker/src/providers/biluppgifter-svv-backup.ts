/**
 * Biluppgifter API client - Backup for SVV når vegvesen er nede.
 * https://www.biluppgifter.se/api - Dekker også norske kjøretøy.
 */

import type { TecdocVehicle } from "./svv";

/** Biluppgitter vehicle response shape */
export interface BiluppgifterVehicle {
  regno: string;
  vin: string;
  make: string;
  model: string;
  year: number;
}

/** Resultat fra Biluppgitter lookup */
export type BiluppgifterResult =
  | { status: "ok"; vehicle: TecdocVehicle }
  | { status: "not_configured" | "not_found" | "upstream_error" | "parse_error" };

/**
 * Look up a Norwegian registration number via Biluppgifter API.
 * @param regnr  Normalised registration number
 * @param apiKey Biluppgifter API key
 * @returns Vehicle data compatible with TecdocVehicle format
 */
export async function fetchBiluppgifterVehicle(
  regnr: string,
  apiKey: string
): Promise<BiluppgifterResult> {
  if (!apiKey || apiKey === "NOT_SET") {
    console.error("Biluppgifter: API key not configured");
    return { status: "not_configured" };
  }

  try {
    // Biluppgitter bruker norsk format (AB12345, ikke AB 12345)
    const cleanRegnr = regnr.toUpperCase().replace(/\s/g, "");
    
    const url = `https://www.biluppgifter.se/api/v1/vehicle/regno/${encodeURIComponent(cleanRegnr)}`;
    
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "User-Agent": "AutoglassAS-B2B/1.0",
      },
    });

    if (res.status === 401 || res.status === 403) {
      console.error(`Biluppgifter auth failed (${res.status})`);
      return { status: "not_configured" };
    }

    if (res.status === 404) {
      return { status: "not_found" };
    }

    if (!res.ok) {
      console.warn(`Biluppgifter upstream error: HTTP ${res.status}`);
      return { status: "upstream_error" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      console.warn(`Biluppgifter parse error: ${e instanceof Error ? e.message : String(e)}`);
      return { status: "parse_error" };
    }

    // Parse Biluppgitter response - struktur kan variere
    const vehicle = parseBiluppgifterResponse(data, cleanRegnr);
    
    if (!vehicle) {
      return { status: "not_found" };
    }

    return {
      status: "ok",
      vehicle,
    };
  } catch (e) {
    console.warn(`Biluppgifter network error: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "upstream_error" };
  }
}

/**
 * Parse Biluppgitter API response til TecdocVehicle format.
 * Håndterer ulike respons-strukturer fra API-et.
 */
function parseBiluppgifterResponse(data: unknown, regnr: string): TecdocVehicle | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const d = data as Record<string, unknown>;

  // Forsøk ulike felter basert på typiske Biluppgitter-responser
  const vin = extractString(d.vin) || extractString(d.understellsnummer) || "";
  const make = extractString(d.make) || extractString(d.marke) || extractString(d.merke) || "";
  const model = extractString(d.model) || extractString(d.modell) || "";
  const year = extractYear(d.year) || extractYear(d.registreringsar) || extractYear(d.ar) || 0;

  if (!make || !model) {
    // Prøv nestede strukturer
    const basic = (d.basic as Record<string, unknown>) || {};
    const dataVehicle = (d.data as Record<string, unknown>) || {};
    
    const finalMake = extractString(basic.make) || extractString(dataVehicle.make) || "";
    const finalModel = extractString(basic.model) || extractString(dataVehicle.model) || "";
    const finalVin = extractString(basic.vin) || extractString(dataVehicle.vin) || "";
    const finalYear = extractYear(basic.year) || extractYear(dataVehicle.year) || year;

    if (!finalMake || !finalModel) {
      console.warn("Biluppgifter: Could not parse vehicle data", Object.keys(d));
      return null;
    }

    return createVehicle(finalMake, finalModel, finalYear, finalVin, regnr);
  }

  return createVehicle(make, model, year, vin, regnr);
}

function extractString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

function extractYear(value: unknown): number | null {
  if (typeof value === "number" && value > 1900 && value < 2100) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 1900 && parsed < 2100) {
      return parsed;
    }
  }
  return null;
}

function createVehicle(
  make: string,
  model: string,
  year: number,
  vin: string,
  regnr: string
): TecdocVehicle {
  return {
    regno: regnr,
    vin: vin || "",
    make: make.toUpperCase(),
    model: model.toUpperCase(),
    year,
    k_type: 0,
  };
}
