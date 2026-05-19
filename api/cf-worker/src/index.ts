/**
 * Autoglass AS — Cloudflare Worker API v2 (D1-optimized)
 * =======================================================
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
 */

export interface Env {
  GLASS_CATALOG: KVNamespace;
  GLASS_CATALOG_D1: D1Database;
  BILUPPGIFTER_API_KEY: string;
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
// RATE LIMITING
// ============================================================================

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `rate:${ip}`;
  const count = parseInt((await kv.get(key)) || "0", 10);
  if (count > 120) return false; // 120 req/min
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
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

async function fetchSvvEnkeltoppslag(regnr: string, apiKey: string): Promise<TecdocVehicle | null> {
  if (!apiKey || apiKey === "NOT_SET") return null;
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
    if (!res.ok) return null;
    const data = (await res.json()) as SvvKjoretoyData;
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
    };
  } catch {
    return null;
  }
}

// ============================================================================
// BILUPPGIFTER EQUIPMENT LOOKUP (Stub — ready for integration after API call)
// ============================================================================

interface BiluppgifterEquipment {
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  adas: boolean;
  hud: boolean;
}

/**
 * Fetch factory equipment data from Biluppgifter API.
 * Called AFTER the user gets a working API key from Biluppgifter tomorrow.
 *
 * Endpoint: GET /api/v1/vehicle-configurator/regno/{regno}?country_code=NO
 * Returns factory options like "Automatiska vindrutetorkare" (rain sensor),
 * "Akustikglas" (acoustic glass), etc.
 *
 * Alternative: /api/v1/oem2/vin/{vin} returns eq_code + description pairs.
 */
async function fetchBiluppgifterEquipment(
  regno: string,
  apiKey: string
): Promise<BiluppgifterEquipment | null> {
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

    if (!res.ok) {
      // Try OEM2 VIN endpoint as fallback
      return null;
    }

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
    adas: /\b(ADAS|FILSKIFTE|LANE ASSIST|COLLISION|AUTO BRAKE)\b/.test(d),
    rainSensor: /\b(RSN|RSNL|RSNLSN|RAIN SENSOR|REGN SENSOR)\b/.test(d),
    heated: /\b(HTD|HEATED|OPPVARM|VARME|DEFROST)\b/.test(d),
    acoustic: /\b(ACO|ACOUSTIC|AKUSTISK|QUIET|STØYDEMP)\b/.test(d),
    antenna: /\b(ANT|ANTENNA|ANTENNE|GPS|RADIO|FM|DAB)\b/.test(d),
    camera: /\b(CAMERA|CAM|KAMERA|SENSOR)\b/.test(d),
    hud: /\b(HUD|HEAD.UP|PROJEKSJON)\b/.test(d),
  };
}

/** Legacy OEM-based detection (kept for future Biluppgifter/TecDoc integration) */
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
  vinInfo: ReturnType<typeof decodeVwTransporterBody>
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

  // Body / chassis compatibility (VIN + SVV data)
  score += scoreBodyCompatibility(c, vehicle, vinInfo);

  return score;
}

function parseYearRangeFromDescription(desc: string | null): { from: number | null; to: number | null } {
  if (!desc) return { from: null, to: null };
  // Match patterns like "T3 79-91", "2015", "2009-", "90-03-"
  // Use (^|\s) to ensure we start at a word boundary, not after a dash
  const m = desc.match(/(?:^|\s)(\d{2,4})\s*[-–]\s*(\d{2,4})?\s*(?:[-–])?\s*[;\)]/);
  if (m) {
    let from = parseInt(m[1], 10);
    let to = m[2] ? parseInt(m[2], 10) : null;
    // Handle 2-digit years
    if (from < 50) from += 2000;
    else if (from < 100) from += 1900;
    if (to !== null) {
      if (to < 50) to += 2000;
      else if (to < 100) to += 1900;
    }
    return { from, to };
  }
  // Single year like "2015;" or " 2016 "
  const m2 = desc.match(/(?:^|\s)(19\d{2}|20\d{2})(?:\s*[;\)])/);
  if (m2) {
    return { from: parseInt(m2[1], 10), to: null };
  }
  return { from: null, to: null };
}

function parseGenerationFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const m = desc.match(/\b(T[1-6]|MK\s*[IVX]+|SERIES\s+[A-Z]\d*|GENERATION\s+\d+)\b/i);
  return m ? m[1].toUpperCase() : null;
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
  return null;
}

function decodeVwTransporterBody(vin: string, lengthMm?: number): { generation: string; body: string; wheelbase: string; roof?: string } | null {
  if (!vin || vin.length < 8) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  if (wmi !== "WV1" && wmi !== "WV2") return null;
  // VW T5/T6 VIN: WV1ZZZ7H... where 7H/7J/7E/7F/7L is body code
  // VDS positions 4-9: ZZZ7H (position 7=7, position 8=H/J/E/F/L)
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
  // Determine generation from position 10 (model year character)
  const yearChar = vin.length >= 10 ? vin[9].toUpperCase() : "";
  let generation = "T5";
  if (yearChar >= "G" && yearChar <= "L") generation = "T5"; // 2005-2015
  if (yearChar >= "M") generation = "T6"; // 2015+

  // SVV length is more reliable than VIN for wheelbase on some EU builds
  // T5 SWB = ~4892mm, LWB = ~5292mm
  let wheelbase = info.wheelbase;
  let roof: string | undefined;
  if (lengthMm && lengthMm > 1000) {
    if (lengthMm >= 5100) {
      wheelbase = "lwb";
    } else if (lengthMm <= 5000) {
      wheelbase = "swb";
    }
    // High roof detection: if description later contains HIGH, mark it
    // (we can't detect roof height from length alone)
  }

  return { generation, body: info.body, wheelbase, roof };
}

/** Infer body variant from SVV data (length, seats, GVWR) */
function inferBodyFromSvvData(vehicle: TecdocVehicle): { wheelbase?: string; bodyType?: string; variant?: string } {
  const result: { wheelbase?: string; bodyType?: string; variant?: string } = {};

  // Wheelbase from length
  if (vehicle.length && vehicle.length > 1000) {
    // VW T5/T6: SWB ~4890mm, LWB ~5290mm
    if (vehicle.length >= 5100) result.wheelbase = "lwb";
    else if (vehicle.length <= 5000) result.wheelbase = "swb";
  }

  // Body type from seats
  if (vehicle.seats) {
    if (vehicle.seats <= 3) result.bodyType = "van";
    else if (vehicle.seats <= 6) result.bodyType = "kombi"; // or double cab
    else if (vehicle.seats >= 7) result.bodyType = "passenger"; // caravelle/multivan
  }

  // Variant hints from GVWR
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

  // ── Wheelbase matching ──
  if (svvBody.wheelbase || vinInfo?.wheelbase) {
    const wb = svvBody.wheelbase || vinInfo?.wheelbase;
    if (wb === "lwb") {
      if (desc.includes("lwb") || desc.includes("lang")) score += 15;
      else if (desc.includes("swb") || desc.includes("kort")) score -= 15;
      // If no wheelbase mentioned, neutral (many parts fit both)
    } else if (wb === "swb") {
      if (desc.includes("swb") || desc.includes("kort")) score += 10;
      else if (desc.includes("lwb") || desc.includes("lang")) score -= 15;
    }
  }

  // ── Body type matching ──
  if (svvBody.bodyType) {
    if (svvBody.bodyType === "van" && (desc.includes("van") || desc.includes("kasse"))) score += 10;
    if (svvBody.bodyType === "passenger" && (desc.includes("multivan") || desc.includes("caravelle"))) score += 10;
    if (svvBody.bodyType === "kombi" && desc.includes("kombi")) score += 10;
  }

  // ── Double cab detection ──
  if (vehicle.seats && vehicle.seats >= 5 && vehicle.seats <= 6) {
    if (desc.includes("double cab") || desc.includes("doble cab") || desc.includes("crew")) score += 12;
    // If it clearly says "van" with 2 seats but vehicle has 5+, penalise
    if ((desc.includes("van") || desc.includes("kasse")) && !desc.includes("double") && !desc.includes("crew")) score -= 5;
  }

  // ── High roof ──
  if (vinInfo?.roof === "high" || desc.includes("high")) {
    if (desc.includes("high") && vinInfo?.roof === "high") score += 10;
    else if (desc.includes("high") && vinInfo?.roof !== "high") score -= 8;
  }

  // ── Multivan vs Transporter ──
  if (desc.includes("multivan") && svvBody.bodyType === "van") score -= 5;
  if (desc.includes("transporter") && svvBody.bodyType === "passenger") score -= 3;

  return score;
}

function modelMatches(vehicleModel: string, recordModel: string | null, vehicleMake?: string): boolean {
  if (!recordModel || recordModel.trim() === "") return false;
  const vm = vehicleModel.toLowerCase().trim();
  const rm = recordModel.toLowerCase().trim();
  if (vm.includes(rm) || rm.includes(vm)) return true;

  // VW T5/T6: Transporter, Multivan, Caravelle share many parts
  const make = (vehicleMake || "").toLowerCase();
  if (make.includes("volkswagen")) {
    const vwModels = ["transporter", "multivan", "caravelle", "california"];
    const vmIsVw = vwModels.some((m) => vm.includes(m));
    const rmIsVw = vwModels.some((m) => rm.includes(m));
    if (vmIsVw && rmIsVw) {
      // Both are VW van models — check generation match
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
  // Generation check first (most reliable)
  const expectedGen = expectedGeneration(vehicleMake, vehicleModel, vehicleYear);
  const recordGen = parseGenerationFromDescription(record.description) || parseGenerationFromDescription(record.model);
  if (expectedGen && recordGen) {
    return expectedGen === recordGen;
  }

  // If we know expected generation but record has no generation info,
  // try to infer from year range in description
  if (expectedGen && !recordGen) {
    const yr = parseYearRangeFromDescription(record.description);
    if (yr.from && yr.to) {
      // If the year range clearly belongs to a different generation, reject
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

  // If DB has explicit year range, use strict bounds
  if (record.year_from !== null && record.year_to !== null) {
    return vehicleYear >= record.year_from && vehicleYear <= record.year_to;
  }

  // Parse from description with strict bounds
  const yr = parseYearRangeFromDescription(record.description);
  if (yr.from && yr.to) {
    return vehicleYear >= yr.from && vehicleYear <= yr.to;
  }
  if (yr.from && !yr.to) {
    return vehicleYear >= yr.from;
  }

  // No year info = allow it (can't reject)
  return true;
}

function inferGenerationFromYearRange(brand: string, model: string, from: number, to: number): string | null {
  const key = `${brand} ${model}`.toLowerCase();
  if (key.includes("volkswagen") && key.includes("transporter")) {
    // Check if range overlaps more with one generation
    if (to <= 1991) return "T3";
    if (from >= 1990 && to <= 2003) return "T4";
    if (from >= 2003 && to <= 2015) return "T5";
    if (from >= 2015) return "T6";
  }
  return null;
}

async function searchByRegnr(regnr: string, env: Env): Promise<unknown> {
  // 1. Lookup vehicle via SVV
  let vehicle: TecdocVehicle | null = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
  let source = "svv.enkeltoppslag";

  if (!vehicle) {
    return { error: "Kunne ikke slå opp registreringsnummer", regnr };
  }

  // 2. Find matching glass in D1
  const db = env.GLASS_CATALOG_D1;
  const candidates: GlassRecord[] = [];
  let layer = 4;
  let confidence: string = "none";

  // Try to match by brand + model + year (with year/generation compatibility filter)
  // First: narrow by model name in SQL to avoid huge result sets
  let modelHint = vehicle.model.length >= 3 ? vehicle.model.toLowerCase() : undefined;
  let extraHints: string[] | undefined;
  // VW T5/T6: Transporter, Multivan, Caravelle share parts — search all variants
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
  // Deduplicate by eurocode
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
    // Fallback: broader search without model hint
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

  // Decode VIN for extra matching info (with SVV length override)
  const vinInfo = vehicle.vin ? decodeVwTransporterBody(vehicle.vin, vehicle.length) : null;
  const svvBody = inferBodyFromSvvData(vehicle);

  // Try Biluppgifter for factory equipment data (if key works)
  let biluppgifterEquipment: BiluppgifterEquipment | null = null;
  if (env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET") {
    biluppgifterEquipment = await fetchBiluppgifterEquipment(regnr, env.BILUPPGIFTER_API_KEY);
  }

  // Equipment flags from vehicle — Biluppgifter first, then neutral (no penalty)
  const vehicleFlags: ReturnType<typeof detectFlagsFromOem> = biluppgifterEquipment
    ? {
        adas: biluppgifterEquipment.adas,
        rainSensor: biluppgifterEquipment.rainSensor,
        heated: biluppgifterEquipment.heated,
        acoustic: biluppgifterEquipment.acoustic,
        antenna: biluppgifterEquipment.antenna,
        camera: biluppgifterEquipment.camera,
        hud: biluppgifterEquipment.hud,
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

  // Score and sort (with body compatibility + equipment)
  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, vehicleFlags, vehicle, vinInfo) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c);

  // Attach parsed equipment to each candidate for frontend display
  const candidatesWithEquipment = scored.slice(0, 10).map((c) => ({
    ...c,
    _equipment: inferRecordEquipment(c),
  }));

  return {
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
      svvBody,
    },
    candidates: candidatesWithEquipment,
    confidence,
    layer,
    sources: [source],
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
    if (!(await checkRateLimit(env.GLASS_CATALOG, clientIp))) {
      return errorResponse("For mange forespørsler. Prøv igjen om et minutt.", 429);
    }

    // Health check
    if (path === "/api/health") {
      const stats = await getCatalogStats(env.GLASS_CATALOG_D1);
      const svvConfigured = !!(env.SVV_API_KEY && env.SVV_API_KEY !== "NOT_SET");
      return jsonResponse({
        status: "ok",
        catalogSize: stats.total,
        brands: stats.brands,
        d1Configured: true,
        svvConfigured,
        timestamp: new Date().toISOString(),
      });
    }

    // Glass search
    if (path === "/api/glass") {
      const regnr = url.searchParams.get("regnr");
      const prefix4 = url.searchParams.get("prefix4");
      const eurocode = url.searchParams.get("eurocode");

      if (regnr) {
        // Check cache
        const cache = await getCache(env.GLASS_CATALOG, cacheKey("glass", { regnr }));
        if (cache) return jsonResponse(cache);

        const result = await searchByRegnr(regnr, env);
        await setCache(env.GLASS_CATALOG, cacheKey("glass", { regnr }), result, 300);
        return jsonResponse(result);
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
