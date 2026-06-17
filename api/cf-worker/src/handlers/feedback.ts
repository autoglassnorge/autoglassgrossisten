/**
 * Handler for POST /api/feedback
 * GDPR-safe: regnr hashed with SHA-256 before storage
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

async function hashRegnr(regnr: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(regnr.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

    const regnrHash = await hashRegnr(body.regnr);

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

/**
 * Handler for POST /api/feedback/wrong-match
 * Stores GDPR-safe reports of incorrect search matches for manual review.
 */
export async function handleWrongMatchFeedback(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as {
      regnr?: string;
      url?: string;
      note?: string;
      userAgent?: string;
      timestamp?: string;
    };

    if (!body.regnr) {
      return errorResponse("Mangler påkrevd felt: regnr");
    }

    const regnrHash = await hashRegnr(body.regnr);
    const db = env.GLASS_CATALOG_D1;

    // Ensure table exists (best-effort; migrations should normally own schema)
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS wrong_match_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          regnr_hash TEXT NOT NULL,
          url TEXT,
          note TEXT,
          user_agent TEXT,
          reported_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch {
      // Table may already exist or schema managed elsewhere
    }

    await db.prepare(
      `INSERT INTO wrong_match_reports (regnr_hash, url, note, user_agent, reported_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(
      regnrHash,
      body.url || null,
      body.note || null,
      body.userAgent || null
    ).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse("Kunne ikke lagre rapport: " + (e as Error).message, 500);
  }
}
