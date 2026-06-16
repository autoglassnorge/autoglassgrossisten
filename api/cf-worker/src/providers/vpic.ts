/**
 * NHTSA vPIC (Vehicle Product Information Center) API client.
 * Free, public VIN decoder — primarily USA market, but covers many
 * European manufacturers sold in the US (BMW, Mercedes, Audi, Volvo, VW).
 * Used as a fallback when SVV (Statens Vegvesen) is unavailable or when
 * we need to decode a VIN that has no Norwegian registration.
 *
 * API docs: https://vpic.nhtsa.dot.gov/api/
 * Endpoint: GET /api/vehicles/decodevinvalues/{vin}?format=json
 */

export interface VpicVehicle {
  make: string;
  model: string;
  year: number;
  bodyClass: string;
  vehicleType: string;
  errorCode?: string;
  errorText?: string;
}

export interface VpicResult {
  status: "ok" | "not_found" | "upstream_error" | "parse_error" | "invalid_vin";
  vehicle?: VpicVehicle;
  httpStatus?: number;
  raw?: unknown;
}

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

/**
 * Decode a VIN via NHTSA vPIC.
 * Returns make, model, year, and body class when available.
 * No API key required — this is a free public service.
 */
export async function decodeVinVpic(vin: string): Promise<VpicResult> {
  if (!vin || vin.length !== 17) {
    return { status: "invalid_vin" };
  }

  const url = `${VPIC_BASE}/decodevinvalues/${encodeURIComponent(vin)}?format=json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return { status: "upstream_error", httpStatus: res.status };
    }

    const data = (await res.json()) as {
      Count: number;
      Message: string;
      Results: Array<Record<string, string>>;
    };

    if (!data.Results || data.Results.length === 0) {
      return { status: "not_found" };
    }

    const r = data.Results[0];

    // vPIC returns empty strings for missing fields — treat as missing
    const make = r.Make || "";
    const model = r.Model || "";
    const yearStr = r.ModelYear || "";
    const bodyClass = r.BodyClass || "";
    const vehicleType = r.VehicleType || "";
    const errorCode = r.ErrorCode || "";
    const errorText = r.ErrorText || "";

    // If NHTSA explicitly flagged errors (e.g. manufacturer not registered for US),
    // we still try to use whatever data we got, but mark it.
    const hasExplicitErrors = errorCode && errorCode !== "0";

    const year = yearStr ? parseInt(yearStr, 10) : 0;

    if (!make && !model && !year) {
      return {
        status: hasExplicitErrors ? "not_found" : "parse_error",
        raw: r,
      };
    }

    return {
      status: "ok",
      vehicle: {
        make: make.trim(),
        model: model.trim(),
        year: isNaN(year) ? 0 : year,
        bodyClass: bodyClass.trim() || '',
        vehicleType: vehicleType.trim() || '',
        errorCode: hasExplicitErrors ? errorCode : undefined,
        errorText: hasExplicitErrors ? errorText : undefined,
      },
      raw: r,
    };
  } catch (err) {
    console.error(`[vPIC] network error for VIN ${vin}:`, err);
    return { status: "upstream_error" };
  }
}

/**
 * Lightweight vPIC check — only returns make/model/year or null.
 * Useful for quick enrichment in the VIN lookup pipeline.
 */
export async function lookupVinVpic(vin: string): Promise<{ make: string; model: string; year: number } | null> {
  const result = await decodeVinVpic(vin);
  if (result.status === "ok" && result.vehicle) {
    return {
      make: result.vehicle.make,
      model: result.vehicle.model,
      year: result.vehicle.year,
    };
  }
  return null;
}
