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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Diagnostic: Bovsoft API test (no creds exposed)
    if (path === "/api/debug/bovsoft" && request.method === "GET") {
      const regnr = url.searchParams.get("regnr") || "UX71699";
      const hasCreds = !!(env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE && env.BOVSOFT_CLIENT_ID !== "NOT_SET");
      if (!hasCreds) {
        return jsonResponse({ configured: false, error: "Bovsoft credentials not configured" });
      }
      try {
        const bovUrl = `http://ns3115634.ip-54-38-179.eu:150/bovsoft.regnum.run?id=${encodeURIComponent(env.BOVSOFT_CLIENT_ID)}&seccode=${encodeURIComponent(env.BOVSOFT_SECCODE)}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
        const res = await fetch(bovUrl, { method: "GET" }, 15000);
        const text = await res.text();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(text); } catch { /* non-JSON */ }
        return jsonResponse({
          configured: true,
          httpStatus: res.status,
          bovsoftStatus: data.status,
          bovsoftStatusText: data.statusText,
          hasDataCar: !!((data.data as Record<string, unknown> | undefined)?.datacar as Array<unknown> | undefined)?.[0],
          freeRequests: data.countFREERequests,
          rawPreview: text.slice(0, 500),
        });
      } catch (e) {
        return jsonResponse({ configured: true, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Glass search
    if (path === "/api/glass") {
      return handleGlass(request, env);
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
