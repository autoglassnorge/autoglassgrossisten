/**
 * Autoglass AS — Cloudflare Worker API v2.3 (Modular)
 * ========================================================================
 * Thin router: delegates all logic to handler modules.
 */

import type { Env } from "./types";
import { CORS_HEADERS, jsonResponse, errorResponse } from "./lib/cors";
import { checkRateLimit } from "./lib/rate-limit";
import { handleGlass } from "./handlers/glass";
import { handleCatalogBrands, handleCatalogCategories, handleCatalogSearch, handleCatalogBulkLookup } from "./handlers/catalog";
import { handleQuote } from "./handlers/quote";
import { handleFeedback } from "./handlers/feedback";
import { handleAdminQuotes } from "./handlers/admin";
import { handleVinLookup, handleVinLookupStatus } from "./handlers/vin";
import { handleHealth } from "./handlers/health";
import { getMetricsSummary, flushMetrics, recordRequest, recordTokenSavings } from "./lib/telemetry";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    
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
      return handleHealth(request, env);
    }

    // Metrics endpoint (enterprise observability)
    if (path === "/api/metrics") {
      const summary = await getMetricsSummary(env);
      return jsonResponse({
        ...summary,
        timestamp: new Date().toISOString(),
        version: "2.3-enterprise",
      });
    }

    // Flush metrics (admin only)
    if (path === "/api/admin/flush-metrics" && request.method === "POST") {
      await flushMetrics(env);
      return jsonResponse({ status: "flushed", timestamp: new Date().toISOString() });
    }

    // Glass search
    if (path === "/api/glass") {
      const response = await handleGlass(request, env);
      
      // Enterprise telemetry (async)
      const latency = Date.now() - startTime;
      const responseBody = await response.clone().text();
      const isCompressed = responseBody.includes('"_compressed":true');
      const fieldsParam = url.searchParams.get('fields');
      
      ctx.waitUntil(
        recordRequest(env, {
          endpoint: "/api/glass",
          method: request.method,
          statusCode: response.status,
          latencyMs: latency,
          compressed: isCompressed,
        })
      );
      
      if (isCompressed && fieldsParam) {
        const originalSize = responseBody.length * 2.5;
        const savedTokens = Math.floor((originalSize - responseBody.length) / 4);
        ctx.waitUntil(
          recordTokenSavings(env, {
            endpoint: "/api/glass",
            originalTokens: Math.floor(originalSize / 4),
            savedTokens,
            compressionRatio: savedTokens / Math.floor(originalSize / 4),
          })
        );
      }
      
      return response;
    }

    // Catalog metadata
    if (path === "/api/catalog/brands") {
      return handleCatalogBrands(request, env);
    }
    if (path === "/api/catalog/categories") {
      return handleCatalogCategories(request, env);
    }
    if (path === "/api/catalog/search") {
      return handleCatalogSearch(request, env);
    }
    if (path === "/api/catalog/bulk-lookup") {
      return handleCatalogBulkLookup(request, env);
    }

    // Auth
    if (path === "/api/me") {
      const email = request.headers.get("CF-Access-Authenticated-User-Email");
      if (!email) {
        return jsonResponse({ authenticated: false }, 401);
      }
      return jsonResponse({ authenticated: true, email });
    }

    // Quote request
    if (path === "/api/quote-request" && request.method === "POST") {
      return handleQuote(request, env);
    }

    // VIN lookup
    if (path === "/api/vin-lookup" && request.method === "POST") {
      return handleVinLookup(request, env, ctx);
    }
    if (path === "/api/vin-lookup/status" && request.method === "GET") {
      return handleVinLookupStatus(request, env);
    }

    // Feedback
    if (path === "/api/feedback" && request.method === "POST") {
      return handleFeedback(request, env);
    }

    // Admin
    if (path === "/api/admin/quotes" && request.method === "GET") {
      return handleAdminQuotes(request, env);
    }

    return errorResponse("Ukjent endepunkt", 404);
  },
};
