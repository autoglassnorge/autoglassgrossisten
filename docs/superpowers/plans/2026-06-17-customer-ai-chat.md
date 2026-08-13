# Customer-Facing AI Chat Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a recommendation-only, customer-facing AI assistant embedded on `/sok` and `/bla` that helps B2B buyers find the correct car glass via regnr, VIN, eurocode, or natural-language description, streaming responses over SSE and handing off to a human ordremottaker when needed.

**Architecture:** A new `POST /api/chat` endpoint in the Cloudflare Worker runs a constrained LLM tool loop (Workers AI + Groq fallback), executes search/handoff tools, and streams typed SSE events. The React frontend consumes the stream, renders messages/product cards/quick replies, and integrates with the existing search/catalog pages. D1 stores sessions, messages, and handoffs; KV caches runtime state for fast back-and-forth.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, Lucide React, Vite/vitest; Cloudflare Worker, Hono-like manual router, D1, KV, Workers AI (`@cf/moonshotai/moonshot-auto`), Groq fallback; Playwright E2E.

---

## File Structure

### Backend

```
api/cf-worker/migrations/0025_customer_chat.sql      # D1 schema for sessions, messages, handoffs
api/cf-worker/src/handlers/customer-chat.ts          # POST /api/chat handler + tool loop
api/cf-worker/src/handlers/customer-chat.test.ts     # Worker integration tests
api/cf-worker/src/lib/customer-chat-types.ts         # Shared types for request/response/events/tools
api/cf-worker/src/lib/customer-chat-session.ts       # D1 session/message helpers
api/cf-worker/src/lib/customer-chat-prompt.ts        # System prompt + LLM JSON schema
api/cf-worker/src/lib/customer-chat-tools.ts         # Tool executors: searchGlass, explainDifferences, askCustomer, handoverToHuman
api/cf-worker/src/lib/customer-chat-tools.test.ts    # Unit tests for tool executors
api/cf-worker/src/lib/customer-chat-stream.ts        # SSE event serialization helpers
```

### Frontend

```
frontend/src/stores/customerAssistantStore.ts
frontend/src/components/customer-assistant/
├── CustomerAssistant.tsx
├── AssistantLauncher.tsx
├── AssistantPanel.tsx
├── AssistantHeader.tsx
├── MessageList.tsx
│   ├── AssistantMessage.tsx
│   ├── UserMessage.tsx
│   ├── ProductCardsMessage.tsx
│   ├── QuickRepliesMessage.tsx
│   ├── HandoffMessage.tsx
│   └── TypingIndicator.tsx
├── ChatInput.tsx
├── AssistantAvatar.tsx
└── hooks/
    ├── useCustomerChat.ts
    └── useSseParser.ts
frontend/src/components/customer-assistant/__tests__/
├── useSseParser.test.ts
├── useCustomerChat.test.ts
├── AssistantPanel.test.tsx
└── ProductCardsMessage.test.tsx
```

### E2E

```
e2e/customer-assistant.spec.js
```

---

## Task 1: D1 Migration

**Files:**
- Create: `api/cf-worker/migrations/0025_customer_chat.sql`

### Step 1: Write the migration

```sql
-- api/cf-worker/migrations/0025_customer_chat.sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web_chat',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','handed_off')),
  page_context TEXT,
  vehicle_context TEXT,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_input TEXT,
  tool_output TEXT,
  candidates_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id),
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  preferred_contact TEXT DEFAULT 'chat' CHECK(preferred_contact IN ('chat','phone','email')),
  handled_by INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','claimed','resolved')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_handoffs_status ON chat_handoffs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_handoffs_session ON chat_handoffs(session_id);
```

### Step 2: Apply migration locally

```bash
cd /Users/taj/bilglass
npx wrangler d1 migrations apply glass-catalog-db --local
```

Expected: `✅ Successfully applied migration 0025_customer_chat.sql`

### Step 3: Verify tables exist

```bash
cd /Users/taj/bilglass
npx wrangler d1 execute glass-catalog-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%';"
```

Expected: three rows (`chat_sessions`, `chat_messages`, `chat_handoffs`).

### Step 4: Commit

```bash
git add api/cf-worker/migrations/0025_customer_chat.sql
git commit -m "feat(chat): add D1 tables for customer assistant sessions, messages, handoffs"
```

---

## Task 2: Shared Chat Types

**Files:**
- Create: `api/cf-worker/src/lib/customer-chat-types.ts`

### Step 1: Write the failing test

```typescript
// api/cf-worker/src/lib/customer-chat-types.test.ts
import { describe, it, expect } from 'vitest';
import type { ChatRequest, ChatEvent, ChatToolCall } from './customer-chat-types';

describe('customer-chat-types', () => {
  it('accepts a valid chat request', () => {
    const req: ChatRequest = {
      message: 'AB12345',
      session_token: '00000000-0000-0000-0000-000000000000',
      page_context: { path: '/sok', current_query: 'AB12345' },
      customer_id: 1,
      language: 'no',
    };
    expect(req.message).toBe('AB12345');
  });

  it('accepts a valid tool call payload', () => {
    const call: ChatToolCall = {
      tool: 'searchGlass',
      params: { regnr: 'AB12345', position: 'frontrute' },
    };
    expect(call.tool).toBe('searchGlass');
  });

  it('accepts a valid SSE event', () => {
    const ev: ChatEvent = { type: 'text', data: { delta: 'Hei' } };
    expect(ev.type).toBe('text');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-types.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/lib/customer-chat-types.ts

export interface ChatPageContext {
  path: string;
  current_query?: string;
  category?: string;
}

export interface ChatRequest {
  message: string | null;
  session_token?: string | null;
  page_context?: ChatPageContext;
  customer_id?: number | null;
  language?: string;
}

export type ChatEventType =
  | 'meta'
  | 'typing'
  | 'text'
  | 'products'
  | 'quick_replies'
  | 'tool_call'
  | 'handoff'
  | 'error'
  | 'done';

export interface ChatEvent {
  type: ChatEventType;
  data: Record<string, unknown>;
}

export interface SearchGlassParams {
  regnr?: string | null;
  vin?: string | null;
  eurocode?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  position?: string | null;
  equipment?: Record<string, boolean>;
}

export interface ExplainDifferencesParams {
  candidate_ids: number[];
}

export interface AskCustomerParams {
  question_key: string;
  question_text: string;
  options: { label: string; value: string }[];
}

export interface HandoverToHumanParams {
  reason: string;
  summary: string;
  preferred_contact?: 'chat' | 'phone' | 'email';
}

export type ChatToolCall =
  | { tool: 'searchGlass'; params: SearchGlassParams }
  | { tool: 'explainDifferences'; params: ExplainDifferencesParams }
  | { tool: 'askCustomer'; params: AskCustomerParams }
  | { tool: 'handoverToHuman'; params: HandoverToHumanParams };

export interface LlmResponseShape {
  tool_calls?: ChatToolCall[];
  message?: string;
  quick_replies?: { label: string; value: string }[];
}

export interface GlassSearchToolResult {
  ok: boolean;
  vehicle?: { make: string; model: string; year: number } | null;
  candidates: unknown[];
  confidence: number;
  reasons: string[];
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-types.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add api/cf-worker/src/lib/customer-chat-types.ts api/cf-worker/src/lib/customer-chat-types.test.ts
git commit -m "feat(chat): add shared types for customer assistant"
```

---

## Task 3: SSE Stream Helpers

**Files:**
- Create: `api/cf-worker/src/lib/customer-chat-stream.ts`
- Test: `api/cf-worker/src/lib/customer-chat-stream.test.ts`

### Step 1: Write the failing test

```typescript
// api/cf-worker/src/lib/customer-chat-stream.test.ts
import { describe, it, expect } from 'vitest';
import { serializeEvent, createChatStream, sseResponse } from './customer-chat-stream';

describe('customer-chat-stream', () => {
  it('serializes an event to SSE wire format', () => {
    const wire = serializeEvent({ type: 'text', data: { delta: 'Hei' } });
    expect(wire).toContain('event: text');
    expect(wire).toContain('data: {"delta":"Hei"}');
    expect(wire).toContain('\n\n');
  });

  it('creates a stream that emits provided events', async () => {
    const stream = createChatStream([
      { type: 'typing', data: {} },
      { type: 'text', data: { delta: 'Hei' } },
      { type: 'done', data: {} },
    ]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    const full = chunks.join('');
    expect(full).toContain('event: typing');
    expect(full).toContain('event: text');
    expect(full).toContain('event: done');
  });

  it('returns a Response with text/event-stream headers', () => {
    const stream = createChatStream([{ type: 'done', data: {} }]);
    const res = sseResponse(stream);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-stream.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/lib/customer-chat-stream.ts
import type { ChatEvent, ChatEventType } from './customer-chat-types';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

export function serializeEvent(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function createChatStream(events: ChatEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(serializeEvent(event)));
      }
      controller.close();
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

export function event(type: ChatEventType, data: Record<string, unknown>): ChatEvent {
  return { type, data };
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-stream.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add api/cf-worker/src/lib/customer-chat-stream.ts api/cf-worker/src/lib/customer-chat-stream.test.ts
git commit -m "feat(chat): add SSE stream serialization helpers"
```

---

## Task 4: Chat Session Store

**Files:**
- Create: `api/cf-worker/src/lib/customer-chat-session.ts`
- Test: `api/cf-worker/src/lib/customer-chat-session.test.ts`

### Step 1: Write the failing test

```typescript
// api/cf-worker/src/lib/customer-chat-session.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, getSession, addMessage, getRecentMessages, createHandoff, hashIdentifier } from './customer-chat-session';
import type { Env } from '../types';

describe('customer-chat-session', () => {
  let env: Env;

  beforeEach(() => {
    env = { GLASS_CATALOG_D1: {} as D1Database } as Env;
  });

  it('hashes an identifier consistently', async () => {
    const h1 = await hashIdentifier('AB12345');
    const h2 = await hashIdentifier('AB12345');
    expect(h1).toBe(h2);
    expect(h1).not.toBe('AB12345');
  });

  it('returns null for missing session', async () => {
    const session = await getSession(env, 'missing-token');
    expect(session).toBeNull();
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-session.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/lib/customer-chat-session.ts
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
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-session.test.ts 2>&1 | tail -20
```

Expected: PASS (hash + missing session only; D1-backed tests come in Task 10).

### Step 5: Commit

```bash
git add api/cf-worker/src/lib/customer-chat-session.ts api/cf-worker/src/lib/customer-chat-session.test.ts
git commit -m "feat(chat): add D1 session/message/handoff helpers"
```

---

## Task 5: LLM Prompt and JSON Schema

**Files:**
- Create: `api/cf-worker/src/lib/customer-chat-prompt.ts`
- Test: `api/cf-worker/src/lib/customer-chat-prompt.test.ts`

### Step 1: Write the failing test

```typescript
// api/cf-worker/src/lib/customer-chat-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, responseJsonSchema } from './customer-chat-prompt';

describe('customer-chat-prompt', () => {
  it('includes guardrail against ordering', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('aldri opprette bestillinger');
  });

  it('defines tool schema for searchGlass', () => {
    const schema = responseJsonSchema();
    expect(JSON.stringify(schema)).toContain('searchGlass');
    expect(JSON.stringify(schema)).toContain('askCustomer');
    expect(JSON.stringify(schema)).toContain('handoverToHuman');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-prompt.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/lib/customer-chat-prompt.ts
import type { JsonSchema } from './ai-gateway';

export function buildSystemPrompt(): string {
  return `Du er bilglass-assistenten til Autoglass AS. Du hjelper verksteder og dekkforhandlere å finne riktig bilglass.

VIKTIGE REGLER:
- Du skal aldri opprette bestillinger, tilbud eller endelige priser.
- Hvis brukeren sier "bestill", "send tilbud", "pris" eller vil kjøpe, kall alltid verktøyet handoverToHuman.
- Du kan bare anbefale produkter. CTA er "Se detaljer" eller "Be menneske sjekke".
- Hold svarene korte og vennlige på norsk.
- Du har tilgang til disse verktøyene: searchGlass, explainDifferences, askCustomer, handoverToHuman.

BRUK AV VERKTØY:
- searchGlass: når brukeren oppgir regnr, VIN, eurocode, OEM/artikkelnummer, eller merke/modell/år + posisjon.
- askCustomer: når du trenger et avgrensende svar (f.eks. ADAS, varme, posisjon) – oppgi alltid 2–4 svaralternativer.
- explainDifferences: når brukeren spør "hva er forskjellen?" eller vil sammenligne to kandidater.
- handoverToHuman: ved usikkerhet, ønske om bestilling, eller hvis brukeren ber om et menneske.

Du skal alltid returnere gyldig JSON som følger skjemaet nedenfor. Ingen annen tekst.`;
}

export function responseJsonSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      tool_calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              enum: ['searchGlass', 'explainDifferences', 'askCustomer', 'handoverToHuman'],
            },
            params: { type: 'object' },
          },
          required: ['tool', 'params'],
        },
      },
      message: { type: 'string' },
      quick_replies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['label', 'value'],
        },
      },
    },
    required: [],
  };
}

export function buildPromptMessages(opts: {
  pageContext?: { path?: string; current_query?: string; category?: string };
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[];
  toolResults?: unknown[];
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const system = buildSystemPrompt();
  const context = `Side: ${opts.pageContext?.path ?? 'ukjent'}\nNåværende søk: ${opts.pageContext?.current_query ?? ''}\nKategori: ${opts.pageContext?.category ?? ''}`;
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: `${system}\n\nKONTEKST:\n${context}` },
  ];
  for (const h of opts.history) {
    messages.push({ role: h.role === 'tool' ? 'assistant' : h.role, content: h.content });
  }
  if (opts.toolResults && opts.toolResults.length > 0) {
    messages.push({ role: 'user', content: `Verktøyresultater: ${JSON.stringify(opts.toolResults)}` });
  }
  return messages;
}
```

Note: `JsonSchema` is already exported from `api/cf-worker/src/lib/ai-gateway.ts`.

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-prompt.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add api/cf-worker/src/lib/customer-chat-prompt.ts api/cf-worker/src/lib/customer-chat-prompt.test.ts
git commit -m "feat(chat): add system prompt and LLM response schema"
```

---

## Task 6: Tool Implementations

**Files:**
- Create: `api/cf-worker/src/lib/customer-chat-tools.ts`
- Test: `api/cf-worker/src/lib/customer-chat-tools.test.ts`

### Step 1: Write the failing test

```typescript
// api/cf-worker/src/lib/customer-chat-tools.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeTool } from './customer-chat-tools';
import type { Env } from '../types';

describe('customer-chat-tools', () => {
  const mockEnv = {
    GLASS_CATALOG_D1: {} as D1Database,
    GLASS_CATALOG: {} as KVNamespace,
  } as Env;

  it('askCustomer returns the question unchanged', async () => {
    const result = await executeTool(mockEnv, {
      tool: 'askCustomer',
      params: {
        question_key: 'adas',
        question_text: 'Har bilen ADAS?',
        options: [{ label: 'Ja', value: 'ja' }],
      },
    });
    expect(result).toHaveProperty('question_key', 'adas');
  });

  it('explainDifferences requires at least two ids', async () => {
    const result = await executeTool(mockEnv, {
      tool: 'explainDifferences',
      params: { candidate_ids: [1] },
    });
    expect(result.ok).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-tools.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/lib/customer-chat-tools.ts
import type { Env, GlassRecord } from '../types';
import { searchByRegnr } from '../handlers/search';
import { handleVinLookup } from '../vin-lookup-api';
import {
  queryByEurocode,
  queryBySupplierSku,
  queryByOemNumber,
  queryByBrandAndYear,
  queryByKtype,
} from './db';
import { normalizeRecord } from './normalize';
import { detectInputType, normalizeRegnr, normalizeVin } from './input-detector';
import type {
  ChatToolCall,
  SearchGlassParams,
  ExplainDifferencesParams,
  AskCustomerParams,
  HandoverToHumanParams,
  GlassSearchToolResult,
} from './customer-chat-types';

export interface ToolContext {
  sessionId: number;
  equipmentAnswers?: Record<string, string>;
}

export async function executeTool(
  env: Env,
  call: ChatToolCall,
  ctx?: ToolContext
): Promise<unknown> {
  switch (call.tool) {
    case 'searchGlass':
      return executeSearchGlass(env, call.params);
    case 'explainDifferences':
      return executeExplainDifferences(env, call.params);
    case 'askCustomer':
      return executeAskCustomer(call.params);
    case 'handoverToHuman':
      return executeHandoverToHuman(env, call.params, ctx);
    default:
      return { ok: false, error: 'Unknown tool' };
  }
}

export async function executeSearchGlass(
  env: Env,
  params: SearchGlassParams
): Promise<GlassSearchToolResult> {
  const { regnr, vin, eurocode, make, model, year, position } = params;

  if (regnr) {
    const normalized = normalizeRegnr(regnr);
    const result = await searchByRegnr(normalized, env, position ?? undefined);
    const body = (result.body ?? {}) as {
      vehicle?: { make: string; model: string; year: number };
      candidates?: GlassRecord[];
      confidence?: number;
      reasons?: string[];
    };
    return {
      ok: true,
      vehicle: body.vehicle ?? null,
      candidates: (body.candidates ?? []).map(normalizeRecord).slice(0, 10),
      confidence: body.confidence ?? 0,
      reasons: body.reasons ?? ['regnr exact'],
    };
  }

  if (vin) {
    const normalized = normalizeVin(vin);
    const request = new Request('http://localhost/api/vin-lookup', {
      method: 'POST',
      body: JSON.stringify({ vin: normalized }),
    });
    const response = await handleVinLookup(request, env, {
      waitUntil: () => {},
    } as unknown as ExecutionContext);
    const body = (await response.json()) as {
      status: string;
      vehicle?: { make: string; model: string; year: number };
      match?: { ktype?: number; eurocode?: string; confidence: number; source: string };
      error?: string;
    };
    if (body.status !== 'resolved' || !body.match) {
      return { ok: false, vehicle: body.vehicle ?? null, candidates: [], confidence: 0, reasons: [body.error ?? 'vin unresolved'] };
    }
    let candidates: GlassRecord[] = [];
    if (body.match.eurocode) {
      const record = await queryByEurocode(env.GLASS_CATALOG_D1, body.match.eurocode);
      if (record) candidates = [record];
    }
    if (candidates.length === 0 && body.match.ktype) {
      candidates = await queryByKtype(env.GLASS_CATALOG_D1, body.match.ktype);
    }
    return {
      ok: candidates.length > 0,
      vehicle: body.vehicle ?? null,
      candidates: candidates.map(normalizeRecord).slice(0, 10),
      confidence: body.match.confidence,
      reasons: [body.match.source],
    };
  }

  if (eurocode) {
    const record = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
    return {
      ok: !!record,
      vehicle: null,
      candidates: record ? [normalizeRecord(record)] : [],
      confidence: record ? 1 : 0,
      reasons: record ? ['eurocode exact'] : ['no match'],
    };
  }

  if (make && model && year) {
    const records = await queryByBrandAndYear(env.GLASS_CATALOG_D1, make, year, model);
    const filtered = position
      ? records.filter((r) => (r.category || '').toLowerCase() === position.toLowerCase())
      : records;
    return {
      ok: filtered.length > 0,
      vehicle: { make, model, year },
      candidates: filtered.map(normalizeRecord).slice(0, 10),
      confidence: filtered.length > 0 ? 0.7 : 0,
      reasons: ['make/model/year lookup'],
    };
  }

  return { ok: false, vehicle: null, candidates: [], confidence: 0, reasons: ['insufficient params'] };
}

export async function executeExplainDifferences(
  env: Env,
  params: ExplainDifferencesParams
): Promise<{ summary: string; diff: string[] }> {
  const { candidate_ids } = params;
  if (candidate_ids.length < 2) {
    return { summary: 'Trenger minst to produkter for å sammenligne.', diff: [] };
  }
  const records: GlassRecord[] = [];
  for (const id of candidate_ids.slice(0, 4)) {
    const row = await env.GLASS_CATALOG_D1
      .prepare('SELECT * FROM glass_catalog WHERE id = ?')
      .bind(id)
      .first<GlassRecord>();
    if (row) records.push(row);
  }
  if (records.length < 2) {
    return { summary: 'Kunne ikke finne alle kandidatene.', diff: [] };
  }
  const diff: string[] = records.map((r) => {
    const brand = r.brand || 'Ukjent';
    const price = r.price ? `${r.price} kr` : 'Pris på forespørsel';
    const features = [
      r.adas ? 'ADAS' : '',
      r.heated ? 'varme' : '',
      r.rain_sensor ? 'regnsensor' : '',
      r.acoustic ? 'akustisk' : '',
      r.hud ? 'HUD' : '',
    ]
      .filter(Boolean)
      .join(', ');
    return `${brand}: ${price}${features ? ` — ${features}` : ''}`;
  });
  const oem = records.find((r) => (r.source || '').toLowerCase().includes('oem'));
  const aftermarket = records.find((r) => !(r.source || '').toLowerCase().includes('oem'));
  const summary = oem && aftermarket
    ? 'OEM-glasset har original kvalitet/logo. Aftermarket-alternativet er rimeligere og dekker samme funksjon.'
    : 'Hovedforskjellene er merke, pris og utstyr. Se tabellen under.';
  return { summary, diff };
}

export function executeAskCustomer(params: AskCustomerParams): AskCustomerParams {
  return params;
}

export async function executeHandoverToHuman(
  env: Env,
  params: HandoverToHumanParams,
  ctx?: ToolContext
): Promise<{ ok: boolean; handoffId?: number; reason: string; summary: string }> {
  if (!ctx?.sessionId) {
    return { ok: false, reason: params.reason, summary: params.summary };
  }
  const { createHandoff } = await import('./customer-chat-session');
  const handoffId = await createHandoff(env, ctx.sessionId, params.reason, params.summary, params.preferred_contact);
  return { ok: true, handoffId, reason: params.reason, summary: params.summary };
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- customer-chat-tools.test.ts 2>&1 | tail -20
```

Expected: PASS for askCustomer and explainDifferences; searchGlass requires D1/stubs in integration tests.

### Step 5: Commit

```bash
git add api/cf-worker/src/lib/customer-chat-tools.ts api/cf-worker/src/lib/customer-chat-tools.test.ts
git commit -m "feat(chat): add customer assistant tool executors"
```

---

## Task 7: `/api/chat` Handler and Tool Loop

**Files:**
- Create: `api/cf-worker/src/handlers/customer-chat.ts`
- Test: `api/cf-worker/src/handlers/customer-chat.test.ts`

### Step 1: Write the failing integration test

```typescript
// api/cf-worker/src/handlers/customer-chat.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { handleCustomerChat } from './customer-chat';
import type { Env } from '../types';

describe('handleCustomerChat', () => {
  let env: Env;

  beforeAll(async () => {
    env = {
      GLASS_CATALOG_D1: {} as D1Database,
      GLASS_CATALOG: {} as KVNamespace,
      AI: {} as Ai,
    } as Env;
  });

  it('returns a text/event-stream response', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hei' }),
    });
    const response = await handleCustomerChat(request, env, {
      waitUntil: () => {},
    } as unknown as ExecutionContext);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('streams a meta event first', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hei' }),
    });
    const response = await handleCustomerChat(request, env, {
      waitUntil: () => {},
    } as unknown as ExecutionContext);
    const text = await response.text();
    expect(text).toContain('event: meta');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- handlers/customer-chat.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// api/cf-worker/src/handlers/customer-chat.ts
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/cors';
import { detectInputType, validateInput } from '../lib/input-detector';
import { callLLM } from '../lib/ai-gateway';
import { buildPromptMessages, responseJsonSchema } from '../lib/customer-chat-prompt';
import { executeTool, executeHandoverToHuman } from '../lib/customer-chat-tools';
import {
  createSession,
  getSession,
  addMessage,
  getRecentMessages,
  updateSessionContext,
  hashIdentifier,
} from '../lib/customer-chat-session';
import { createChatStream, sseResponse, event } from '../lib/customer-chat-stream';
import type { ChatEvent, ChatRequest, ChatToolCall, LlmResponseShape } from '../lib/customer-chat-types';

const MAX_ITERATIONS = 3;
const STREAM_TIMEOUT_MS = 15000;

export async function handleCustomerChat(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const message = body.message ?? '';
  const pageContext = body.page_context;

  if (message) {
    const detected = detectInputType(message);
    const validation = validateInput(detected);
    if (!validation.valid) {
      const stream = createChatStream([
        event('meta', { session_token: null, status: 'active' }),
        event('error', { message: validation.error }),
        event('done', {}),
      ]);
      return sseResponse(stream);
    }
  }

  let session: { token: string; id: number };
  let existingSession = body.session_token ? await getSession(env, body.session_token) : null;
  if (existingSession) {
    session = { token: existingSession.session_token, id: existingSession.id };
  } else {
    session = await createSession(env, { customerId: body.customer_id ?? null, pageContext });
  }

  if (message) {
    await addMessage(env, session.id, 'user', message);
  }

  const events: ChatEvent[] = [event('meta', { session_token: session.token, status: 'active' })];

  try {
    const timeout = setTimeout(() => {
      throw new Error('stream timeout');
    }, STREAM_TIMEOUT_MS);

    const toolResults: unknown[] = [];
    let finalResponse: LlmResponseShape | null = null;
    const history = await getRecentMessages(env, session.id, 20);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const messages = buildPromptMessages({ pageContext, history, toolResults });
      const llmResult = await callLLM(env, {
        messages,
        max_tokens: 512,
        temperature: iteration === 0 ? 0.2 : 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'customer_chat_response',
            schema: responseJsonSchema(),
            strict: false,
          },
        },
      });
      const parsed = JSON.parse(llmResult.response) as LlmResponseShape;

      if (parsed.tool_calls && parsed.tool_calls.length > 0) {
        events.push(event('typing', {}));
        for (const call of parsed.tool_calls) {
          events.push(event('tool_call', { tool: call.tool, params: call.params }));
          const result = await executeTool(env, call as ChatToolCall, {
            sessionId: session.id,
          });
          if (call.tool === 'handoverToHuman' && (result as { ok: boolean }).ok) {
            const handoff = result as { handoffId: number; summary: string; reason: string };
            events.push(
              event('handoff', {
                handoff_id: handoff.handoffId,
                summary: handoff.summary,
                reason: handoff.reason,
              })
            );
            events.push(event('done', {}));
            clearTimeout(timeout);
            const stream = createChatStream(events);
            await addMessage(env, session.id, 'assistant', handoff.summary, {
              candidatesJson: [],
            });
            return sseResponse(stream);
          }
          toolResults.push({ tool: call.tool, result });
        }
        continue;
      }

      finalResponse = parsed;
      break;
    }

    if (!finalResponse) {
      const handoff = await executeHandoverToHuman(
        env,
        { reason: 'loop_limit', summary: 'Verktøyloopen nådde maksimalt antall iterasjoner.' },
        { sessionId: session.id }
      );
      events.push(
        event('handoff', {
          handoff_id: handoff.handoffId,
          summary: handoff.summary,
          reason: handoff.reason,
        })
      );
    } else {
      if (finalResponse.message) {
        const words = finalResponse.message.split(' ');
        for (const word of words) {
          events.push(event('text', { delta: `${word} ` }));
        }
      }
      if (finalResponse.quick_replies) {
        events.push(event('quick_replies', { chips: finalResponse.quick_replies }));
      }
      await addMessage(env, session.id, 'assistant', finalResponse.message ?? '', {
        candidatesJson: [],
      });
    }

    events.push(event('done', {}));
    clearTimeout(timeout);
    const stream = createChatStream(events);
    return sseResponse(stream);
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Unknown error';
    const handoff = await executeHandoverToHuman(
      env,
      { reason: 'error', summary: `Assistenten fikk en feil: ${err}` },
      { sessionId: session.id }
    );
    events.push(event('error', { message: 'Beklager, jeg fikk ikke svar. Jeg overfører deg til et menneske.' }));
    events.push(
      event('handoff', {
        handoff_id: handoff.handoffId ?? null,
        summary: handoff.summary,
        reason: handoff.reason,
      })
    );
    events.push(event('done', {}));
    const stream = createChatStream(events);
    return sseResponse(stream);
  }
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- handlers/customer-chat.test.ts 2>&1 | tail -30
```

Expected: PASS for stream header and meta event (with mocked `env.AI` in later integration tests).

### Step 5: Commit

```bash
git add api/cf-worker/src/handlers/customer-chat.ts api/cf-worker/src/handlers/customer-chat.test.ts
git commit -m "feat(chat): add /api/chat handler with tool loop and SSE streaming"
```

---

## Task 8: Wire `/api/chat` into the Router

**Files:**
- Modify: `api/cf-worker/src/index.ts`

### Step 1: Add import and route

```typescript
// api/cf-worker/src/index.ts
// Add near other handler imports:
import { handleCustomerChat } from './handlers/customer-chat';
```

### Step 2: Add route inside the fetch handler

Insert this block immediately before `return errorResponse("Ukjent endepunkt", 404);`:

```typescript
    // Customer-facing AI assistant
    if (path === '/api/chat' && request.method === 'POST') {
      return handleCustomerChat(request, env, ctx);
    }
```

### Step 3: Verify routing with a curl smoke test

```bash
cd /Users/taj/bilglass
npx wrangler dev --local-protocol=http &
WORKER_PID=$!
sleep 8
curl -N -X POST http://127.0.0.1:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hei"}' 2>&1 | head -20
kill $WORKER_PID
```

Expected: `event: meta` followed by `event: text` and `event: done`.

### Step 4: Commit

```bash
git add api/cf-worker/src/index.ts
git commit -m "feat(chat): route POST /api/chat to customer chat handler"
```

---

## Task 9: Backend Integration Tests with Mocked AI

**Files:**
- Modify: `api/cf-worker/src/handlers/customer-chat.test.ts`

### Step 1: Add full integration tests

Replace the contents of `api/cf-worker/src/handlers/customer-chat.test.ts` with:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { handleCustomerChat } from './customer-chat';
import type { Env } from '../types';

async function collectSse(response: Response): Promise<{ type: string; data: unknown }[]> {
  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim());
  const events: { type: string; data: unknown }[] = [];
  let current: { type?: string; data?: unknown } = {};
  for (const line of lines) {
    if (line.startsWith('event:')) {
      current.type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      current.data = JSON.parse(line.slice(5).trim());
      if (current.type) {
        events.push({ type: current.type, data: current.data });
        current = {};
      }
    }
  }
  return events;
}

describe('handleCustomerChat integration', () => {
  let env: Env;

  beforeAll(async () => {
    env = {
      GLASS_CATALOG_D1: {} as D1Database,
      GLASS_CATALOG: {} as KVNamespace,
      AI: {
        run: async (_model: string, options: unknown) => {
          const opts = options as { messages?: { role: string; content: string }[] };
          const lastUser = opts.messages?.reverse().find((m) => m.role === 'user');
          const content = lastUser?.content ?? '';
          if (content.toLowerCase().includes('ab12345')) {
            return {
              response: JSON.stringify({
                tool_calls: [
                  {
                    tool: 'searchGlass',
                    params: { regnr: 'AB12345', position: 'frontrute' },
                  },
                ],
              }),
            };
          }
          return {
            response: JSON.stringify({
              message: 'Hei! Jeg kan hjelpe deg å finne riktig glass.',
              quick_replies: [
                { label: 'Regnr', value: 'regnr' },
                { label: 'Merke/modell', value: 'merke' },
              ],
            }),
          };
        },
      } as unknown as Ai,
    } as Env;
  });

  it('greets with quick replies', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hei' }),
    });
    const response = await handleCustomerChat(request, env, {
      waitUntil: () => {},
    } as unknown as ExecutionContext);
    const events = await collectSse(response);
    expect(events.find((e) => e.type === 'meta')).toBeDefined();
    expect(events.find((e) => e.type === 'text')).toBeDefined();
    const replies = events.find((e) => e.type === 'quick_replies');
    expect(replies).toBeDefined();
  });

  it('routes regnr to searchGlass tool call', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'AB12345' }),
    });
    const response = await handleCustomerChat(request, env, {
      waitUntil: () => {},
    } as unknown as ExecutionContext);
    const events = await collectSse(response);
    expect(events.find((e) => e.type === 'tool_call' && (e.data as { tool: string }).tool === 'searchGlass')).toBeDefined();
  });
});
```

### Step 2: Run integration tests

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test -- handlers/customer-chat.test.ts 2>&1 | tail -30
```

Expected: PASS.

### Step 3: Commit

```bash
git add api/cf-worker/src/handlers/customer-chat.test.ts
git commit -m "test(chat): add backend integration tests with mocked AI"
```

---

## Task 10: Frontend Customer Assistant Store

**Files:**
- Create: `frontend/src/stores/customerAssistantStore.ts`
- Test: `frontend/src/stores/customerAssistantStore.test.ts`

### Step 1: Write the failing test

```typescript
// frontend/src/stores/customerAssistantStore.test.ts
import { describe, it, expect } from 'vitest';
import { useCustomerAssistantStore } from './customerAssistantStore';
import { act } from '@testing-library/react';

describe('customerAssistantStore', () => {
  it('starts closed', () => {
    expect(useCustomerAssistantStore.getState().isOpen).toBe(false);
  });

  it('opens and closes', () => {
    act(() => useCustomerAssistantStore.getState().open());
    expect(useCustomerAssistantStore.getState().isOpen).toBe(true);
    act(() => useCustomerAssistantStore.getState().close());
    expect(useCustomerAssistantStore.getState().isOpen).toBe(false);
  });

  it('sets page context', () => {
    act(() => useCustomerAssistantStore.getState().setPageContext({ path: '/sok', current_query: 'AB12345' }));
    expect(useCustomerAssistantStore.getState().pageContext?.current_query).toBe('AB12345');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/frontend && npm test -- customerAssistantStore.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// frontend/src/stores/customerAssistantStore.ts
import { create } from 'zustand';

export interface AssistantPageContext {
  path: string;
  current_query?: string;
  category?: string;
}

interface CustomerAssistantState {
  isOpen: boolean;
  pageContext?: AssistantPageContext;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setPageContext: (ctx: AssistantPageContext) => void;
}

export const useCustomerAssistantStore = create<CustomerAssistantState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setPageContext: (pageContext) => set({ pageContext }),
}));
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/frontend && npm test -- customerAssistantStore.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add frontend/src/stores/customerAssistantStore.ts frontend/src/stores/customerAssistantStore.test.ts
git commit -m "feat(chat): add customer assistant zustand store"
```

---

## Task 11: SSE Parser Hook

**Files:**
- Create: `frontend/src/components/customer-assistant/hooks/useSseParser.ts`
- Test: `frontend/src/components/customer-assistant/__tests__/useSseParser.test.ts`

### Step 1: Write the failing test

```typescript
// frontend/src/components/customer-assistant/__tests__/useSseParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSseStream } from '../hooks/useSseParser';

describe('parseSseStream', () => {
  it('parses events from a ReadableStream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: text\ndata: {"delta":"Hei"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
      },
    });
    const events = await parseSseStream(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text', data: { delta: 'Hei' } });
    expect(events[1]).toEqual({ type: 'done', data: {} });
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/frontend && npm test -- useSseParser.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// frontend/src/components/customer-assistant/hooks/useSseParser.ts

export interface SseEvent {
  type: string;
  data: unknown;
}

export async function parseSseStream(response: Response): Promise<SseEvent[]> {
  if (!response.body) return [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = '';
  let current: Partial<SseEvent> = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        current.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        try {
          current.data = JSON.parse(line.slice(5).trim());
        } catch {
          current.data = line.slice(5).trim();
        }
        if (current.type) {
          events.push({ type: current.type, data: current.data } as SseEvent);
          current = {};
        }
      }
    }
  }

  return events;
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/frontend && npm test -- useSseParser.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add frontend/src/components/customer-assistant/hooks/useSseParser.ts frontend/src/components/customer-assistant/__tests__/useSseParser.test.ts
git commit -m "feat(chat): add SSE parser hook"
```

---

## Task 12: Customer Chat Hook

**Files:**
- Create: `frontend/src/components/customer-assistant/hooks/useCustomerChat.ts`
- Test: `frontend/src/components/customer-assistant/__tests__/useCustomerChat.test.ts`

### Step 1: Write the failing test

```typescript
// frontend/src/components/customer-assistant/__tests__/useCustomerChat.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomerChat } from '../hooks/useCustomerChat';

describe('useCustomerChat', () => {
  it('initializes with empty messages and idle status', () => {
    const { result } = renderHook(() => useCustomerChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('appends a user message immediately on send', () => {
    const { result } = renderHook(() => useCustomerChat());
    act(() => result.current.sendMessage('Hei'));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
  });

  it('aborts an active stream on new send', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
          controller.close();
        },
      }),
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useCustomerChat());
    act(() => result.current.sendMessage('Hei'));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    act(() => result.current.sendMessage('Ny melding'));
    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/taj/bilglass/frontend && npm test -- useCustomerChat.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 3: Write minimal implementation

```typescript
// frontend/src/components/customer-assistant/hooks/useCustomerChat.ts
import { useState, useCallback, useRef } from 'react';
import { parseSseStream } from './useSseParser';
import type { Product } from '@/types/api';

export interface QuickReplyChip {
  label: string;
  value: string;
}

export type ChatMessage =
  | { id: string; role: 'user'; content: string; timestamp: number }
  | { id: string; role: 'assistant'; content: string; isStreaming?: boolean; timestamp: number }
  | { id: string; role: 'products'; products: Product[]; timestamp: number }
  | { id: string; role: 'quick_replies'; chips: QuickReplyChip[]; timestamp: number }
  | { id: string; role: 'handoff'; summary: string; handoffId: number; reason: string; timestamp: number }
  | { id: string; role: 'error'; content: string; timestamp: number };

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface UseCustomerChatOptions {
  pageContext?: { path: string; current_query?: string; category?: string };
}

export function useCustomerChat(options: UseCustomerChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [sessionToken, setSessionToken] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const abortActive = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      abortActive();
      const abort = new AbortController();
      abortRef.current = abort;

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() },
      ]);
      setStatus('thinking');

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            session_token: sessionToken || undefined,
            page_context: options.pageContext,
          }),
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Network response was not ok');
        }

        const events = await parseSseStream(response);

        setMessages((prev) => {
          const next = [...prev];
          for (const ev of events) {
            if (ev.type === 'meta') {
              const data = ev.data as { session_token?: string };
              if (data.session_token) setSessionToken(data.session_token);
            } else if (ev.type === 'typing') {
              setStatus('streaming');
            } else if (ev.type === 'text') {
              const delta = (ev.data as { delta?: string }).delta ?? '';
              const last = next[next.length - 1];
              if (last && last.role === 'assistant' && 'isStreaming' in last) {
                last.content += delta;
              } else {
                next.push({
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: delta,
                  isStreaming: true,
                  timestamp: Date.now(),
                });
              }
            } else if (ev.type === 'products') {
              const products = (ev.data as { products?: Product[] }).products ?? [];
              next.push({ id: crypto.randomUUID(), role: 'products', products, timestamp: Date.now() });
            } else if (ev.type === 'quick_replies') {
              const chips = (ev.data as { chips?: QuickReplyChip[] }).chips ?? [];
              next.push({ id: crypto.randomUUID(), role: 'quick_replies', chips, timestamp: Date.now() });
            } else if (ev.type === 'handoff') {
              const data = ev.data as { handoff_id: number; summary: string; reason: string };
              next.push({
                id: crypto.randomUUID(),
                role: 'handoff',
                handoffId: data.handoff_id,
                summary: data.summary,
                reason: data.reason,
                timestamp: Date.now(),
              });
            } else if (ev.type === 'error') {
              const message = (ev.data as { message?: string }).message ?? 'Noe gikk galt.';
              next.push({ id: crypto.randomUUID(), role: 'error', content: message, timestamp: Date.now() });
            }
          }
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && 'isStreaming' in last) {
            last.isStreaming = false;
          }
          return next;
        });

        setStatus('idle');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'error', content: 'Beklager, jeg fikk ikke svar. Prøv igjen.', timestamp: Date.now() },
          ]);
          setStatus('error');
        }
      } finally {
        abortRef.current = null;
      }
    },
    [abortActive, options.pageContext, sessionToken]
  );

  const reset = useCallback(() => {
    abortActive();
    setMessages([]);
    setStatus('idle');
    setSessionToken('');
  }, [abortActive]);

  return { messages, status, sendMessage, reset, sessionToken };
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/taj/bilglass/frontend && npm test -- useCustomerChat.test.ts 2>&1 | tail -20
```

Expected: PASS.

### Step 5: Commit

```bash
git add frontend/src/components/customer-assistant/hooks/useCustomerChat.ts frontend/src/components/customer-assistant/__tests__/useCustomerChat.test.ts
git commit -m "feat(chat): add customer chat hook with SSE parsing and abort"
```

---

## Task 13: Assistant UI Components

**Files:**
- Create: `frontend/src/components/customer-assistant/AssistantAvatar.tsx`
- Create: `frontend/src/components/customer-assistant/TypingIndicator.tsx`
- Create: `frontend/src/components/customer-assistant/AssistantMessage.tsx`
- Create: `frontend/src/components/customer-assistant/UserMessage.tsx`
- Create: `frontend/src/components/customer-assistant/QuickRepliesMessage.tsx`
- Create: `frontend/src/components/customer-assistant/ProductCardsMessage.tsx`
- Create: `frontend/src/components/customer-assistant/HandoffMessage.tsx`
- Create: `frontend/src/components/customer-assistant/MessageList.tsx`
- Create: `frontend/src/components/customer-assistant/AssistantHeader.tsx`
- Create: `frontend/src/components/customer-assistant/ChatInput.tsx`

### Step 1: Write base component tests first

```typescript
// frontend/src/components/customer-assistant/__tests__/AssistantAvatar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AssistantAvatar from '../AssistantAvatar';

describe('AssistantAvatar', () => {
  it('renders an image with alt text', () => {
    render(<AssistantAvatar size="md" />);
    expect(screen.getByAltText('Bilglass-assistent')).toBeInTheDocument();
  });
});
```

```bash
cd /Users/taj/bilglass/frontend && npm test -- AssistantAvatar.test.tsx 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 2: Implement AssistantAvatar

```tsx
// frontend/src/components/customer-assistant/AssistantAvatar.tsx
interface AssistantAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  isThinking?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
};

export default function AssistantAvatar({ size = 'md', isThinking = false, className = '' }: AssistantAvatarProps) {
  const sizeClass = SIZE_MAP[size];
  return (
    <div className={`relative ${sizeClass} ${className}`}>
      <img
        src="/hero-autoglass.png"
        alt="Bilglass-assistent"
        className={`h-full w-full rounded-full object-cover border-2 border-autoglass-blue shadow-sm ${isThinking ? 'animate-pulse' : ''}`}
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = 'none';
          const parent = img.parentElement;
          if (parent) {
            parent.innerHTML = `<div class="h-full w-full rounded-full bg-autoglass-blue text-white flex items-center justify-center text-sm font-bold">AI</div>`;
          }
        }}
      />
    </div>
  );
}
```

### Step 3: Implement TypingIndicator

```tsx
// frontend/src/components/customer-assistant/TypingIndicator.tsx
export default function TypingIndicator() {
  return (
    <div className="flex gap-1 px-4 py-3 bg-gray-100 rounded-2xl rounded-tl-none w-fit" aria-label="Assistenten skriver">
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
    </div>
  );
}
```

### Step 4: Implement message variants

```tsx
// frontend/src/components/customer-assistant/AssistantMessage.tsx
interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function AssistantMessage({ content, isStreaming }: AssistantMessageProps) {
  return (
    <div className="bg-gray-100 text-gray-900 px-4 py-3 rounded-2xl rounded-tl-none max-w-[85%] text-sm leading-relaxed">
      {content}
      {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-autoglass-blue animate-pulse align-middle" />}
    </div>
  );
}
```

```tsx
// frontend/src/components/customer-assistant/UserMessage.tsx
interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="bg-autoglass-blue text-white px-4 py-3 rounded-2xl rounded-tr-none max-w-[85%] text-sm leading-relaxed self-end">
      {content}
    </div>
  );
}
```

```tsx
// frontend/src/components/customer-assistant/QuickRepliesMessage.tsx
interface QuickRepliesProps {
  chips: { label: string; value: string }[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export default function QuickRepliesMessage({ chips, onSelect, disabled }: QuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-2 pl-12">
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip.value)}
          className="px-3 py-1.5 text-xs font-medium rounded-full bg-autoglass-light text-autoglass-blue hover:bg-autoglass-blue hover:text-white disabled:opacity-50 transition"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// frontend/src/components/customer-assistant/ProductCardsMessage.tsx
import { PhoneCall } from 'lucide-react';
import type { Product } from '@/types/api';

interface ProductCardsMessageProps {
  products: Product[];
  onViewDetails: (product: Product) => void;
}

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return 'Pris på forespørsel';
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK' }).format(price);
}

function featureBadges(product: Product): string[] {
  const p = product.properties;
  const badges: string[] = [];
  if (p.adas) badges.push('ADAS');
  if (p.heated) badges.push('Varme');
  if (p.rainSensor) badges.push('Regnsensor');
  if (p.acoustic) badges.push('Akustisk');
  if (p.hud) badges.push('HUD');
  if (p.antenna) badges.push('Antenne');
  return badges;
}

export default function ProductCardsMessage({ products, onViewDetails }: ProductCardsMessageProps) {
  return (
    <div className="pl-12 grid gap-3">
      {products.slice(0, 5).map((product) => (
        <div
          key={product.id}
          className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-500">{product.brand}</p>
              <h4 className="text-sm font-medium text-gray-900">{product.title}</h4>
              <p className="text-xs text-gray-500">{product.eurocode || product.articleNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{formatPrice(product.price)}</p>
              <p className="text-xs text-gray-500">{product.stockStatus > 0 ? 'På lager' : 'Ikke på lager'}</p>
            </div>
          </div>
          {featureBadges(product).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {featureBadges(product).map((badge) => (
                <span key={badge} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full">
                  {badge}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onViewDetails(product)}
            className="mt-2 w-full text-xs font-medium text-autoglass-blue hover:underline"
          >
            Se detaljer
          </button>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// frontend/src/components/customer-assistant/HandoffMessage.tsx
import { PhoneCall } from 'lucide-react';

interface HandoffMessageProps {
  handoffId: number;
  summary: string;
  reason: string;
}

export default function HandoffMessage({ handoffId, summary }: HandoffMessageProps) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
      <PhoneCall className="h-5 w-5 text-yellow-700 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-yellow-900">Overført til ordremottaker</p>
        <p className="text-xs text-yellow-800 mt-1">{summary}</p>
        <p className="text-xs text-yellow-700 mt-2">Referansenummer: #{handoffId}</p>
      </div>
    </div>
  );
}
```

### Step 5: Implement MessageList

```tsx
// frontend/src/components/customer-assistant/MessageList.tsx
import { useRef, useEffect } from 'react';
import AssistantMessage from './AssistantMessage';
import UserMessage from './UserMessage';
import QuickRepliesMessage from './QuickRepliesMessage';
import ProductCardsMessage from './ProductCardsMessage';
import HandoffMessage from './HandoffMessage';
import TypingIndicator from './TypingIndicator';
import type { ChatMessage } from './hooks/useCustomerChat';
import type { Product } from '@/types/api';

interface MessageListProps {
  messages: ChatMessage[];
  isThinking: boolean;
  onQuickReply: (value: string) => void;
  onViewDetails: (product: Product) => void;
  isHandedOff: boolean;
}

export default function MessageList({ messages, isThinking, onQuickReply, onViewDetails, isHandedOff }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end">
              <UserMessage content={msg.content} />
            </div>
          );
        }
        if (msg.role === 'assistant') {
          return (
            <div key={msg.id} className="flex flex-col items-start gap-1">
              <AssistantMessage content={msg.content} isStreaming={msg.isStreaming} />
            </div>
          );
        }
        if (msg.role === 'quick_replies') {
          return (
            <QuickRepliesMessage
              key={msg.id}
              chips={msg.chips}
              onSelect={onQuickReply}
              disabled={isHandedOff}
            />
          );
        }
        if (msg.role === 'products') {
          return <ProductCardsMessage key={msg.id} products={msg.products} onViewDetails={onViewDetails} />;
        }
        if (msg.role === 'handoff') {
          return (
            <HandoffMessage
              key={msg.id}
              handoffId={msg.handoffId}
              summary={msg.summary}
              reason={msg.reason}
            />
          );
        }
        if (msg.role === 'error') {
          return (
            <div key={msg.id} className="bg-red-50 text-red-800 text-sm px-4 py-3 rounded-xl max-w-[85%]">
              {msg.content}
            </div>
          );
        }
        return null;
      })}
      {isThinking && (
        <div className="flex items-start gap-2">
          <AssistantAvatar size="sm" isThinking />
          <TypingIndicator />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

Add the missing import in `MessageList.tsx`:

```tsx
import AssistantAvatar from './AssistantAvatar';
```

### Step 6: Implement AssistantHeader and ChatInput

```tsx
// frontend/src/components/customer-assistant/AssistantHeader.tsx
import { X, RotateCcw } from 'lucide-react';
import AssistantAvatar from './AssistantAvatar';

interface AssistantHeaderProps {
  onClose: () => void;
  onReset: () => void;
}

export default function AssistantHeader({ onClose, onReset }: AssistantHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
      <div className="flex items-center gap-3">
        <AssistantAvatar size="sm" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">AI-hjelp</h3>
          <p className="text-xs text-gray-500">Bilglass-assistenten</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReset}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
          aria-label="Nullstill samtale"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
          aria-label="Lukk assistent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

```tsx
// frontend/src/components/customer-assistant/ChatInput.tsx
import { useState, FormEvent, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder = 'Skriv her...' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 bg-white rounded-b-2xl flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'Ordremottaker tar over...' : placeholder}
        className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-autoglass-blue/30 disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="p-2 bg-autoglass-blue text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition"
        aria-label="Send melding"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}
```

### Step 7: Run component tests

```bash
cd /Users/taj/bilglass/frontend && npm test -- AssistantAvatar.test.tsx 2>&1 | tail -20
```

Expected: PASS.

### Step 8: Commit

```bash
git add frontend/src/components/customer-assistant/AssistantAvatar.tsx frontend/src/components/customer-assistant/TypingIndicator.tsx frontend/src/components/customer-assistant/AssistantMessage.tsx frontend/src/components/customer-assistant/UserMessage.tsx frontend/src/components/customer-assistant/QuickRepliesMessage.tsx frontend/src/components/customer-assistant/ProductCardsMessage.tsx frontend/src/components/customer-assistant/HandoffMessage.tsx frontend/src/components/customer-assistant/MessageList.tsx frontend/src/components/customer-assistant/AssistantHeader.tsx frontend/src/components/customer-assistant/ChatInput.tsx frontend/src/components/customer-assistant/__tests__/AssistantAvatar.test.tsx
git commit -m "feat(chat): add customer assistant UI components"
```

---

## Task 14: Panel, Launcher, and CustomerAssistant Container

**Files:**
- Create: `frontend/src/components/customer-assistant/AssistantPanel.tsx`
- Create: `frontend/src/components/customer-assistant/AssistantLauncher.tsx`
- Create: `frontend/src/components/customer-assistant/CustomerAssistant.tsx`
- Test: `frontend/src/components/customer-assistant/__tests__/AssistantPanel.test.tsx`

### Step 1: Write failing test

```typescript
// frontend/src/components/customer-assistant/__tests__/AssistantPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AssistantPanel from '../AssistantPanel';

describe('AssistantPanel', () => {
  it('renders greeting and quick replies', () => {
    render(
      <AssistantPanel
        isOpen
        onClose={vi.fn()}
        pageContext={{ path: '/sok' }}
      />
    );
    expect(screen.getByText('Hei! Jeg kan hjelpe deg å finne riktig glass.')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<AssistantPanel isOpen onClose={onClose} pageContext={{ path: '/sok' }} />);
    fireEvent.click(screen.getByLabelText('Lukk assistent'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

```bash
cd /Users/taj/bilglass/frontend && npm test -- AssistantPanel.test.tsx 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module".

### Step 2: Implement AssistantPanel

```tsx
// frontend/src/components/customer-assistant/AssistantPanel.tsx
import { useEffect } from 'react';
import AssistantHeader from './AssistantHeader';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useCustomerChat } from './hooks/useCustomerChat';
import type { Product } from '@/types/api';
import type { AssistantPageContext } from '@/stores/customerAssistantStore';

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: AssistantPageContext;
  onViewDetails?: (product: Product) => void;
}

export default function AssistantPanel({ isOpen, onClose, pageContext, onViewDetails }: AssistantPanelProps) {
  const { messages, status, sendMessage, reset } = useCustomerChat({ pageContext });

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      sendMessage('__greeting__');
    }
  }, [isOpen]);

  const isHandedOff = messages.some((m) => m.role === 'handoff');

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex flex-col bg-white shadow-2xl border border-gray-200 rounded-2xl overflow-hidden transition-all duration-300
        ${isOpen ? 'w-[90vw] max-w-md h-[70vh] opacity-100' : 'w-0 h-0 opacity-0 pointer-events-none'}`}
      role="dialog"
      aria-label="Bilglass-assistent"
      aria-hidden={!isOpen}
    >
      <AssistantHeader onClose={onClose} onReset={reset} />
      <MessageList
        messages={messages}
        isThinking={status === 'thinking'}
        onQuickReply={sendMessage}
        onViewDetails={onViewDetails ?? (() => {})}
        isHandedOff={isHandedOff}
      />
      <ChatInput onSend={sendMessage} disabled={isHandedOff} />
    </div>
  );
}
```

### Step 3: Implement AssistantLauncher

```tsx
// frontend/src/components/customer-assistant/AssistantLauncher.tsx
import { MessageCircle } from 'lucide-react';

interface AssistantLauncherProps {
  onClick: () => void;
  isOpen: boolean;
}

export default function AssistantLauncher({ onClick, isOpen }: AssistantLauncherProps) {
  if (isOpen) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 bg-autoglass-blue text-white rounded-full shadow-lg hover:bg-blue-700 transition"
      aria-label="Åpne AI-hjelp"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="text-sm font-medium">AI-hjelp</span>
    </button>
  );
}
```

### Step 4: Implement CustomerAssistant

```tsx
// frontend/src/components/customer-assistant/CustomerAssistant.tsx
import AssistantPanel from './AssistantPanel';
import AssistantLauncher from './AssistantLauncher';
import { useCustomerAssistantStore } from '@/stores/customerAssistantStore';
import type { Product } from '@/types/api';

interface CustomerAssistantProps {
  onViewDetails?: (product: Product) => void;
}

export default function CustomerAssistant({ onViewDetails }: CustomerAssistantProps) {
  const { isOpen, open, close, pageContext } = useCustomerAssistantStore();

  return (
    <>
      <AssistantLauncher onClick={open} isOpen={isOpen} />
      <AssistantPanel isOpen={isOpen} onClose={close} pageContext={pageContext} onViewDetails={onViewDetails} />
    </>
  );
}
```

### Step 5: Handle greeting on backend

Modify `api/cf-worker/src/handlers/customer-chat.ts` to detect the `__greeting__` pseudo-message and bypass user-message storage:

In `handleCustomerChat`, replace the user-message storage block with:

```typescript
  const isGreeting = message === '__greeting__';
  if (message && !isGreeting) {
    await addMessage(env, session.id, 'user', message);
  }
```

Also ensure the LLM still receives a greeting prompt. Add after history is loaded:

```typescript
    if (isGreeting) {
      events.push(event('typing', {}));
      events.push(
        event('text', {
          delta: 'Hei! Jeg kan hjelpe deg å finne riktig glass. Har du registreringsnummer, eller vil du søke på merke/modell?',
        })
      );
      const chips: { label: string; value: string }[] = [
        { label: 'Regnr', value: 'Jeg har regnr' },
        { label: 'Merke/modell', value: 'Jeg vil søke på merke og modell' },
        { label: 'Snakk med et menneske', value: 'Jeg vil snakke med et menneske' },
      ];
      if (pageContext?.current_query) {
        chips.unshift({ label: `Søk på ${pageContext.current_query}`, value: pageContext.current_query });
      }
      events.push(event('quick_replies', { chips }));
      events.push(event('done', {}));
      await addMessage(env, session.id, 'assistant', 'Hei! Jeg kan hjelpe deg å finne riktig glass. Har du registreringsnummer, eller vil du søke på merke/modell?', {
        candidatesJson: [],
      });
      const stream = createChatStream(events);
      return sseResponse(stream);
    }
```

### Step 6: Run panel tests

```bash
cd /Users/taj/bilglass/frontend && npm test -- AssistantPanel.test.tsx 2>&1 | tail -20
```

Expected: PASS.

### Step 7: Commit

```bash
git add frontend/src/components/customer-assistant/AssistantPanel.tsx frontend/src/components/customer-assistant/AssistantLauncher.tsx frontend/src/components/customer-assistant/CustomerAssistant.tsx frontend/src/components/customer-assistant/__tests__/AssistantPanel.test.tsx api/cf-worker/src/handlers/customer-chat.ts
git commit -m "feat(chat): add assistant panel, launcher, container, and greeting flow"
```

---

## Task 15: Page Integration

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/SearchPage.tsx`
- Modify: `frontend/src/pages/BrowsePage.tsx`

### Step 1: Conditionally render CustomerAssistant and hide global ChatWidget

Modify `frontend/src/App.tsx`:

```tsx
import { lazy, Suspense, useMemo } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
// ... existing imports
import CustomerAssistant from '@/components/customer-assistant/CustomerAssistant'

function AppContent() {
  const location = useLocation();
  const showCustomerAssistant = location.pathname === '/sok' || location.pathname === '/bla';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* ... routes unchanged ... */}
          </Routes>
        </Suspense>
      </main>
      <Footer />
      {showCustomerAssistant ? <CustomerAssistant /> : <ChatWidget />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
```

Ensure `BrowserRouter` is imported from `react-router-dom` at the top of `App.tsx`.

### Step 2: Update SearchPage to pass context

In `frontend/src/pages/SearchPage.tsx`, add after the state declarations:

```typescript
import { useCustomerAssistantStore } from '@/stores/customerAssistantStore';
```

Add inside the component:

```typescript
  const { setPageContext, open } = useCustomerAssistantStore();

  useEffect(() => {
    setPageContext({ path: '/sok', current_query: activeQuery || inputValue || undefined });
  }, [activeQuery, inputValue, setPageContext]);
```

### Step 3: Update BrowsePage to pass context

In `frontend/src/pages/BrowsePage.tsx`, add:

```typescript
import { useCustomerAssistantStore } from '@/stores/customerAssistantStore';
```

Add inside the component:

```typescript
  const { setPageContext } = useCustomerAssistantStore();

  useEffect(() => {
    setPageContext({ path: '/bla', current_query: selectedBrand, category: categoryParam || undefined });
  }, [selectedBrand, categoryParam, setPageContext]);
```

### Step 4: Typecheck frontend

```bash
cd /Users/taj/bilglass/frontend && npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors.

### Step 5: Commit

```bash
git add frontend/src/App.tsx frontend/src/pages/SearchPage.tsx frontend/src/pages/BrowsePage.tsx
git commit -m "feat(chat): integrate customer assistant into /sok and /bla"
```

---

## Task 16: E2E Tests

**Files:**
- Create: `e2e/customer-assistant.spec.js`

### Step 1: Write the E2E spec

```javascript
// e2e/customer-assistant.spec.js
import { test, expect } from '@playwright/test';

test.describe('customer assistant', () => {
  test('opens on /sok, greets, and supports a full regnr flow', async ({ page }) => {
    await page.goto('/sok');
    await page.getByRole('button', { name: 'Åpne AI-hjelp' }).click();
    await expect(page.getByText('Hei! Jeg kan hjelpe deg å finne riktig glass.')).toBeVisible();

    await page.getByRole('button', { name: 'Regnr' }).click();
    await page.getByPlaceholder('Skriv her...').fill('AB12345');
    await page.getByLabel('Send melding').click();

    await expect(page.getByText('AB12345')).toBeVisible();
    await expect(page.locator('[aria-label="Assistenten skriver"]')).toBeVisible();
  });

  test('proactive chip on /sok references current query', async ({ page }) => {
    await page.goto('/sok?q=AB12345');
    await page.getByRole('button', { name: 'Åpne AI-hjelp' }).click();
    await expect(page.getByRole('button', { name: 'Søk på AB12345' })).toBeVisible();
  });

  test('hides global ChatWidget on /bla', async ({ page }) => {
    await page.goto('/bla');
    await expect(page.locator('[aria-label="Åpne chat"]').first()).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Åpne AI-hjelp' })).toBeVisible();
  });
});
```

### Step 2: Run E2E tests locally

```bash
cd /Users/taj/bilglass
npm run test:e2e -- customer-assistant.spec.js 2>&1 | tail -40
```

Expected: tests launch Chromium and pass/fail based on local backend availability. At minimum, the greeting and proactive-chip tests should pass.

### Step 3: Commit

```bash
git add e2e/customer-assistant.spec.js
git commit -m "test(chat): add Playwright E2E for customer assistant"
```

---

## Task 17: Final Verification

### Step 1: Run all backend tests

```bash
cd /Users/taj/bilglass/api/cf-worker && npm test 2>&1 | tail -30
```

Expected: all tests pass.

### Step 2: Run all frontend tests

```bash
cd /Users/taj/bilglass/frontend && npm test 2>&1 | tail -30
```

Expected: all tests pass.

### Step 3: Full typecheck

```bash
cd /Users/taj/bilglass/frontend && npx tsc --noEmit 2>&1 | tail -20
cd /Users/taj/bilglass/api/cf-worker && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no TypeScript errors in either package.

### Step 4: Commit

```bash
git add -A
git commit -m "test(chat): final verification suite for customer assistant"
```

---

## Deployment Order

1. **Database:** Run `npx wrangler d1 migrations apply glass-catalog-db --remote` to create chat tables in production.
2. **Worker:** Run `npm run worker:deploy` in `api/cf-worker` to deploy the new `/api/chat` endpoint.
3. **Smoke test backend:** `curl -N -X POST https://<worker>/api/chat -H 'Content-Type: application/json' -d '{"message":"Hei"}'` should return SSE events.
4. **Frontend:** Build and deploy the React app (`npm run build` then `npm run pages:deploy` or via CI).
5. **E2E:** Run `npm run test:e2e -- customer-assistant.spec.js` against production/staging.
6. **Monitor:** Check Wrangler tail logs for `/api/chat` errors and handoff creation rates.

---

## Spec Coverage Check

| Spec section | Task covering it |
|--------------|------------------|
| D1 schema (`chat_sessions`, `chat_messages`, `chat_handoffs`) | Task 1 |
| `/api/chat` endpoint + request/response contract | Task 7 |
| SSE event types | Tasks 3, 7 |
| Tool definitions (`searchGlass`, `explainDifferences`, `askCustomer`, `handoverToHuman`) | Tasks 5, 6 |
| LLM tool loop + guardrails | Tasks 5, 7 |
| Frontend widget components + animations | Tasks 10–14 |
| Proactive greeting + quick replies | Task 14 |
| Product cards with "Se detaljer" CTA | Task 13 |
| Human handoff UX + D1 insert | Tasks 6, 13 |
| Rate limiting reuse | Task 7 via existing `checkRateLimit` in `index.ts` |
| Tests (unit, integration, E2E) | Tasks 2–16 |

---

Plan complete and saved to `docs/superpowers/plans/2026-06-17-customer-ai-chat.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Which approach would you like?
