/**
 * Ordremottaker session management
 * KV-based session storage with 24h TTL
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

export { jsonResponse, errorResponse };

export interface SessionContext {
  messages: { role: "user" | "ai"; content: string; timestamp: number }[];
  vehicle?: { make: string; model: string; year: number };
  candidates?: number[]; // glass IDs
  answers: Record<string, string>;
  cartItems: { sku: string; qty: number }[];
  status: "active" | "completed" | "escalated";
  pending_question?: string | null;
  candidate_data?: string; // JSON-serialiserte kandidater (for equipment oppfølging)
}

const SESSION_PREFIX = "ai_session:";
const SESSION_TTL = 60 * 60 * 24; // 24 hours

function getSessionKey(token: string): string {
  return `${SESSION_PREFIX}${token}`;
}

function createDefaultSession(): SessionContext {
  return {
    messages: [],
    answers: {},
    cartItems: [],
    status: "active",
  };
}

/** Generate a new session token and store it in KV */
export async function createSession(env: Env): Promise<string> {
  const token = crypto.randomUUID();
  const session = createDefaultSession();
  await env.GLASS_CATALOG.put(
    getSessionKey(token),
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL }
  );
  return token;
}

/** Retrieve a session from KV */
export async function getSession(
  env: Env,
  token: string
): Promise<SessionContext | null> {
  try {
    const raw = await env.GLASS_CATALOG.get(getSessionKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as SessionContext;
  } catch (e) {
    console.error(
      "[Ordremottaker-Session] getSession error:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/** Merge updates into an existing session and write back to KV */
export async function updateSession(
  env: Env,
  token: string,
  updates: Partial<SessionContext>
): Promise<void> {
  try {
    const existing = await getSession(env, token);
    if (!existing) {
      console.error(
        `[Ordremottaker-Session] updateSession: session not found for token ${token}`
      );
      return;
    }
    const merged: SessionContext = {
      ...existing,
      ...updates,
      messages: updates.messages ?? existing.messages,
      answers: updates.answers ?? existing.answers,
      cartItems: updates.cartItems ?? existing.cartItems,
    };
    await env.GLASS_CATALOG.put(
      getSessionKey(token),
      JSON.stringify(merged),
      { expirationTtl: SESSION_TTL }
    );
  } catch (e) {
    console.error(
      "[Ordremottaker-Session] updateSession error:",
      e instanceof Error ? e.message : String(e)
    );
  }
}

/** Append a message to the session, keeping only the last 20 messages */
export async function addMessage(
  env: Env,
  token: string,
  role: "user" | "ai",
  content: string
): Promise<void> {
  try {
    const existing = await getSession(env, token);
    if (!existing) {
      console.error(
        `[Ordremottaker-Session] addMessage: session not found for token ${token}`
      );
      return;
    }
    const messages = [
      ...existing.messages,
      { role, content, timestamp: Date.now() },
    ];
    // Keep last 20 messages
    const trimmed = messages.slice(-20);
    const merged: SessionContext = {
      ...existing,
      messages: trimmed,
    };
    await env.GLASS_CATALOG.put(
      getSessionKey(token),
      JSON.stringify(merged),
      { expirationTtl: SESSION_TTL }
    );
  } catch (e) {
    console.error(
      "[Ordremottaker-Session] addMessage error:",
      e instanceof Error ? e.message : String(e)
    );
  }
}
