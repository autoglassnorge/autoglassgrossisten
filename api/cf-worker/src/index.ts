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
  return `cache:${endpoint}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
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
    forstegangsregistrering?: { registrertForstegangNorgeDato?: string };
    godkjenning?: {
      tekniskGodkjenning?: {
        tekniskeData?: {
          generelt?: {
            merke?: Array<{ merke: string }>;
            handelsbetegnelse?: Array<string>;
          };
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

    const merke = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke || "";
    const model = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] || "";
    const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
    const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;

    return {
      regno: regnr,
      vin: "",
      make: merke.toUpperCase(),
      model: model.toUpperCase(),
      year,
      k_type: 0,
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
  prefix4?: string
): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE brand = ? AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)";
  const params: (string | number)[] = [brand, year, year];
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " LIMIT 50";
  const { results } = await db.prepare(sql).bind(...params).all();
  return (results || []) as unknown as GlassRecord[];
}

async function queryByBrandOnly(db: D1Database, brand: string, prefix4?: string): Promise<GlassRecord[]> {
  let sql = "SELECT * FROM glass_catalog WHERE brand = ?";
  const params: (string | number)[] = [brand];
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " LIMIT 50";
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

function detectFlagsFromOem(oemDescriptions: string[]) {
  return {
    adas: oemDescriptions.some((d) => /adas|camera|sensor|kamera|filskifte|lane|collision/i.test(d)),
    rainSensor: oemDescriptions.some((d) => /rain|regn|wipe|vindusspor/i.test(d)),
    heated: oemDescriptions.some((d) => /heat|oppvarm|varme|defrost/i.test(d)),
    acoustic: oemDescriptions.some((d) => /acoustic|akustisk|quiet|støydemp/i.test(d)),
    antenna: oemDescriptions.some((d) => /antenna|antenne|radio|fm|dab/i.test(d)),
    hud: oemDescriptions.some((d) => /hud|head.up|projeksjon/i.test(d)),
  };
}

function scoreCandidate(c: GlassRecord, flags: ReturnType<typeof detectFlagsFromOem>): number {
  let score = 0;
  if (flags.adas && c.adas) score += 10;
  if (flags.rainSensor && c.rain_sensor) score += 8;
  if (flags.heated && c.heated) score += 6;
  if (flags.acoustic && c.acoustic) score += 4;
  if (flags.antenna && c.antenna) score += 4;
  if (flags.hud && c.hud) score += 6;
  if (!flags.adas && c.adas) score -= 3;
  if (!flags.hud && c.hud) score -= 2;
  return score;
}

function modelMatches(vehicleModel: string, recordModel: string | null): boolean {
  if (!recordModel || recordModel.trim() === "") return false;
  const vm = vehicleModel.toLowerCase().trim();
  const rm = recordModel.toLowerCase().trim();
  if (vm.includes(rm) || rm.includes(vm)) return true;
  const tokenize = (s: string) => s.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const vTokens = tokenize(vm);
  const rTokens = tokenize(rm);
  const common = rTokens.filter((t) => vTokens.includes(t));
  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 4) return true;
  if (rTokens.length === 1 && vTokens.includes(rTokens[0]) && rTokens[0].length >= 3) return true;
  return false;
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

  // Get prefix4 from first 4 digits of eurocode... but we don't know eurocode yet.
  // Try to match by brand + model + year
  const l1 = await queryByBrandAndYear(db, vehicle.make, vehicle.year);
  const l1Model = l1.filter((r) => modelMatches(vehicle.model, r.model));

  if (l1Model.length > 0) {
    candidates.push(...l1Model);
    layer = 1;
    confidence = "high";
  } else if (l1.length > 0) {
    candidates.push(...l1);
    layer = 2;
    confidence = "medium";
  } else {
    const l3 = await queryByBrandOnly(db, vehicle.make);
    if (l3.length > 0) {
      candidates.push(...l3);
      layer = 3;
      confidence = "medium";
    }
  }

  // Score and sort
  const flags = detectFlagsFromOem([]);
  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, flags) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.c);

  return {
    vehicle: {
      regnr: vehicle.regno,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      kType: vehicle.k_type,
    },
    candidates: scored.slice(0, 10),
    confidence,
    layer,
    flags,
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

    return errorResponse("Ukjent endepunkt", 404);
  },
};
