/**
 * Handler for /api/glass — regnr, prefix4, eurocode, supplier_sku, oem lookups.
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { getCache, setCache, cacheKey } from "../lib/cache";
import { queryByPrefix4, queryByEurocode, queryBySupplierSku, queryByOemNumber } from "../lib/db";
import { normalizeRecord } from "../lib/normalize";
import { searchByRegnr } from "./search";
import {
  compressSearchResponse,
  parseFieldsParam,
  type CompressOptions,
} from "../lib/response-compressor";

export async function handleGlass(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const regnr = url.searchParams.get("regnr");
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
    const categoryFilter = url.searchParams.get("category") || undefined;
    const cacheKeyParams: Record<string, string> = { regnr };
    if (categoryFilter) cacheKeyParams.category = categoryFilter;

    // Cache key should include fields param for proper cache isolation
    // Bump cache namespace when search matching semantics change.
    // glass-v2 may contain stale pre-kType-compatibility responses.
    const compressionCacheKey = cacheKey("glass-v3-ktype-compat", {
      ...cacheKeyParams,
      _fields: fieldsParam || "default",
    });

    const cached = await getCache<unknown>(env.GLASS_CATALOG, compressionCacheKey);
    if (cached) return jsonResponse(cached);

    const result = await searchByRegnr(regnr, env, categoryFilter);

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

  return errorResponse("Mangler parameter: regnr, prefix4, eurocode, supplier_sku eller oem");
}
