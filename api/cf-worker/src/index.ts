/**
 * Autoglass AS — Cloudflare Worker API v2.2 (Hardened)
 * ========================================================================
 * Endepunkter:
 *   GET  /api/glass?regnr=AB12345       → søk på regnr via SVV → D1
 *   GET  /api/glass?prefix4=5351        → søk på prefix4 i D1
 *   GET  /api/glass?eurocode=5351AGNMV  → direkte oppslag i D1
 *   GET  /api/health                    → statussjekk
 *   GET  /api/catalog/brands            → merke-liste med count
 *   GET  /api/catalog/categories        → kategori-liste med count
 *   GET  /api/catalog/search?q=...      → fulltext søk i D1
 *
 * Arkitektur: D1 (primær) + KV (cache + fallback)
 * Nytt i v2.1: Bovsoft kType-integrasjon + statistisk læring
 * Nytt i v2.2:
 *   - SVV 401/403 returnerer 503 + Retry-After i stedet for 500-krasj
 *   - Bovsoft 401/402/403/404 logges separat — vi ser når konto aktiveres
 *   - ktype_matches GDPR-fikset: ingen regnr lagres, kun (ktype, eurocode, hit_count)
 *   - KTYPE_CONFIDENCE_THRESHOLD=3 hindrer cache-poisoning fra enkelt-feil
 *   - Feilrespons cachet IKKE (kun 200 OK ender i KV)
 */

export interface Env {
  GLASS_CATALOG: KVNamespace;
  GLASS_CATALOG_D1: D1Database;
  BILUPPGIFTER_API_KEY: string;
  BOVSOFT_CLIENT_ID: string;
  BOVSOFT_SECCODE: string;
  SVV_API_KEY: string;
}

interface GlassRecord {
  id: number;
  eurocode: string;
  brand: string;
  model: string | null;
  category: string;
  year_from: number | null;
  year_to: number | null;
  prefix4: string;
  adas: number;
  rain_sensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  hud: number;
  shade: number;
  camera: number;
  lane_assist: number;
  supplier: string | null;
  image_url: string | null;
  description: string;
  source: string;
}

interface TecdocVehicle {
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
}

// ============================================================================
// CORS
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ============================================================================
// CACHE (KV)
// ============================================================================

async function getCache<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const cached = await kv.get(key);
  return cached ? JSON.parse(cached) : null;
}

async function setCache(kv: KVNamespace, key: string, data: unknown, ttlSeconds = 300): Promise<void> {
  await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
}

function cacheKey(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `cache:v2:${endpoint}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

// ============================================================================
// RATE LIMITING (D1-basert — unngår KV write-kvote)
// ============================================================================

async function checkRateLimit(db: D1Database, ip: string): Promise<boolean> {
  const key = `rate:${ip}`;
  try {
    const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ? AND expires_at > datetime('now')").bind(key).first();
    const count = row ? (row as any).count : 0;
    if (count > 120) return false; // 120 req/min
    await db.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, ?, datetime('now', '+1 minute'))
       ON CONFLICT(key) DO UPDATE SET count = count + 1, expires_at = excluded.expires_at`
    ).bind(key, count + 1).run();
    return true;
  } catch {
    // If table doesn't exist yet, allow through (don't block on migration missing)
    return true;
  }
}

// ============================================================================
// SVV API
// ============================================================================

interface SvvKjoretoyData {
  kjoretoydataListe?: Array<{
    kjoretoyId?: { understellsnummer?: string };
    forstegangsregistrering?: { registrertForstegangNorgeDato?: string };
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
        };
      };
    };
  }>;
}

/**
 * SVV fetch result — explicit error taxonomy so callers can return
 * appropriate HTTP status codes instead of swallowing everything as null.
 *
 * status taxonomy:
 *   - 'ok'             → vehicle data returned
 *   - 'not_configured' → SVV_API_KEY missing/NOT_SET (deploy-time issue)
 *   - 'auth_error'     → 401/403 from SVV (rotate key)
 *   - 'not_found'      → 404 or empty list (regnr doesn't exist)
 *   - 'upstream_error' → 5xx from SVV or network failure
 *   - 'parse_error'    → response not parseable
 */
type SvvFetchResult =
  | { status: "ok"; vehicle: TecdocVehicle }
  | { status: "not_configured" | "auth_error" | "not_found" | "upstream_error" | "parse_error"; httpStatus?: number };

async function fetchSvvEnkeltoppslag(regnr: string, apiKey: string): Promise<SvvFetchResult> {
  if (!apiKey || apiKey === "NOT_SET") {
    console.error("SVV: SVV_API_KEY not configured");
    return { status: "not_configured" };
  }
  try {
    const res = await fetch(
      `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(regnr)}`,
      {
        headers: {
          "Accept": "application/json",
          "SVV-Authorization": `Apikey ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      }
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

    const k = data.kjoretoydataListe?.[0];
    if (!k) return { status: "not_found" };

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

    return {
      status: "ok",
      vehicle: {
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
      },
    };
  } catch (e) {
    console.warn(`SVV network error: ${e instanceof Error ? e.message : String(e)}`);
    return { status: "upstream_error" };
  }
}

// ============================================================================
// BOVSOFT REGNUM API — kType lookup
// ============================================================================

interface BovsoftVehicle {
  ktype: number;
  vin: string;
  brand: string;
  model: string;
  type: string;
  yearFrom: number;
  yearTo: number;
  body: string;
  source: "bovsoft";
}

/**
 * Fetch vehicle data from Bovsoft REGNUM API.
 * Returns ktype (TecDoc type ID) + VIN + vehicle data.
 *
 * Endpoint: GET /bovsoft.regnum.run?id=ID&seccode=SECRET&nameservice=getktypefornumplatenorway&regnum=REG&contenttype=JSON
 */
async function fetchBovsoftVehicle(
  regno: string,
  clientId: string,
  secCode: string
): Promise<BovsoftVehicle | null> {
  if (!clientId || !secCode || clientId === "NOT_SET") return null;

  try {
    const url = `http://54.38.179.43:150/bovsoft.regnum.run?id=${encodeURIComponent(clientId)}&seccode=${encodeURIComponent(secCode)}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regno)}&contenttype=JSON`;
    const res = await fetch(url, { method: "GET" });

    if (!res.ok) {
      console.warn(`Bovsoft HTTP ${res.status} for regnr=${regno}`);
      return null;
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};

    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.warn(`Bovsoft: non-JSON response for regnr=${regno}`);
      return null;
    }

    // Bovsoft response: { status: 200|401|402|403|404, statusText?: string, data?: { datacar: [...] }, countFREERequests?: number }
    const bovStatus = typeof data.status === "number" ? data.status : parseInt(String(data.status), 10);
    const bovStatusText = typeof data.statusText === "string" ? data.statusText : "";

    // Diagnostic logging — critical for knowing when account becomes active
    if (bovStatus === 401) {
      console.error(`Bovsoft auth failed (401) — wrong client id or seccode. Check BOVSOFT_CLIENT_ID/BOVSOFT_SECCODE secrets.`);
      return null;
    }
    if (bovStatus === 402) {
      console.error(`Bovsoft zero balance (402) — top up account. countFREERequests=${data.countFREERequests}`);
      return null;
    }
    if (bovStatus === 403) {
      console.warn(`Bovsoft account pending (403): ${bovStatusText || "temp status, need wait confirmation"}. Contact bovsoft@gmail.com ref Client id=${clientId}.`);
      return null;
    }
    if (bovStatus === 404) {
      // regnr exists in our system but Bovsoft couldn't decode it — normal, just fall through
      return null;
    }
    if (bovStatus !== 200) {
      console.warn(`Bovsoft unexpected status=${bovStatus} statusText="${bovStatusText}" for regnr=${regno}`);
      return null;
    }

    // Log remaining free requests every time — helps monitor quota
    const freeReq = typeof data.countFREERequests === "number" ? data.countFREERequests : null;
    if (freeReq !== null && freeReq < 50) {
      console.warn(`Bovsoft countFREERequests=${freeReq} — low quota`);
    }

    const datacar = (data.data as Record<string, unknown> | undefined)?.datacar as Array<Record<string, unknown>> | undefined;
    const car = datacar?.[0];
    if (!car) return null;

    const ktype = typeof car.ktype === "number" ? car.ktype : parseInt(String(car.ktype), 10);
    if (!ktype || isNaN(ktype)) return null;

    // Parse year from YYYYMM format
    const parseYear = (val: unknown): number => {
      if (!val) return 0;
      const s = String(val);
      const y = parseInt(s.slice(0, 4), 10);
      return isNaN(y) ? 0 : y;
    };

    return {
      ktype,
      vin: String(car.vin || ""),
      brand: String(car.manufCar || "").toUpperCase(),
      model: String(car.modelCar || "").toUpperCase(),
      type: String(car.typeCar || ""),
      yearFrom: parseYear(car.typeFromYearCar),
      yearTo: parseYear(car.typeToYearCar),
      body: String(car.bodyCar || ""),
      source: "bovsoft",
    };
  } catch (e) {
    console.warn(`Bovsoft network error for regnr=${regno}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Cache Bovsoft vehicle data in KV for 30 days */
async function cacheBovsoftVehicle(kv: KVNamespace, regnr: string, vehicle: BovsoftVehicle): Promise<void> {
  await kv.put(`bovsoft:${regnr.toUpperCase()}`, JSON.stringify(vehicle), { expirationTtl: 30 * 24 * 60 * 60 });
}

/** Get cached Bovsoft vehicle data from KV */
async function getCachedBovsoftVehicle(kv: KVNamespace, regnr: string): Promise<BovsoftVehicle | null> {
  const cached = await kv.get(`bovsoft:${regnr.toUpperCase()}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as BovsoftVehicle;
  } catch {
    return null;
  }
}

// ============================================================================
// FACTORY EQUIPMENT LOOKUP (Biluppgitter)
// ============================================================================

interface FactoryEquipment {
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  adas: boolean;
  hud: boolean;
  source: "bovsoft" | "biluppgifter" | "none";
}

/**
 * Fetch factory equipment from Biluppgitter API.
 * Kept as equipment source since Bovsoft does not return equipment flags.
 */
async function fetchBiluppgifterEquipment(
  regno: string,
  apiKey: string
): Promise<FactoryEquipment | null> {
  if (!apiKey || apiKey === "NOT_SET") return null;

  try {
    const res = await fetch(
      `https://api.biluppgifter.se/api/v1/vehicle-configurator/regno/${encodeURIComponent(regno)}?country_code=NO`,
      {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      }
    );

    if (!res.ok) return null;

    const data = await res.json() as {
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
  } catch {
    return null;
  }
}

// ============================================================================
// D1 QUERIES
// ============================================================================

async function queryByPrefix4(db: D1Database, prefix4: string, limit = 50): Promise<GlassRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM glass_catalog WHERE prefix4 = ? LIMIT ?")
    .bind(prefix4, limit)
    .all();
  return (results || []) as unknown as GlassRecord[];
}

async function queryByEurocode(db: D1Database, eurocode: string): Promise<GlassRecord | null> {
  const result = await db
    .prepare("SELECT * FROM glass_catalog WHERE eurocode = ? COLLATE NOCASE")
    .bind(eurocode)
    .first();
  return result as unknown as GlassRecord | null;
}

async function queryByBrandAndYear(
  db: D1Database,
  brand: string,
  year: number,
  modelHint?: string,
  prefix4?: string
): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE brand = ? AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)";
  const params: (string | number)[] = [brand, year, year];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " LIMIT 200";
  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

async function queryByBrandOnly(db: D1Database, brand: string, modelHint?: string, prefix4?: string): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE brand = ?";
  const params: (string | number)[] = [brand];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " LIMIT 200";
  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

// === kType-based queries (statistical learning) ===

/** Query glass catalog by ktype (when we have ktype populated in DB) */
async function queryByKtype(db: D1Database, ktype: number): Promise<GlassRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM glass_catalog WHERE ktype = ? LIMIT 20")
    .bind(ktype)
    .all();
  return (results || []) as unknown as GlassRecord[];
}

/**
 * Confidence threshold for Layer 0 (statistical match).
 * A ktype→eurocode mapping must have been observed at least this many times
 * before we trust it as 'exact'. Prevents single misclassifications from
 * permanently poisoning the cache.
 */
const KTYPE_CONFIDENCE_THRESHOLD = 3;

/**
 * Query statistical ktype→eurocode mapping from learned data.
 * Returns frequency-sorted candidates. Schema v3 (after migration 0003):
 *   ktype_matches(ktype, eurocode, hit_count, first_seen, last_seen)
 * No regnr stored — GDPR-safe aggregation only.
 */
async function queryKtypeMapping(db: D1Database, ktype: number): Promise<{ eurocode: string; frequency: number }[]> {
  try {
    const { results } = await db
      .prepare(`
        SELECT eurocode, hit_count as frequency
        FROM ktype_matches
        WHERE ktype = ?
        ORDER BY hit_count DESC
        LIMIT 5
      `)
      .bind(ktype)
      .all();
    return (results || []) as unknown as { eurocode: string; frequency: number }[];
  } catch {
    // Table might not exist yet (migration 0003 not run)
    return [];
  }
}

/**
 * Record a ktype→eurocode observation for statistical learning.
 * NOTE: regnr is intentionally NOT stored — it is a personal data identifier
 * under Norwegian law when linkable to a vehicle owner. We aggregate by
 * (ktype, eurocode) only, incrementing hit_count on each observation.
 */
async function insertKtypeMatch(db: D1Database, ktype: number, eurocode: string): Promise<void> {
  if (!ktype || !eurocode) return;
  try {
    await db.prepare(
      `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
       VALUES (?, ?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(ktype, eurocode) DO UPDATE SET
         hit_count = hit_count + 1,
         last_seen = datetime('now')`
    ).bind(ktype, eurocode.toUpperCase()).run();
  } catch {
    // Silently fail if migration 0003 not run yet
  }
}

async function getCatalogStats(db: D1Database): Promise<{ total: number; brands: number }> {
  const totalRow = await db.prepare("SELECT COUNT(*) as cnt FROM glass_catalog").first();
  const brandRow = await db.prepare("SELECT COUNT(DISTINCT brand) as cnt FROM glass_catalog").first();
  return {
    total: (totalRow as any)?.cnt || 0,
    brands: (brandRow as any)?.cnt || 0,
  };
}

async function getBrandsWithCount(db: D1Database): Promise<Array<{ brand: string; count: number }>> {
  const { results } = await db
    .prepare("SELECT brand, COUNT(*) as count FROM glass_catalog GROUP BY brand ORDER BY count DESC")
    .all();
  return (results || []) as unknown as Array<{ brand: string; count: number }>;
}

async function getCategoriesWithCount(db: D1Database): Promise<Array<{ category: string; count: number }>> {
  const { results } = await db
    .prepare("SELECT category, COUNT(*) as count FROM glass_catalog GROUP BY category ORDER BY count DESC")
    .all();
  return (results || []) as unknown as Array<{ category: string; count: number }>;
}

async function searchCatalog(
  db: D1Database,
  q: string,
  filters: { brand?: string; category?: string; yearMin?: number; yearMax?: number }
): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE (eurocode LIKE ? OR brand LIKE ? OR model LIKE ? OR description LIKE ?)";
  const params: (string | number)[] = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];

  if (filters.brand) {
    sql += " AND brand = ?";
    params.push(filters.brand);
  }
  if (filters.category) {
    sql += " AND category = ?";
    params.push(filters.category);
  }
  if (filters.yearMin !== undefined) {
    sql += " AND (year_to IS NULL OR year_to >= ?)";
    params.push(filters.yearMin);
  }
  if (filters.yearMax !== undefined) {
    sql += " AND (year_from IS NULL OR year_from <= ?)";
    params.push(filters.yearMax);
  }
  sql += " LIMIT 100";

  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

// ============================================================================
// SEARCH LOGIC
// ============================================================================

// ============================================================================
// EQUIPMENT DETECTION
// ============================================================================

/**
 * Detect equipment flags from product description text.
 * Most descriptions use standardized codes:
 *   RSN / RSNL / RSNLSN = Rain sensor
 *   HTD                 = Heated
 *   ACO                 = Acoustic
 *   ANT / GPS           = Antenna
 *   CAMERA / CAM        = Camera bracket / ADAS
 *   SOLAR               = Solar control (not a distinguishing feature for matching)
 *   VIN                 = VIN etched
 *   GY / GN / BL / CL   = Tint color (not equipment)
 */
function detectFlagsFromDescription(description: string | null): {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  hud: boolean;
} {
  const d = (description || "").toUpperCase();
  return {
    adas: /\b(ADAS|FILSKIFTE|LANE.ASSIST|LANE|COLLISION|AUTO.BRAKE|EMERGENCY|BRAKE|DRIVE.ASSIST|PRO.PILOT|AUTOPILOT|TRAFFIC|AP|ACC|ADAPTIVE)\b/.test(d),
    rainSensor: /\b(RSN|RSNL|RSNLSN|RAIN|REGN|WIPER|WASHER|VIPE|AUTOMATIC.WIPER|REGNSENSOR|VINDRUTE.VISKER)\b/.test(d),
    heated: /\b(HTD|HT|HEATED|OPPVARM|VARME|DEFROST|DEFOG|EL.VARME|EL-VARME|HEATING|WARM|VARMET)\b/.test(d),
    acoustic: /\b(ACO|ACOUSTIC|AKUSTIK|QUIET|STØYDEMP|STØY|NOISE|SILENT|SOUND|ACUSTIC)\b/.test(d),
    antenna: /\b(ANT|ANTENNA|ANTENNE|GPS|RADIO|FM|DAB|AERIAL|ANTEN)\b/.test(d),
    camera: /\b(CAMERA|CAM|KAMERA|SENSOR|BACKUP|REVERSING|360|FRONT.CAM|REAR.CAM)\b/.test(d),
    hud: /\b(HUD|HEAD.UP|HEADUP|PROJEKSJON|PROJECTION|WINDSHIELD.DISPLAY)\b/.test(d),
  };
}

/** Legacy OEM-based detection (kept for future Biluppgitter/TecDoc integration) */
function detectFlagsFromOem(oemDescriptions: string[]) {
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
function inferRecordEquipment(record: GlassRecord): {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  hud: boolean;
} {
  // Prefer explicit DB columns if set
  if (record.rain_sensor || record.heated || record.acoustic || record.antenna || record.camera || record.adas) {
    return {
      adas: !!record.adas,
      rainSensor: !!record.rain_sensor,
      heated: !!record.heated,
      acoustic: !!record.acoustic,
      antenna: !!record.antenna,
      camera: !!record.camera,
      hud: !!record.hud,
    };
  }
  // Fallback: parse from description
  return detectFlagsFromDescription(record.description);
}

function scoreCandidate(
  c: GlassRecord,
  flags: ReturnType<typeof detectFlagsFromOem>,
  vehicle: TecdocVehicle,
  vinInfo: ReturnType<typeof decodeVwTransporterBody>,
  bovsoftInfo?: BovsoftVehicle,
  unifiedVin?: ReturnType<typeof decodeVin>
): number {
  let score = 0;

  // Infer equipment from DB columns + description parsing
  const recordFlags = inferRecordEquipment(c);

  // Equipment matching (high weight when we know vehicle equipment)
  if (flags.adas && recordFlags.adas) score += 15;
  if (flags.rainSensor && recordFlags.rainSensor) score += 12;
  if (flags.heated && recordFlags.heated) score += 10;
  if (flags.acoustic && recordFlags.acoustic) score += 8;
  if (flags.antenna && recordFlags.antenna) score += 8;
  if (flags.hud && recordFlags.hud) score += 10;
  if (flags.camera && recordFlags.camera) score += 12;

  // Penalize if record has equipment the vehicle doesn't have
  if (!flags.adas && recordFlags.adas) score -= 5;
  if (!flags.hud && recordFlags.hud) score -= 3;
  if (!flags.camera && recordFlags.camera) score -= 4;
  if (!flags.rainSensor && recordFlags.rainSensor) score -= 3;
  if (!flags.heated && recordFlags.heated) score -= 2;

  // Year compatibility scoring
  const vehicleYear = vehicle.year;
  const yr = parseYearRangeFromDescription(c.description);
  if (yr.from && yr.to) {
    if (vehicleYear >= yr.from && vehicleYear <= yr.to) {
      score += 20; // Exact year match
    } else if (vehicleYear >= yr.from - 2 && vehicleYear <= yr.to + 2) {
      score += 5; // Close year match
    } else if (vehicleYear < yr.from - 5 || vehicleYear > yr.to + 5) {
      score -= 30; // Wrong generation entirely
    }
  } else if (yr.from && !yr.to) {
    if (vehicleYear >= yr.from - 2) {
      score += 10;
    } else if (vehicleYear < yr.from - 10) {
      score -= 30;
    }
  }

  // VIN model year verification (works for ALL makes)
  if (unifiedVin?.modelYear && c.year_from) {
    const vinYear = unifiedVin.modelYear;
    if (Math.abs(vinYear - c.year_from) <= 1) {
      score += 15; // VIN model year matches DB year
    } else if (Math.abs(vinYear - c.year_from) <= 3) {
      score += 5;
    } else if (Math.abs(vinYear - c.year_from) > 5) {
      score -= 20; // VIN year clearly doesn't match
    }
  }

  // VIN generation cross-check with description
  if (unifiedVin?.generation) {
    const descGen = parseGenerationFromDescription(c.description) || parseGenerationFromDescription(c.model);
    if (descGen && unifiedVin.generation.toUpperCase() === descGen.toUpperCase()) {
      score += 30; // Strong match: VIN generation = description generation
    }
  }

  // VIN body type cross-check with description
  if (unifiedVin?.body) {
    const desc = (c.description + " " + (c.model || "")).toLowerCase();
    const vinBody = unifiedVin.body.toLowerCase();
    // Map VIN body to description keywords
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
      score += 25; // Strong generation match via kType year range
    }
  }

  // Body / chassis compatibility (VIN + SVV data)
  score += scoreBodyCompatibility(c, vehicle, vinInfo);

  return score;
}

function parseYearRangeFromDescription(desc: string | null): { from: number | null; to: number | null } {
  if (!desc) return { from: null, to: null };
  const d = desc;

  // Pattern 1: "2015-2019;" or "2015-2019 " or "2015 - 2019"
  const m1 = d.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*(\d{4})\s*[;\)\s]/);
  if (m1) {
    return { from: parseInt(m1[1], 10), to: parseInt(m1[2], 10) };
  }

  // Pattern 2: "T3 79-91" or "90-03" (2-digit years)
  const m2 = d.match(/(?:^|\s|\()(\d{2})\s*[-–]\s*(\d{2})\s*[;\)\s]/);
  if (m2) {
    let from = parseInt(m2[1], 10);
    let to = parseInt(m2[2], 10);
    if (from < 50) from += 2000; else from += 1900;
    if (to < 50) to += 2000; else to += 1900;
    return { from, to };
  }

  // Pattern 3: "2009-" or "2015- " (open-ended)
  const m3 = d.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*[;\)\s]/);
  if (m3) {
    return { from: parseInt(m3[1], 10), to: null };
  }

  // Pattern 4: "2015;" or " 2016 " or "(2017)"
  const m4 = d.match(/(?:^|\s|\()(19\d{2}|20\d{2})(?:\s*[;\)\s]|$)/);
  if (m4) {
    return { from: parseInt(m4[1], 10), to: null };
  }

  return { from: null, to: null };
}

function parseGenerationFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  // VW: T1-T6
  const vw = desc.match(/\b(T[1-6])\b/i);
  if (vw) return vw[1].toUpperCase();
  // BMW: E30, E36, E46, E90, F30, G20
  const bmw = desc.match(/\b(E30|E36|E46|E90|F30|G20)\b/i);
  if (bmw) return bmw[1].toUpperCase();
  // Mercedes: W201, W202, W203, W204, W205, W206
  const merc = desc.match(/\b(W20[1-6])\b/i);
  if (merc) return merc[1].toUpperCase();
  // Audi: B8, B9, 8V, 8Y
  const audi = desc.match(/\b(B[89]|8[VY])\b/i);
  if (audi) return audi[1].toUpperCase();
  // Ford Focus: MK3, MK4
  const ford = desc.match(/\b(MK\s*[34])\b/i);
  if (ford) return ford[1].toUpperCase();
  // Volvo: P3, SPA
  const volvo = desc.match(/\b(P3|SPA)\b/i);
  if (volvo) return volvo[1].toUpperCase();
  // Generic: MK I, MK II, GENERATION 1
  const generic = desc.match(/\b(MK\s*[IVX]+|SERIES\s+[A-Z]\d*|GENERATION\s+\d+)\b/i);
  if (generic) return generic[1].toUpperCase();
  return null;
}

function expectedGeneration(brand: string, model: string, year: number): string | null {
  const key = `${brand} ${model}`.toLowerCase();
  // VW Transporter generations
  if (key.includes("volkswagen") && key.includes("transporter")) {
    if (year <= 1991) return "T3";
    if (year <= 2003) return "T4";
    if (year <= 2015) return "T5";
    return "T6";
  }
  // BMW 3-series generations
  if (key.includes("bmw") && (key.includes("3") || key.includes("tre"))) {
    if (year <= 1990) return "E30";
    if (year <= 2000) return "E36";
    if (year <= 2006) return "E46";
    if (year <= 2012) return "E90";
    if (year <= 2018) return "F30";
    return "G20";
  }
  // BMW 5-series
  if (key.includes("bmw") && (key.includes("5") || key.includes("fem"))) {
    if (year <= 1995) return "E34";
    if (year <= 2003) return "E39";
    if (year <= 2010) return "E60";
    if (year <= 2016) return "F10";
    return "G30";
  }
  // Mercedes C-Class
  if (key.includes("mercedes") && (key.includes("c") || key.includes("190"))) {
    if (year <= 1993) return "W201";
    if (year <= 2000) return "W202";
    if (year <= 2007) return "W203";
    if (year <= 2014) return "W204";
    if (year <= 2021) return "W205";
    return "W206";
  }
  // Mercedes E-Class
  if (key.includes("mercedes") && (key.includes("e") || key.includes("klasse"))) {
    if (year <= 1995) return "W124";
    if (year <= 2002) return "W210";
    if (year <= 2009) return "W211";
    if (year <= 2016) return "W212";
    return "W213";
  }
  // Audi A3
  if (key.includes("audi") && key.includes("3")) {
    if (year <= 2003) return "8L";
    if (year <= 2012) return "8P";
    if (year <= 2020) return "8V";
    return "8Y";
  }
  // Audi A4
  if (key.includes("audi") && key.includes("4")) {
    if (year <= 2000) return "B5";
    if (year <= 2004) return "B6";
    if (year <= 2008) return "B7";
    if (year <= 2015) return "B8";
    return "B9";
  }
  // Volvo V70
  if (key.includes("volvo") && key.includes("70")) {
    if (year <= 2000) return "P80";
    if (year <= 2007) return "P2";
    return "P3";
  }
  // Volvo XC60
  if (key.includes("volvo") && key.includes("xc60")) {
    if (year <= 2017) return "P3";
    return "SPA";
  }
  // Volvo XC90
  if (key.includes("volvo") && key.includes("xc90")) {
    if (year <= 2014) return "P2";
    return "SPA";
  }
  // Ford Focus
  if (key.includes("ford") && key.includes("focus")) {
    if (year <= 2004) return "Mk1";
    if (year <= 2010) return "Mk2";
    if (year <= 2018) return "Mk3";
    return "Mk4";
  }
  // Nissan Qashqai
  if (key.includes("nissan") && key.includes("qashqai")) {
    if (year <= 2013) return "J10";
    if (year <= 2021) return "J11";
    return "J12";
  }
  // Mazda 3
  if (key.includes("mazda") && key.includes("3")) {
    if (year <= 2008) return "BK";
    if (year <= 2013) return "BL";
    if (year <= 2018) return "BM";
    return "BP";
  }
  // Skoda Octavia
  if (key.includes("skoda") && key.includes("octavia")) {
    if (year <= 2004) return "1U";
    if (year <= 2012) return "1Z";
    if (year <= 2020) return "5E";
    return "NX";
  }
  return null;
}

// ============================================================================
// VIN DECODING
// ============================================================================

function decodeVwTransporterBody(vin: string, lengthMm?: number): { generation: string; body: string; wheelbase: string; roof?: string } | null {
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
function decodeBmwVin(vin: string): { series: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WB")) return null; // BMW WMI
  const modelCode = vin.slice(3, 7).toUpperCase(); // Positions 4-7
  // BMW F30 3-series: 3V51, 3V52, etc.
  // BMW G20 3-series: 3V31, 3V32, etc.
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
function decodeMercedesVin(vin: string): { class: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WD")) return null;
  const classCode = vin.slice(3, 6).toUpperCase();
  // WDD205 = C-Class W205
  if (classCode.startsWith("205")) return { class: "C", generation: "W205", body: "sedan" };
  if (classCode.startsWith("206")) return { class: "C", generation: "W206", body: "sedan" };
  if (classCode.startsWith("204")) return { class: "C", generation: "W204", body: "sedan" };
  if (classCode.startsWith("213")) return { class: "E", generation: "W213", body: "sedan" };
  if (classCode.startsWith("212")) return { class: "E", generation: "W212", body: "sedan" };
  return { class: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Audi VIN (WAU/WAU prefix) */
function decodeAudiVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (!wmi.startsWith("WA")) return null;
  const modelCode = vin.slice(3, 7).toUpperCase();
  // Audi A4 B8: 8K2, 8K5
  // Audi A4 B9: 8W2, 8W5
  if (modelCode.startsWith("8K")) return { model: "A4", generation: "B8", body: "sedan" };
  if (modelCode.startsWith("8W")) return { model: "A4", generation: "B9", body: "sedan" };
  // Audi A3 8V
  if (modelCode.startsWith("8V")) return { model: "A3", generation: "8V", body: "hatch" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Ford VIN (WF0 prefix) */
function decodeFordVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (wmi !== "WF0" && wmi !== "1FT" && wmi !== "3FA") return null;
  const modelCode = vin.slice(5, 7).toUpperCase();
  // Ford Focus Mk3: P1
  // Ford Focus Mk4: H1
  if (modelCode === "P1") return { model: "Focus", generation: "Mk3", body: "hatch" };
  if (modelCode === "H1") return { model: "Focus", generation: "Mk4", body: "hatch" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Hyundai/Kia VIN */
function decodeHyundaiVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Hyundai WMI: KMx, MEx, NLx, TMA
  // Kia WMI: KNx, MEx, NLx
  if (!wmi.startsWith("KM") && !wmi.startsWith("KN") && !wmi.startsWith("ME") && !wmi.startsWith("NL") && !wmi.startsWith("TMA")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  // Hyundai i30 GD = HDE
  // Hyundai i30 PD = PDE
  if (modelCode === "HD") return { model: "i30", generation: "GD", body: "hatch" };
  if (modelCode === "PD") return { model: "i30", generation: "PD", body: "hatch" };
  return { model: "unknown", generation: "unknown", body: "hatch" };
}

/** Decode Toyota VIN */
function decodeToyotaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Toyota WMI: JTD, JT1, JT2, JT3, JT5, JT6, NMT, SB1
  if (!wmi.startsWith("JT") && !wmi.startsWith("NMT") && !wmi.startsWith("SB1")) return null;
  const modelCode = vin.slice(3, 6).toUpperCase();
  // Toyota Corolla E210: ZRE21, ZWE21
  // Toyota Corolla E180: ZRE18
  if (modelCode.startsWith("ZRE21") || modelCode.startsWith("ZWE21")) return { model: "Corolla", generation: "E210", body: "sedan" };
  if (modelCode.startsWith("ZRE18")) return { model: "Corolla", generation: "E180", body: "sedan" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Volvo VIN (YV1, YV2, YV3, LVY, MHY) */
function decodeVolvoVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 7) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Volvo WMI: YV1/YV2/YV3 (USA/Sverige), LVY (Belgia), MHY (Malaysia)
  if (!wmi.startsWith("YV") && !wmi.startsWith("LVY") && !wmi.startsWith("MHY")) return null;
  const seriesCode = vin.slice(3, 5).toUpperCase();
  // Volvo model codes: https://www.volvoclub.org.uk/tech/VIN_A.shtml
  // S60 = RS, S80 = TS, V70 = SW, XC60 = DZ, XC90 = CZ
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
function decodeNissanVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Nissan WMI: SJN (UK), MNT (Thailand), MLH (Thailand), MMB (Thailand), JN1/JN6 (Japan)
  if (!wmi.startsWith("SJN") && !wmi.startsWith("MNT") && !wmi.startsWith("MLH") && !wmi.startsWith("MMB") && !wmi.startsWith("JN")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  // Nissan Qashqai J11 = J11, Leaf ZE = ZE
  if (modelCode === "J1") return { model: "Qashqai", generation: "J11", body: "suv" };
  if (modelCode === "ZE") return { model: "Leaf", generation: "ZE1", body: "hatch" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Mazda VIN (JM1, JM6, JM7, JM0, 3MZ) */
function decodeMazdaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Mazda WMI: JM0/JM1/JM6/JM7 (Japan), 3MZ (Mexico)
  if (!wmi.startsWith("JM") && !wmi.startsWith("3MZ")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  // Mazda 3 BM/BN = BM, Mazda 6 GJ = GJ, CX-5 KE/KF = KE
  if (modelCode === "BM" || modelCode === "BN") return { model: "3", generation: "BM", body: "hatch" };
  if (modelCode === "GJ") return { model: "6", generation: "GJ", body: "sedan" };
  if (modelCode === "KE" || modelCode === "KF") return { model: "CX-5", generation: "KE", body: "suv" };
  return { model: "unknown", generation: "unknown", body: "sedan" };
}

/** Decode Skoda VIN (TMB, TMJ, TMK, WVW) */
function decodeSkodaVin(vin: string): { model: string; generation: string; body: string } | null {
  if (!vin || vin.length < 6) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  // Skoda WMI: TMB/TMJ/TMK (Tsjekkia), WVW (Tyskland - noen Skoda)
  if (!wmi.startsWith("TM") && !wmi.startsWith("WVW")) return null;
  const modelCode = vin.slice(3, 5).toUpperCase();
  // Skoda Octavia 3 = 5E, Superb 3 = 3V, Fabia = 6Y/NJ
  if (modelCode === "5E" || modelCode === "NX") return { model: "Octavia", generation: "3", body: "wagon" };
  if (modelCode === "3V" || modelCode === "3T") return { model: "Superb", generation: "3", body: "sedan" };
  return { model: "unknown", generation: "unknown", body: "hatch" };
}

/** Extract model year from VIN position 10 (valid for all manufacturers, 1980+) */
function decodeVinModelYear(vin: string): number | null {
  if (!vin || vin.length < 10) return null;
  const yearChar = vin[9].toUpperCase();
  // VIN model year mapping (cycles every 30 years)
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
function decodeVin(vin: string, lengthMm?: number): { make: string; generation: string; body: string; wheelbase?: string; modelYear?: number } | null {
  if (!vin || vin.length < 8) return null;
  const wmi = vin.slice(0, 3).toUpperCase();

  // VW Transporter
  if (wmi === "WV1" || wmi === "WV2") {
    const result = decodeVwTransporterBody(vin, lengthMm);
    if (result) return { make: "volkswagen", generation: result.generation, body: result.body, wheelbase: result.wheelbase, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // BMW
  if (wmi.startsWith("WB")) {
    const result = decodeBmwVin(vin);
    if (result) return { make: "bmw", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Mercedes
  if (wmi.startsWith("WD")) {
    const result = decodeMercedesVin(vin);
    if (result) return { make: "mercedes", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Audi
  if (wmi.startsWith("WA")) {
    const result = decodeAudiVin(vin);
    if (result) return { make: "audi", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Ford
  if (wmi === "WF0" || wmi.startsWith("1FT") || wmi.startsWith("3FA")) {
    const result = decodeFordVin(vin);
    if (result) return { make: "ford", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Hyundai/Kia
  if (wmi.startsWith("KM") || wmi.startsWith("KN") || wmi.startsWith("ME") || wmi.startsWith("NL") || wmi.startsWith("TMA")) {
    const result = decodeHyundaiVin(vin);
    if (result) return { make: "hyundai", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Toyota
  if (wmi.startsWith("JT") || wmi.startsWith("NMT") || wmi.startsWith("SB1")) {
    const result = decodeToyotaVin(vin);
    if (result) return { make: "toyota", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Volvo
  if (wmi.startsWith("YV") || wmi.startsWith("LVY") || wmi.startsWith("MHY")) {
    const result = decodeVolvoVin(vin);
    if (result) return { make: "volvo", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Nissan
  if (wmi.startsWith("SJN") || wmi.startsWith("MNT") || wmi.startsWith("MLH") || wmi.startsWith("MMB") || wmi.startsWith("JN")) {
    const result = decodeNissanVin(vin);
    if (result) return { make: "nissan", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Mazda
  if (wmi.startsWith("JM") || wmi.startsWith("3MZ")) {
    const result = decodeMazdaVin(vin);
    if (result) return { make: "mazda", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  // Skoda
  if (wmi.startsWith("TM") || wmi.startsWith("WVW")) {
    const result = decodeSkodaVin(vin);
    if (result) return { make: "skoda", generation: result.generation, body: result.body, modelYear: decodeVinModelYear(vin) || undefined };
  }

  return null;
}

/** Infer body variant from SVV data (length, seats, GVWR) */
function inferBodyFromSvvData(vehicle: TecdocVehicle): { wheelbase?: string; bodyType?: string; variant?: string } {
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
function scoreBodyCompatibility(
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

function modelMatches(vehicleModel: string, recordModel: string | null, vehicleMake?: string): boolean {
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

function yearCompatible(record: GlassRecord, vehicleYear: number, vehicleMake: string, vehicleModel: string): boolean {
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

function inferGenerationFromYearRange(brand: string, model: string, from: number, to: number): string | null {
  const key = `${brand} ${model}`.toLowerCase();
  if (key.includes("volkswagen") && key.includes("transporter")) {
    if (to <= 1991) return "T3";
    if (from >= 1990 && to <= 2003) return "T4";
    if (from >= 2003 && to <= 2015) return "T5";
    if (from >= 2015) return "T6";
  }
  if (key.includes("bmw") && (key.includes("3") || key.includes("tre"))) {
    if (to <= 1990) return "E30";
    if (from >= 1990 && to <= 2000) return "E36";
    if (from >= 1998 && to <= 2006) return "E46";
    if (from >= 2005 && to <= 2012) return "E90";
    if (from >= 2011 && to <= 2018) return "F30";
    if (from >= 2018) return "G20";
  }
  if (key.includes("mercedes") && (key.includes("c") || key.includes("190"))) {
    if (to <= 1993) return "W201";
    if (from >= 1993 && to <= 2000) return "W202";
    if (from >= 2000 && to <= 2007) return "W203";
    if (from >= 2007 && to <= 2014) return "W204";
    if (from >= 2014 && to <= 2021) return "W205";
    if (from >= 2021) return "W206";
  }
  return null;
}

// ============================================================================
// MAIN SEARCH
// ============================================================================

/**
 * Result shape: includes httpStatus so the HTTP handler can return the
 * correct status code (200 OK, 404 not found, 503 upstream down, 500 misconfig).
 */
type SearchResult = {
  httpStatus: number;
  retryAfter?: number;
  body: unknown;
};

async function searchByRegnr(regnr: string, env: Env): Promise<SearchResult> {
  // 1. Lookup vehicle via SVV — typed result so we can distinguish auth vs not-found vs upstream
  const svvResult = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
  let source = "svv.enkeltoppslag";

  if (svvResult.status !== "ok") {
    switch (svvResult.status) {
      case "not_configured":
        return {
          httpStatus: 503,
          retryAfter: 3600,
          body: { error: "Kjøretøyoppslag midlertidig utilgjengelig (konfigurasjon)", regnr, code: "svv_not_configured" },
        };
      case "auth_error":
        return {
          httpStatus: 503,
          retryAfter: 3600,
          body: { error: "Kjøretøyoppslag midlertidig utilgjengelig", regnr, code: "svv_auth_error" },
        };
      case "upstream_error":
      case "parse_error":
        return {
          httpStatus: 503,
          retryAfter: 60,
          body: { error: "Kjøretøyoppslag midlertidig utilgjengelig", regnr, code: "svv_upstream_error" },
        };
      case "not_found":
      default:
        return {
          httpStatus: 404,
          body: { error: "Kunne ikke slå opp registreringsnummer", regnr },
        };
    }
  }

  const vehicle: TecdocVehicle = svvResult.vehicle;

  // 2. Lookup Bovsoft kType (cached first, then API)
  let bovsoftVehicle: BovsoftVehicle | null = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
  if (!bovsoftVehicle && env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE && env.BOVSOFT_CLIENT_ID !== "NOT_SET") {
    bovsoftVehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);
    if (bovsoftVehicle) {
      await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, bovsoftVehicle);
    }
  }

  // Cross-validate: if Bovsoft brand differs from SVV, log and prefer SVV
  if (bovsoftVehicle && bovsoftVehicle.brand && vehicle.make) {
    const bovBrand = bovsoftVehicle.brand.toLowerCase().replace(/[^a-z]/g, "");
    const svvBrand = vehicle.make.toLowerCase().replace(/[^a-z]/g, "");
    if (bovBrand !== svvBrand && !bovBrand.includes(svvBrand) && !svvBrand.includes(bovBrand)) {
      console.warn(`Brand mismatch for ${regnr}: SVV=${vehicle.make}, Bovsoft=${bovsoftVehicle.brand}`);
    }
  }

  // Merge kType into vehicle if available
  if (bovsoftVehicle && bovsoftVehicle.ktype > 0) {
    vehicle.k_type = bovsoftVehicle.ktype;
  }

  // 3. Find matching glass in D1
  const db = env.GLASS_CATALOG_D1;
  const candidates: GlassRecord[] = [];
  let layer = 4;
  let confidence: string = "none";

  // === Layer 0: kType exact match (statistical learning) ===
  if (vehicle.k_type > 0) {
    // First: direct kType lookup in catalog (if ktype column is populated)
    const ktypeDirect = await queryByKtype(db, vehicle.k_type);
    if (ktypeDirect.length > 0) {
      candidates.push(...ktypeDirect);
      layer = 0;
      confidence = "exact";
    }

    // Second: statistical mapping from learned data — only trust if seen enough times
    if (candidates.length === 0) {
      const ktypeMappings = await queryKtypeMapping(db, vehicle.k_type);
      if (ktypeMappings.length > 0) {
        const topMapping = ktypeMappings[0];
        if (topMapping.frequency >= KTYPE_CONFIDENCE_THRESHOLD) {
          const mappedRecord = await queryByEurocode(db, topMapping.eurocode);
          if (mappedRecord) {
            candidates.push(mappedRecord);
            layer = 0;
            // 'exact' only when overwhelming evidence (10+ hits); 'high' otherwise
            confidence = topMapping.frequency >= 10 ? "exact" : "high";
          }
        }
        // Below threshold — don't poison the result, let Layer 1-4 handle it
      }
    }
  }

  // === Layer 1-3: brand + model + year matching ===
  if (candidates.length === 0) {
    let modelHint = vehicle.model.length >= 3 ? vehicle.model.toLowerCase() : undefined;
    let extraHints: string[] | undefined;
    if (vehicle.make.toLowerCase().includes("volkswagen")) {
      const vwVariants = ["transporter", "multivan", "caravelle", "california"];
      if (vwVariants.some((v) => vehicle.model.toLowerCase().includes(v))) {
        extraHints = vwVariants.filter((v) => !vehicle.model.toLowerCase().includes(v));
      }
    }

    const l1 = await queryByBrandAndYear(db, vehicle.make, vehicle.year, modelHint);
    let l1Extra: GlassRecord[] = [];
    if (extraHints) {
      for (const hint of extraHints) {
        const extra = await queryByBrandAndYear(db, vehicle.make, vehicle.year, hint);
        l1Extra.push(...extra);
      }
    }
    const l1All = [...l1, ...l1Extra];
    const seen = new Set<string>();
    const l1Deduped = l1All.filter((r) => { if (seen.has(r.eurocode)) return false; seen.add(r.eurocode); return true; });

    const l1Compatible = l1Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
    const l1Model = l1Compatible.filter((r) => modelMatches(vehicle.model, r.model, vehicle.make));

    if (l1Model.length > 0) {
      candidates.push(...l1Model);
      layer = 1;
      confidence = "high";
    } else if (l1Compatible.length > 0) {
      candidates.push(...l1Compatible);
      layer = 2;
      confidence = "medium";
    } else {
      const l3 = await queryByBrandOnly(db, vehicle.make, modelHint);
      let l3Extra: GlassRecord[] = [];
      if (extraHints) {
        for (const hint of extraHints) {
          const extra = await queryByBrandOnly(db, vehicle.make, hint);
          l3Extra.push(...extra);
        }
      }
      const l3All = [...l3, ...l3Extra];
      const seen3 = new Set<string>();
      const l3Deduped = l3All.filter((r) => { if (seen3.has(r.eurocode)) return false; seen3.add(r.eurocode); return true; });
      const l3Compatible = l3Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
      if (l3Compatible.length > 0) {
        candidates.push(...l3Compatible);
        layer = 3;
        confidence = "medium";
      }
    }
  }

  // Decode VIN for all supported makes
  const vinInfo = vehicle.vin ? decodeVwTransporterBody(vehicle.vin, vehicle.length) : null;
  const unifiedVin = vehicle.vin ? decodeVin(vehicle.vin, vehicle.length) : null;
  const svvBody = inferBodyFromSvvData(vehicle);

  // Fetch equipment from Biluppgitter (Bovsoft does not return equipment)
  let factoryEquipment: FactoryEquipment | null = null;
  if (env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET") {
    factoryEquipment = await fetchBiluppgifterEquipment(regnr, env.BILUPPGIFTER_API_KEY);
  }

  // Equipment flags from vehicle
  const vehicleFlags: ReturnType<typeof detectFlagsFromOem> = factoryEquipment
    ? {
        adas: factoryEquipment.adas,
        rainSensor: factoryEquipment.rainSensor,
        heated: factoryEquipment.heated,
        acoustic: factoryEquipment.acoustic,
        antenna: factoryEquipment.antenna,
        camera: factoryEquipment.camera,
        hud: factoryEquipment.hud,
      }
    : {
        adas: false,
        rainSensor: false,
        heated: false,
        acoustic: false,
        antenna: false,
        camera: false,
        hud: false,
      };

  // Score and sort (with body compatibility + equipment + kType verification)
  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, vehicleFlags, vehicle, vinInfo, bovsoftVehicle || undefined, unifiedVin || undefined) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c);

  const candidatesWithEquipment = scored.slice(0, 10).map((c) => ({
    ...c,
    _equipment: inferRecordEquipment(c),
  }));

  // Determine confidence level
  const topCandidate = candidatesWithEquipment[0];
  if (factoryEquipment && topCandidate && confidence !== "exact") {
    const topEq = inferRecordEquipment(topCandidate);
    const allMatch =
      factoryEquipment.adas === topEq.adas &&
      factoryEquipment.rainSensor === topEq.rainSensor &&
      factoryEquipment.heated === topEq.heated &&
      factoryEquipment.acoustic === topEq.acoustic &&
      factoryEquipment.antenna === topEq.antenna &&
      factoryEquipment.camera === topEq.camera &&
      factoryEquipment.hud === topEq.hud;
    if (allMatch && confidence === "high") {
      confidence = "exact";
    }
  }

  // Save kType→eurocode mapping for statistical learning
  if (vehicle.k_type > 0 && topCandidate) {
    // GDPR-safe: regnr is NOT passed — we aggregate (ktype, eurocode) frequencies only
    await insertKtypeMatch(db, vehicle.k_type, topCandidate.eurocode);
  }

  return {
    httpStatus: 200,
    body: {
      vehicle: {
        regnr: vehicle.regno,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        kType: vehicle.k_type,
        typeCode: vehicle.typeCode,
        length: vehicle.length,
        fuelCode: vehicle.fuelCode,
        engineCode: vehicle.engineCode,
        seats: vehicle.seats,
        gvwr: vehicle.gvwr,
        vinDecode: vinInfo,
        unifiedVin,
        svvBody,
        bovsoft: bovsoftVehicle
          ? {
              ktype: bovsoftVehicle.ktype,
              brand: bovsoftVehicle.brand,
              model: bovsoftVehicle.model,
              yearFrom: bovsoftVehicle.yearFrom,
              yearTo: bovsoftVehicle.yearTo,
              body: bovsoftVehicle.body,
            }
          : null,
        factoryEquipment: factoryEquipment
          ? {
              rainSensor: factoryEquipment.rainSensor,
              heated: factoryEquipment.heated,
              acoustic: factoryEquipment.acoustic,
              adas: factoryEquipment.adas,
              camera: factoryEquipment.camera,
              antenna: factoryEquipment.antenna,
              hud: factoryEquipment.hud,
              source: factoryEquipment.source,
            }
          : null,
      },
      candidates: candidatesWithEquipment,
      confidence,
      layer,
      sources: [source, bovsoftVehicle ? "bovsoft" : "none", factoryEquipment?.source || "none"],
    },
  };
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    // Rate limiting
    if (!(await checkRateLimit(env.GLASS_CATALOG_D1, clientIp))) {
      return errorResponse("For mange forespørsler. Prøv igjen om et minutt.", 429);
    }

    // Health check
    if (path === "/api/health") {
      const stats = await getCatalogStats(env.GLASS_CATALOG_D1);
      const svvConfigured = !!(env.SVV_API_KEY && env.SVV_API_KEY !== "NOT_SET");
      const bovsoftConfigured = !!(env.BOVSOFT_CLIENT_ID && env.BOVSOFT_CLIENT_ID !== "NOT_SET");
      const biluppgifterConfigured = !!(env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET");
      return jsonResponse({
        status: "ok",
        version: "2.1",
        catalogSize: stats.total,
        brands: stats.brands,
        d1Configured: true,
        svvConfigured,
        bovsoftConfigured,
        biluppgifterConfigured,
        timestamp: new Date().toISOString(),
      });
    }

    // Glass search
    if (path === "/api/glass") {
      const regnr = url.searchParams.get("regnr");
      const prefix4 = url.searchParams.get("prefix4");
      const eurocode = url.searchParams.get("eurocode");

      if (regnr) {
        // Cache hit — always 200 (we only cache successful lookups)
        const cache = await getCache<unknown>(env.GLASS_CATALOG, cacheKey("glass", { regnr }));
        if (cache) return jsonResponse(cache);

        const result = await searchByRegnr(regnr, env);
        // Only cache successful 200 responses; never cache errors (auth/upstream/not_found)
        if (result.httpStatus === 200) {
          await setCache(env.GLASS_CATALOG, cacheKey("glass", { regnr }), result.body, 300);
        }
        const extraHeaders: Record<string, string> = {};
        if (result.retryAfter) extraHeaders["Retry-After"] = String(result.retryAfter);
        return jsonResponse(result.body, result.httpStatus, extraHeaders);
      }

      if (prefix4) {
        const cache = await getCache(env.GLASS_CATALOG, cacheKey("glass", { prefix4 }));
        if (cache) return jsonResponse(cache);

        const results = await queryByPrefix4(env.GLASS_CATALOG_D1, prefix4);
        const data = { query: { prefix4 }, count: results.length, results };
        await setCache(env.GLASS_CATALOG, cacheKey("glass", { prefix4 }), data, 3600);
        return jsonResponse(data);
      }

      if (eurocode) {
        const cache = await getCache(env.GLASS_CATALOG, cacheKey("glass", { eurocode }));
        if (cache) return jsonResponse(cache);

        const result = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
        const data = { query: { eurocode }, count: result ? 1 : 0, results: result ? [result] : [] };
        await setCache(env.GLASS_CATALOG, cacheKey("glass", { eurocode }), data, 3600);
        return jsonResponse(data);
      }

      return errorResponse("Mangler parameter: regnr, prefix4 eller eurocode");
    }

    // Catalog metadata endpoints
    if (path === "/api/catalog/brands") {
      const cache = await getCache(env.GLASS_CATALOG, "catalog:brands");
      if (cache) return jsonResponse(cache);
      const brands = await getBrandsWithCount(env.GLASS_CATALOG_D1);
      await setCache(env.GLASS_CATALOG, "catalog:brands", { brands }, 3600);
      return jsonResponse({ brands });
    }

    if (path === "/api/catalog/categories") {
      const cache = await getCache(env.GLASS_CATALOG, "catalog:categories");
      if (cache) return jsonResponse(cache);
      const categories = await getCategoriesWithCount(env.GLASS_CATALOG_D1);
      await setCache(env.GLASS_CATALOG, "catalog:categories", { categories }, 3600);
      return jsonResponse({ categories });
    }

    if (path === "/api/catalog/search") {
      const q = url.searchParams.get("q") || "";
      const brand = url.searchParams.get("brand") || undefined;
      const category = url.searchParams.get("category") || undefined;
      const yearMin = url.searchParams.get("yearMin") ? parseInt(url.searchParams.get("yearMin")!, 10) : undefined;
      const yearMax = url.searchParams.get("yearMax") ? parseInt(url.searchParams.get("yearMax")!, 10) : undefined;
      const results = await searchCatalog(env.GLASS_CATALOG_D1, q, { brand, category, yearMin, yearMax });
      return jsonResponse({ query: q, count: results.length, results });
    }

    // ── Auth: /api/me ──────────────────────────────────────────────────────
    if (path === "/api/me") {
      const email = request.headers.get("CF-Access-Authenticated-User-Email");
      if (!email) {
        return jsonResponse({ authenticated: false }, 401);
      }
      return jsonResponse({ authenticated: true, email });
    }

    // ── Quote Request: POST /api/quote-request ─────────────────────────────
    if (path === "/api/quote-request" && request.method === "POST") {
      try {
        const body = await request.json() as {
          email?: string;
          eurocode?: string;
          regnr?: string;
          quantity?: number;
          message?: string;
        };
        if (!body.email || !body.eurocode) {
          return errorResponse("Mangler påkrevde felt: email, eurocode");
        }
        const db = env.GLASS_CATALOG_D1;
        await db.prepare(
          `INSERT INTO quote_requests (email, eurocode, regnr, quantity, message, created_at, status)
           VALUES (?, ?, ?, ?, ?, datetime('now'), 'new')`
        ).bind(
          body.email,
          body.eurocode,
          body.regnr || null,
          body.quantity || 1,
          body.message || null
        ).run();
        return jsonResponse({ success: true, message: "Forespørsel mottatt" });
      } catch (e) {
        return errorResponse("Kunne ikke lagre forespørsel: " + (e as Error).message, 500);
      }
    }

    // ── Admin: GET /api/admin/quotes ───────────────────────────────────────
    if (path === "/api/admin/quotes" && request.method === "GET") {
      const email = request.headers.get("CF-Access-Authenticated-User-Email");
      if (!email) {
        return errorResponse("Krever innlogging", 401);
      }
      try {
        const { results } = await env.GLASS_CATALOG_D1
          .prepare("SELECT * FROM quote_requests ORDER BY created_at DESC LIMIT 200")
          .all();
        return jsonResponse({ quotes: results || [] });
      } catch (e) {
        return errorResponse("Kunne ikke hente forespørsler: " + (e as Error).message, 500);
      }
    }

    return errorResponse("Ukjent endepunkt", 404);
  },
};
