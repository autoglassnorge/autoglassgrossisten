/**
 * @typedef {Object} TecdocVehicle
 * @property {string} regno
 * @property {string} vin
 * @property {string} make
 * @property {string} model
 * @property {number} year
 * @property {number} k_type
 * @property {string} [typeCode]
 * @property {number} [length]
 * @property {string} [fuelCode]
 * @property {string} [engineCode]
 * @property {number} [seats]
 * @property {number} [gvwr]
 * @property {string} [color]
 * @property {string} [fuelType]
 * @property {string} [euroClass]
 * @property {string} [nextEUDate]
 * @property {string} [registrationStatus]
 * @property {string} [vehicleClass]
 * @property {number} [seatCount]
 */

/**
 * @typedef {{status:'ok',vehicle:TecdocVehicle}|{status:'not_configured'|'auth_error'|'not_found'|'upstream_error'|'parse_error',httpStatus?:number}} SvvFetchResult
 */

export async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSvvVehicle(data, regnr) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const k = data.kjoretoydataListe?.[0];
  if (!k) return null;

  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;
  const merke = generelt?.merke?.[0]?.merke || "";
  const model = generelt?.handelsbetegnelse?.[0] || "";
  const typeCode = generelt?.typebetegnelse || "";
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
  const year = regDate ? (parseInt(regDate.split("-")[0], 10) || 0) : 0;
  const vin = k.kjoretoyId?.understellsnummer || "";
  const length = td?.dimensjoner?.lengde || 0;
  const fuelCode = td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "";
  const engineCode = td?.motorOgDrivverk?.motor?.[0]?.motorKode || "";
  const seats = td?.persontall?.sitteplasserTotalt || 0;
  const gvwr = td?.vekter?.tillattTotalvekt || 0;
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
    color,
    fuelType,
    euroClass,
    nextEUDate,
    registrationStatus,
    vehicleClass,
    seatCount,
  };
}

export async function fetchSvvEnkeltoppslag(regnr, apiKey) {
  if (!apiKey || apiKey === "NOT_SET") {
    console.error("SVV: SVV_API_KEY not configured");
    return { status: "not_configured" };
  }
  try {
    const res = await fetchWithTimeout(
      `https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
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

    let data;
    try {
      data = await res.json();
    } catch (e) {
      console.warn(`SVV parse error: ${e instanceof Error ? e.message : String(e)}`);
      return { status: "parse_error" };
    }

    const vehicle = parseSvvVehicle(data, regnr);
    if (!vehicle) {
      return { status: "not_found" };
    }

    return { status: "ok", vehicle };
  } catch (e) {
    console.warn(`SVV network error: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "upstream_error" };
  }
}
