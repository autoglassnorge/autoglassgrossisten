/**
 * Vincario API Provider
 * =====================
 * Vehicle data enrichment source (NOT a direct kType source).
 *
 * Vincario decodes VINs to detailed vehicle specs (make, model, year,
 * engine, body, drive type, etc.) but does NOT return TecDoc kType.
 *
 * Use case: Confirm EU vehicle identity with higher confidence than vPIC,
 * and enrich vehicle data for better fuzzy matching against catalog.
 *
 * Auth: API Key + Secret Key + Control Sum (SHA1-based)
 * Endpoint: https://api.vincario.com/3.2/
 * Rate limit: 60 VINs/minute
 * Invalid VINs are NOT charged.
 *
 * @see https://vincario.com/api-docs/3.2/
 */

export interface VincarioConfig {
  apiKey: string;
  secretKey: string;
}

export interface VincarioVehicle {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  body: string | null;
  doors: number | null;
  engineType: string | null;
  engineDisplacement: number | null; // ccm
  fuelType: string | null;
  driveType: string | null;
  transmission: string | null;
  powerHp: number | null;
  powerKw: number | null;
  raw: Record<string, unknown>;
}

export interface VincarioResult {
  vehicle: VincarioVehicle | null;
  balance: number | null;
  latencyMs: number;
  httpStatus: number;
  error?: string;
}

const BASE_URL = "https://api.vincario.com/3.2/";

/**
 * Decode a VIN via Vincario API.
 * Returns enriched vehicle data (NOT kType).
 */
export async function decodeVinVincario(
  vin: string,
  config: VincarioConfig
): Promise<VincarioResult> {
  const t0 = Date.now();
  const upperVin = vin.trim().toUpperCase();

  try {
    const controlSum = await buildControlSum(upperVin, "decode", config);
    const url = new URL(BASE_URL);
    url.searchParams.set("id", "decode");
    url.searchParams.set("key", config.apiKey);
    url.searchParams.set("secret", config.secretKey);
    url.searchParams.set("vin", upperVin);
    url.searchParams.set("controlSum", controlSum);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        vehicle: null,
        balance: null,
        latencyMs,
        httpStatus: res.status,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as Record<string, unknown>;

    // Vincario returns an object with decoded fields directly
    const vehicle = parseVincarioResponse(upperVin, json);
    const balance = extractBalance(json);

    return {
      vehicle,
      balance,
      latencyMs,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      vehicle: null,
      balance: null,
      latencyMs: Date.now() - t0,
      httpStatus: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get remaining API balance.
 */
export async function getVincarioBalance(
  config: VincarioConfig
): Promise<{ decode: number; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const controlSum = await buildControlSumNoVin("balance", config);
    const url = new URL(BASE_URL);
    url.searchParams.set("id", "balance");
    url.searchParams.set("key", config.apiKey);
    url.searchParams.set("secret", config.secretKey);
    url.searchParams.set("controlSum", controlSum);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { decode: 0, latencyMs, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as Record<string, unknown>;
    // Response shape: { "API Decode": 5520, "API Stolen Check": 68, ... }
    const decodeBalance =
      typeof json["API Decode"] === "number"
        ? json["API Decode"]
        : typeof json.decode === "number"
        ? json.decode
        : 0;

    return { decode: decodeBalance as number, latencyMs };
  } catch (err) {
    return {
      decode: 0,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Build Vincario control sum.
 * For VIN calls: SHA1(VIN|ID|API_KEY|SECRET_KEY), first 10 chars.
 * VIN must be UPPERCASE.
 */
async function buildControlSum(
  vin: string,
  id: string,
  config: VincarioConfig
): Promise<string> {
  const payload = `${vin}|${id}|${config.apiKey}|${config.secretKey}`;
  return sha1First10(payload);
}

/**
 * Build control sum for non-VIN calls (balance, info, etc.)
 * SHA1(ID|API_KEY|SECRET_KEY), first 10 chars.
 */
async function buildControlSumNoVin(
  id: string,
  config: VincarioConfig
): Promise<string> {
  const payload = `${id}|${config.apiKey}|${config.secretKey}`;
  return sha1First10(payload);
}

async function sha1First10(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseVincarioResponse(
  vin: string,
  json: Record<string, unknown>
): VincarioVehicle | null {
  const get = (key: string): unknown => {
    // Vincario may return fields in various casing
    const lowerKey = key.toLowerCase().replace(/\s+/g, "");
    for (const [k, v] of Object.entries(json)) {
      const normalizedK = k.toLowerCase().replace(/\s+/g, "");
      if (normalizedK === lowerKey) return v;
    }
    return undefined;
  };

  const make = str(get("Make")) || str(get("Manufacturer"));
  const model = str(get("Model"));
  const year = num(get("ModelYear")) || num(get("Year"));
  const body = str(get("Body")) || str(get("BodyClass"));
  const doors = num(get("NumberofDoors")) || num(get("Doors"));
  const engineType = str(get("EngineType")) || str(get("Engine"));
  const engineDisplacement = num(get("EngineDisplacement(ccm)")) || num(get("EngineDisplacement"));
  const fuelType = str(get("FuelType-Primary")) || str(get("FuelType")) || str(get("FuelTypePrimary"));
  const driveType = str(get("DriveType")) || str(get("Drivetrain"));
  const transmission = str(get("Transmission")) || str(get("NumberofGears"));
  const powerHp = num(get("PowerHP")) || num(get("Horsepower"));
  const powerKw = num(get("PowerKW")) || num(get("PowerkW"));

  if (!make || !model || !year) {
    return null;
  }

  return {
    vin,
    make,
    model,
    year,
    body,
    doors,
    engineType,
    engineDisplacement,
    fuelType,
    driveType,
    transmission,
    powerHp,
    powerKw,
    raw: json,
  };
}

function extractBalance(json: Record<string, unknown>): number | null {
  if (typeof json.balance === "object" && json.balance !== null) {
    const b = json.balance as Record<string, unknown>;
    if (typeof b["API Decode"] === "number") return b["API Decode"];
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return isNaN(n) ? null : n;
}
