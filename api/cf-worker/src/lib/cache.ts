/**
 * KV cache helpers.
 */

import type { CacheEnvelope } from "../types";

export const CACHE_VERSION = "6";

export async function getCache<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const cached = await kv.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function setCache(kv: KVNamespace, key: string, data: unknown, ttlSeconds = 300): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
  } catch (e) {
    console.warn(`KV write failed for key ${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function cacheKey(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `cache:v2:${endpoint}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

export function buildCacheEnvelope<T>(data: T, version = CACHE_VERSION): CacheEnvelope<T> {
  return { version, cachedAt: new Date().toISOString(), data };
}

export function normalizeCatalogSearchParams(url: URL): Record<string, string> {
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
