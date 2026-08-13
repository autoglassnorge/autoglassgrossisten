# Design: Customer-Facing AI Chat Assistant

**Date:** 2026-06-17  
**Owner:** Tomar / Autoglass AS  
**Agent:** UX/product design + AI integration  
**Status:** Design ready for implementation  

---

## 1. Goal and scope

Build a **recommendation-only, customer-facing AI assistant** for B2B car-glass buyers (workshops / tire shops). It helps the user find the correct glass via regnr, VIN, eurocode, or a natural-language description of the vehicle and position. The assistant never completes an order itself; when the user wants to buy or the AI is uncertain, it hands the conversation over to a human ordremottaker.

**In scope**
- Embedded assistant on the React search page (`/sok`) and catalog/browse page (`/bla`).
- Streaming-feel chat UI: typing indicator, product cards, quick-reply chips, proactive greeting, smooth animations, avatar.
- New backend endpoint `/api/chat` powered by `env.AI` (Workers AI) with tool/function calling.
- Tools: `searchGlass`, `explainDifferences`, `askCustomer`, `handoverToHuman`.
- Persistent chat sessions and human handoffs in D1.

**Out of scope for this design**
- Direct checkout from the chat.
- Customer-specific prices or contract terms.
- Voice / email channels.
- Internal ordremottaker order-taking flow (the existing `/api/ordremottaker` keeps that role).

---

## 2. User flow

### Example conversation

> **AI (proactive):** Hei! Jeg er bilglass-assistenten. Har du registreringsnummer, eller vil du søke på merke/modell?  
> *(quick-reply chips: [Regnr] [Merke/modell] [Snakk med et menneske])*
>
> **User:** AB12345  
> *(typing indicator …)*
>
> **AI:** Jeg fant en **Volvo XC60 (2019)**. Hvilket glass trenger du?
> *(chips: [Frontrute] [Bakrute] [Dørrute] [Siderute])*
>
> **User:** Frontrute  
> *(typing indicator …)*
>
> **AI:** For Volvo XC60 2019 finnes det flere frontrute-varianter. Jeg må vite om bilen har **ADAS-kamera** (f.eks. filskiftevarsel / adaptiv cruisekontroll).
> *(chips: [Ja] [Nei] [Vet ikke])*
>
> **User:** Ja  
> *(typing indicator …)*
>
> **AI:** Da passer disse:
> *(product cards: OEM Volvo frontrute + Pilkington aftermarket)*
> *(chips: [Hva er forskjellen?] [Be menneske sjekke] [Nytt søk])*
>
> **User:** Be menneske sjekke
>
> **AI:** Jeg overfører deg til et av våre ordremottakere. De ser samtalen og forslagene.
> *(handoff card with reference number and contact options)*

**End-to-end flow**

1. User opens assistant on `/sok` or `/bla`.
2. AI greets and proposes entry points.
3. User supplies regnr / VIN / vehicle + position.
4. AI calls `searchGlass` and optionally asks follow-up equipment questions via `askCustomer`.
5. AI shows up to 3–5 product cards with a concise explanation.
6. User can ask for comparison (`explainDifferences`), more info, or request a human (`handoverToHuman`).
7. On handoff, the system creates a `chat_handoffs` row and shows a handoff card.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  React frontend (/sok, /bla)                                        │
│  CustomerAssistant panel ──► useCustomerChat hook ──► /api/chat     │
└─────────────────────────────────────────────────────────────────────┘
                              POST  text/event-stream
                                       │
┌──────────────────────────────────────▼──────────────────────────────┐
│  Cloudflare Worker                                                  │
│  POST /api/chat                                                     │
│    ├── rate-limit (reuse checkRateLimit)                            │
│    ├── session store (D1 chat_sessions + KV cache)                  │
│    ├── LLM decision loop (env.AI via ai-gateway)                    │
│    │      └── JSON response: tool_calls | message | quick_replies   │
│    ├── tool execution                                               │
│    │      ├── searchGlass  ──► searchByRegnr / vin-lookup-api       │
│    │      ├── explainDifferences ──► LLM diff or structured diff    │
│    │      ├── askCustomer  ──► no backend side effect               │
│    │      └── handoverToHuman ──► INSERT chat_handoffs              │
│    └── SSE stream to client                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  D1 glass-catalog-db                                                │
│  chat_sessions, chat_messages, chat_handoffs                        │
└─────────────────────────────────────────────────────────────────────┘
```

The assistant reuses existing building blocks:
- `api/cf-worker/src/handlers/search.ts` → `searchByRegnr`
- `api/cf-worker/src/vin-lookup-api.ts` → VIN resolution
- `api/cf-worker/src/lib/ai-gateway.ts` → LLM call with Workers AI + Groq fallback
- `api/cf-worker/src/lib/normalize.ts` → record normalization
- `frontend/src/types/api.ts` → `Product`, `VehicleInfo`, `EquipmentFlags`

---

## 4. Backend design

### 4.1 Endpoint

```http
POST /api/chat
Content-Type: application/json
```

**Request body**

```json
{
  "message": "AB12345",
  "session_token": "uuid-v4",
  "page_context": {
    "path": "/sok",
    "current_query": "AB12345",
    "category": "frontrute"
  },
  "customer_id": 123,
  "language": "no"
}
```

`message` can be text, a quick-reply value, or `null` for a pure refresh/greeting.

**Response:** `Content-Type: text/event-stream`

```text
event: meta
data: {"session_token":"...","status":"active"}

event: typing
data: {}

event: text
data: {"delta":"Jeg fant en Volvo XC60 (2019)."}

event: text
data: {"delta":" Hvilket glass trenger du?"}

event: quick_replies
data: {"chips":[{"label":"Frontrute","value":"frontrute"},{"label":"Bakrute","value":"bakrute"}]}

event: done
data: {}
```

**Event types**

| Event | Purpose |
|-------|---------|
| `meta` | `session_token`, conversation status, request ID |
| `typing` | Frontend shows the typing indicator |
| `text` | Word/chunk delta to animate into the assistant bubble |
| `products` | Array of product cards to render inline |
| `quick_replies` | Clickable suggestion chips |
| `tool_call` | Optional: show a subtle “søker …” status |
| `handoff` | Handoff summary + reference number |
| `error` | Recoverable error message |
| `done` | Stream complete |

### 4.2 Tool definitions

The LLM returns a JSON object with an optional `tool_calls` array. Each tool is executed sequentially in the loop.

#### `searchGlass`

Find glass candidates for a given identifier.

```json
{
  "tool": "searchGlass",
  "params": {
    "regnr": "AB12345",
    "vin": null,
    "eurocode": null,
    "make": null,
    "model": null,
    "year": null,
    "position": "frontrute",
    "equipment": { "adas": true }
  }
}
```

**Execution:**
- If `regnr` → `searchByRegnr(...)`
- If `vin` → `vin-lookup-api.ts`
- If `eurocode`/`supplier_sku`/`oem` → direct D1 lookup
- If `make+model+year` → brand/year + kType-family lookup

**Result returned to LLM:**
```json
{
  "ok": true,
  "vehicle": { "make": "Volvo", "model": "XC60", "year": 2019 },
  "candidates": [ /* up to 10 normalized GlassRecord */ ],
  "confidence": 0.92,
  "reasons": ["regnr exact", "kType match"]
}
```

#### `explainDifferences`

Generate a concise comparison between selected candidates.

```json
{
  "tool": "explainDifferences",
  "params": { "candidate_ids": [101, 205] }
}
```

**Execution:**
- Fetch full records.
- Build a short diff focused on: OEM vs aftermarket, ADAS, heating, coating, acoustic, antenna, HUD, price.
- Either compute a deterministic diff or ask the LLM for a one-sentence summary.

**Result returned to LLM:**
```json
{
  "summary": "OEM-glasset har original coating og logo. Pilkington-glasset er aftermarket uten logo, ellers samme ADAS-støtte.",
  "diff": ["OEM: 4 850 kr", "Aftermarket: 3 200 kr", "Begge har ADAS"]
}
```

#### `askCustomer`

Present a question with quick-reply options.

```json
{
  "tool": "askCustomer",
  "params": {
    "question_key": "adas",
    "question_text": "Har bilen ADAS-kamera i frontruten?",
    "options": [
      { "label": "Ja", "value": "ja" },
      { "label": "Nei", "value": "nei" },
      { "label": "Vet ikke", "value": "vet_ikke" }
    ]
  }
}
```

**Execution:** No backend side effect. The assistant streams the question and the `quick_replies` event.

#### `handoverToHuman`

Escalate to a human ordremottaker.

```json
{
  "tool": "handoverToHuman",
  "params": {
    "reason": "low_confidence",
    "summary": "Volvo XC60 2019 frontrute — usikker på ADAS-variant.",
    "preferred_contact": "chat"
  }
}
```

**Execution:**
- Insert a row into `chat_handoffs`.
- Update `chat_sessions.status = 'handed_off'`.
- Stream a `handoff` event.

### 4.3 LLM loop

```text
1. Receive user message → store in chat_messages.
2. Build prompt:
   - System instructions (role, guardrails, tool schemas)
   - Page context (current search query, category)
   - Last N messages from chat_messages
   - Results from any tool calls already executed this turn
3. Call LLM (Workers AI via ai-gateway; Groq fallback).
4. Parse JSON: { tool_calls[], message?, quick_replies?, handoff? }.
5. If tool_calls:
   - Stream a `typing` event.
   - Execute each tool (max 3 iterations).
   - Re-run from step 2 with tool results.
6. If message:
   - Stream `text` chunks word-by-word (backend chunking).
   - Stream `products` if candidates are available.
   - Stream `quick_replies` for the next turn.
7. If handoff:
   - Execute `handoverToHuman`, stream `handoff` event.
8. Store assistant message in chat_messages.
```

**Model / parameters**
- Primary: `@cf/moonshotai/moonshot-auto` via `ai-gateway.ts`
- Fallback: Groq `llama-3.3-70b-versatile`
- Temperature: `0.2` for NER/tool routing, `0.3` for natural-language answers
- Max tokens: `512`
- Response format: `json_schema`

### 4.4 Guardrails

- **No ordering:** The system prompt explicitly forbids the assistant from creating orders, quotes, or final prices. If the user says “bestill” or “send tilbud”, the LLM must call `handoverToHuman`.
- **Loop limit:** Max 3 LLM → tool iterations per request; if exceeded, force handoff.
- **Timeout:** Hard ceiling of 15 s for the full stream; if hit, return a graceful error event and suggest handoff.
- **Input validation:** Regnr/VIN/eurocode validated with existing `input-detector.ts` helpers before calling search.
- **Rate limiting:** Reuse D1-based `checkRateLimit` per IP.
- **PII handling:** Raw regnr is allowed in the live session context but is **hashed (SHA-256)** before long-term logging or handoff records. Chat message retention is 30 days by default.
- **Language:** Norwegian (`no`) for the MVP; other languages reuse the same prompt with a language header.

---

## 5. Frontend design

### 5.1 Placement

- The assistant is **route-specific** to `/sok` and `/bla`.
- On those routes the existing global Professor floating widget is hidden to avoid duplicate chat UIs.
- It appears as a **collapsible side panel on desktop** (right edge) and a **bottom sheet on mobile**.
- A floating launcher button (“AI-hjelp”) is anchored bottom-right; on desktop it can also be opened from a button near the search bar / catalog filters.

### 5.2 Component hierarchy

```
frontend/src/components/customer-assistant/
├── CustomerAssistant.tsx          # page-level container, manages open/closed
├── AssistantLauncher.tsx          # floating trigger button
├── AssistantPanel.tsx             # collapsible panel / bottom sheet
├── AssistantHeader.tsx            # avatar, title, close, reset
├── MessageList.tsx                # scrollable message feed
│   ├── AssistantMessage.tsx
│   ├── UserMessage.tsx
│   ├── ProductCardsMessage.tsx
│   ├── QuickRepliesMessage.tsx
│   ├── HandoffMessage.tsx
│   └── TypingIndicator.tsx
├── ChatInput.tsx                  # text input + send
├── AssistantAvatar.tsx            # animated avatar
└── hooks/
    ├── useCustomerChat.ts         # streaming + message state
    └── useSseParser.ts            # ReadableStream → SSE events
stores/
└── customerAssistantStore.ts      # open/closed, initial page context
```

### 5.3 Message types

```ts
type Message =
  | { id: string; role: 'user'; content: string; timestamp: number }
  | { id: string; role: 'assistant'; content: string; isStreaming?: boolean; timestamp: number }
  | { id: string; role: 'products'; products: Product[]; timestamp: number }
  | { id: string; role: 'quick_replies'; chips: QuickReplyChip[]; timestamp: number }
  | { id: string; role: 'handoff'; summary: HandoffSummary; timestamp: number }
  | { id: string; role: 'error'; content: string; timestamp: number };
```

### 5.4 Streaming and typing indicator

- When the user sends a message, the UI immediately appends a user bubble and sets `status = 'thinking'`.
- A `typing` event from the backend shows the typing indicator.
- `text` deltas are appended to the latest assistant bubble.
- To create the “alive” feel without requiring native LLM token streaming, the backend emits pre-chunked words; the frontend renders them with a short delay (`~25 ms`) using `requestAnimationFrame`.
- On `done`, `isStreaming` flips to `false`.
- If the user sends a new message while a stream is active, the active stream is aborted via `AbortController` and a fresh request starts.

### 5.5 Product cards

Product cards are rendered inline in the chat feed when a `products` event arrives.

Each card shows:
- Small product image (fallback to placeholder).
- Brand + model line.
- Eurocode / article number.
- Price (standard list price).
- Key feature badges: ADAS, heated, rain sensor, acoustic, HUD, antenna.
- Stock status indicator.
- CTA: **“Se detaljer”** → opens the existing product detail modal / scrolls to the relevant search result.
- **No “Add to cart”** button in the chat (recommendation-only).

Cards use the existing `Product` type and reuse visual styling from `frontend/src/components/browse/ProductCard.tsx` but in a more compact chat variant.

### 5.6 Quick-reply chips

- Chips appear below the assistant bubble they belong to.
- Clicking a chip sends its `value` as a user message.
- Examples:
  - Position: Frontrute / Bakrute / Dørrute / Siderute
  - Equipment: Ja / Nei / Vet ikke
  - Actions: Hva er forskjellen? / Be menneske sjekke / Nytt søk
- Visually: small rounded pills, `bg-autoglass-light text-autoglass-blue`, hover `bg-autoglass-blue text-white`.

### 5.7 Proactive greeting

On first open, before any user input:
- Assistant avatar pulses gently.
- Greeting bubble: *“Hei! Jeg kan hjelpe deg å finne riktig glass. Har du regnr, eller vil du søke på merke/modell?”*
- Proactive chips based on `page_context`:
  - On `/sok` with `current_query=AB12345`: *“Finn glass til AB12345”*
  - On `/bla` with a brand selected: *“Finn glass til Volvo”*

### 5.8 Animations

- Panel open/close: `animate-slide-up` + opacity fade on mobile; width transition on desktop.
- Message bubbles: `animate-fade-in` (Tailwind keyframe already defined).
- Typing indicator: three bouncing dots.
- Avatar: subtle `animate-pulse-slow` while thinking.
- Product cards: staggered `animate-fade-in` with `transition-transform hover:scale-[1.01]`.
- Respect `prefers-reduced-motion`: disable animations.

---

## 6. Data model / storage

Add three tables to the existing D1 catalog database. Migration file: `api/cf-worker/migrations/00XX_customer_chat.sql`.

```sql
-- Live conversation metadata
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web_chat',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','handed_off')),
  page_context TEXT,              -- JSON: path, current_query, category
  vehicle_context TEXT,           -- JSON: make, model, year, regnr_hash, vin_hash
  context TEXT,                   -- JSON: last candidates, equipment answers
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Full message log (retention 30 days by default)
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

-- Human handoff queue
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

Session runtime state (last candidates, pending question) is also cached in KV with a short TTL (15 min) to reduce D1 reads during rapid back-and-forth; D1 remains the source of truth for messages and handoffs.

---

## 7. Error handling and human handoff

### Error scenarios

| Scenario | UX | Backend action |
|----------|----|----------------|
| LLM / AI gateway failure | Show *“Beklager, jeg fikk ikke svar. Vil du prøve igjen eller snakke med et menneske?”* + retry + handoff chips | Log error; return `error` event; do not store assistant message |
| Search no-match | Explain and ask for regnr / year / position | Return empty candidates; LLM clarifies |
| Invalid regnr/VIN | Inline validation before request; if backend rejects, show friendly error | Return 400 with `error` event |
| Rate limit 429 | Show *“For mange forespørsler. Vent et øyeblikk.”* | `checkRateLimit` |
| Timeout (>15 s) | Show *“Det tok for lang tid. Jeg overfører deg.”* | Auto-create handoff with reason `timeout` |
| Unknown error | Handoff chip + generic retry | Log + return `error` event |

### Handoff triggers

The LLM calls `handoverToHuman` automatically when any of the following is true:
- User explicitly asks for a human (“snakk med noen”, “ordremottaker”, “telefon”).
- `searchGlass` returns zero candidates after two clarification attempts.
- Candidate confidence is below `0.4` and the user is unsure.
- Multiple possible vehicles with similar confidence.
- Required equipment cannot be determined and the user chooses “Vet ikke”.
- User intent is “bestill” / “tilbud” / “send pris” (order-related; recommendation-only scope).
- Tool loop limit or timeout.

### Handoff UX

- Yellow handoff card with `PhoneCall` icon.
- Shows reason, short summary, and a reference number (`chat_handoffs.id`).
- Offers quick contact capture if the customer is unknown: *“Legg igjen e-post eller telefon så kontakter vi deg.”*
- Disables the input and shows *“En ordremottaker tar over straks.”*

---

## 8. Testing strategy

### Unit tests

- `customer-chat-router.test.ts` — tool routing decisions from mocked LLM output.
- `customer-chat-stream.test.ts` — SSE event serialization.
- `useCustomerChat.test.ts` — hook state transitions and abort behavior (mocked `ReadableStream`).
- `ProductCardsMessage.test.tsx` — renders correct number of cards and CTA links.

### Integration tests (Worker)

- `api/cf-worker/src/handlers/customer-chat.test.ts` using the Workers vitest pool:
  - regnr → `searchGlass` → `askCustomer` → product cards stream.
  - VIN path → `searchGlass` → handoff on timeout.
  - invalid regnr → 400 error event.
  - handoff → assert `chat_handoffs` row exists.
- Mock `env.AI` and D1; stub `searchByRegnr` and `vin-lookup-api.ts`.

### Frontend component tests

- Assistant panel open/close, launcher visibility, focus trap.
- Typing indicator appears/disappears on events.
- Quick-reply click sends correct message.
- Handoff card disables input.

### E2E (Playwright)

- `/sok`: open assistant, type regnr, select position, answer equipment, see product cards, click “Be menneske sjekke”, see handoff card.
- `/bla`: open assistant, verify proactive greeting references selected brand.
- Accessibility: keyboard navigation and screen-reader labels.

---

## 9. Open questions / decisions

1. **Widget placement — inline vs. floating?**  
   Decision: collapsible side panel / bottom sheet on `/sok` and `/bla`, launched from a floating AI-hjelp button. Hide the global Professor widget on these two routes to avoid duplicate chat surfaces.

2. **Session storage — KV, D1, or both?**  
   Decision: D1 as source of truth for sessions, messages, and handoffs; KV as a 15-minute runtime cache for fast back-and-forth.

3. **True LLM streaming vs. chunk animation?**  
   Decision: backend emits pre-chunked words via SSE; frontend animates them. Tool-calling stays JSON-schema reliable. Native token streaming can be added later without changing the event protocol.

4. **Should product cards have an “Add to cart” button?**  
   Decision: no. The assistant is recommendation-only. The CTA is “Se detaljer” which opens the existing product detail/search result. Ordering requires human handoff.

5. **Which avatar?**  
   Decision: reuse `ProfessorAvatar` initially but rename/extend for a customer-facing variant. Tone should be friendly, not academic.

6. **Regnr retention**  
   Open: do we store raw regnr in `chat_messages.content` for context, or replace it with `[REDACTED]` after hashing? Recommend hashing in durable storage and keeping raw only in KV during the active session.

7. **Handoff notifications**  
   Open: should a new handoff row trigger an email/Slack alert to ordremottaker staff? Out of scope for the widget itself; add via a separate notification worker reading `chat_handoffs`.

8. **Language**  
   Decision: Norwegian only for MVP. Prompt and quick-replies are Norwegian; the schema is language-agnostic for future expansion.

9. **Overlap with `/api/ordremottaker`**  
   Decision: keep the two endpoints separate. `/api/ordremottaker` remains the internal/conversational ordering path; `/api/chat` is the public, recommendation-only assistant. They may share helper functions but not handler logic.
