/**
 * POST /api/vin-lookup
 * ====================
 * Unified VIN / regnr lookup endpoint with async enrichment.
 *
 * Request body:
 *   {
 *     regnr?: string,      // Norwegian regnr (e.g. "SU18018")
 *     vin?: string,        // 17-char VIN
 *     opening?: string,    // "windshield" | "backglass" | ...
 *     features?: object,   // { camera?, hud?, rainSensor?, heated?, acoustic? }
 *     mode?: "auto" | "free_only" | "paid_only"
 *   }
 *
 * Response:
 *   { status: "resolved", requestId: number, match: GlassMatch, vehicle: {...} }
 *   { status: "pending",  requestId: number, message: "Enrichment queued" }
 *   { status: "needs_review", requestId: number, reasons: string[] }
 *   { status: "failed", error: string }
 */

import { resolveGlass, upsertGlassRule, GlassMatch } from "./vin-glass-resolver";
import { decodeVinVincario, VincarioConfig } from "./providers/vincario";
import { normalizeRegnr, normalizeVin, REGNR_PATTERN, VIN_PATTERN } from "./lib/input-detector";
import { lookupVinKtype } from "./lib/db";

export interface VinLookupRequest {
  regnr?: string;
  vin?: string;
  opening?: string;
  features?: Record<string, boolean>;
  mode?: "auto" | "free_only" | "paid_only";
}

export interface VinLookupResponse {
  status: "resolved" | "pending" | "needs_review" | "failed";
  requestId?: number;
  match?: GlassMatch;
  vehicle?: {
    make: string;
    model: string;
    year: number;
    vin: string;
    kType?: number;
    bodyClass?: string;
  };
  reasons?: string[];
  error?: string;
  resolutionPath?: string[];
  paidLookupUsed?: boolean;
  providerCost?: number;
}

const SVV_API_URL =
  "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

interface VinDecodeCacheRow {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  normalized_key: string | null;
  confidence: number;
  expires_at: string;
}

/**
 * Main handler for POST /api/vin-lookup
 */
export async function handleVinLookup(
  request: Request,
  env: {
    GLASS_CATALOG_D1: D1Database;
    SVV_API_KEY: string;
    VINCARIO_API_KEY?: string;
    VINCARIO_SECRET_KEY?: string;
    MACS_VIS_API_KEY?: string;
    AGM_API_KEY?: string;
  },
  ctx: ExecutionContext
): Promise<Response> {
  let body: VinLookupRequest;
  try {
    body = (await request.json()) as VinLookupRequest;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const {
    regnr: rawRegnr,
    vin: rawInputVin,
    opening = "windshield",
    features = {},
    mode = "auto",
  } = body;
  const regnr = rawRegnr ? normalizeRegnr(rawRegnr) : undefined;
  const inputVin = rawInputVin ? normalizeVin(rawInputVin) : undefined;

  // Validate input
  if (!regnr && !inputVin) {
    return jsonError("Either regnr or vin is required", 400);
  }

  if (regnr && !REGNR_PATTERN.test(regnr)) {
    return jsonError(`Invalid regnr format: ${rawRegnr}`, 400);
  }

  if (inputVin && !VIN_PATTERN.test(inputVin)) {
    return jsonError(`Invalid VIN format: ${rawInputVin}`, 400);
  }

  const db = env.GLASS_CATALOG_D1;

  try {
    // ── Step 1: Resolve regnr → VIN + vehicle data via SVV ──
    let resolvedVin = inputVin ?? "";
    let vehicleMake = "";
    let vehicleModel = "";
    let vehicleYear = 0;
    let vehicleSource = regnr && !resolvedVin ? "svv" : "vin";

    if (regnr && !resolvedVin) {
      const svvResult = await fetchSvv(regnr, env.SVV_API_KEY);
      if (!svvResult) {
        return jsonError(`Regnr ${regnr} not found in SVV`, 404);
      }
      resolvedVin = svvResult.vin;
      vehicleMake = svvResult.make;
      vehicleModel = svvResult.model;
      vehicleYear = svvResult.year;
      vehicleSource = "svv";
    }

    if (!resolvedVin || resolvedVin.length !== 17) {
      return jsonError("Could not resolve VIN", 404);
    }

    if ((!vehicleMake || !vehicleModel || !vehicleYear) && resolvedVin) {
      const cachedVin = await lookupVinDecodeCache(db, resolvedVin);
      if (cachedVin) {
        vehicleMake = vehicleMake || cachedVin.make || "";
        vehicleModel = vehicleModel || cachedVin.model || "";
        vehicleYear = vehicleYear || cachedVin.year || 0;
        vehicleSource = cachedVin.make || cachedVin.model || cachedVin.year ? "vin_decode_cache" : vehicleSource;
      }
    }

    // ── Step 1b: Check vin_ktype_map for a pre-computed VIN → kType mapping ──
    // This matches the fast path used by /api/glass?regnr=... and gives
    // immediate exact kType resolution for the ~99.6 % of VINs we already know.
    if (resolvedVin) {
      const vinKtypeEntry = await lookupVinKtype(db, resolvedVin);
      if (vinKtypeEntry && vinKtypeEntry.confidence >= 0.85) {
        const match: GlassMatch = {
          ktype: vinKtypeEntry.ktype,
          confidence: vinKtypeEntry.confidence,
          source: vinKtypeEntry.source,
        };
        return jsonResponse({
          status: "resolved",
          match,
          vehicle: {
            make: vinKtypeEntry.make || vehicleMake || "",
            model: vinKtypeEntry.model || vehicleModel || "",
            year: vinKtypeEntry.year || vehicleYear || 0,
            vin: resolvedVin,
            kType: vinKtypeEntry.ktype,
            bodyClass: "",
          },
          resolutionPath: [vehicleSource, "vin_ktype_map"],
          paidLookupUsed: false,
        });
      }
    }

    // ── Step 2: Check glass_rules synchronously (Layer 0) ──
    const normalizedKey = [
      (vehicleMake || "unknown").toLowerCase().trim().replace(/\s+/g, "_"),
      (vehicleModel || "unknown").toLowerCase().trim().replace(/\s+/g, "_"),
      String(vehicleYear || 0),
    ].join(":");

    const ruleResult = await db
      .prepare(
        "SELECT ktype, confidence, evidence_count FROM glass_rules WHERE normalized_key = ? AND active = 1 ORDER BY confidence DESC, evidence_count DESC LIMIT 1"
      )
      .bind(normalizedKey)
      .first<{ ktype: number; confidence: number; evidence_count: number }>();

    if (ruleResult && ruleResult.ktype && ruleResult.confidence >= 0.90) {
      // High-confidence cache hit — return immediately
      const match: GlassMatch = {
        ktype: ruleResult.ktype,
        confidence: ruleResult.confidence,
        source: "glass_rules",
      };

      return jsonResponse({
        status: "resolved",
        match,
        vehicle: {
          make: vehicleMake,
          model: vehicleModel,
          year: vehicleYear,
          vin: resolvedVin,
          kType: ruleResult.ktype,
          bodyClass: "",
        },
        resolutionPath: [vehicleSource, "glass_rules"],
        paidLookupUsed: false,
      });
    }

    // ── Step 3: Medium-confidence rule hit (return with warning) ──
    if (ruleResult && ruleResult.ktype && ruleResult.confidence >= 0.75) {
      const match: GlassMatch = {
        ktype: ruleResult.ktype,
        confidence: ruleResult.confidence,
        source: "glass_rules",
      };

      return jsonResponse({
        status: "resolved",
        match,
        vehicle: {
          make: vehicleMake,
          model: vehicleModel,
          year: vehicleYear,
          vin: resolvedVin,
          kType: ruleResult.ktype,
          bodyClass: "",
        },
        resolutionPath: [vehicleSource, "glass_rules"],
        paidLookupUsed: false,
      });
    }

    // ── Step 4: No cache hit — trigger async enrichment ──
    // Return pending immediately, enrichment runs in background
    const requestId = await createPendingRequest(db, resolvedVin, opening, mode, features);

    // Fire-and-forget enrichment
    ctx.waitUntil(
      enrichAsync(db, resolvedVin, opening, mode, features, env, vehicleMake, vehicleModel, vehicleYear, requestId)
    );

    return jsonResponse({
      status: "pending",
      requestId,
      message: "Enrichment queued. Poll /api/vin-lookup/status?requestId=" + requestId,
      vehicle: {
        make: vehicleMake,
        model: vehicleModel,
        year: vehicleYear,
        vin: resolvedVin,
      },
    });
  } catch (err) {
    console.error("[vin-lookup] Error:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
}

async function lookupVinDecodeCache(db: D1Database, vin: string): Promise<VinDecodeCacheRow | null> {
  try {
    return await db
      .prepare("SELECT vin, make, model, year, normalized_key, confidence, expires_at FROM vin_decode_cache WHERE vin = ? AND expires_at > datetime('now')")
      .bind(vin)
      .first<VinDecodeCacheRow>();
  } catch {
    return null;
  }
}

/**
 * Poll endpoint: GET /api/vin-lookup/status?requestId=123
 */
export async function handleVinLookupStatus(
  request: Request,
  env: { GLASS_CATALOG_D1: D1Database }
): Promise<Response> {
  const url = new URL(request.url);
  const requestId = parseInt(url.searchParams.get("requestId") || "", 10);
  if (isNaN(requestId)) {
    return jsonError("requestId required", 400);
  }

  try {
    const row = await env.GLASS_CATALOG_D1
      .prepare("SELECT * FROM glass_resolution_requests WHERE id = ?")
      .bind(requestId)
      .first<{
        status: string;
        resolution_path: string;
        paid_lookup_used: number;
        provider_cost: number | null;
      }>();

    if (!row) {
      return jsonError("Request not found", 404);
    }

    return jsonResponse({
      status: row.status,
      requestId,
      resolutionPath: JSON.parse(row.resolution_path || "[]"),
      paidLookupUsed: row.paid_lookup_used === 1,
      providerCost: row.provider_cost ?? undefined,
    });
  } catch (err) {
    return jsonError("Failed to fetch status", 500);
  }
}

// ---------------------------------------------------------------------------
// Async enrichment
// ---------------------------------------------------------------------------

async function enrichAsync(
  db: D1Database,
  vin: string,
  opening: string,
  mode: string,
  features: Record<string, boolean>,
  env: {
    VINCARIO_API_KEY?: string;
    VINCARIO_SECRET_KEY?: string;
    MACS_VIS_API_KEY?: string;
    AGM_API_KEY?: string;
  },
  vehicleMake: string,
  vehicleModel: string,
  vehicleYear: number,
  requestId: number
): Promise<void> {
  try {
    // Build Vincario config if keys available
    const vincarioConfig: VincarioConfig | undefined =
      env.VINCARIO_API_KEY && env.VINCARIO_SECRET_KEY
        ? { apiKey: env.VINCARIO_API_KEY, secretKey: env.VINCARIO_SECRET_KEY }
        : undefined;

    // Run full resolver
    const result = await resolveGlass({
      db,
      vin,
      opening: opening as any,
      market: "EU",
      mode: mode as any,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      macsVisApiKey: env.MACS_VIS_API_KEY,
      agmApiKey: env.AGM_API_KEY,
    });

    // Optional: enrich with Vincario for higher confidence vehicle data
    if (vincarioConfig && result.status === "needs_review") {
      try {
        const vincResult = await decodeVinVincario(vin, vincarioConfig);
        if (vincResult.vehicle) {
          // Log Vincario enrichment for future analysis
          await db
            .prepare(
              `INSERT INTO provider_calls
                (provider, operation, success, http_status, latency_ms, request_payload, response_payload, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            )
            .bind(
              "vincario",
              "enrich",
              vincResult.httpStatus === 200 ? 1 : 0,
              vincResult.httpStatus,
              vincResult.latencyMs,
              JSON.stringify({ vin }),
              JSON.stringify({ make: vincResult.vehicle.make, model: vincResult.vehicle.model, year: vincResult.vehicle.year })
            )
            .run();
        }
      } catch {
        // Non-fatal: Vincario enrichment is best-effort
      }
    }

    // Update resolution request status
    const resolutionPath = JSON.stringify(result.resolutionPath || []);
    const paidLookupUsed = result.paidLookupUsed ? 1 : 0;
    const providerCost = result.providerCost ?? null;

    if (result.status === "resolved" && result.match?.ktype) {
      // Cache hit — upsert glass_rules + mark request resolved
      const normalizedKey = [
        vehicleMake.toLowerCase().trim().replace(/\s+/g, "_"),
        vehicleModel.toLowerCase().trim().replace(/\s+/g, "_"),
        String(vehicleYear),
      ].join(":");

      await upsertGlassRule(db, {
        normalizedKey,
        market: "EU",
        opening,
        featureSig: "default",
        match: {
          ktype: result.match.ktype,
          confidence: result.match.confidence,
          source: result.match.source,
        },
      });

      await db
        .prepare(
          `UPDATE glass_resolution_requests
           SET status = 'resolved',
               resolution_path = ?,
               paid_lookup_used = ?,
               provider_cost = ?,
               resolved_at = datetime('now')
           WHERE id = ?`
        )
        .bind(resolutionPath, paidLookupUsed, providerCost, requestId)
        .run();
    } else if (result.status === "needs_review") {
      await db
        .prepare(
          `UPDATE glass_resolution_requests
           SET status = 'needs_review',
               resolution_path = ?,
               paid_lookup_used = ?,
               provider_cost = ?,
               resolved_at = datetime('now')
           WHERE id = ?`
        )
        .bind(resolutionPath, paidLookupUsed, providerCost, requestId)
        .run();
    } else {
      // no_match or other terminal state
      await db
        .prepare(
          `UPDATE glass_resolution_requests
           SET status = ?,
               resolution_path = ?,
               paid_lookup_used = ?,
               provider_cost = ?,
               resolved_at = datetime('now')
           WHERE id = ?`
        )
        .bind(result.status || "failed", resolutionPath, paidLookupUsed, providerCost, requestId)
        .run();
    }
  } catch (err) {
    console.error(`[enrichAsync] requestId=${requestId} failed:`, err);
    // Mark request as failed on exception
    try {
      await db
        .prepare(
          `UPDATE glass_resolution_requests
           SET status = 'failed',
               resolution_path = ?,
               resolved_at = datetime('now')
           WHERE id = ?`
        )
        .bind(JSON.stringify(["svv", "enrich_error"]), requestId)
        .run();
    } catch {
      // Best-effort: ignore secondary failure
    }
  }
}

// ---------------------------------------------------------------------------
// SVV lookup
// ---------------------------------------------------------------------------

interface SvvVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
}

async function fetchSvv(regnr: string, apiKey: string): Promise<SvvVehicle | null> {
  try {
    const res = await fetch(`${SVV_API_URL}?kjennemerke=${encodeURIComponent(regnr.toUpperCase())}`, {
      headers: {
        Accept: "application/json",
        "SVV-Authorization": `Apikey ${apiKey}`,
        "User-Agent": "AutoglassAS-B2B/1.0",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const k = data.kjoretoydataListe?.[0];
    if (!k) return null;

    const make = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.merke?.[0]?.merke ?? "";
    const model = k.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt?.handelsbetegnelse?.[0] ?? "";
    const vin = k.kjoretoyId?.understellsnummer ?? "";
    const firstReg = k.forstegangsregistrering?.registrertForstegangNorgeDato ?? "";
    const year = firstReg ? parseInt(firstReg.split("-")[0], 10) : 0;

    if (!vin || vin.length !== 17) return null;

    return { vin, make, model, year };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function createPendingRequest(
  db: D1Database,
  vin: string,
  opening: string,
  mode: string,
  features: Record<string, boolean>
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO glass_resolution_requests
        (vin, opening, market, mode, features, feature_signature, status, resolution_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      vin,
      opening,
      "EU",
      mode,
      JSON.stringify(features),
      buildFeatureSignature(opening, features),
      "pending",
      JSON.stringify(["svv", "queued"])
    )
    .run();

  return result.meta?.last_row_id ?? 0;
}

function buildFeatureSignature(opening: string, features: Record<string, boolean>): string {
  const b = (k: string) => (features[k] ? "1" : "0");
  return `${opening}|camera:${b("camera")}|hud:${b("hud")}|rain:${b("rainSensor")}|heated:${b("heated")}|acoustic:${b("acoustic")}`;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ status: "failed", error: message }, status);
}
