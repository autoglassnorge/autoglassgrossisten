/**
 * SVV (Statens Vegvesen) API client.
 * Provides typed wrappers for the Norwegian Public Roads Administration
 * vehicle lookup endpoint (enkeltoppslag/kjoretoydata).
 */

/** Vehicle shape returned to consumers after normalising SVV data. */
export interface TecdocVehicle {
  regno: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  k_type: number;
  typeCode?: string;
  length?: number;
  fuelCode?: string;
  engineCode?: string;
  seats?: number;
  gvwr?: number;
  // Utvidede felter fra SVV API (v2)
  color?: string;                    // karosseriOgLasteplan.rFarge[0].kodeNavn
  fuelType?: string;                 // miljodata.miljoOgdrivstoffGruppe[0].drivstoffKodeMiljodata.kodeNavn
  euroClass?: string;                // miljodata.euroKlasse.kodeNavn
  nextEUDate?: string;               // periodiskKjoretoyKontroll.kontrollfrist (ISO dato)
  registrationStatus?: string;       // registrering.registreringsstatus.kodeBeskrivelse
  vehicleClass?: string;             // kjoretoyklassifisering.beskrivelse
  seatCount?: number;                // persontall.sitteplasserTotalt (alias for seats)
}

/** Raw SVV enkeltoppslag response shape. */
export interface SvvKjoretoyData {
  kjoretoydataListe?: Array<{
    kjoretoyId?: { understellsnummer?: string };
    forstegangsregistrering?: { registrertForstegangNorgeDato?: string };
    registrering?: {
      registreringsstatus?: {
        kodeBeskrivelse?: string;
      };
    };
    periodiskKjoretoyKontroll?: {
      kontrollfrist?: string;
    };
    kjoretoyklassifisering?: {
      beskrivelse?: string;
    };
    godkjenning?: {
      tekniskGodkjenning?: {
        tekniskeData?: {
          generelt?: {
            merke?: Array<{ merke: string }>;
            handelsbetegnelse?: Array<string>;
            typebetegnelse?: string;
          };
          dimensjoner?: { lengde?: number; bredde?: number };
          motorOgDrivverk?: {
            motor?: Array<{
              drivstoff?: Array<{ drivstoffKode?: { kodeVerdi?: string } }>;
              motorKode?: string;
            }>;
          };
          persontall?: { sitteplasserTotalt?: number };
          vekter?: { tillattTotalvekt?: number };
          karosseriOgLasteplan?: {
            rFarge?: Array<{
              kodeNavn?: string;
            }>;
          };
          miljodata?: {
            euroKlasse?: {
              kodeNavn?: string;
            };
            miljoOgdrivstoffGruppe?: Array<{
              drivstoffKodeMiljodata?: {
                kodeNavn?: string;
              };
            }>;
          };
        };
      };
    };
  }>;
}

/**
 * SVV fetch result — explicit error taxonomy so callers can return
 * appropriate HTTP status codes instead of swallowing everything as null.
 *
 * Status taxonomy:
 *   - 'ok'             → vehicle data returned
 *   - 'not_configured' → SVV_API_KEY missing/NOT_SET (deploy-time issue)
 *   - 'auth_error'     → 401/403 from SVV (rotate key)
 *   - 'not_found'      → 404 or empty list (regnr doesn't exist)
 *   - 'upstream_error' → 5xx from SVV or network failure
 *   - 'parse_error'    → response not parseable
 */
export type SvvFetchResult =
  | { status: "ok"; vehicle: TecdocVehicle }
  | { status: "not_configured" | "auth_error" | "not_found" | "upstream_error" | "parse_error"; httpStatus?: number };

/**
 * Generic fetch wrapper with AbortController timeout.
 * @param url       Target URL
 * @param options   Standard RequestInit
 * @param timeoutMs Abort after N milliseconds (default 10 000)
 */
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract a normalised {@link TecdocVehicle} from raw SVV response data.
 * @param data  Parsed SVV JSON
 * @param regnr Registration number to attach to the vehicle
 * @returns Normalised vehicle, or `null` if the list is empty/missing
 */
export function parseSvvVehicle(data: SvvKjoretoyData, regnr: string): TecdocVehicle | null {
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;

  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;
  const merke = generelt?.merke?.[0]?.merke || "";
  const model = generelt?.handelsbetegnelse?.[0] || "";
  const typeCode = generelt?.typebetegnelse || "";
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;
  const vin = k.kjoretoyId?.understellsnummer || "";
  const length = td?.dimensjoner?.lengde || 0;
  const fuelCode = td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";
  const engineCode = td?.motorOgDrivverk?.motor?.[0]?.motorKode || "";
  const seats = td?.persontall?.sitteplasserTotalt || 0;
  const gvwr = td?.vekter?.tillattTotalvekt || 0;

  // Nye utvidede felter
  const color = td?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn;
  const fuelType = td?.miljodata?.miljoOgdrivstoffGruppe?.[0]?.drivstoffKodeMiljodata?.kodeNavn;
  const euroClass = td?.miljodata?.euroKlasse?.kodeNavn;
  const nextEUDate = k.periodiskKjoretoyKontroll?.kontrollfrist;
  const registrationStatus = k.registrering?.registreringsstatus?.kodeBeskrivelse;
  const vehicleClass = k.kjoretoyklassifisering?.beskrivelse;
  const seatCount = td?.persontall?.sitteplasserTotalt;

  return {
    regno: regnr,
    vin,
    make: merke.toUpperCase(),
    model: model.toUpperCase(),
    year,
    k_type: 0,
    typeCode,
    length,
    fuelCode,
    engineCode,
    seats,
    gvwr,
    // Nye felter (optional, undefined hvis ikke tilgjengelig)
    color,
    fuelType,
    euroClass,
    nextEUDate,
    registrationStatus,
    vehicleClass,
    seatCount,
  };
}

/**
 * Look up a Norwegian registration number via SVV Enkeltoppslag.
 * @param regnr  Normalised registration number
 * @param apiKey SVV API key
 * @returns {@link SvvFetchResult} with explicit status taxonomy
 */
export async function fetchSvvEnkeltoppslag(regnr: string, apiKey: string): Promise<SvvFetchResult> {
  if (!apiKey || apiKey === "NOT_SET") {
    console.error("SVV: SVV_API_KEY not configured");
    return { status: "not_configured" };
  }
  try {
    const res = await fetchWithTimeout(
      `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
      {
        headers: {
          "Accept": "application/json",
          "SVV-Authorization": `Apikey ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      },
      15000
    );

    if (res.status === 401 || res.status === 403) {
      console.error(`SVV auth failed (${res.status}) — rotate SVV_API_KEY via 'wrangler secret put SVV_API_KEY'`);
      return { status: "auth_error", httpStatus: res.status };
    }
    if (res.status === 404) {
      return { status: "not_found", httpStatus: 404 };
    }
    if (!res.ok) {
      console.warn(`SVV upstream error: HTTP ${res.status}`);
      return { status: "upstream_error", httpStatus: res.status };
    }

    let data: SvvKjoretoyData;
    try {
      data = (await res.json()) as SvvKjoretoyData;
    } catch (e) {
      console.warn(`SVV parse error: ${e instanceof Error ? e.message : String(e)}`);
      return { status: "parse_error" };
    }

    const vehicle = parseSvvVehicle(data, regnr);
    if (!vehicle) {
      return { status: "not_found" };
    }

    return {
      status: "ok",
      vehicle,
    };
  } catch (e) {
    console.warn(`SVV network error: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "upstream_error" };
  }
}
