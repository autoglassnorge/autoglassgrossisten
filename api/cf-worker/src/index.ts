/**
 * Autoglass AS — Cloudflare Worker API
 * =====================================
 * Endepunkter:
 *   GET  /api/glass?regnr=AB12345       → søk på regnr
 *   GET  /api/glass?prefix4=5351        → søk på prefix4
 *   GET  /api/glass?eurocode=5351AGNMV  → direkte oppslag
 *   GET  /api/health                    → statussjekk
 *
 * Kilder:
 *   - SVV (Statens Vegvesen) Enkeltoppslag API — primær kjøretøyoppslag (API-nøkkel)
 *   - Biluppgifter — fallback
 */

export interface Env {
  GLASS_CATALOG: KVNamespace;
  BILUPPGIFTER_API_KEY: string;
  SVV_API_KEY: string;
}

interface CatalogData {
  meta: { totalRecords: number; exportedAt: string };
  records: GlassRecord[];
}

interface GlassRecord {
  eurocode: string;
  articleNumber: string;
  scanNumber: string | null;
  category: string;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null;
  stockStatus: number;
  warehouseLocation: string | null;
  oemNumbers: string[];
  crossReferences: string[];
  nagsCodes: string[];
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
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
// STATIC FILE SERVING (from KV — uploaded by CI)
// ============================================================================

const STATIC_CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

async function serveStaticFile(path: string, kv: KVNamespace): Promise<Response | null> {
  // Normalize: / → index.html, /vin-sok → vin-sok.html, /css/tokens.css stays
  let filePath = path;
  if (filePath === "/") filePath = "/index.html";
  if (!filePath.includes(".") && !filePath.endsWith("/")) filePath += ".html";

  // KV key: _site_index_html, _site_css_tokens_css, _site_js_search_glass_js
  const kvKey = "_site_" + filePath.replace(/^\//, "").replace(/[\/\.\-]/g, "_");

  const content = await kv.get(kvKey, "text");
  if (!content) return null;

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const ct = STATIC_CONTENT_TYPES[ext] || "text/plain";

  return new Response(content, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=3600",
    },
  });
}

// ============================================================================
// CORS HEADERS
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS,
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ============================================================================
// SVV ENKELTOPPSLAG API (Åpent API med API-nøkkel)
// ============================================================================

interface SvvKjoretoyData {
  kjoretoydata?: Array<{
    forstegangsregistrering?: {
      registrertForstegangNorgeDato?: string;
    };
    godkjenning?: {
      tekniskGodkjenning?: {
        tekniskeData?: {
          generelt?: {
            merke?: Array<{ merke?: string }>;
            handelsbetegnelse?: string[];
            typebetegnelse?: string;
          };
        };
      };
    };
    kjoretoyId?: {
      kjennemerke?: string;
      understellsnummer?: string;
    };
  }>;
}

function parseSvvEnkeltoppslag(data: SvvKjoretoyData, regnr: string): TecdocVehicle | null {
  const vehicle = data.kjoretoydata?.[0];
  if (!vehicle) return null;

  const generelt = vehicle.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt;
  if (!generelt) return null;

  const make = generelt.merke?.[0]?.merke || "Ukjent";
  const model = generelt.handelsbetegnelse?.[0] || generelt.typebetegnelse || "";
  const vin = vehicle.kjoretoyId?.understellsnummer || "";

  // Parse år fra førstegangsregistrering
  let year = new Date().getFullYear();
  const regDate = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato;
  if (regDate) {
    const parsed = new Date(regDate);
    if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
  }

  return {
    regno: regnr.toUpperCase(),
    vin,
    make: make.trim(),
    model: model.trim(),
    year,
    k_type: 0,
  };
}

async function fetchSvvEnkeltoppslag(regnr: string, apiKey: string): Promise<TecdocVehicle | null> {
  if (!apiKey || apiKey === "NOT_SET") return null;

  const cleanRegnr = regnr.replace(/\s/g, "").toUpperCase();

  try {
    const response = await fetch(
      `https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(cleanRegnr)}`,
      {
        headers: {
          "SVV-Authorization": `Apikey ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("SVV enkeltoppslag error:", response.status, text);
      return null;
    }

    const data = (await response.json()) as SvvKjoretoyData;
    return parseSvvEnkeltoppslag(data, cleanRegnr);
  } catch (err) {
    console.error("SVV enkeltoppslag fetch error:", err);
    return null;
  }
}

// ============================================================================
// BILUPPGIFTER API (fallback)
// ============================================================================

async function fetchTecdoc(regnr: string, apiKey: string): Promise<TecdocVehicle | null> {
  const url = `https://api.biluppgifter.se/api/v1/tecdoc/regno/${encodeURIComponent(regnr)}?country_code=NO`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { data: { vehicle: TecdocVehicle } };
  return data.data?.vehicle ?? null;
}

async function fetchOemFlags(vin: string, apiKey: string): Promise<string[]> {
  const url = `https://api.biluppgifter.se/api/v1/oem2/vin/${encodeURIComponent(vin)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: { vehicle?: { equipment?: Array<{ description: string }> } } };
    return (data.data?.vehicle?.equipment || []).map((e) => e.description.toLowerCase());
  } catch {
    return [];
  }
}

// ============================================================================
// KATALOG FRA KV
// ============================================================================

async function loadCatalog(kv: KVNamespace): Promise<GlassRecord[]> {
  const cached = await kv.get("catalog_records", { type: "json" });
  if (cached) return cached as GlassRecord[];

  const records: GlassRecord[] = [];
  let chunk = 0;
  while (true) {
    const data = await kv.get(`catalog_chunk_${chunk}`, { type: "json" });
    if (!data) break;
    records.push(...(data as GlassRecord[]));
    chunk++;
  }
  return records;
}

async function loadPrefix4Cache(kv: KVNamespace): Promise<Record<string, Array<{ prefix4: string; confidence: number }>>> {
  const cached = await kv.get("prefix4_cache", { type: "json" });
  if (!cached) return {};
  return (cached as { entries?: Record<string, Array<{ prefix4: string; confidence: number }>> }).entries || {};
}

// ============================================================================
// SØKELOGIKK
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
  if (flags.rainSensor && c.rainSensor) score += 8;
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

  const tokenize = (s: string) => s.split(/[^a-z0-9]+/).filter(t => t.length >= 2);
  const vTokens = tokenize(vm);
  const rTokens = tokenize(rm);

  const common = rTokens.filter(t => vTokens.includes(t));
  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 4) return true;

  if (rTokens.length === 1 && vTokens.includes(rTokens[0]) && rTokens[0].length >= 3) {
    return true;
  }

  return false;
}

async function searchByRegnr(regnr: string, env: Env): Promise<unknown> {
  // 1. Prøv SVV Enkeltoppslag først (åpent API med API-nøkkel)
  let vehicle: TecdocVehicle | null = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
  let source = "svv.enkeltoppslag";

  // 2. Fallback til Biluppgitter
  if (!vehicle && env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET") {
    vehicle = await fetchTecdoc(regnr, env.BILUPPGIFTER_API_KEY);
    source = "biluppgifter.tecdoc";
  }

  if (!vehicle) {
    return { error: "Kunne ikke slå opp registreringsnummer", regnr };
  }

  // 3. Hent flagg (kun Biluppgitter)
  let oemDescriptions: string[] = [];
  let flags = { adas: false, rainSensor: false, heated: false, acoustic: false, antenna: false, hud: false };

  if (source === "biluppgifter.tecdoc" && vehicle.vin && env.BILUPPGIFTER_API_KEY) {
    oemDescriptions = await fetchOemFlags(vehicle.vin, env.BILUPPGIFTER_API_KEY);
    flags = detectFlagsFromOem(oemDescriptions);
  }

  // 4. Last katalog
  const catalog = await loadCatalog(env.GLASS_CATALOG);

  // 5. Last prefix4-cache
  const prefix4Cache = await loadPrefix4Cache(env.GLASS_CATALOG);
  let prefix4: string | undefined;
  let prefix4Confidence = 0;

  const cacheKeys = [
    `${vehicle.make.toUpperCase()}:${vehicle.model.toUpperCase()}:${vehicle.year}`,
    `${vehicle.make.toUpperCase()}:${vehicle.model.toUpperCase()}`,
    `${vehicle.make.toUpperCase()}:${vehicle.year}`,
  ];

  for (const key of cacheKeys) {
    const entries = prefix4Cache[key];
    if (entries && entries.length > 0) {
      prefix4 = entries[0].prefix4;
      prefix4Confidence = entries[0].confidence;
      break;
    }
  }

  // Fallback
  if (!prefix4) {
    const yearMatch = catalog.filter((r) =>
      r.brand?.toLowerCase() === vehicle.make.toLowerCase() &&
      r.yearFrom && r.yearFrom <= vehicle.year &&
      (r.yearTo === null || r.yearTo >= vehicle.year)
    );
    if (yearMatch.length > 0) {
      const freq: Record<string, number> = {};
      for (const r of yearMatch) freq[r.prefix4] = (freq[r.prefix4] || 0) + 1;
      prefix4 = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
      prefix4Confidence = 1;
    }
  }

  // 6. Finn kandidater
  let candidates: GlassRecord[] = [];
  let layer = 4;
  let confidence: string = "none";

  if (prefix4) {
    candidates = catalog.filter((r) => r.prefix4 === prefix4);

    const l1 = candidates.filter((r) =>
      r.brand?.toLowerCase() === vehicle.make.toLowerCase() &&
      modelMatches(vehicle.model, r.model) &&
      r.yearFrom && r.yearFrom <= vehicle.year &&
      (r.yearTo === null || r.yearTo >= vehicle.year)
    );

    if (l1.length > 0) {
      candidates = l1;
      layer = 1;
      confidence = "high";
    } else {
      const l2 = candidates.filter((r) =>
        r.brand?.toLowerCase() === vehicle.make.toLowerCase() &&
        r.yearFrom && r.yearFrom <= vehicle.year &&
        (r.yearTo === null || r.yearTo >= vehicle.year)
      );
      if (l2.length > 0) {
        candidates = l2;
        layer = 2;
        confidence = "medium";
      } else {
        const l3 = candidates.filter((r) => r.brand?.toLowerCase() === vehicle.make.toLowerCase());
        if (l3.length > 0) {
          candidates = l3;
          layer = 3;
          confidence = "medium";
        } else {
          layer = 4;
          confidence = "low";
        }
      }
    }

    candidates = candidates
      .map((c) => ({ c, score: scoreCandidate(c, flags) }))
      .sort((a, b) => b.score - a.score)
      .map((s) => s.c);
  }

  const sources = [source];
  if (oemDescriptions.length > 0) sources.push("biluppgifter.oem");

  return {
    vehicle: {
      regnr: vehicle.regno,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      kType: vehicle.k_type,
    },
    candidates: candidates.slice(0, 10),
    confidence: prefix4Confidence >= 2 ? "high" : prefix4Confidence >= 1 ? "medium" : confidence,
    layer,
    prefix4,
    flags,
    sources,
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

    // Serve static site files from KV
    const staticResponse = await serveStaticFile(path, env.GLASS_CATALOG);
    if (staticResponse) {
      return staticResponse;
    }

    // Health check
    if (path === "/api/health") {
      const catalog = await loadCatalog(env.GLASS_CATALOG);
      const svvConfigured = !!(env.SVV_API_KEY && env.SVV_API_KEY !== "NOT_SET");
      const biluppgifterConfigured = !!(env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET");

      return jsonResponse({
        status: "ok",
        catalogSize: catalog.length,
        svvConfigured,
        biluppgifterConfigured,
        timestamp: new Date().toISOString(),
      });
    }

    // Glass søk
    if (path === "/api/glass") {
      const regnr = url.searchParams.get("regnr");
      const prefix4 = url.searchParams.get("prefix4");
      const eurocode = url.searchParams.get("eurocode");
      const type = url.searchParams.get("type");

      if (regnr) {
        let result = await searchByRegnr(regnr, env) as any;
        if (type && result.candidates) {
          const typeLower = type.toLowerCase();
          result.candidates = result.candidates.filter((r: any) =>
            r.category?.toLowerCase() === typeLower ||
            r.description?.toLowerCase().includes(typeLower)
          );
        }
        return jsonResponse(result);
      }

      if (prefix4 || eurocode) {
        const catalog = await loadCatalog(env.GLASS_CATALOG);
        let results = catalog;

        if (eurocode) {
          results = results.filter((r) =>
            r.eurocode.toLowerCase() === eurocode.toLowerCase()
          );
        } else if (prefix4) {
          results = results.filter((r) => r.prefix4 === prefix4);
        }

        return jsonResponse({
          query: { prefix4, eurocode },
          count: results.length,
          results: results.slice(0, 50),
        });
      }

      return errorResponse("Mangler parameter: regnr, prefix4 eller eurocode");
    }

    return errorResponse("Ukjent endepunkt", 404);
  },
};
