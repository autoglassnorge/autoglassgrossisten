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

import { getNagsCodes } from "./nags";
import { lookupNagsByVehicle } from "./nags-by-vehicle";
import { resolveGlass, upsertGlassRule } from "./vin-glass-resolver";
import { handleVinLookup, handleVinLookupStatus } from "./vin-lookup-api";
import { fetchSvvEnkeltoppslag, fetchWithTimeout, SvvFetchResult, SvvKjoretoyData, TecdocVehicle } from "./providers/svv";

export interface Env {
  GLASS_CATALOG: KVNamespace;
  GLASS_CATALOG_D1: D1Database;
  BILUPPGIFTER_API_KEY: string;
  BOVSOFT_CLIENT_ID: string;
  BOVSOFT_SECCODE: string;
  SVV_API_KEY: string;
  RAPIDAPI_KEY?: string; // DEPRECATED: RapidAPI Autoways fjernet 2026-05-21
  VINCARIO_API_KEY?: string;
  VINCARIO_SECRET_KEY?: string;
  MACS_VIS_API_KEY?: string;
  AGM_API_KEY?: string;
}

interface GlassRecord {
  id: number;
  eurocode: string;
  article_number: string | null;
  scan_number: string | null;
  category: string;
  supplier: string | null;
  brand: string;
  model: string | null;
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
  adas_features: string | null;
  price: number | null;
  stock_status: number | null;
  warehouse_location: string | null;
  oem_numbers: string | null;
  cross_references: string | null;
  weight: number | null;
  dimensions: string | null;
  color: string | null;
  solar: number | null;
  tinted: number | null;
  description: string;
  image_url: string | null;
  pdf_url: string | null;
  source: string;
  nags_codes: string | null;
  brand_original: string | null;
  ktype: number | null;
  created_at: string | null;
  typeCode?: string;
  typeCodeDesc?: string;
  position?: "driver" | "passenger" | null;
  nagsCodes?: string[];
}

/** Generate a clean, standardized title from catalog record data */
function generateTitle(r: GlassRecord): string {
  const parts: string[] = [];

  // Brand + Model
  const brandModel = [r.brand, r.model].filter(Boolean).join(' ');
  if (brandModel) parts.push(brandModel);

  // Year range
  if (r.year_from && r.year_to) {
    parts.push(`(${r.year_from}–${r.year_to})`);
  } else if (r.year_from) {
    parts.push(`(fra ${r.year_from})`);
  }

  // Category
  const catMap: Record<string, string> = {
    frontrute: 'Frontrute',
    bakrute: 'Bakrute',
    'dørrute-frem': 'Dørrute fremme',
    'dørrute-bak': 'Dørrute bak',
    siderute: 'Siderute',
    annet: 'Annet glass',
  };
  const cat = catMap[r.category] || r.category;
  if (cat) parts.push('· ' + cat);

  // Color from description
  const d = (r.description || '').toUpperCase();
  const colorParts: string[] = [];
  if (d.includes('SOTE') || d.includes('YP')) colorParts.push('Sotet');
  else if (d.includes('GD') || d.includes('MØRK GRØNN')) colorParts.push('Mørk grønn');
  else if (d.includes('GN') && d.includes('SOLAR')) colorParts.push('Grønn solar');
  else if (d.includes('GN')) colorParts.push('Grønn');
  else if (d.includes('GY') && d.includes('EL')) colorParts.push('Grå m/el');
  else if (d.includes('GY')) colorParts.push('Grå');
  else if (d.includes('GB')) colorParts.push('Grå/blå');
  else if (d.includes('BL') && d.includes('BLÅ')) colorParts.push('Blå');
  else if (d.includes('BL')) colorParts.push('Blå');
  else if (d.includes('BZ') || d.includes('BRONZE')) colorParts.push('Bronze');
  else if (d.includes('CL') || d.includes('KLAR')) colorParts.push('Klar');

  // Equipment
  const eqParts: string[] = [];
  if (r.adas) eqParts.push('ADAS');
  if (r.heated) eqParts.push('Varme');
  if (r.rain_sensor) eqParts.push('Regnsensor');
  if (r.acoustic) eqParts.push('Akustisk');
  if (r.hud) eqParts.push('HUD');
  if (r.camera) eqParts.push('Kamera');

  // Build title
  let title = parts.join(' ');
  if (colorParts.length > 0) {
    title += ' · ' + colorParts.join(', ');
  }
  if (eqParts.length > 0) {
    title += ' · ' + eqParts.join(', ');
  }

  return title || `${r.brand || ''} ${r.model || ''}`.trim() || r.eurocode;
}

/** Generate a standardized human-readable description with full technical details */
function generateDescription(r: GlassRecord): string {
  const parts: string[] = [];
  const d = (r.description || '').toUpperCase();
  const eq = inferRecordEquipment(r);

  // Vehicle info
  const vehicleParts: string[] = [];
  if (r.brand) vehicleParts.push(r.brand);
  if (r.model && r.model !== r.brand) vehicleParts.push(r.model);
  if (r.year_from && r.year_to) {
    vehicleParts.push(`${r.year_from}–${r.year_to}`);
  } else if (r.year_from) {
    vehicleParts.push(`fra ${r.year_from}`);
  }
  if (vehicleParts.length > 0) {
    parts.push('Kjøretøy: ' + vehicleParts.join(' '));
  }

  // Glass type / position
  const positionParts: string[] = [];
  const catMap: Record<string, string> = {
    frontrute: 'Frontrute',
    bakrute: 'Bakrute',
    'dørrute-frem': 'Dørrute fremme',
    'dørrute-bak': 'Dørrute bak',
    siderute: 'Siderute',
    annet: 'Annet glass',
  };
  const cat = catMap[r.category] || r.category;
  if (cat) positionParts.push(cat);

  // Side (VS/HS)
  if (d.includes('VS') || d.includes('VENSTRE')) positionParts.push('venstre side');
  else if (d.includes('HS') || d.includes('HØYRE')) positionParts.push('høyre side');

  // Special variants
  if (d.includes('TODELT')) positionParts.push('todelt');
  if (d.includes('ÅPNB') || d.includes('ÅPNINGSBAR')) positionParts.push('åpningsbar');
  if (d.includes('LAV')) positionParts.push('lav');
  if (d.includes('LANG')) positionParts.push('lang');
  if (d.includes('KORT')) positionParts.push('kort');

  if (positionParts.length > 0) {
    parts.push('Type: ' + positionParts.join(', '));
  }

  // Color
  const colorParts: string[] = [];
  if (d.includes('SOTE') || d.includes('YP')) colorParts.push('Sotet');
  else if (d.includes('GD') || d.includes('MØRK GRØNN')) colorParts.push('Mørk grønn');
  else if (d.includes('GN') && d.includes('SOLAR')) colorParts.push('Grønn solar');
  else if (d.includes('GN')) colorParts.push('Grønn');
  else if (d.includes('GY')) colorParts.push('Grå');
  else if (d.includes('GB')) colorParts.push('Grå/blå');
  else if (d.includes('BL')) colorParts.push('Blå');
  else if (d.includes('BZ') || d.includes('BRONZE')) colorParts.push('Bronze');
  else if (d.includes('CL') || d.includes('KLAR')) colorParts.push('Klar');

  if (colorParts.length > 0) {
    parts.push('Farge: ' + colorParts.join(', '));
  }

  // Equipment
  const equipParts: string[] = [];
  if (r.adas) equipParts.push('ADAS (avansert førerassistanse)');
  if (r.heated) equipParts.push('Elektrisk oppvarming');
  if (r.rain_sensor) equipParts.push('Regnsensor');
  if (r.acoustic) equipParts.push('Akustisk laminert glass');
  if (r.hud) equipParts.push('Head-up display (HUD)');
  if (r.camera) equipParts.push('Kamera (f.eks. filskifteassistanse)');
  if (r.antenna) equipParts.push('Innebygd antenne');
  if (eq.shade) equipParts.push('Solbeskyttelse / privacy');

  if (equipParts.length > 0) {
    parts.push('Utstyr: ' + equipParts.join(', '));
  }

  // Dimensions
  let dims: { width?: number; height?: number; thickness?: number } = {};
  try {
    dims = JSON.parse(r.dimensions || '{}');
  } catch { /* ignore */ }
  if (dims.width || dims.height || dims.thickness) {
    const dimParts: string[] = [];
    if (dims.width) dimParts.push(`bredde ${dims.width} cm`);
    if (dims.height) dimParts.push(`høyde ${dims.height} cm`);
    if (dims.thickness) dimParts.push(`tykkelse ${dims.thickness} mm`);
    parts.push('Mål: ' + dimParts.join(', '));
  }

  // Lists / clips compatibility
  if (eq.listRequired) {
    const listType = eq.listType || 'lister';
    parts.push(`⚠ Krever ${listType} — bestilles separat`);
  } else if (eq.listIncluded) {
    const listType = eq.listType || 'lister';
    parts.push(`✓ Inkluderer ${listType}`);
  }
  if (eq.klipsRequired) {
    parts.push('⚠ Krever klips — bestilles separat');
  } else if (eq.hasKlips) {
    parts.push('✓ Inkluderer klips');
  }

  return parts.join('. ');
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

/** Convert D1 snake_case record to frontend camelCase */
function normalizeRecord(r: GlassRecord): any {
  return {
    id: r.id,
    eurocode: r.eurocode,
    title: generateTitle(r),
    articleNumber: r.article_number,
    scanNumber: r.scan_number,
    category: r.category,
    supplier: r.supplier,
    brand: r.brand,
    model: r.model,
    yearFrom: r.year_from,
    yearTo: r.year_to,
    prefix4: r.prefix4,
    properties: {
      adas: !!r.adas,
      rainSensor: !!r.rain_sensor,
      heated: !!r.heated,
      acoustic: !!r.acoustic,
      antenna: !!r.antenna,
      hud: !!r.hud,
      shade: !!r.shade,
      camera: !!r.camera,
      color: r.color || null,
      solar: !!r.solar,
      tinted: !!r.tinted,
      ...(() => {
        const eq = inferRecordEquipment(r);
        return {
          hasList: eq.hasList,
          listRequired: eq.listRequired,
          listIncluded: eq.listIncluded,
          listType: eq.listType,
          hasKlips: eq.hasKlips,
          klipsRequired: eq.klipsRequired,
          klipsType: eq.klipsType,
        };
      })(),
    },
    standardDescription: generateDescription(r),
    adasFeatures: r.adas_features ? JSON.parse(r.adas_features) : [],
    price: r.price,
    stockStatus: r.stock_status,
    warehouseLocation: r.warehouse_location,
    oemNumbers: r.oem_numbers,
    crossReferences: r.cross_references,
    weight: r.weight,
    dimensions: r.dimensions,
    description: r.description,
    rawDescription: r.description,
    imageUrl: r.image_url,
    pdfUrl: r.pdf_url,
    source: r.source,
    nagsCodes: r.nags_codes,
    brandOriginal: r.brand_original,
    ktype: r.ktype,
    createdAt: r.created_at,
    typeCode: r.typeCode,
    typeCodeDesc: r.typeCodeDesc,
    position: r.position,
  };
}

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

const CACHE_VERSION = "1";

async function getCache<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const cached = await kv.get(key);
  return cached ? JSON.parse(cached) : null;
}

async function setCache(kv: KVNamespace, key: string, data: unknown, ttlSeconds = 300): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
  } catch (e) {
    // Silently ignore KV write failures (quota exhausted, etc.)
    // Reads still work; we just skip caching for this request.
    console.warn(`KV write failed for key ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function cacheKey(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `cache:v2:${endpoint}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

// Cache envelope for versionert, tidsstemplet caching
interface CacheEnvelope<T> {
  version: string;
  cachedAt: string;
  data: T;
}

function buildCacheEnvelope<T>(data: T, version = CACHE_VERSION): CacheEnvelope<T> {
  return { version, cachedAt: new Date().toISOString(), data };
}

// Normaliserer catalog/search-params til en konsistent cache key
function normalizeCatalogSearchParams(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
  if (q) out.q = q;
  const brand = url.searchParams.get("brand")?.trim().toLowerCase();
  if (brand) out.brand = brand;
  const category = url.searchParams.get("category")?.trim().toLowerCase();
  if (category) out.category = category;
  const yearMin = url.searchParams.get("yearMin");
  if (yearMin) out.yearMin = yearMin;
  const yearMax = url.searchParams.get("yearMax");
  if (yearMax) out.yearMax = yearMax;
  const priceMin = url.searchParams.get("price_min");
  if (priceMin) out.price_min = priceMin;
  const priceMax = url.searchParams.get("price_max");
  if (priceMax) out.price_max = priceMax;
  const equipment = url.searchParams.get("equipment")?.trim().toLowerCase();
  if (equipment) out.equipment = equipment;
  const inStock = url.searchParams.get("in_stock");
  if (inStock) out.in_stock = inStock;
  out.page = String(parseInt(url.searchParams.get("page") || "1", 10));
  out.per_page = String(parseInt(url.searchParams.get("per_page") || "48", 10));
  return out;
}

// ============================================================================
// RATE LIMITING (D1-basert — unngår KV write-kvote)
// ============================================================================

async function checkRateLimit(db: D1Database, ip: string): Promise<boolean> {
  const key = `rate:${ip}`;
  try {
    const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ? AND expires_at > datetime('now')").bind(key).first();
    const count = row ? (row as any).count : 0;
    if (count > 300) return false; // 300 req/min
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
    const res = await fetchWithTimeout(url, { method: "GET" }, 15000);

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
// SVV CACHE (KV)
// ============================================================================

/** Cache SVV vehicle data in KV for 24 hours */
async function cacheSvvVehicle(kv: KVNamespace, regnr: string, vehicle: TecdocVehicle): Promise<void> {
  try {
    await kv.put(`svv:regnr:${regnr.toUpperCase()}`, JSON.stringify(vehicle), { expirationTtl: 86400 });
  } catch (e) {
    console.warn(`SVV KV cache write failed for ${regnr}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Get cached SVV vehicle data from KV */
async function getCachedSvvVehicle(kv: KVNamespace, regnr: string): Promise<TecdocVehicle | null> {
  const cached = await kv.get(`svv:regnr:${regnr.toUpperCase()}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as TecdocVehicle;
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
  source: "bovsoft" | "biluppgifter" | "catalog_guess" | "learned" | "learned_vin" | "none";
  guessed?: boolean;
  guessConfidence?: string;
  guessSource?: string;
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
    const res = await fetchWithTimeout(
      `https://api.biluppgifter.se/api/v1/vehicle-configurator/regno/${encodeURIComponent(regno)}?country_code=NO`,
      {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": "AutoglassAS-B2B/1.0",
        },
      },
      15000
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

/** Normalize SVV/API brand names to D1 catalog brand names */
function normalizeBrand(brand: string): string {
  const b = brand.toUpperCase().trim();
  const map: Record<string, string> = {
    'VOLKSWAGEN': 'VW',
    'VW TRUCKS': 'VW',
    'MERCEDES-BENZ': 'MERCEDES',
    'MERCEDES BENZ': 'MERCEDES',
    'LAND ROVER': 'LANDROVER',
    'ROLLS ROYCE': 'ROLLS ROYCE',
    'VAUXHALL': 'OPEL',
    'VAUXHALL/OPEL': 'OPEL',
    'OPEL/VAUXHALL': 'OPEL',
    'CITROËN': 'CITROEN',
    'DS': 'CITROEN',
    'ALFA': 'ALFA ROMEO',
    'ABARTH': 'FIAT',
    'LAMBORGH.': 'LAMBORGHINI',
    'MITS.': 'MITSUBISHI',
    'MITS': 'MITSUBISHI',
    'NISS': 'NISSAN',
    'HON': 'HONDA',
    'TOY': 'TOYOTA',
    'REN': 'RENAULT',
    'REN.': 'RENAULT',
    'RENAU': 'RENAULT',
    'HYUNADI': 'HYUNDAI',
    'HYUN.': 'HYUNDAI',
    'PEUG': 'PEUGEOT',
    'CHEV': 'CHEVROLET',
    'CHEVR.': 'CHEVROLET',
    'CHEVROLET': 'DAEWOO (CHEVROLET)',
    'DAEWOO': 'DAEWOO (CHEVROLET)',
    'SUZ': 'SUZUKI',
    'FOR': 'FORD',
    'FORD,': 'FORD',
    'KIA.': 'KIA',
    'SUB.': 'SUBARU',
    'MAZ.': 'MAZDA',
    'MAZDA.': 'MAZDA',
    'LEX.': 'LEXUS',
    'JAG': 'JAGUAR',
    'POR': 'PORSCHE',
    'PORSCH': 'PORSCHE',
    'AUDI.': 'AUDI',
    'BMW.': 'BMW',
    'MERC.': 'MERCEDES',
    'MERC': 'MERCEDES',
    'VOLVO.': 'VOLVO',
    'SEAT.': 'SEAT',
    'SKODA.': 'SKODA',
    'MINI.': 'MINI',
    'SAAB.': 'SAAB',
    'DODGE.': 'DODGE',
    'CHRY': 'CHRYSLER',
    'CHRSYLER': 'CHRYSLER',
    'HUM': 'HUMMER',
    'PONT': 'PONTIAC',
    'JEEP.': 'JEEP',
    'CAD': 'CADILLAC',
    'LINCOLN.': 'LINCOLN',
    'BUICK.': 'BUICK',
    'GMC,': 'GMC',
    'GMC': 'GMC',
    'HOLDEN.': 'HOLDEN',
    'ISUZU.': 'ISUZU',
    'DAIHATSU.': 'DAIHATSU',
    'LADA': 'LADA / TOGLIATTI',
    'ZASTAVA': 'LADA / TOGLIATTI',
    'DACIA.': 'DACIA',
    'LADA / TOGLIATTI': 'LADA / TOGLIATTI',
    'SSANYONG': 'SSANGYONG',
    'SSAN.': 'SSANGYONG',
    'SMART.': 'SMART',
    'TESLA.': 'TESLA',
    'FERRARI.': 'FERRARI',
    'MASERATI.': 'MASERATI',
    'LAMBORGHINI.': 'LAMBORGHINI',
    'BENTLEY.': 'BENTLEY',
    'ASTON': 'ASTON MARTIN',
    'LOTUS.': 'LOTUS',
    'MG.': 'MG',
    'ROVER.': 'ROVER',
    'MC LAREN': 'McLAREN',
    'MCLAREN': 'McLAREN',
    'INEOS.': 'INEOS',
    'MAXUS.': 'MAXUS',
    'POLESTAR.': 'POLESTAR',
    'CUPRA.': 'CUPRA',
    'HONGQI.': 'HONGQI',
    'VOYAH.': 'VOYAH',
    'XPENG.': 'XPENG',
    'ZEEKR.': 'ZEEKR',
    'BYD.': 'BYD',
    'ORA.': 'ORA',
    'NIO.': 'NIO',
    'THINK.': 'THINK',
    'FISKER.': 'FISKER',
    'RIVIAN': 'USA CARS',
    'LUCID': 'USA CARS',
    'TVR.': 'TVR',
    'TVR': 'TVR',
    'JC INDIGO': 'JC INDIGO',
    'KEWET': 'KEWET',
    'AIXAM': 'AIXAM',
    'AIWAYS': 'AIWAYS',
    'DFSK (SERES)': 'DFSK (SERES)',
    'DONGFENG': 'DONGFENG',
    'EXLANTIX': 'EXLANTIX',
    'JAC (CH)': 'JAC (CH)',
    'LYNK & CO': 'LYNK & CO',
    'MAN': 'MAN',
    'SCANIA': 'SCANIA TRUCKS',
    'DAF': 'DAF',
    'IVECO': 'IVECO (FIAT) TRUCKS',
    'HINO': 'HINO TRUCKS',
    'ISUZU TRUCKS': 'ISUZU',
  };
  return map[b] || b;
}

/** Get all brand aliases for a given brand (for DB queries) */
function getBrandAliases(brand: string): string[] {
  const normalized = normalizeBrand(brand);
  // Reverse lookup: find all keys that map to this normalized value
  const map: Record<string, string> = {
    'VOLKSWAGEN': 'VW',
    'VW TRUCKS': 'VW',
    'MERCEDES-BENZ': 'MERCEDES',
    'MERCEDES BENZ': 'MERCEDES',
    'LAND ROVER': 'LANDROVER',
    'VAUXHALL': 'OPEL',
    'VAUXHALL/OPEL': 'OPEL',
    'OPEL/VAUXHALL': 'OPEL',
    'CITROËN': 'CITROEN',
    'DS': 'CITROEN',
    'ALFA': 'ALFA ROMEO',
    'ABARTH': 'FIAT',
    'CHEVROLET': 'DAEWOO (CHEVROLET)',
    'DAEWOO': 'DAEWOO (CHEVROLET)',
    'SCANIA': 'SCANIA TRUCKS',
    'MCLAREN': 'McLAREN',
    'MC LAREN': 'McLAREN',
    'SSANYONG': 'SSANGYONG',
  };
  const aliases = new Set<string>([normalized]);
  for (const [key, val] of Object.entries(map)) {
    if (val === normalized) {
      aliases.add(key);
      aliases.add(val);
    }
  }
  return Array.from(aliases);
}

async function queryByBrandAndYear(
  db: D1Database,
  brand: string,
  year: number,
  modelHint?: string,
  prefix4?: string
): Promise<GlassRecord[]> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => '?').join(',');
  let sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders}) AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)`;
  const params: (string | number)[] = [...brands, year, year];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 500";
  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

async function queryByBrandOnly(db: D1Database, brand: string, modelHint?: string, prefix4?: string): Promise<GlassRecord[]> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => '?').join(',');
  let sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders})`;
  const params: (string | number)[] = [...brands];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 500";
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

async function getCatalogStats(db: D1Database): Promise<{ total: number; brands: number; rulesCount: number }> {
  const [totalRow, brandRow, rulesRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) as cnt FROM glass_catalog").first(),
    db.prepare("SELECT COUNT(DISTINCT brand) as cnt FROM glass_catalog").first(),
    db.prepare("SELECT COUNT(*) as cnt FROM glass_rules").first(),
  ]);
  return {
    total: (totalRow as any)?.cnt || 0,
    brands: (brandRow as any)?.cnt || 0,
    rulesCount: (rulesRow as any)?.cnt || 0,
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
  filters: {
    brand?: string;
    category?: string;
    yearMin?: number;
    yearMax?: number;
    priceMin?: number;
    priceMax?: number;
    equipment?: string[];
    inStock?: boolean;
  },
  offset = 0,
  limit = 100
): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE (eurocode LIKE ? OR article_number LIKE ? OR scan_number LIKE ? OR brand LIKE ? OR model LIKE ? OR description LIKE ?)";
  const params: (string | number)[] = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];

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
  if (filters.priceMin !== undefined) {
    sql += " AND (price IS NULL OR price >= ?)";
    params.push(filters.priceMin);
  }
  if (filters.priceMax !== undefined) {
    sql += " AND (price IS NULL OR price <= ?)";
    params.push(filters.priceMax);
  }
  if (filters.equipment && filters.equipment.length > 0) {
    const EQUIPMENT_COL_MAP: Record<string, string> = {
      adas: 'adas',
      heated: 'heated',
      rainsensor: 'rain_sensor',
      rain_sensor: 'rain_sensor',
      acoustic: 'acoustic',
      antenna: 'antenna',
      hud: 'hud',
      camera: 'camera',
      solar: 'solar',
      tinted: 'tinted',
    };
    for (const eq of filters.equipment) {
      const col = EQUIPMENT_COL_MAP[eq.toLowerCase()];
      if (col) {
        sql += ` AND ${col} = 1`;
      }
    }
  }
  if (filters.inStock) {
    sql += " AND (stock_status IS NOT NULL AND stock_status > 0)";
  }
  sql += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

// ============================================================================
// GROUND TRUTH
// ============================================================================

interface GroundTruthRecord {
  id: number;
  regnr_hash: string;
  vin: string | null;
  vin_prefix: string | null;
  k_type: number | null;
  make: string;
  model: string;
  year: number;
  submodel: string | null;
  frontrute_eurocode: string | null;
  bakrute_eurocode: string | null;
  sideglass_fv_eurocode: string | null;
  sideglass_fh_eurocode: string | null;
  sideglass_bv_eurocode: string | null;
  sideglass_bh_eurocode: string | null;
  dor_fv_eurocode: string | null;
  dor_fh_eurocode: string | null;
  dor_bv_eurocode: string | null;
  dor_bh_eurocode: string | null;
  adas: number;
  rain_sensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  hud: number;
  camera: number;
  shade: number;
  properties: string | null;
  verified_by: string;
  verified_at: string;
  source_url: string | null;
  confidence: number;
}

async function queryGroundTruth(db: D1Database, regnr: string): Promise<GroundTruthRecord | null> {
  const hash = await sha256(regnr);
  try {
    const row = await db.prepare("SELECT * FROM ground_truth WHERE regnr_hash = ?").bind(hash).first();
    return row as unknown as GroundTruthRecord | null;
  } catch {
    return null;
  }
}

async function queryGroundTruthByVehicle(
  db: D1Database,
  make: string,
  model: string,
  year: number,
  equipment?: { adas?: boolean; rainSensor?: boolean; heated?: boolean; acoustic?: boolean; antenna?: boolean; hud?: boolean; camera?: boolean }
): Promise<GroundTruthRecord | null> {
  try {
    const normalizedMake = normalizeBrand(make);
    let sql = "SELECT * FROM ground_truth WHERE make = ? AND model = ? AND year = ?";
    const params: (string | number)[] = [normalizedMake, model, year];

    // Optional equipment filtering for exact variant matching
    if (equipment) {
      if (equipment.adas !== undefined) { sql += " AND adas = ?"; params.push(equipment.adas ? 1 : 0); }
      if (equipment.rainSensor !== undefined) { sql += " AND rain_sensor = ?"; params.push(equipment.rainSensor ? 1 : 0); }
      if (equipment.heated !== undefined) { sql += " AND heated = ?"; params.push(equipment.heated ? 1 : 0); }
      if (equipment.acoustic !== undefined) { sql += " AND acoustic = ?"; params.push(equipment.acoustic ? 1 : 0); }
      if (equipment.antenna !== undefined) { sql += " AND antenna = ?"; params.push(equipment.antenna ? 1 : 0); }
      if (equipment.hud !== undefined) { sql += " AND hud = ?"; params.push(equipment.hud ? 1 : 0); }
      if (equipment.camera !== undefined) { sql += " AND camera = ?"; params.push(equipment.camera ? 1 : 0); }
    }

    sql += " ORDER BY confidence DESC LIMIT 1";
    const row = await db.prepare(sql).bind(...params).first();
    return row as unknown as GroundTruthRecord | null;
  } catch {
    return null;
  }
}

// ============================================================================
// ADAS CALIBRATION REQUIREMENTS (Hella Gutmann CSC)
// ============================================================================

interface CalibrationRequirement {
  sensorType: string;
  sensorLabel: string;
  calibrationTriggers: string[];
  calibrationType: string;
  cscToolSupported: boolean;
  targetPlate: string | null;
  notes: string | null;
}

interface KtypeRegistryInfo {
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  body: string | null;
  source: string;
}

async function queryCalibrationRequirements(
  db: D1Database,
  make: string,
  model: string,
  year: number
): Promise<CalibrationRequirement[]> {
  try {
    const normalizedMake = normalizeBrand(make);
    const { results } = await db
      .prepare(
        `SELECT sensor_type, sensor_label, calibration_triggers, calibration_type,
                csc_tool_supported, target_plate, notes
         FROM adas_calibration_requirements
         WHERE brand = ? COLLATE NOCASE AND model LIKE ? COLLATE NOCASE AND year_from <= ? AND (year_to IS NULL OR year_to >= ?)
         ORDER BY sensor_type`
      )
      .bind(normalizedMake, model.split(/\s+/)[0] + "%", year, year)
      .all();

    return (results || []).map((r: any) => ({
      sensorType: r.sensor_type,
      sensorLabel: r.sensor_label,
      calibrationTriggers: r.calibration_triggers ? JSON.parse(r.calibration_triggers) : [],
      calibrationType: r.calibration_type || "unknown",
      cscToolSupported: !!r.csc_tool_supported,
      targetPlate: r.target_plate || null,
      notes: r.notes || null,
    }));
  } catch {
    return [];
  }
}

async function queryKtypeRegistry(db: D1Database, ktype: number): Promise<KtypeRegistryInfo | null> {
  try {
    const row = await db
      .prepare(
        `SELECT ktype, brand, model, year_from, year_to, body, source
         FROM ktype_registry
         WHERE ktype = ?`
      )
      .bind(ktype)
      .first();
    if (!row) return null;
    return {
      ktype: (row as any).ktype,
      brand: (row as any).brand,
      model: (row as any).model,
      yearFrom: (row as any).year_from,
      yearTo: (row as any).year_to,
      body: (row as any).body,
      source: (row as any).source,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// AUTO-GLASS.NO MAPPING (KV-backed)
// ============================================================================

interface AutoGlassMapping {
  make: string;
  model: string;
  year: number;
  typeCodes: Record<string, string>; // typeCode -> eurocode
}

async function getAutoGlassMapping(
  kv: KVNamespace,
  make: string,
  model: string,
  year: number
): Promise<AutoGlassMapping | null> {
  const key = `autoglass:map:${make.toUpperCase()}:${model.toUpperCase()}:${year}`;
  const cached = await kv.get(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as AutoGlassMapping;
  } catch {
    return null;
  }
}

// ============================================================================
// TYPE CODE HELPERS
// ============================================================================

const GT_FIELD_TO_TYPE: Record<
  string,
  { code: string; desc: string; position: "driver" | "passenger" | null }
> = {
  frontrute_eurocode: { code: "F", desc: "Frontrute", position: null },
  bakrute_eurocode: { code: "B", desc: "Bakrute", position: null },
  sideglass_fv_eurocode: { code: "SFB1", desc: "Sideglass foran venstre", position: "driver" },
  sideglass_fh_eurocode: { code: "SPB1", desc: "Sideglass foran høyre", position: "passenger" },
  sideglass_bv_eurocode: { code: "SFB2", desc: "Sideglass bak venstre", position: "driver" },
  sideglass_bh_eurocode: { code: "SPB2", desc: "Sideglass bak høyre", position: "passenger" },
  dor_fv_eurocode: { code: "DFF", desc: "Dørglass foran venstre", position: "driver" },
  dor_fh_eurocode: { code: "DPF", desc: "Dørglass foran høyre", position: "passenger" },
  dor_bv_eurocode: { code: "DFB", desc: "Dørglass bak venstre", position: "driver" },
  dor_bh_eurocode: { code: "DPB", desc: "Dørglass bak høyre", position: "passenger" },
};

async function groundTruthToCandidates(
  db: D1Database,
  gt: GroundTruthRecord
): Promise<GlassRecord[]> {
  const candidates: GlassRecord[] = [];
  for (const [field, meta] of Object.entries(GT_FIELD_TO_TYPE)) {
    const eurocode = (gt as unknown as Record<string, unknown>)[field] as string | null;
    if (!eurocode) continue;
    const rec = await queryByEurocode(db, eurocode);
    if (rec) {
      candidates.push({
        ...rec,
        typeCode: meta.code,
        typeCodeDesc: meta.desc,
        position: meta.position,
      });
    }
  }
  return candidates;
}

function inferTypeCodeFromRecord(record: GlassRecord): string | null {
  const cat = record.category?.toLowerCase() || detectCategoryFromDescription(record.description);
  const desc = (record.description || "").toUpperCase();

  if (cat === "frontrute") return "F";
  if (cat === "bakrute") return "B";

  // Door glass (dørglass) — position from description keywords
  if (cat === "dørglass") {
    // Rear doors first (longer match) to avoid "BAK" matching before "BAK V"
    if (/\b(BAK\s*H|BH|RRD|RIGHT\s*REAR)\b/.test(desc)) return "DPB";
    if (/\b(BAK\s*V|BV|LRD|LEFT\s*REAR)\b/.test(desc)) return "DFB";
    if (/\b(FORAN\s*H|FH|RFD|RIGHT\s*FRONT|R\.\s*F\.\s*D)\b/.test(desc)) return "DPF";
    if (/\b(FORAN\s*V|FV|LFD|LEFT\s*FRONT|L\.\s*F\.\s*D)\b/.test(desc)) return "DFF";
  }

  // Side glass (sideglass / quarter)
  if (cat === "sideglass" || cat === "quarter") {
    if (/\b(BAK\s*H|BH|RRQ|RIGHT\s*REAR)\b/.test(desc)) return "SPB2";
    if (/\b(BAK\s*V|BV|LRQ|LEFT\s*REAR)\b/.test(desc)) return "SFB2";
    if (/\b(FORAN\s*H|FH|RFQ|RIGHT\s*FRONT|R\.\s*F\.\s*Q)\b/.test(desc)) return "SPB1";
    if (/\b(FORAN\s*V|FV|LFQ|LEFT\s*FRONT|L\.\s*F\.\s*Q)\b/.test(desc)) return "SFB1";
  }

  // Fallback: try to detect from description even without category
  if (/\bWINDSHIELD\b|\bWINDSCREEN\b|\bFRONT\s+GLASS\b/.test(desc)) return "F";
  if (/\bREAR\s+WINDOW\b|\bBACK\s+WINDOW\b|\bREAR\s+GLASS\b/.test(desc)) return "B";

  return null;
}

function groupByTypeCode(candidates: GlassRecord[]): Record<string, GlassRecord[]> {
  const groups: Record<string, GlassRecord[]> = {};
  for (const c of candidates) {
    const code = c.typeCode || inferTypeCodeFromRecord(c) || "UNKNOWN";
    if (!groups[code]) groups[code] = [];
    groups[code].push(c);
  }
  return groups;
}

// ============================================================================
// LEARNING ENGINE — Hacker Mode v2.2
// ============================================================================

/** Simple SHA-256 hash for GDPR-safe regnr storage */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SearchHistoryRecord {
  regnr_hash: string;
  make: string;
  model: string;
  year: number;
  generation?: string;
  body?: string;
  chosen_eurocode?: string;
  equipment: {
    adas: boolean;
    rainSensor: boolean;
    heated: boolean;
    acoustic: boolean;
    antenna: boolean;
    hud: boolean;
    camera: boolean;
    shade: boolean;
  };
  layer: number;
  confidence: string;
  source: string;
  vin_prefix?: string;
}

/**
 * Save search result to D1 for learning.
 * GDPR-safe: only SHA-256 hash of regnr is stored.
 */
async function saveSearchResult(db: D1Database, record: SearchHistoryRecord): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO search_history (
        regnr_hash, make, model, year, generation, body, chosen_eurocode,
        equipment_adas, equipment_rain_sensor, equipment_heated, equipment_acoustic,
        equipment_antenna, equipment_hud, equipment_camera, equipment_shade,
        layer, confidence, source, vin_prefix, search_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(regnr_hash) DO UPDATE SET
         chosen_eurocode = excluded.chosen_eurocode,
         equipment_adas = excluded.equipment_adas,
         equipment_rain_sensor = excluded.equipment_rain_sensor,
         equipment_heated = excluded.equipment_heated,
         equipment_acoustic = excluded.equipment_acoustic,
         equipment_antenna = excluded.equipment_antenna,
         equipment_hud = excluded.equipment_hud,
         equipment_camera = excluded.equipment_camera,
         equipment_shade = excluded.equipment_shade,
         layer = excluded.layer,
         confidence = excluded.confidence,
         source = excluded.source,
         search_count = search_count + 1,
         updated_at = datetime('now')`
    ).bind(
      record.regnr_hash,
      record.make,
      record.model,
      record.year,
      record.generation || null,
      record.body || null,
      record.chosen_eurocode || null,
      record.equipment.adas ? 1 : 0,
      record.equipment.rainSensor ? 1 : 0,
      record.equipment.heated ? 1 : 0,
      record.equipment.acoustic ? 1 : 0,
      record.equipment.antenna ? 1 : 0,
      record.equipment.hud ? 1 : 0,
      record.equipment.camera ? 1 : 0,
      record.equipment.shade ? 1 : 0,
      record.layer,
      record.confidence,
      record.source,
      record.vin_prefix || null
    ).run();
  } catch {
    // Silently fail if migration 0005 not run yet
  }
}

/**
 * Get learned equipment from search history for a specific regnr.
 * Returns null if no prior searches found.
 */
async function getLearnedEquipment(db: D1Database, regnr: string): Promise<{
  equipment: SearchHistoryRecord["equipment"];
  chosen_eurocode?: string;
  search_count: number;
} | null> {
  try {
    const hash = await sha256(regnr);
    const row = await db.prepare(
      `SELECT equipment_adas, equipment_rain_sensor, equipment_heated, equipment_acoustic,
              equipment_antenna, equipment_hud, equipment_camera, equipment_shade,
              chosen_eurocode, search_count
       FROM search_history WHERE regnr_hash = ?`
    ).bind(hash).first();
    if (!row) return null;
    return {
      equipment: {
        adas: !!(row as any).equipment_adas,
        rainSensor: !!(row as any).equipment_rain_sensor,
        heated: !!(row as any).equipment_heated,
        acoustic: !!(row as any).equipment_acoustic,
        antenna: !!(row as any).equipment_antenna,
        hud: !!(row as any).equipment_hud,
        camera: !!(row as any).equipment_camera,
        shade: !!(row as any).equipment_shade,
      },
      chosen_eurocode: (row as any).chosen_eurocode || undefined,
      search_count: (row as any).search_count || 1,
    };
  } catch {
    return null;
  }
}

/**
 * Get learned equipment by VIN prefix (first 6 chars).
 * Aggregates across all searches with same VIN prefix.
 */
async function getLearnedByVinPrefix(db: D1Database, vin: string): Promise<{
  equipment: SearchHistoryRecord["equipment"];
  count: number;
} | null> {
  if (!vin || vin.length < 6) return null;
  try {
    const prefix = vin.slice(0, 6).toUpperCase();
    const row = await db.prepare(
      `SELECT
        AVG(equipment_adas) as adas_prob,
        AVG(equipment_rain_sensor) as rain_prob,
        AVG(equipment_heated) as heated_prob,
        AVG(equipment_acoustic) as acoustic_prob,
        AVG(equipment_antenna) as antenna_prob,
        AVG(equipment_hud) as hud_prob,
        AVG(equipment_camera) as camera_prob,
        AVG(equipment_shade) as shade_prob,
        COUNT(*) as cnt
       FROM search_history WHERE vin_prefix = ? AND search_count >= 1`
    ).bind(prefix).first();
    if (!row || (row as any).cnt < 3) return null;
    return {
      equipment: {
        adas: ((row as any).adas_prob || 0) >= 0.5,
        rainSensor: ((row as any).rain_prob || 0) >= 0.5,
        heated: ((row as any).heated_prob || 0) >= 0.5,
        acoustic: ((row as any).acoustic_prob || 0) >= 0.5,
        antenna: ((row as any).antenna_prob || 0) >= 0.5,
        hud: ((row as any).hud_prob || 0) >= 0.5,
        camera: ((row as any).camera_prob || 0) >= 0.5,
        shade: ((row as any).shade_prob || 0) >= 0.5,
      },
      count: (row as any).cnt,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SEARCH LOGIC
// ============================================================================

// ============================================================================
// CATEGORY DETECTION FROM DESCRIPTION
// ============================================================================

const TYPE_TO_CATEGORY: Record<string, string> = {
  "WS": "frontrute",
  "WINDSHIELD": "frontrute",
  "WSH": "frontrute",
  "FD": "dørglass",
  "RD": "dørglass",
  "LFD": "dørglass",
  "RFD": "dørglass",
  "LRD": "dørglass",
  "RRD": "dørglass",
  "DOOR": "dørglass",
  "LRQ": "sideglass",
  "RRQ": "sideglass",
  "LFQ": "sideglass",
  "RFQ": "sideglass",
  "RQ": "sideglass",
  "LRV": "sideglass",
  "RRV": "sideglass",
  "LFV": "sideglass",
  "RFV": "sideglass",
  "FV": "sideglass",
  "RV": "sideglass",
  "QTR": "sideglass",
  "VENT": "sideglass",
  "RR": "bakrute",
  "REAR": "bakrute",
  "BACK": "bakrute",
  "RW": "bakrute",
  "SR": "annet",
  "SUNROOF": "annet",
};

function detectCategoryFromDescription(description: string | null): string | null {
  if (!description) return null;
  const d = description.toUpperCase();
  // First try to find type code after semicolon (Pilkington format: "BRAND MODEL YEAR; WS GN...")
  const afterSemi = d.match(/;\s*([A-Z]{1,4})\s/);
  if (afterSemi) {
    const code = afterSemi[1].trim();
    if (TYPE_TO_CATEGORY[code]) {
      return TYPE_TO_CATEGORY[code];
    }
  }
  // Fallback: type code at start of description
  const atStart = d.match(/^([A-Z]{1,4})\s/);
  if (atStart) {
    const code = atStart[1].trim();
    if (TYPE_TO_CATEGORY[code]) {
      return TYPE_TO_CATEGORY[code];
    }
  }
  if (/\bWINDSHIELD\b|\bFRONT\s+WINDOW\b|\bFRONT\s+GLASS\b/.test(d)) return "frontrute";
  if (/\bREAR\s+WINDOW\b|\bREAR\s+GLASS\b|\bBACK\s+WINDOW\b/.test(d)) return "bakrute";
  if (/\bDOOR\s+GLASS\b|\bDOOR\s+WINDOW\b/.test(d)) return "dørglass";
  if (/\bQUARTER\b|\bVENT\s+GLASS\b|\bSIDE\s+GLASS\b/.test(d)) return "sideglass";
  return null;
}

// ============================================================================
// EQUIPMENT DETECTION
// ============================================================================

/**
 * Detect equipment flags from product description text.
 * Supports Pilkington/Glavista/Autoglass standardized codes plus
 * Norwegian/Swedish/English variants found across all suppliers.
 *
 * Pilkington codes:
 *   RSN / RSNL / RSNLSN = Rain sensor
 *   HTD / HT / UHTD       = Heated
 *   ACO                   = Acoustic
 *   ANT / GPS             = Antenna
 *   CAMERA / CAM          = Camera bracket / ADAS
 *   HUD / H.U.D           = Head-up display
 *   SOLAR / SOL / SOLA    = Solar control (tint/shade indicator)
 *   PRIVACY               = Privacy tint
 *   GN / BL / GY / CL     = Standard tint colors (not distinguishing)
 *
 * Additional variants detected:
 *   REGN / REGNS / REGNSEN / LYS/REGN = Rain sensor (NO/SE)
 *   EL / ELEK / VARM                   = Heated (NO/SE)
 *   AKU                                = Acoustic (NO)
 *   LDW / SENS / 1-3 CAM               = ADAS/camera
 *   SOTET / SOLAR CONTROL / TOPSHADE   = Shade/privacy
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
  if (!description) {
    return { adas: false, rainSensor: false, heated: false, acoustic: false, antenna: false, camera: false, hud: false };
  }
  const d = description.toUpperCase();

  // Tokenize for exact word matching (handles + and . separators)
  const tokens = d.split(/[\s;,.\[\]()+-]+/).filter(t => t.length >= 1);
  const s = new Set(tokens);

  // Rain sensor — expanded with NO/SE variants and Pilkington codes
  const rainSensor =
    s.has("RSN") || s.has("RSNL") || s.has("RSNLSN") ||
    s.has("REGN") || s.has("REGNS") || s.has("REGNSEN") || s.has("REGNSENSOR") ||
    /\bRAIN\b|\bAUTOMATIC\s+WIPER\b|\bVINDRUTETORKARE\b|\bLYS\/REGN\b|\bLYS\/REGNS\b/.test(d);

  // Heated — expanded with NO/SE variants
  // Note: 'EL' is only matched as a standalone token surrounded by separators
  const heated =
    s.has("HTD") || s.has("HT") || s.has("UHTD") || s.has("ELEK") || s.has("VARM") ||
    /\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b/.test(d) ||
    // 'EL' as standalone token (e.g. "EL+GN", "+EL+", " EL ")
    /(?:^|[\s+])(EL)(?:[\s+.]|[+-]|$)/.test(d);

  // Acoustic — expanded with NO variant
  const acoustic =
    s.has("ACO") || s.has("AKU") ||
    /\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bST[\u00d8O]YDEMP\b|\bSILENT\b/.test(d);

  // Antenna
  const antenna =
    s.has("ANT") || s.has("GNAG") ||
    /\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b/.test(d);

  // Camera / ADAS — expanded with LDW, CAM counts, SENS
  const hasCam = s.has("CAMERA") || s.has("CAM") || /\bKAMERA\b|\bBACKUP\b|\bREVERSING\b|\b360\b/.test(d);
  const hasLdw = /\bLDW\b/.test(d);
  const hasAdasText =
    s.has("ADAS") || s.has("FILSKIFTE") ||
    /\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b|\bCITY\s+SAFETY\b/.test(d);
  // SENS/SENSOR in context of ADAS (when combined with LDW, HUD, or CAM)
  const sensWithAdas = (s.has("SENS") || s.has("SENSOR")) && (hasLdw || hasCam || s.has("HUD") || s.has("H.U.D"));
  const camera = hasCam || hasLdw || hasAdasText || sensWithAdas;

  // ADAS = camera + LDW + ADAS text (anything that indicates driver assistance)
  const adas = hasAdasText || hasLdw || hasCam || sensWithAdas;

  // HUD
  const hud =
    s.has("HUD") || s.has("H.U.D") ||
    /\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b|\bWINDSHIELD\s+DISPLAY\b/.test(d);

  return {
    adas,
    rainSensor,
    heated,
    acoustic,
    antenna,
    camera,
    hud,
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
  shade: boolean;
  hasList: boolean;
  listRequired: boolean;
  listIncluded: boolean;
  listType: string | null;
  hasKlips: boolean;
  klipsRequired: boolean;
  klipsType: string | null;
} {
  // Prefer explicit DB columns if set
  if (record.rain_sensor || record.heated || record.acoustic || record.antenna || record.camera || record.adas || record.shade) {
    return {
      adas: !!record.adas,
      rainSensor: !!record.rain_sensor,
      heated: !!record.heated,
      acoustic: !!record.acoustic,
      antenna: !!record.antenna,
      camera: !!record.camera,
      hud: !!record.hud,
      shade: !!record.shade,
      hasList: false,
      listRequired: false,
      listIncluded: false,
      listType: null,
      hasKlips: false,
      klipsRequired: false,
      klipsType: null,
    };
  }
  // Fallback: parse from description
  const flags = detectFlagsFromDescription(record.description);
  // Also detect shade from description
  const d = (record.description || "").toUpperCase();
  const tokens = d.split(/[\s;,.\[\]()]+/).filter(t => t.length >= 2);
  const s = new Set(tokens);
  const shade = s.has("SOLAR") || s.has("SOL") || s.has("SOLA") ||
                s.has("PRIVACY") || s.has("PRIV") || s.has("PRIVA") || s.has("PRIVAC") ||
                s.has("DARK") || s.has("TOP") || s.has("TINT") ||
                s.has("COATED") || s.has("HMSL");
  // Parse lister/klips from description
  const hasList = /\b(PYNTELIST|LIST|GUMMILIST|BUNNLIST|KANTLIST|RAMMELIST|DEKORLIST)\b/.test(d);
  const listRequired = hasList && /\b(NB\b|HUSK|MÅ HA|MÅH|KUN MED|FOR LIST|FOR GUMMILIST|TA PÅ EN LIST)\b/.test(d);
  const listIncluded = hasList && /\b(INNK|INNKAPSL|INKL|INKLUDERT|MED LIST)\b/.test(d);
  const hasKlips = /\b(KLIPS)\b/.test(d);
  const klipsRequired = hasKlips && /\b(NB\b|HUSK|MÅ HA|MÅH|KUN MED)\b/.test(d);

  // Detect specific list type
  let listType: string | null = null;
  if (hasList) {
    if (d.includes("PYNTELIST")) listType = "pyntelister";
    else if (d.includes("GUMMILIST")) listType = "gummilister";
    else if (d.includes("BUNNLIST")) listType = "bunnlister";
    else if (d.includes("KANTLIST")) listType = "kantlister";
    else if (d.includes("RAMMELIST")) listType = "rammelister";
    else if (d.includes("DEKORLIST")) listType = "dekorlister";
    else if (/\bLIST\b/.test(d)) listType = "lister";
  }

  // Detect specific klips type
  let klipsType: string | null = null;
  if (hasKlips) {
    klipsType = "klips"; // Generic for now — extend if we see variants
  }

  return { ...flags, shade, hasList, listRequired, listIncluded, listType, hasKlips, klipsRequired, klipsType };
}

// ============================================================================
// SMART EQUIPMENT GUESSER — Hacker Mode v2.2
// ============================================================================

/**
 * Equipment signatures learned from catalog statistics.
 * These are probability-based guesses when no API provides equipment data.
 * Format: "BRAND:MODEL" → { camera: 0.67, adas: 0.67, acoustic: 0.33 }
 * Only includes signatures with >= 5 samples and >= 30% probability.
 */
const CATALOG_EQUIPMENT_SIGNATURES: Record<string, Record<string, number>> = {
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
const GENERATION_EQUIPMENT_SIGNATURES: Record<string, Record<string, number>> = {
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

interface GuessedEquipment {
  adas: number;        // 0.0 - 1.0 probability
  rainSensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  camera: number;
  hud: number;
  shade: number;
  confidence: "high" | "medium" | "low" | "none";
  source: "catalog_signature" | "generation_signature" | "none";
}

/**
 * Guess equipment based on catalog statistics + VIN/generation data.
 * Returns probabilities (0.0-1.0) instead of booleans.
 * This is used when Biluppgitter/Bovsoft APIs don't return equipment.
 */
function guessEquipment(
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
  const yearBucket = `${Math.floor(year / 5) * 5}`;

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

function scoreCandidate(
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

  // Category scoring: no bias — all glass types are equally important
  // Users want to find ALL types (front, rear, door, side) for a given vehicle
  const cat = c.category?.toLowerCase() || detectCategoryFromDescription(c.description);
  if (cat === "annet" || cat === "unknown" || !cat) {
    score -= 5; // Penalty for uncategorized remains
  }

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

  // Prefix4 consensus bonus: if most candidates share a prefix4, boost matches
  if (dominantPrefix4 && c.prefix4 === dominantPrefix4) {
    score += 8; // Consensus boost
  }

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

async function searchByRegnr(regnr: string, env: Env, categoryFilter?: string): Promise<SearchResult> {
  try {
  // 1. Lookup vehicle via SVV — typed result so we can distinguish auth vs not-found vs upstream
  let svvCacheHit = false;
  let svvResult: SvvFetchResult;
  const cachedVehicle = await getCachedSvvVehicle(env.GLASS_CATALOG, regnr);
  if (cachedVehicle) {
    svvResult = { status: "ok", vehicle: cachedVehicle };
    svvCacheHit = true;
  } else {
    svvResult = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
    if (svvResult.status === "ok") {
      await cacheSvvVehicle(env.GLASS_CATALOG, regnr, svvResult.vehicle);
    }
  }
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

  // 2. Check ground_truth database FIRST (layer -1: verified mapping)
  const db = env.GLASS_CATALOG_D1;
  let groundTruth: GroundTruthRecord | null = null;
  let gtCandidates: GlassRecord[] = [];
  try {
    groundTruth = await queryGroundTruth(db, regnr);
    if (!groundTruth) {
      // Fallback: lookup by make+model+year
      groundTruth = await queryGroundTruthByVehicle(db, vehicle.make, vehicle.model, vehicle.year);
    }
    if (groundTruth) {
      gtCandidates = await groundTruthToCandidates(db, groundTruth);
    }
  } catch {
    // Ground truth table might not exist yet — silently continue
  }

  // 3. Hybrid kType resolution: glass_rules → Bovsoft → resolveGlass fallback
  let resolvedKtype: number | null = null;
  let ktypeSource = "none";

  // 3a. Check glass_rules (statistical learning from previous searches)
  try {
    const normalizedKey = [
      vehicle.make.toLowerCase().trim().replace(/\s+/g, "_"),
      vehicle.model.toLowerCase().trim().replace(/\s+/g, "_"),
      String(vehicle.year),
    ].join(":");
    const ruleResult = await db
      .prepare("SELECT ktype, confidence FROM glass_rules WHERE normalized_key = ? AND active = 1 ORDER BY confidence DESC, evidence_count DESC LIMIT 1")
      .bind(normalizedKey).first<{ ktype: number; confidence: number }>();
    if (ruleResult && ruleResult.ktype && ruleResult.confidence >= 0.75) {
      resolvedKtype = ruleResult.ktype;
      ktypeSource = "glass_rules";
      console.log(`[kType] Glass rule hit for ${regnr}: kType=${resolvedKtype}, conf=${ruleResult.confidence}`);
    }
  } catch {
    // glass_rules table might not exist yet — silently continue
  }

  // 3b. Bovsoft kType (cached first, then API)
  let bovsoftVehicle: BovsoftVehicle | null = null;
  if (!resolvedKtype) {
    bovsoftVehicle = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
    if (!bovsoftVehicle && env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE && env.BOVSOFT_CLIENT_ID !== "NOT_SET") {
      bovsoftVehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);
      if (bovsoftVehicle) {
        await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, bovsoftVehicle);
      }
    }
    if (bovsoftVehicle && bovsoftVehicle.ktype > 0) {
      resolvedKtype = bovsoftVehicle.ktype;
      ktypeSource = "bovsoft";
    }
  }

  // 3c. Fallback: resolveGlass via vPIC (gratis) or paid APIs
  if (!resolvedKtype && vehicle.vin) {
    try {
      const glassResult = await resolveGlass({
        db,
        vin: vehicle.vin,
        opening: "windshield",
        market: "EU",
        mode: "auto",
        regnr,
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        vincarioApiKey: env.VINCARIO_API_KEY,
        vincarioSecretKey: env.VINCARIO_SECRET_KEY,
        macsVisApiKey: env.MACS_VIS_API_KEY,
        agmApiKey: env.AGM_API_KEY,
      });
      if (glassResult.status === "resolved" && glassResult.match?.ktype) {
        resolvedKtype = glassResult.match.ktype;
        ktypeSource = glassResult.paidLookupUsed ? "paid_api" : "vpic_rules";
      }
    } catch (e) {
      console.warn(`[kType] resolveGlass fallback failed for ${regnr}:`, e);
    }
  }

  // 3d. Cross-validate: if Bovsoft brand differs from SVV, log and prefer SVV
  if (bovsoftVehicle && bovsoftVehicle.brand && vehicle.make) {
    const bovBrand = bovsoftVehicle.brand.toLowerCase().replace(/[^a-z]/g, "");
    const svvBrand = vehicle.make.toLowerCase().replace(/[^a-z]/g, "");
    if (bovBrand !== svvBrand && !bovBrand.includes(svvBrand) && !svvBrand.includes(bovBrand)) {
      console.warn(`Brand mismatch for ${regnr}: SVV=${vehicle.make}, Bovsoft=${bovsoftVehicle.brand}`);
    }
  }

  // 3e. Merge kType into vehicle + save to glass_rules for future learning
  if (resolvedKtype && resolvedKtype > 0) {
    vehicle.k_type = resolvedKtype;

    // Persist in glass_rules for next time (fire-and-forget)
    try {
      const normalizedKey = [
        vehicle.make.toLowerCase().trim().replace(/\s+/g, "_"),
        vehicle.model.toLowerCase().trim().replace(/\s+/g, "_"),
        String(vehicle.year),
      ].join(":");
      await upsertGlassRule(db, {
        normalizedKey,
        market: "EU",
        opening: "windshield",
        featureSig: "default",
        match: {
          ktype: resolvedKtype,
          confidence: ktypeSource === "bovsoft" ? 0.90 : 0.75,
          source: ktypeSource,
        },
      });
    } catch {
      // glass_rules might not exist yet — silently continue
    }
  }

  // 3f. Also save SVV vehicle data to vin_decode_cache (fire-and-forget)
  if (vehicle.vin) {
    try {
      await db.prepare(`
        INSERT INTO vin_decode_cache
          (vin, market, source, make, model, year, normalized_key, confidence, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 days'))
        ON CONFLICT(vin) DO UPDATE SET
          make = excluded.make, model = excluded.model, year = excluded.year,
          normalized_key = excluded.normalized_key, expires_at = excluded.expires_at
      `).bind(
        vehicle.vin, "EU", "svv", vehicle.make, vehicle.model, vehicle.year,
        [vehicle.make, vehicle.model, String(vehicle.year)].join(":").toLowerCase().replace(/\s+/g, "_"),
        0.85
      ).run();
    } catch {
      // vin_decode_cache might not exist yet — silently continue
    }
  }

  // Lookup ktype registry info when we have a resolved ktype
  const ktypeRegistryInfo = resolvedKtype ? await queryKtypeRegistry(db, resolvedKtype) : null;

  // Find matching glass in D1 (db already declared above)
  const candidates: GlassRecord[] = [];
  let layer = 4;
  let confidence: string = "none";

  // === Layer -1: Ground truth from auto-glass.no ===
  if (gtCandidates.length > 0) {
    candidates.push(...gtCandidates);
    layer = -1;
    confidence = "exact";
  }

  // === Layer 0: kType exact match (statistical learning) ===
  if (candidates.length === 0 && vehicle.k_type > 0) {
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
      } else {
        // Layer 3b: brand-only without modelHint, then filter with modelMatches
        // This catches cases where SVV model has suffixes not in catalog (e.g. "WRANGLER UNLIMITED" vs "WRANGLER")
        const l3b = await queryByBrandOnly(db, vehicle.make);
        const l3bCompatible = l3b.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
        const l3bModel = l3bCompatible.filter((r) => modelMatches(vehicle.model, r.model, vehicle.make));
        if (l3bModel.length > 0) {
          candidates.push(...l3bModel);
          layer = 3;
          confidence = "medium";
        } else if (l3bCompatible.length > 0) {
          candidates.push(...l3bCompatible);
          layer = 3;
          confidence = "low";
        }
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

  // Learning Engine — check if we've seen this regnr before
  const learned = await getLearnedEquipment(db, regnr);
  const learnedByVin = vehicle.vin ? await getLearnedByVinPrefix(db, vehicle.vin) : null;

  // Smart Equipment Guesser — Hacker Mode v2.2
  // When Biluppgitter is unavailable, use catalog statistics to guess equipment
  const guessedEquipment = guessEquipment(
    vehicle.make,
    vehicle.model,
    vehicle.year,
    unifiedVin?.generation || parseGenerationFromDescription(vehicle.model)
  );

  // Merge equipment sources (priority: Biluppgitter > Learned > Catalog Guess > None)
  let effectiveEquipment: FactoryEquipment;
  let equipSource = "none";

  if (factoryEquipment) {
    effectiveEquipment = { ...factoryEquipment, source: "biluppgifter" };
    equipSource = "biluppgifter";
  } else if (learned && learned.search_count >= 2) {
    // Learned data with 2+ searches is fairly reliable
    effectiveEquipment = {
      rainSensor: learned.equipment.rainSensor,
      heated: learned.equipment.heated,
      acoustic: learned.equipment.acoustic,
      antenna: learned.equipment.antenna,
      camera: learned.equipment.camera,
      adas: learned.equipment.adas,
      hud: learned.equipment.hud,
      source: "learned",
      guessed: true,
      guessConfidence: learned.search_count >= 5 ? "high" : "medium",
      guessSource: "search_history",
    };
    equipSource = "learned";
  } else if (learnedByVin && learnedByVin.count >= 3) {
    // VIN-prefix learned data
    effectiveEquipment = {
      rainSensor: learnedByVin.equipment.rainSensor,
      heated: learnedByVin.equipment.heated,
      acoustic: learnedByVin.equipment.acoustic,
      antenna: learnedByVin.equipment.antenna,
      camera: learnedByVin.equipment.camera,
      adas: learnedByVin.equipment.adas,
      hud: learnedByVin.equipment.hud,
      source: "learned_vin",
      guessed: true,
      guessConfidence: learnedByVin.count >= 10 ? "high" : "medium",
      guessSource: "vin_prefix_history",
    };
    equipSource = "learned_vin";
  } else if (guessedEquipment.confidence !== "none") {
    effectiveEquipment = {
      rainSensor: guessedEquipment.rainSensor >= 0.5,
      heated: guessedEquipment.heated >= 0.5,
      acoustic: guessedEquipment.acoustic >= 0.5,
      antenna: guessedEquipment.antenna >= 0.5,
      camera: guessedEquipment.camera >= 0.5,
      adas: guessedEquipment.adas >= 0.5,
      hud: guessedEquipment.hud >= 0.5,
      source: "catalog_guess",
      guessed: true,
      guessConfidence: guessedEquipment.confidence,
      guessSource: guessedEquipment.source,
    };
    equipSource = "catalog_guess";
  } else {
    effectiveEquipment = {
      rainSensor: false,
      heated: false,
      acoustic: false,
      antenna: false,
      camera: false,
      adas: false,
      hud: false,
      source: "none",
    };
  }

  // Equipment flags from vehicle for scoring
  const vehicleFlags: ReturnType<typeof detectFlagsFromOem> = {
    adas: effectiveEquipment.adas,
    rainSensor: effectiveEquipment.rainSensor,
    heated: effectiveEquipment.heated,
    acoustic: effectiveEquipment.acoustic,
    antenna: effectiveEquipment.antenna,
    camera: effectiveEquipment.camera,
    hud: effectiveEquipment.hud,
  };

  // Re-check ground_truth with equipment filtering for exact variant matching
  // If a more specific ground truth entry exists with matching equipment, use it
  if (!groundTruth || (groundTruth && groundTruth.make === vehicle.make)) {
    try {
      const gtWithEquipment = await queryGroundTruthByVehicle(db, vehicle.make, vehicle.model, vehicle.year, {
        adas: effectiveEquipment.adas,
        rainSensor: effectiveEquipment.rainSensor,
        heated: effectiveEquipment.heated,
        acoustic: effectiveEquipment.acoustic,
        antenna: effectiveEquipment.antenna,
        hud: effectiveEquipment.hud,
        camera: effectiveEquipment.camera,
      });
      if (gtWithEquipment) {
        groundTruth = gtWithEquipment;
        gtCandidates = await groundTruthToCandidates(db, groundTruth);
        layer = -1;
        confidence = "exact";
      }
    } catch {
      // Silently continue if query fails
    }
  }

  // Compute dominant prefix4 from candidates for consensus scoring
  const prefix4Counts = new Map<string, number>();
  candidates.forEach(c => { if (c.prefix4) prefix4Counts.set(c.prefix4, (prefix4Counts.get(c.prefix4) || 0) + 1); });
  const dominantPrefix4 = Array.from(prefix4Counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Score and sort (with body compatibility + equipment + kType verification)
  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, vehicleFlags, vehicle, vinInfo, bovsoftVehicle || undefined, unifiedVin || undefined, dominantPrefix4) }))
    .sort((a, b) => b.score - a.score);

  // Optional category filter (e.g., ?regnr=SU18018&category=frontrute)
  const filteredScored = categoryFilter
    ? scored.filter((s) => {
        const cat = s.c.category?.toLowerCase() || detectCategoryFromDescription(s.c.description);
        return cat === categoryFilter.toLowerCase();
      })
    : scored;

  // === Top-per-type selection ===
  // Instead of global top-N, ensure each glass type is represented.
  // Group by inferred type code, take top 3 per type, flatten.
  const MAX_PER_TYPE = 3;
  const MAX_TOTAL = 30;

  const byType = new Map<string, typeof filteredScored>();
  for (const s of filteredScored) {
    const code = s.c.typeCode || inferTypeCodeFromRecord(s.c) || "UNKNOWN";
    if (!byType.has(code)) byType.set(code, []);
    byType.get(code)!.push(s);
  }

  const selected: typeof filteredScored = [];
  // First pass: one from each type (round-robin) to ensure coverage
  let round = 0;
  while (selected.length < MAX_TOTAL) {
    let addedInRound = 0;
    for (const [, list] of byType) {
      if (list[round] && selected.length < MAX_TOTAL) {
        selected.push(list[round]);
        addedInRound++;
      }
    }
    if (addedInRound === 0 || round >= MAX_PER_TYPE - 1) break;
    round++;
  }

  const candidatesWithEquipment = selected.map((s) => {
    const record = s.c;
    const nagsCodes = lookupNagsByVehicle(
      record.brand || '',
      record.model || '',
      record.year_from,
      record.year_to,
      record.category || inferTypeCodeFromRecord(record) || 'annet'
    );
    return {
      ...normalizeRecord(record),
      _score: s.score,
      _equipment: inferRecordEquipment(record),
      nagsCodes: nagsCodes.length > 0 ? nagsCodes : undefined,
    };
  });

  const topPick = candidatesWithEquipment[0] || null;

  // Determine confidence level
  const topCandidate = candidatesWithEquipment[0];
  if (factoryEquipment && topCandidate && confidence !== "exact") {
    const topEq = topCandidate._equipment || inferRecordEquipment(topCandidate);
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

  // Learning Engine: save this search result for future learning
  if (topCandidate) {
    const regnrHash = await sha256(regnr);
    await saveSearchResult(db, {
      regnr_hash: regnrHash,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      generation: unifiedVin?.generation || parseGenerationFromDescription(vehicle.model) || undefined,
      body: unifiedVin?.body || svvBody.bodyType || undefined,
      chosen_eurocode: topCandidate.eurocode,
      equipment: {
        adas: effectiveEquipment.adas,
        rainSensor: effectiveEquipment.rainSensor,
        heated: effectiveEquipment.heated,
        acoustic: effectiveEquipment.acoustic,
        antenna: effectiveEquipment.antenna,
        hud: effectiveEquipment.hud,
        camera: effectiveEquipment.camera,
        shade: (topCandidate._equipment || inferRecordEquipment(topCandidate)).shade,
      },
      layer,
      confidence,
      source: equipSource,
      vin_prefix: vehicle.vin ? vehicle.vin.slice(0, 6).toUpperCase() : undefined,
    });
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
        guessedEquipment: guessedEquipment.confidence !== "none"
          ? {
              adas: guessedEquipment.adas,
              rainSensor: guessedEquipment.rainSensor,
              heated: guessedEquipment.heated,
              acoustic: guessedEquipment.acoustic,
              antenna: guessedEquipment.antenna,
              camera: guessedEquipment.camera,
              hud: guessedEquipment.hud,
              shade: guessedEquipment.shade,
              confidence: guessedEquipment.confidence,
              source: guessedEquipment.source,
            }
          : null,
        effectiveEquipment: {
          rainSensor: effectiveEquipment.rainSensor,
          heated: effectiveEquipment.heated,
          acoustic: effectiveEquipment.acoustic,
          adas: effectiveEquipment.adas,
          camera: effectiveEquipment.camera,
          antenna: effectiveEquipment.antenna,
          hud: effectiveEquipment.hud,
          source: effectiveEquipment.source,
          guessed: effectiveEquipment.guessed,
          guessConfidence: effectiveEquipment.guessConfidence,
        },
      },
      candidates: candidatesWithEquipment,
      top_pick: topPick,
      confidence,
      layer,
      cache_hit: svvCacheHit,
      confidenceInfo: {
        score: layer === -1 ? 100 : layer === 0 ? 95 : layer === 1 ? 85 : layer === 2 ? 65 : layer === 3 ? 45 : 25,
        label: confidence,
        reasons: layer === -1
          ? ['Verifisert i ground truth database (auto-glass.no)']
          : layer === 0
            ? ['Eksakt match på kType fra TecDoc']
            : layer === 1
              ? ['Match på merke, modell og årsmodell']
              : layer === 2
                ? ['Match på merke og årsmodell', 'Verifiser modell før bestilling']
                : layer === 3
                  ? ['Kun match på merke', 'Sterkt anbefalt å verifisere modell og år']
                  : ['Begrenset data tilgjengelig'],
        layer,
        groundTruth: layer === -1,
      },
      resultsByType: groupByTypeCode(candidatesWithEquipment),
      // Extract most common prefix4 values from candidates as hints for direct lookup
      prefix4Hints: (() => {
        const counts = new Map<string, number>();
        candidatesWithEquipment.forEach((c: any) => {
          const p = c.prefix4;
          if (p) counts.set(p, (counts.get(p) || 0) + 1);
        });
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([prefix4, count]) => ({ prefix4, count }));
      })(),
      calibrationRequirements: await queryCalibrationRequirements(
        db,
        vehicle.make,
        vehicle.model,
        vehicle.year
      ),
      ktypeInfo: ktypeRegistryInfo,
      sources: [source, bovsoftVehicle ? "bovsoft" : "none", effectiveEquipment.source],
    },
  };
  } catch (e) {
    console.error(`searchByRegnr exception for ${regnr}: ${e instanceof Error ? e.message : String(e)}`);
    return {
      httpStatus: 500,
      body: { error: "En intern feil oppstod under søket. Prøv igjen senere.", regnr, code: "internal_error" },
    };
  }
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      const vincarioConfigured = !!(env.VINCARIO_API_KEY && env.VINCARIO_SECRET_KEY);
      const macsVisConfigured = !!env.MACS_VIS_API_KEY;
      return jsonResponse({
        status: "ok",
        version: "2.3",
        catalogSize: stats.total,
        brands: stats.brands,
        rulesCount: stats.rulesCount,
        rulesConfigured: stats.rulesCount > 0,
        d1Configured: true,
        svvConfigured,
        bovsoftConfigured,
        biluppgifterConfigured,
        vincarioConfigured,
        macsVisConfigured,
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
        const categoryFilter = url.searchParams.get("category") || undefined;
        const cacheKeyParams: Record<string, string> = { regnr };
        if (categoryFilter) cacheKeyParams.category = categoryFilter;
        // Cache hit — always 200 (we only cache successful lookups)
        const cache = await getCache<unknown>(env.GLASS_CATALOG, cacheKey("glass", cacheKeyParams));
        if (cache) return jsonResponse(cache);

        const result = await searchByRegnr(regnr, env, categoryFilter || undefined);
        // Only cache successful 200 responses; never cache errors (auth/upstream/not_found)
        if (result.httpStatus === 200) {
          await setCache(env.GLASS_CATALOG, cacheKey("glass", cacheKeyParams), result.body, 300);
        }
        const extraHeaders: Record<string, string> = {};
        if (result.retryAfter) extraHeaders["Retry-After"] = String(result.retryAfter);
        return jsonResponse(result.body, result.httpStatus, extraHeaders);
      }

      if (prefix4) {
        const cache = await getCache(env.GLASS_CATALOG, cacheKey("glass", { prefix4 }));
        if (cache) return jsonResponse(cache);

        const results = await queryByPrefix4(env.GLASS_CATALOG_D1, prefix4);
        const data = { query: { prefix4 }, count: results.length, results: results.map(normalizeRecord) };
        await setCache(env.GLASS_CATALOG, cacheKey("glass", { prefix4 }), data, 3600);
        return jsonResponse(data);
      }

      if (eurocode) {
        const cache = await getCache(env.GLASS_CATALOG, cacheKey("glass", { eurocode }));
        if (cache) return jsonResponse(cache);

        const result = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
        const data = { query: { eurocode }, count: result ? 1 : 0, results: result ? [normalizeRecord(result)] : [] };
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
      const priceMin = url.searchParams.get("price_min") ? parseInt(url.searchParams.get("price_min")!, 10) : undefined;
      const priceMax = url.searchParams.get("price_max") ? parseInt(url.searchParams.get("price_max")!, 10) : undefined;
      const equipment = url.searchParams.get("equipment")?.split(",").filter(Boolean);
      const inStock = url.searchParams.get("in_stock") === "1";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const perPage = Math.min(parseInt(url.searchParams.get("per_page") || "48", 10), 100);

      // ── KV Cache (180s TTL) ──────────────────────────────────────────────
      const cacheParams = normalizeCatalogSearchParams(url);
      const cacheKeyStr = cacheKey("catalog:search", cacheParams);
      const cached = await getCache<CacheEnvelope<unknown>>(env.GLASS_CATALOG, cacheKeyStr);
      if (cached && cached.version === CACHE_VERSION && cached.data) {
        return jsonResponse(cached.data, 200, {
          "X-Cache-Status": "HIT",
          "X-Cache-Key": cacheKeyStr,
          "X-Cached-At": cached.cachedAt,
        });
      }

      const offset = (page - 1) * perPage;
      const results = await searchCatalog(env.GLASS_CATALOG_D1, q, { brand, category, yearMin, yearMax, priceMin, priceMax, equipment, inStock }, offset, perPage + 1);
      const hasMore = results.length > perPage;
      const sliced = hasMore ? results.slice(0, perPage) : results;
      const responseBody = {
        query: q,
        page,
        perPage,
        count: sliced.length,
        total: results.length, // approximate
        hasMore,
        products: sliced.map(normalizeRecord),
        filters: { brands: [], categories: [], years: { min: 1960, max: 2030 }, prices: { min: 0, max: 150000 } },
      };

      // Store in KV with envelope (version + cachedAt)
      const envelope = buildCacheEnvelope(responseBody, CACHE_VERSION);
      await setCache(env.GLASS_CATALOG, cacheKeyStr, envelope, 180);

      return jsonResponse(responseBody, 200, {
        "X-Cache-Status": "MISS",
        "X-Cache-Key": cacheKeyStr,
      });
    }

    // ── Catalog: /api/catalog/bulk-lookup ──────────────────────────────────
    if (path === "/api/catalog/bulk-lookup") {
      const codesParam = url.searchParams.get("codes") || "";
      const codes = codesParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (codes.length === 0) {
        return errorResponse("Mangler codes parameter");
      }
      if (codes.length > 50) {
        return errorResponse("Maks 50 eurokoder per forespørsel");
      }

      const placeholders = codes.map(() => "?").join(",");
      const sql = `SELECT * FROM glass_catalog WHERE eurocode IN (${placeholders})`;
      const { results } = await env.GLASS_CATALOG_D1.prepare(sql).bind(...codes).all();
      const found = ((results || []) as unknown as GlassRecord[]).map(normalizeRecord);
      const foundCodes = new Set(found.map((r: any) => r.eurocode));
      const notFound = codes.filter((c) => !foundCodes.has(c));

      return jsonResponse({ found, notFound, count: found.length });
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

    // ── VIN Lookup: POST /api/vin-lookup ───────────────────────────────────
    if (path === "/api/vin-lookup" && request.method === "POST") {
      return handleVinLookup(request, env, ctx);
    }

    // ── VIN Lookup Status: GET /api/vin-lookup/status ──────────────────────
    if (path === "/api/vin-lookup/status" && request.method === "GET") {
      return handleVinLookupStatus(request, env);
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
