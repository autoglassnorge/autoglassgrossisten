import type { Env } from '../types';
import type { ChatPageContext } from './customer-chat-types';

export async function hashIdentifier(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw.trim().toUpperCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ChatSessionRow {
  id: number;
  session_token: string;
  customer_id: number | null;
  status: 'active' | 'closed' | 'handed_off';
  page_context: string | null;
  vehicle_context: string | null;
  context: string | null;
}

export async function createSession(
  env: Env,
  opts: {
    customerId?: number | null;
    pageContext?: ChatPageContext;
  } = {}
): Promise<{ token: string; id: number }> {
  const token = crypto.randomUUID();
  const result = await env.GLASS_CATALOG_D1
    .prepare(
      `INSERT INTO chat_sessions (session_token, customer_id, page_context, status)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      token,
      opts.customerId ?? null,
      opts.pageContext ? JSON.stringify(opts.pageContext) : null,
      'active'
    )
    .run();
  return { token, id: result.meta.last_row_id as number };
}

export async function getSession(env: Env, token: string): Promise<ChatSessionRow | null> {
  const row = await env.GLASS_CATALOG_D1
    .prepare('SELECT * FROM chat_sessions WHERE session_token = ?')
    .bind(token)
    .first<ChatSessionRow>();
  return row ?? null;
}

export async function updateSessionContext(
  env: Env,
  sessionId: number,
  updates: { vehicleContext?: unknown; context?: unknown; status?: ChatSessionRow['status'] }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.vehicleContext !== undefined) {
    sets.push('vehicle_context = ?');
    values.push(JSON.stringify(updates.vehicleContext));
  }
  if (updates.context !== undefined) {
    sets.push('context = ?');
    values.push(JSON.stringify(updates.context));
  }
  if (updates.status) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  await env.GLASS_CATALOG_D1
    .prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values, sessionId)
    .run();
}

export async function addMessage(
  env: Env,
  sessionId: number,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  extras?: {
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: unknown;
    candidatesJson?: unknown;
  }
): Promise<void> {
  await env.GLASS_CATALOG_D1
    .prepare(
      `INSERT INTO chat_messages (session_id, role, content, tool_name, tool_input, tool_output, candidates_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      sessionId,
      role,
      content,
      extras?.toolName ?? null,
      extras?.toolInput ? JSON.stringify(extras.toolInput) : null,
      extras?.toolOutput ? JSON.stringify(extras.toolOutput) : null,
      extras?.candidatesJson ? JSON.stringify(extras.candidatesJson) : null
    )
    .run();
}

export async function getRecentMessages(
  env: Env,
  sessionId: number,
  limit = 20
): Promise<{ role: 'user' | 'assistant' | 'tool'; content: string; created_at: string }[]> {
  const { results } = await env.GLASS_CATALOG_D1
    .prepare(
      `SELECT role, content, created_at FROM chat_messages
       WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .bind(sessionId, limit)
    .all<{ role: 'user' | 'assistant' | 'tool'; content: string; created_at: string }>();
  return (results ?? []).reverse();
}

export async function createHandoff(
  env: Env,
  sessionId: number,
  reason: string,
  summary: string,
  preferredContact: 'chat' | 'phone' | 'email' = 'chat'
): Promise<number> {
  const result = await env.GLASS_CATALOG_D1
    .prepare(
      `INSERT INTO chat_handoffs (session_id, reason, summary, preferred_contact, status)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(sessionId, reason, summary, preferredContact, 'open')
    .run();
  await updateSessionContext(env, sessionId, { status: 'handed_off' });
  return result.meta.last_row_id as number;
}
