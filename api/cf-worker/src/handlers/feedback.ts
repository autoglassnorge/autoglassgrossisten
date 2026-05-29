/**
 * Handler for POST /api/feedback
 * GDPR-safe: regnr hashed with SHA-256 before storage
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      regnr?: string;
      eurocode?: string;
      ktype?: number;
      layer?: number;
      score?: number;
      action?: "view" | "cart" | "order";
    };
    if (!body.regnr || !body.eurocode) {
      return errorResponse("Mangler påkrevde felt: regnr, eurocode");
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(body.regnr.trim().toUpperCase());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const regnrHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const db = env.GLASS_CATALOG_D1;
    await db.prepare(
      `INSERT INTO search_feedback (regnr_hash, ktype, eurocode, layer, score, action)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      regnrHash,
      body.ktype || null,
      body.eurocode.toUpperCase(),
      body.layer || null,
      body.score || null,
      body.action || "view"
    ).run();

    if (body.ktype) {
      try {
        await db.prepare(
          `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
           VALUES (?, ?, 1, datetime('now'), datetime('now'))
           ON CONFLICT(ktype, eurocode) DO UPDATE SET
             hit_count = hit_count + 1,
             last_seen = datetime('now')`
        ).bind(body.ktype, body.eurocode.toUpperCase()).run();
      } catch {
        // Silently ignore
      }
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse("Kunne ikke lagre feedback: " + (e as Error).message, 500);
  }
}
