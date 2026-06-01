/**
 * Handler for GET /api/health
 */

import type { Env } from "../types";
import { jsonResponse } from "../lib/cors";
import { getCatalogStats } from "../lib/db";
import { fetchSvvEnkeltoppslag } from "../providers/svv";

/** Resultat fra SVV health check */
interface SvvHealthResult {
  status: "ok" | "degraded" | "down";
  responseTimeMs: number;
  httpStatus?: number;
  error?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureCount: number;
}

/** Sjekk SVV API health - gjør faktisk kall */
async function checkSvvHealth(env: Env): Promise<SvvHealthResult> {
  const startTime = Date.now();
  const testRegnr = "EB21570"; // Test-regnr som alltid skal finnes
  
  try {
    const result = await fetchSvvEnkeltoppslag(testRegnr, env.SVV_API_KEY);
    const responseTimeMs = Date.now() - startTime;
    
    if (result.status === "ok") {
      return {
        status: "ok",
        responseTimeMs,
        failureCount: 0,
      };
    }
    
    if (result.status === "upstream_error") {
      return {
        status: "down",
        responseTimeMs,
        httpStatus: result.httpStatus,
        error: `SVV upstream error: HTTP ${result.httpStatus}`,
        failureCount: 1,
      };
    }
    
    if (result.status === "not_found") {
      // not_found er OK - betyr at APIet fungerer, bare ukjent regnr
      return {
        status: "ok",
        responseTimeMs,
        failureCount: 0,
      };
    }
    
    return {
      status: "degraded",
      responseTimeMs,
      error: result.status,
      failureCount: 1,
    };
  } catch (e) {
    return {
      status: "down",
      responseTimeMs: Date.now() - startTime,
      error: e instanceof Error ? e.message : "Unknown error",
      failureCount: 1,
    };
  }
}

/** Hent siste kjente SVV-status fra KV */
async function getSvvStatusHistory(env: Env): Promise<{
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureCount: number;
  statusHistory: Array<{ timestamp: string; status: string; error?: string }>;
}> {
  try {
    const history = await env.GLASS_CATALOG.get("svv:status:history", "json") as {
      entries?: Array<{ timestamp: string; status: string; error?: string }>;
      lastSuccessAt?: string;
      lastFailureAt?: string;
      failureCount?: number;
    } | null;
    
    return {
      lastSuccessAt: history?.lastSuccessAt,
      lastFailureAt: history?.lastFailureAt,
      failureCount: history?.failureCount || 0,
      statusHistory: history?.entries?.slice(-10) || [], // Siste 10 entries
    };
  } catch {
    return { failureCount: 0, statusHistory: [] };
  }
}

export async function handleHealth(_request: Request, env: Env): Promise<Response> {
  const stats = await getCatalogStats(env.GLASS_CATALOG_D1);
  const svvConfigured = !!(env.SVV_API_KEY && env.SVV_API_KEY !== "NOT_SET");
  const bovsoftConfigured = !!(env.BOVSOFT_CLIENT_ID && env.BOVSOFT_CLIENT_ID !== "NOT_SET");
  const biluppgifterConfigured = !!(env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET");
  const vincarioConfigured = !!(env.VINCARIO_API_KEY && env.VINCARIO_SECRET_KEY);
  const macsVisConfigured = !!env.MACS_VIS_API_KEY;
  
  // Live SVV health check
  const svvHealth = svvConfigured ? await checkSvvHealth(env) : {
    status: "down" as const,
    responseTimeMs: 0,
    error: "Not configured",
    failureCount: 0,
  };
  
  // Hent historikk
  const history = await getSvvStatusHistory(env);
  
  return jsonResponse({
    status: "ok",
    version: "2.3",
    catalogSize: stats.total,
    brands: stats.brands,
    rulesCount: stats.rulesCount,
    rulesConfigured: stats.rulesCount > 0,
    d1Configured: true,
    svvConfigured,
    svvHealth: {
      ...svvHealth,
      lastSuccessAt: history.lastSuccessAt,
      lastFailureAt: history.lastFailureAt,
      cumulativeFailures: history.failureCount,
    },
    bovsoftConfigured,
    biluppgifterConfigured,
    vincarioConfigured,
    macsVisConfigured,
    timestamp: new Date().toISOString(),
  });
}
