/**
 * Handler for /api/catalog/* endpoints.
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { getCache, setCache, cacheKey, buildCacheEnvelope, normalizeCatalogSearchParams, CACHE_VERSION } from "../lib/cache";
import { getBrandsWithCount, getCategoriesWithCount, searchCatalog } from "../lib/db";
import { normalizeRecord } from "../lib/normalize";

export async function handleCatalogBrands(request: Request, env: Env): Promise<Response> {
  const cached = await getCache(env.GLASS_CATALOG, "catalog:brands");
  if (cached) return jsonResponse(cached);
  const brands = await getBrandsWithCount(env.GLASS_CATALOG_D1);
  const data = { brands };
  await setCache(env.GLASS_CATALOG, "catalog:brands", data, 3600);
  return jsonResponse(data);
}

export async function handleCatalogCategories(request: Request, env: Env): Promise<Response> {
  const cached = await getCache(env.GLASS_CATALOG, "catalog:categories");
  if (cached) return jsonResponse(cached);
  const categories = await getCategoriesWithCount(env.GLASS_CATALOG_D1);
  const data = { categories };
  await setCache(env.GLASS_CATALOG, "catalog:categories", data, 3600);
  return jsonResponse(data);
}

export async function handleCatalogSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
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

  const cacheParams = normalizeCatalogSearchParams(url);
  const cacheKeyStr = cacheKey("catalog:search", cacheParams);
  const cached = await getCache<{ version: string; cachedAt: string; data: unknown }>(env.GLASS_CATALOG, cacheKeyStr);
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
    total: results.length,
    hasMore,
    products: sliced.map(normalizeRecord),
    filters: { brands: [] as string[], categories: [] as string[], years: { min: 1960, max: 2030 }, prices: { min: 0, max: 150000 } },
  };

  const envelope = buildCacheEnvelope(responseBody, CACHE_VERSION);
  await setCache(env.GLASS_CATALOG, cacheKeyStr, envelope, 180);

  return jsonResponse(responseBody, 200, {
    "X-Cache-Status": "MISS",
    "X-Cache-Key": cacheKeyStr,
  });
}

export async function handleCatalogBulkLookup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
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
  const found = ((results || []) as unknown as import("../types").GlassRecord[]).map(normalizeRecord);
  const foundCodes = new Set(found.map((r: any) => r.eurocode));
  const notFound = codes.filter((c) => !foundCodes.has(c));

  return jsonResponse({ found, notFound, count: found.length });
}
