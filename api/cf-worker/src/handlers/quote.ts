/**
 * Handler for POST /api/quote-request
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

export async function handleQuote(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      email?: string;
      eurocode?: string;
      regnr?: string;
      quantity?: number;
      message?: string;
    };
    if (!body.email || !body.eurocode) {
      return errorResponse("Mangler påkrevde felt: email, eurocode");
    }
    const db = env.GLASS_CATALOG_D1;
    await db.prepare(
      `INSERT INTO quote_requests (email, eurocode, regnr, quantity, message, created_at, status)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 'new')`
    ).bind(
      body.email,
      body.eurocode,
      body.regnr || null,
      body.quantity || 1,
      body.message || null
    ).run();
    return jsonResponse({ success: true, message: "Forespørsel mottatt" });
  } catch (e) {
    return errorResponse("Kunne ikke lagre forespørsel: " + (e as Error).message, 500);
  }
}
