/**
 * Handler for /api/glass — regnr, prefix4, eurocode, supplier_sku, oem lookups.
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { getCache, setCache, cacheKey } from "../lib/cache";
import { queryByPrefix4, queryByEurocode, queryBySupplierSku, queryByOemNumber } from "../lib/db";
import { normalizeRecord } from "../lib/normalize";
import { searchByRegnr } from "./search";
import { handleVinLookup } from "./vin";
import { normalizeRegnr, normalizeVin, REGNR_PATTERN, VIN_PATTERN } from "../lib/input-detector";
import {
  compressSearchResponse,
  parseFieldsParam,
  type CompressOptions,
} from "../lib/response-compressor";
import type { UserEquipmentAnswers } from "../lib/equipment";

const EQUIPMENT_FIELDS = ["adas", "rainSensor", "heated", "acoustic", "antenna", "camera", "hud"] as const;
const POSITION_FILTERS = ["driver", "passenger", "center", "both"] as const;

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "ja"].includes(normalized)) return true;
  if (["0", "false", "no", "nei"].includes(normalized)) return false;
  return undefined;
}

function parseEquipmentAnswers(url: URL): UserEquipmentAnswers | undefined {
  const answers: UserEquipmentAnswers = {};

  for (const field of EQUIPMENT_FIELDS) {
    const value = parseBooleanParam(url.searchParams.get(`eq_${field}`));
    if (value !== undefined) {
      answers[field] = value;
    }
  }

  const packed = url.searchParams.get("equipment");
  if (packed) {
    for (const part of packed.split(",")) {
      const [rawKey, rawValue] = part.split(":");
      const key = rawKey?.trim() as typeof EQUIPMENT_FIELDS[number];
      if (!EQUIPMENT_FIELDS.includes(key)) continue;
      const value = parseBooleanParam(rawValue ?? null);
      if (value !== undefined) {
        answers[key] = value;
      }
    }
  }

  return Object.keys(answers).length > 0 ? answers : undefined;
}

function serializeEquipmentAnswers(answers: UserEquipmentAnswers | undefined): string | undefined {
  if (!answers) return undefined;
  const parts = EQUIPMENT_FIELDS
    .filter((field) => answers[field] !== undefined)
    .map((field) => `${field}:${answers[field] ? "1" : "0"}`);
  return parts.length > 0 ? parts.join(",") : undefined;
}

function parsePositionFilter(value: string | null): typeof POSITION_FILTERS[number] | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return POSITION_FILTERS.includes(normalized as typeof POSITION_FILTERS[number])
    ? normalized as typeof POSITION_FILTERS[number]
    : undefined;
}

export async function handleGlass(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const regnr = url.searchParams.get("regnr");
  const vin = url.searchParams.get("vin");
  const prefix4 = url.searchParams.get("prefix4");
  const eurocode = url.searchParams.get("eurocode");
  const supplierSku = url.searchParams.get("supplier_sku");
  const oem = url.searchParams.get("oem");

  // Parse compression options from query params
  const fieldsParam = url.searchParams.get("fields");
  const fields = parseFieldsParam(fieldsParam);
  const debugParam = url.searchParams.get("debug");
  const isDevelopment = env.ENVIRONMENT === "development";
  const includeDebug = debugParam === "true" || (debugParam !== "false" && isDevelopment);

  if (regnr) {
    const normalizedRegnr = normalizeRegnr(regnr);
    if (!REGNR_PATTERN.test(normalizedRegnr)) {
      return errorResponse("Ugyldig registreringsnummer. Forventet 2 bokstaver og 4-5 sifre.", 400);
    }
    const categoryFilter = url.searchParams.get("category") || undefined;
    const positionFilter = parsePositionFilter(url.searchParams.get("position"));
    const equipmentAnswers = parseEquipmentAnswers(url);
    const equipmentKey = serializeEquipmentAnswers(equipmentAnswers);
    const cacheKeyParams: Record<string, string> = { regnr: normalizedRegnr };
    if (categoryFilter) cacheKeyParams.category = categoryFilter;
    if (positionFilter) cacheKeyParams.position = positionFilter;
    if (equipmentKey) cacheKeyParams.equipment = equipmentKey;

    // Cache key should include fields param for proper cache isolation
    // Bump cache namespace when search matching semantics change.
    // glass-v2/v3 may contain stale pre-kType/generation-compatibility responses.
    const compressionCacheKey = cacheKey("glass-v7-equipment-filter", {
      ...cacheKeyParams,
      _fields: fieldsParam || "default",
    });

    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const result = await searchByRegnr(normalizedRegnr, env, categoryFilter, equipmentAnswers, positionFilter);

    // Apply compression to successful responses
    let responseBody = result.body;
    if (result.httpStatus === 200 && typeof result.body === "object" && result.body !== null) {
      const compressOptions: CompressOptions = {
        includeDebug,
        includeEquipmentDetails: debugParam === "true",
        maxCandidates: 1000,
        fields,
      };
      responseBody = compressSearchResponse(
        result.body as Record<string, unknown>,
        compressOptions
      );
    }

    if (result.httpStatus === 200) {
      await setCache(env.GLASS_CATALOG, compressionCacheKey, responseBody, 300);
    }
    const extraHeaders: Record<string, string> = {};
    if (result.retryAfter) extraHeaders["Retry-After"] = String(result.retryAfter);
    return jsonResponse(responseBody, result.httpStatus, extraHeaders);
  }

  if (vin) {
    const normalizedVin = normalizeVin(vin);
    if (!VIN_PATTERN.test(normalizedVin)) {
      return errorResponse("Ugyldig VIN. Forventet 17 tegn uten I, O eller Q.", 400);
    }

    const compressionCacheKey = cacheKey("glass-v2", {
      vin: normalizedVin,
      _fields: fieldsParam || "default",
    });
    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const syntheticRequest = new Request("http://internal/api/vin-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vin: normalizedVin,
        opening: "windshield",
        market: "EU",
        mode: "auto",
      }),
    });
    const vinResponse = await handleVinLookup(syntheticRequest, env, ctx ?? {
      waitUntil() {},
      passThroughOnException() {},
      props: {},
    } as ExecutionContext);
    const data = await vinResponse.json();
    if (vinResponse.status === 200) {
      await setCache(env.GLASS_CATALOG, compressionCacheKey, data, 300);
    }
    return jsonResponse(data, vinResponse.status);
  }

  if (prefix4) {
    const compressionCacheKey = cacheKey("glass-v2", {
      prefix4,
      _fields: fieldsParam || "default",
    });
    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const results = await queryByPrefix4(env.GLASS_CATALOG_D1, prefix4);
    const data = compressSearchResponse(
      { query: { prefix4 }, count: results.length, results: results.map(normalizeRecord) },
      { fields, maxCandidates: 50 }
    );
    await setCache(env.GLASS_CATALOG, compressionCacheKey, data, 3600);
    return jsonResponse(data);
  }

  if (eurocode) {
    const compressionCacheKey = cacheKey("glass-v2", {
      eurocode,
      _fields: fieldsParam || "default",
    });
    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const result = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
    const data = compressSearchResponse(
      { query: { eurocode }, count: result ? 1 : 0, results: result ? [normalizeRecord(result)] : [] },
      { fields, maxCandidates: 10 }
    );
    await setCache(env.GLASS_CATALOG, compressionCacheKey, data, 3600);
    return jsonResponse(data);
  }

  if (supplierSku) {
    const compressionCacheKey = cacheKey("glass-v2", {
      supplier_sku: supplierSku,
      _fields: fieldsParam || "default",
    });
    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const result = await queryBySupplierSku(env.GLASS_CATALOG_D1, supplierSku);
    const data = compressSearchResponse(
      { query: { supplier_sku: supplierSku }, count: result ? 1 : 0, results: result ? [normalizeRecord(result)] : [] },
      { fields, maxCandidates: 10 }
    );
    await setCache(env.GLASS_CATALOG, compressionCacheKey, data, 3600);
    return jsonResponse(data);
  }

  if (oem) {
    const compressionCacheKey = cacheKey("glass-v2", {
      oem,
      _fields: fieldsParam || "default",
    });
    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const results = await queryByOemNumber(env.GLASS_CATALOG_D1, oem);
    const data = compressSearchResponse(
      { query: { oem }, count: results.length, results: results.map(normalizeRecord) },
      { fields, maxCandidates: 10 }
    );
    await setCache(env.GLASS_CATALOG, compressionCacheKey, data, 3600);
    return jsonResponse(data);
  }

  return errorResponse("Mangler parameter: regnr, vin, prefix4, eurocode, supplier_sku eller oem");
}
