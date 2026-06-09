/**
 * Unified search handler — /api/search
 * Routes any input (regnr, VIN, eurocode, OEM, SKU, text) to the appropriate
 * backend lookup and normalises the response into UnifiedSearchResponse.
 */

import type {
  Env,
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchResult,
  GlassRecord,
} from "../types";
import type { InputType, DetectedInput } from "../lib/input-detector";
import { detectInputType, validateInput } from "../lib/input-detector";
import { searchByRegnr } from "./search";
import { handleVinLookup } from "./vin";
import {
  queryByEurocode,
  queryByOemNumber,
  queryBySupplierSku,
  queryByKtype,
} from "../lib/db";
import { normalizeRecord } from "../lib/normalize";
import { jsonResponse, errorResponse } from "../lib/cors";

/** Normalise raw input the same way detectInputType would for a given type. */
function normalizeForType(raw: string, type: InputType): string {
  const trimmed = raw.trim();
  switch (type) {
    case "regnr":
    case "vin":
      return trimmed.toUpperCase().replace(/\s+/g, "");
    case "eurocode":
    case "oem":
    case "sku":
      return trimmed.toUpperCase();
    case "text":
      return trimmed;
    default:
      return trimmed;
  }
}



/** Build a catalog-lookup UnifiedSearchResponse (handles 0 hits gracefully). */
function buildCatalogResponse(
  rawInput: string,
  detectedType: InputType,
  normalized: string,
  records: GlassRecord[]
): UnifiedSearchResponse {
  if (records.length === 0) {
    return {
      ok: true,
      input: { raw: rawInput, detectedType, normalized },
      results: [],
      confidence: {
        level: "none",
        score: 0,
        layer: 99,
        reasons: ["Ingen treff i katalogen for denne identifikatoren"],
      },
      nextActions: [
        { action: "search_catalog", label: "Søk i katalog" },
        { action: "ask_professor", label: "Spør Professor Autoglass" },
      ],
    };
  }

  return {
    ok: true,
    input: { raw: rawInput, detectedType, normalized },
    results: records.map((r) => ({
      ...(normalizeRecord(r) as Record<string, unknown>),
      score: 100,
    })) as unknown as UnifiedSearchResponse["results"],
    confidence: {
      level: "exact",
      score: 100,
      layer: -1,
      reasons: ["Direct catalog lookup by unique identifier"],
    },
    nextActions: [{ action: "add_to_quote", label: "Be om tilbud" }],
  };
}

/** Convert a SearchResult from searchByRegnr into UnifiedSearchResponse. */
function buildRegnrResponse(
  rawInput: string,
  detected: DetectedInput,
  result: SearchResult
): UnifiedSearchResponse {
  const body = result.body as Record<string, unknown> | undefined;

  if (!body || result.httpStatus !== 200) {
    const errorBody = body || {};
    return {
      ok: false,
      error: {
        code: "search_failed",
        message:
          typeof errorBody.error === "string"
            ? errorBody.error
            : "Søket feilet",
      },
      input: {
        raw: rawInput,
        detectedType: detected.type,
        normalized: detected.normalized,
      },
      results: [],
      confidence: {
        level: "none",
        score: 0,
        layer: 99,
        reasons: ["Søket returnerte ingen resultater"],
      },
      nextActions: [],
    };
  }

  const candidates =
    (body.candidates as Array<Record<string, unknown>>) || [];
  const confidenceLabel = String(body.confidence || "none");
  const layer = typeof body.layer === "number" ? body.layer : 99;
  const confidenceInfo =
    (body.confidenceInfo as Record<string, unknown> | undefined) || {};
  const reasons = Array.isArray(confidenceInfo.reasons)
    ? (confidenceInfo.reasons as string[])
    : [];
  const topPick = body.top_pick ?? null;
  const resultsByType =
    (body.resultsByType as Record<string, unknown[] | undefined>) || {};
  const vehicleData =
    (body.vehicle as Record<string, unknown> | undefined) || {};

  const results = candidates.map((c) => ({
    ...c,
    score: typeof c._score === "number" ? c._score : 0,
  })) as unknown as UnifiedSearchResponse["results"];

  const response: UnifiedSearchResponse = {
    ok: true,
    input: {
      raw: rawInput,
      detectedType: detected.type,
      normalized: detected.normalized,
    },
    vehicle: {
      make:
        typeof vehicleData.make === "string"
          ? vehicleData.make
          : undefined,
      model:
        typeof vehicleData.model === "string"
          ? vehicleData.model
          : undefined,
      year:
        typeof vehicleData.year === "number"
          ? vehicleData.year
          : undefined,
      vin:
        typeof vehicleData.vin === "string"
          ? vehicleData.vin
          : undefined,
      regnr:
        typeof vehicleData.regnr === "string"
          ? vehicleData.regnr
          : detected.normalized,
      kType:
        typeof vehicleData.kType === "number"
          ? vehicleData.kType
          : undefined,
    },
    results,
    confidence: {
      level: confidenceLabel as UnifiedSearchResponse["confidence"]["level"],
      score:
        typeof confidenceInfo.score === "number" ? confidenceInfo.score : 0,
      layer,
      reasons:
        reasons.length > 0
          ? reasons
          : ["Ingen detaljert forklaring tilgjengelig"],
    },
    groupedByType: resultsByType as Record<string, unknown[]>,
    bestMatch: topPick,
    nextActions: [{ action: "add_to_quote", label: "Be om tilbud" }],
  };

  if (confidenceLabel === "medium" || confidenceLabel === "low") {
    response.equipmentVerifier = {
      required: true,
      questions: [
        {
          key: "camera",
          label: "Har bilen kamera i frontruta?",
          description: "ADAS / filholder-kamera",
        },
        {
          key: "rainSensor",
          label: "Har bilen regnsensor?",
          description: "Automatisk vindusvisker",
        },
        {
          key: "heated",
          label: "Er ruta oppvarmet?",
          description: "Elektrisk oppvarming",
        },
        {
          key: "acoustic",
          label: "Er rua akustisk?",
          description: "Støydempet glass",
        },
        {
          key: "hud",
          label: "Har bilen head-up display?",
          description: "Projeksjon i frontrute",
        },
      ],
    };
  }

  return response;
}

/** Convert a VIN-lookup Response into UnifiedSearchResponse. */
async function buildVinResponse(
  rawInput: string,
  detected: DetectedInput,
  env: Env,
  vinResponse: Response
): Promise<UnifiedSearchResponse> {
  let vinData: Record<string, unknown>;
  try {
    vinData = (await vinResponse.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: {
        code: "vin_parse_error",
        message: "Kunne ikke tolke VIN-oppslagsvar",
      },
      input: {
        raw: rawInput,
        detectedType: detected.type,
        normalized: detected.normalized,
      },
      results: [],
      confidence: {
        level: "none",
        score: 0,
        layer: 99,
        reasons: ["VIN-oppslag returnerte ugyldig JSON"],
      },
      nextActions: [],
    };
  }

  const status = String(vinData.status || "failed");

  if (status === "failed") {
    const errorMsg =
      typeof vinData.error === "string"
        ? vinData.error
        : "VIN-oppslag feilet";
    return {
      ok: false,
      error: { code: "vin_lookup_failed", message: errorMsg },
      input: {
        raw: rawInput,
        detectedType: detected.type,
        normalized: detected.normalized,
      },
      results: [],
      confidence: {
        level: "none",
        score: 0,
        layer: 99,
        reasons: [errorMsg],
      },
      nextActions: [],
    };
  }

  const vehicleData =
    (vinData.vehicle as Record<string, unknown> | undefined) || {};
  const match =
    (vinData.match as Record<string, unknown> | undefined) || {};
  const kType = typeof match.ktype === "number" ? match.ktype : 0;

  // If resolved with kType, fetch actual glass records from catalog
  let records: GlassRecord[] = [];
  if (status === "resolved" && kType > 0) {
    records = await queryByKtype(env.GLASS_CATALOG_D1, kType);
  }

  const reasons: string[] =
    status === "resolved"
      ? ["VIN-oppslag løst via glass_rules / resolver"]
      : status === "pending"
        ? [
            "VIN-oppslag er i kø for berikelse. Poll /api/vin-lookup/status",
          ]
        : typeof vinData.reasons === "string"
          ? [vinData.reasons as string]
          : Array.isArray(vinData.reasons)
            ? (vinData.reasons as string[])
            : ["VIN-oppslag krever manuell gjennomgang"];

  const response: UnifiedSearchResponse = {
    ok: status === "resolved",
    input: {
      raw: rawInput,
      detectedType: detected.type,
      normalized: detected.normalized,
    },
    vehicle: {
      make:
        typeof vehicleData.make === "string"
          ? vehicleData.make
          : undefined,
      model:
        typeof vehicleData.model === "string"
          ? vehicleData.model
          : undefined,
      year:
        typeof vehicleData.year === "number"
          ? vehicleData.year
          : undefined,
      vin:
        typeof vehicleData.vin === "string"
          ? vehicleData.vin
          : detected.normalized,
      kType: kType > 0 ? kType : undefined,
    },
    results: records.map((r) => ({
      ...(normalizeRecord(r) as Record<string, unknown>),
      score: 100,
    })) as unknown as UnifiedSearchResponse["results"],
    confidence: {
      level: status === "resolved" ? "high" : "none",
      score: status === "resolved" ? 90 : 0,
      layer: status === "resolved" ? 0 : 99,
      reasons,
    },
    nextActions:
      status === "resolved"
        ? [{ action: "add_to_quote", label: "Be om tilbud" }]
        : status === "pending"
          ? [
              {
                action: "poll_vin_status",
                label: "Sjekk VIN-status",
              },
            ]
          : [
              {
                action: "ask_professor",
                label: "Spør Professor Autoglass",
              },
            ],
  };

  return response;
}

export async function handleUnifiedSearch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Ugyldig JSON i forespørselen", 400);
    }

    const req = body as UnifiedSearchRequest;
    const rawInput = typeof req.input === "string" ? req.input.trim() : "";

    if (!rawInput) {
      return errorResponse("Mangler påkrevd felt: input", 400);
    }

    const detected: DetectedInput = req.type
      ? {
          type: req.type,
          normalized: normalizeForType(rawInput, req.type),
          confidence: 1.0,
        }
      : detectInputType(rawInput);

    const validation = validateInput(detected);
    if (!validation.valid) {
      return errorResponse(validation.error || "Ugyldig input", 400);
    }

    const category =
      typeof req.category === "string" ? req.category : undefined;

    switch (detected.type) {
      case "regnr": {
        const result = await searchByRegnr(
          detected.normalized,
          env,
          category
        );
        const unified = buildRegnrResponse(rawInput, detected, result);
        return jsonResponse(unified);
      }

      case "vin": {
        const syntheticRequest = new Request(
          "http://internal/api/vin-lookup",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vin: detected.normalized,
              opening: "windshield",
              market: "EU",
              mode: "auto",
            }),
          }
        );
        const vinResponse = await handleVinLookup(
          syntheticRequest,
          env,
          ctx
        );
        const unified = await buildVinResponse(
          rawInput,
          detected,
          env,
          vinResponse
        );
        return jsonResponse(unified);
      }

      case "eurocode": {
        const record = await queryByEurocode(
          env.GLASS_CATALOG_D1,
          detected.normalized
        );
        const records = record ? [record] : [];
        const unified = buildCatalogResponse(
          rawInput,
          detected.type,
          detected.normalized,
          records
        );
        return jsonResponse(unified);
      }

      case "oem": {
        const records = await queryByOemNumber(
          env.GLASS_CATALOG_D1,
          detected.normalized
        );
        const unified = buildCatalogResponse(
          rawInput,
          detected.type,
          detected.normalized,
          records
        );
        return jsonResponse(unified);
      }

      case "sku": {
        const record = await queryBySupplierSku(
          env.GLASS_CATALOG_D1,
          detected.normalized
        );
        const records = record ? [record] : [];
        const unified = buildCatalogResponse(
          rawInput,
          detected.type,
          detected.normalized,
          records
        );
        return jsonResponse(unified);
      }

      case "text": {
        const unified: UnifiedSearchResponse = {
          ok: true,
          input: {
            raw: rawInput,
            detectedType: detected.type,
            normalized: detected.normalized,
          },
          results: [],
          confidence: {
            level: "none",
            score: 0,
            layer: 99,
            reasons: ["Free-text search requires AI processing (Phase 3)"],
          },
          nextActions: [
            { action: "ask_professor", label: "Spør Professor Autoglass" },
          ],
        };
        return jsonResponse(unified);
      }

      default: {
        // Exhaustiveness check — should never reach here
        return errorResponse("Ukjent input-type", 400);
      }
    }
  } catch (err) {
    console.error("[unified-search] Unexpected error:", err);
    return errorResponse("En intern feil oppstod", 500);
  }
}
