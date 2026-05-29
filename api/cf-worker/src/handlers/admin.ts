/**
 * Handler for GET /api/admin/quotes
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

export async function handleAdminQuotes(request: Request, env: Env): Promise<Response> {
  const email = request.headers.get("CF-Access-Authenticated-User-Email");
  if (!email) {
    return errorResponse("Krever innlogging", 401);
  }
  try {
    const { results } = await env.GLASS_CATALOG_D1
      .prepare("SELECT * FROM quote_requests ORDER BY created_at DESC LIMIT 200")
      .all();
    return jsonResponse({ quotes: results || [] });
  } catch (e) {
    return errorResponse("Kunne ikke hente forespørsler: " + (e as Error).message, 500);
  }
}
