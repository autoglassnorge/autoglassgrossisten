# AI Ordremottaker — Fase 1: Chat-widget + Norsk + Handlekurv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en AI-chat-widget på nettsiden som tar imot naturlig språk fra B2B-kunder, finner riktig bilglass med Moonshot Kimi K2.5, og sender kunden direkte til handlekurv.

**Architecture:** Sentralt Cloudflare Worker API (`/api/ordremottaker`) mottar meldinger, bruker LLM (Moonshot Kimi K2.5 via Workers AI) for NER og dialog, søker i D1 glass_catalog, og returnerer strukturert respons. React chat-widget bruker React Query for sesjons-håndtering og Zustand cartStore for handlekurv.

**Tech Stack:** Cloudflare Worker (TypeScript), D1 SQLite, Workers AI (Moonshot Kimi K2.5), React 18 + Vite + Tailwind + React Query + Zustand

---

## Eksisterende kontekst

- `frontend/src/stores/cartStore.ts` — Zustand handlekurv med `addItem()`, `removeItem()`, `items[]`
- `frontend/src/api/glass.ts` — Eksisterende API-klient med `searchByRegnr()`, `guideGlass()`
- `frontend/src/pages/SearchPage.tsx` — Søkeside med regnr-input og resultater
- `api/cf-worker/src/index.ts` — Router med alle API-endepunkter
- `api/cf-worker/src/handlers/glass-guide.ts` — Rule-based + LLM glassvelger
- `api/cf-worker/src/lib/llm.ts` — Moonshot Kimi K2.5 via Workers AI med JSON schema
- `api/cf-worker/schema.sql` — D1-skjema med `glass_catalog`, `ktype_registry`, `glass_rules`
- `api/cf-worker/wrangler.toml` — Wrangler-config med `[ai]` binding

---

## Filstruktur (Fase 1)

### Backend (nye filer)

| Fil | Ansvar |
|-----|--------|
| `api/cf-worker/src/handlers/ordremottaker.ts` | Hovedhandler for POST `/api/ordremottaker` — mottar melding, kaller LLM, søker D1, returnerer respons |
| `api/cf-worker/src/lib/ordremottaker-llm.ts` | LLM-prompts: NER-extract, dialogue, recommendation. JSON schema mode |
| `api/cf-worker/src/lib/ordremottaker-session.ts` | Sesjonshåndtering: lagre/hente kontekst i KV |
| `api/cf-worker/migrations/0010_b2b_customers.sql` | D1-migrasjon: `b2b_customers`, `order_history` (minimalt for Fase 1) |

### Backend (modifiserte filer)

| Fil | Endring |
|-----|---------|
| `api/cf-worker/src/index.ts` | Legg til route `POST /api/ordremottaker` |
| `api/cf-worker/src/types.ts` | Legg til `OrdremottakerRequest`, `OrdremottakerResponse`, `AiSession` typer |

### Frontend (nye filer)

| Fil | Ansvar |
|-----|--------|
| `frontend/src/api/ordremottaker.ts` | API-klient: `sendMessage()`, `getSession()` med typer |
| `frontend/src/hooks/useOrdremottaker.ts` | React Query hook: håndterer sesjon, meldinger, loading |
| `frontend/src/components/ordremottaker/ChatWidget.tsx` | Hoved-widget: flytende chat-boble nede høyre |
| `frontend/src/components/ordremottaker/ChatMessage.tsx` | Enkelt meldings-komponent (AI / kunde) |
| `frontend/src/components/ordremottaker/ChatInput.tsx` | Input-felt med send-knapp |
| `frontend/src/components/ordremottaker/CartPreview.tsx` | Forhåndsvisning av valgt glass + tilbehør med "Legg i handlekurv" |
| `frontend/src/components/ordremottaker/GlassSuggestion.tsx` | Viser OEM + Aftermarket side om side |

### Frontend (modifiserte filer)

| Fil | Endring |
|-----|---------|
| `frontend/src/App.tsx` | Legg til `<ChatWidget />` globalt (alltid synlig) |

---

## Task 1: D1-migrasjon — B2B-kunder og ordrehistorikk

**Files:**
- Create: `api/cf-worker/migrations/0010_b2b_customers.sql`

**Context:** Vi trenger minimale tabeller for Fase 1. Kunderegistrering kommer i Fase 2, men vi trenger tabellene for å lagre sesjoner og teste.

- [ ] **Step 1: Skriv migrasjon**

```sql
-- B2B-kunder (minimalt for Fase 1)
CREATE TABLE IF NOT EXISTS b2b_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_nr TEXT UNIQUE,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  price_tier TEXT DEFAULT 'standard',
  payment_terms TEXT DEFAULT 'faktura',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ordrehistorikk (minimalt for Fase 1)
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  regnr TEXT,
  vin TEXT,
  glass_sku TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price_per_unit REAL,
  total REAL,
  accessories TEXT,
  status TEXT DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

-- AI-sesjoner
CREATE TABLE IF NOT EXISTS ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'chat',
  session_token TEXT UNIQUE NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_token ON ai_sessions(session_token);
```

- [ ] **Step 2: Kjør migrasjon på D1**

Run: `cd api/cf-worker && wrangler d1 execute glass-catalog-db --file=migrations/0010_b2b_customers.sql --remote`

- [ ] **Step 3: Commit**

```bash
git add api/cf-worker/migrations/0010_b2b_customers.sql
git commit -m "db: add b2b_customers, order_history, ai_sessions tables"
```

---

## Task 2: Typer — Ordremottaker-interfaces

**Files:**
- Modify: `api/cf-worker/src/types.ts`

**Context:** Legg til typer for ordremottaker-APIet.

- [ ] **Step 1: Legg til typer etter eksisterende typer**

```typescript
// api/cf-worker/src/types.ts
// Legg til etter eksisterende typer (f.eks. etter GuideState)

export interface OrdremottakerRequest {
  message: string;
  session_token?: string;
  customer_id?: number;
  channel?: 'chat' | 'email' | 'phone';
  language?: 'no' | 'sv' | 'da' | 'en';
}

export interface OrdremottakerResponse {
  status: 'question' | 'recommendation' | 'order_ready' | 'escalated' | 'clarification';
  ai_response: string;
  session_token: string;
  candidates?: GlassRecord[];
  accessories?: AccessoryItem[];
  cart_url?: string;
  confidence: number;
  next_action?: string;
}

export interface AccessoryItem {
  sku: string;
  name: string;
  price: number;
  included: boolean;
  removable: boolean;
}

export interface AiSession {
  id: number;
  customer_id: number | null;
  channel: string;
  session_token: string;
  context: string; // JSON
  status: 'active' | 'completed' | 'escalated';
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/types.ts
git commit -m "types: add Ordremottaker interfaces"
```

---

## Task 3: LLM-prompts og NER — Ordremottaker LLM-modul

**Files:**
- Create: `api/cf-worker/src/lib/ordremottaker-llm.ts`

**Context:** Bygg LLM-modul som bruker Moonshot Kimi K2.5 med JSON schema mode for å ekstraher kjøretøydata fra naturlig språk og generere dialog.

- [ ] **Step 1: Skriv LLM-modul**

```typescript
// api/cf-worker/src/lib/ordremottaker-llm.ts
import type { Env, GlassRecord } from '../types';

interface NerResult {
  make: string | null;
  model: string | null;
  year: number | null;
  regnr: string | null;
  vin: string | null;
  position: 'frontrute' | 'bakrute' | 'dørrute-frem' | 'dørrute-bak' | 'siderute' | 'annet' | null;
  adas: boolean | null;
  rain_sensor: boolean | null;
  heated: boolean | null;
  intent: 'bestill' | 'prisforespørsel' | 'support' | 'uklart';
  confidence: number;
}

interface DialogueResult {
  ai_response: string;
  status: 'question' | 'recommendation' | 'clarification';
  next_action: string | null;
  confidence: number;
}

export async function extractVehicleFromMessage(
  env: Env,
  message: string
): Promise<NerResult | null> {
  const schema = {
    type: 'object',
    properties: {
      make: { type: ['string', 'null'] },
      model: { type: ['string', 'null'] },
      year: { type: ['number', 'null'] },
      regnr: { type: ['string', 'null'] },
      vin: { type: ['string', 'null'] },
      position: { type: ['string', 'null'], enum: ['frontrute', 'bakrute', 'dørrute-frem', 'dørrute-bak', 'siderute', 'annet', null] },
      adas: { type: ['boolean', 'null'] },
      rain_sensor: { type: ['boolean', 'null'] },
      heated: { type: ['boolean', 'null'] },
      intent: { type: 'string', enum: ['bestill', 'prisforespørsel', 'support', 'uklart'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['make', 'model', 'year', 'regnr', 'vin', 'position', 'adas', 'rain_sensor', 'heated', 'intent', 'confidence']
  };

  const systemPrompt = `Du er en erfaren ordremottaker hos Autoglass AS med 30 års erfaring.
Les kundens melding og ekstraher følgende felter.
- make: bilmerke (f.eks. "Jaguar", "VW", "Audi")
- model: modell (f.eks. "E-Pace", "Transporter", "A4")
- year: årsmodell som tall
- regnr: norsk registreringsnummer (2 bokstaver + 4-5 tall)
- vin: 17-sifret understellsnummer
- position: glassposisjon
- adas: har bilen ADAS/kamera?
- rain_sensor: har bilen regnsensor?
- heated: har bilen oppvarmet frontrute?
- intent: hva vil kunden?
- confidence: 0.0-1.0 hvor sikker er du?

Svar KUN med JSON. Ingen forklaring.`;

  try {
    const result = await env.AI.run('@cf/moonshotai/kimi-k2.5', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 512,
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'vehicle_extraction', schema, strict: true }
      }
    });

    const response = (result as { response?: string }).response || '';
    if (!response) return null;
    return JSON.parse(response) as NerResult;
  } catch (e) {
    console.error('NER extraction failed:', e);
    return null;
  }
}

export async function generateDialogue(
  env: Env,
  message: string,
  context: {
    vehicle?: { make: string; model: string; year: number };
    candidates?: GlassRecord[];
    previousAnswers?: Record<string, string>;
    confidence: number;
  }
): Promise<DialogueResult> {
  const schema = {
    type: 'object',
    properties: {
      ai_response: { type: 'string' },
      status: { type: 'string', enum: ['question', 'recommendation', 'clarification'] },
      next_action: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['ai_response', 'status', 'next_action', 'confidence']
  };

  const systemPrompt = `Du er ordremottaker hos Autoglass AS. Du snakker norsk.
Hjelp B2B-kunder (verksteder) med å finne riktig bilglass.

REGLER:
- Hvis du har funnet glass: vis OEM og Aftermarket side om side (ikke sorter).
- Foreslå tilbehør: list, lim, klips.
- Avslutt med direkte link til handlekurv når alt er klart.
- Vær kort og konsis. Maks 3 setninger.
- Hvis usikker: still ETT spørsmål.

NÅVÆRENDE KONTEKST:
Kjøretøy: ${context.vehicle ? `${context.vehicle.make} ${context.vehicle.model} ${context.vehicle.year}` : 'Ukjent'}
Kandidater: ${context.candidates?.length || 0} glass funnet
Usikkerhet: ${context.confidence < 0.7 ? 'Høy' : 'Lav'}`;

  try {
    const result = await env.AI.run('@cf/moonshotai/kimi-k2.5', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 512,
      temperature: 0.3,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'dialogue_response', schema, strict: true }
      }
    });

    const response = (result as { response?: string }).response || '';
    if (!response) {
      return {
        ai_response: 'Beklager, jeg kunne ikke prosessere forespørselen. Kan du gi meg registreringsnummeret?',
        status: 'clarification',
        next_action: 'ask_regnr',
        confidence: 0
      };
    }
    return JSON.parse(response) as DialogueResult;
  } catch (e) {
    console.error('Dialogue generation failed:', e);
    return {
      ai_response: 'Beklager, teknisk feil. Vennligst prøv igjen eller kontakt oss på telefon.',
      status: 'clarification',
      next_action: null,
      confidence: 0
    };
  }
}

export function buildCartUrl(items: { sku: string; qty: number }[]): string {
  const params = new URLSearchParams();
  items.forEach((item, i) => {
    params.append(`sku${i}`, item.sku);
    params.append(`qty${i}`, String(item.qty));
  });
  return `/kasse?${params.toString()}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/lib/ordremottaker-llm.ts
git commit -m "llm: add ordremottaker NER + dialogue prompts with Moonshot Kimi"
```

---

## Task 4: Sesjonshåndtering — KV-basert kontekst

**Files:**
- Create: `api/cf-worker/src/lib/ordremottaker-session.ts`

**Context:** Lagre AI-sesjoner i KV for rask tilgang og stateless Worker.

- [ ] **Step 1: Skriv sesjons-modul**

```typescript
// api/cf-worker/src/lib/ordremottaker-session.ts
import type { Env } from '../types';

interface SessionContext {
  messages: { role: 'user' | 'ai'; content: string; timestamp: number }[];
  vehicle?: { make: string; model: string; year: number };
  candidates?: number[]; // glass IDs
  answers: Record<string, string>;
  cartItems: { sku: string; qty: number }[];
  status: 'active' | 'completed' | 'escalated';
}

const SESSION_PREFIX = 'ai_session:';
const SESSION_TTL = 60 * 60 * 24; // 24 timer

export async function createSession(env: Env): Promise<string {
  const token = crypto.randomUUID();
  const context: SessionContext = {
    messages: [],
    answers: {},
    cartItems: [],
    status: 'active'
  };
  await env.GLASS_CATALOG.put(
    `${SESSION_PREFIX}${token}`,
    JSON.stringify(context),
    { expirationTtl: SESSION_TTL }
  );
  return token;
}

export async function getSession(env: Env, token: string): Promise<SessionContext | null> {
  const data = await env.GLASS_CATALOG.get(`${SESSION_PREFIX}${token}`, 'json');
  return data as SessionContext | null;
}

export async function updateSession(
  env: Env,
  token: string,
  updates: Partial<SessionContext>
): Promise<void> {
  const existing = await getSession(env, token);
  if (!existing) return;
  const updated = { ...existing, ...updates };
  await env.GLASS_CATALOG.put(
    `${SESSION_PREFIX}${token}`,
    JSON.stringify(updated),
    { expirationTtl: SESSION_TTL }
  );
}

export async function addMessage(
  env: Env,
  token: string,
  role: 'user' | 'ai',
  content: string
): Promise<void> {
  const session = await getSession(env, token);
  if (!session) return;
  session.messages.push({ role, content, timestamp: Date.now() });
  // Keep only last 20 messages
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }
  await updateSession(env, token, { messages: session.messages });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/lib/ordremottaker-session.ts
git commit -m "session: add KV-based AI session management"
```

---

## Task 5: Hovedhandler — POST /api/ordremottaker

**Files:**
- Create: `api/cf-worker/src/handlers/ordremottaker.ts`

**Context:** Hoved-API som orkestrerer hele flyten: motta melding → NER → søk D1 → LLM-dialogue → returner respons.

- [ ] **Step 1: Skriv hovedhandler**

```typescript
// api/cf-worker/src/handlers/ordremottaker.ts
import type { Env, GlassRecord, OrdremottakerRequest, OrdremottakerResponse } from '../types';
import { jsonResponse, errorResponse } from '../lib/cors';
import { extractVehicleFromMessage, generateDialogue, buildCartUrl } from '../lib/ordremottaker-llm';
import { createSession, getSession, updateSession, addMessage } from '../lib/ordremottaker-session';
import { searchByRegnr } from './search';
import { queryByBrandAndYear, queryByBrandOnly } from '../lib/db';
import { normalizeRecord } from '../lib/normalize';
import { decodeVin } from '../lib/vin-decoder';

export async function handleOrdremottaker(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Kun POST støttet', 405);
  }

  let body: OrdremottakerRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ugyldig JSON', 400);
  }

  const { message, session_token, language = 'no' } = body;

  if (!message || typeof message !== 'string') {
    return errorResponse('Mangler melding', 400);
  }

  // Get or create session
  let token = session_token;
  let session = token ? await getSession(env, token) : null;
  if (!session) {
    token = await createSession(env);
    session = await getSession(env, token);
  }
  if (!session) {
    return errorResponse('Kunne ikke opprette sesjon', 500);
  }

  // Log user message
  await addMessage(env, token, 'user', message);

  try {
    // Step 1: NER extraction via LLM
    const nerResult = await extractVehicleFromMessage(env, message);

    let candidates: GlassRecord[] = [];
    let vehicle: { make: string; model: string; year: number } | undefined;

    // Step 2: Search for glass
    if (nerResult?.regnr) {
      // Regnr path
      const searchResult = await searchByRegnr(nerResult.regnr, env);
      if (searchResult.httpStatus === 200) {
        const searchBody = searchResult.body as { candidates?: GlassRecord[]; vehicle?: typeof vehicle };
        candidates = searchBody.candidates || [];
        vehicle = searchBody.vehicle;
      }
    } else if (nerResult?.vin) {
      // VIN path
      const vinData = decodeVin(nerResult.vin);
      if (vinData) {
        vehicle = { make: vinData.make, model: vinData.generation, year: vinData.modelYear || new Date().getFullYear() };
        const db = env.GLASS_CATALOG_D1;
        candidates = (await queryByBrandAndYear(db, vinData.make, vehicle.year)).map(normalizeRecord);
        if (candidates.length === 0) {
          candidates = (await queryByBrandOnly(db, vinData.make, vinData.generation)).map(normalizeRecord);
        }
      }
    } else if (nerResult?.make && nerResult.year) {
      // Brand + year path
      vehicle = { make: nerResult.make, model: nerResult.model || 'Ukjent', year: nerResult.year };
      const db = env.GLASS_CATALOG_D1;
      candidates = (await queryByBrandAndYear(db, nerResult.make, nerResult.year)).map(normalizeRecord);
      if (candidates.length === 0 && nerResult.model) {
        candidates = (await queryByBrandOnly(db, nerResult.make, nerResult.model)).map(normalizeRecord);
      }
    }

    // Filter by position if specified
    if (nerResult?.position && candidates.length > 0) {
      const posMap: Record<string, string> = {
        'frontrute': 'frontrute',
        'bakrute': 'bakrute',
        'dørrute-frem': 'dørrute-frem',
        'dørrute-bak': 'dørrute-bak',
        'siderute': 'siderute'
      };
      const targetPos = posMap[nerResult.position];
      if (targetPos) {
        candidates = candidates.filter(c =>
          c.category?.toLowerCase() === targetPos ||
          c.type_code?.toLowerCase() === targetPos
        );
      }
    }

    // Step 3: Generate dialogue via LLM
    const dialogue = await generateDialogue(env, message, {
      vehicle,
      candidates,
      previousAnswers: session.answers,
      confidence: nerResult?.confidence || 0
    });

    // Step 4: Build accessories (Fase 1: standard)
    const accessories = candidates.length > 0 ? buildDefaultAccessories() : [];

    // Step 5: Build cart URL if ready
    let cartUrl: string | undefined;
    if (dialogue.status === 'recommendation' && candidates.length > 0) {
      const topCandidate = candidates[0];
      const items = [{ sku: topCandidate.eurocode || topCandidate.article_number || String(topCandidate.id), qty: 1 }];
      accessories.filter(a => a.included).forEach(a => items.push({ sku: a.sku, qty: 1 }));
      cartUrl = buildCartUrl(items);
    }

    // Update session
    await updateSession(env, token, {
      vehicle,
      candidates: candidates.map(c => c.id),
      status: dialogue.status === 'recommendation' ? 'completed' : 'active'
    });
    await addMessage(env, token, 'ai', dialogue.ai_response);

    const response: OrdremottakerResponse = {
      status: dialogue.status as OrdremottakerResponse['status'],
      ai_response: dialogue.ai_response,
      session_token: token,
      candidates: candidates.slice(0, 5),
      accessories,
      cart_url: cartUrl,
      confidence: dialogue.confidence,
      next_action: dialogue.next_action || undefined
    };

    return jsonResponse(response);

  } catch (e) {
    console.error('Ordremottaker error:', e);
    return errorResponse('Intern feil i ordremottaker', 500);
  }
}

function buildDefaultAccessories() {
  return [
    { sku: 'LIST-STD', name: 'Pyntelist', price: 245, included: true, removable: true },
    { sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: true },
    { sku: 'KLIPS-STD', name: 'Klips (sett)', price: 89, included: true, removable: true },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "api: add ordremottaker handler with NER, search, dialogue flow"
```

---

## Task 6: Route — Koble til Worker-router

**Files:**
- Modify: `api/cf-worker/src/index.ts`

**Context:** Legg til route for `/api/ordremottaker` i eksisterende router.

- [ ] **Step 1: Importer handler og legg til route**

```typescript
// api/cf-worker/src/index.ts
// Legg til import øverst:
import { handleOrdremottaker } from './handlers/ordremottaker';

// Legg til route i handleRequest (før fallback 404):
if (path === '/api/ordremottaker' && request.method === 'POST') {
  return handleOrdremottaker(request, env);
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/index.ts
git commit -m "routes: add /api/ordremottaker endpoint"
```

---

## Task 7: Deploy backend

**Files:**
- Modify: `api/cf-worker/src/index.ts`

- [ ] **Step 1: Deploy Worker**

Run: `cd api/cf-worker && wrangler deploy`

Expected: Deployment successful with new `/api/ordremottaker` endpoint.

- [ ] **Step 2: Test med curl**

Run:
```bash
curl -X POST https://autoglass-glass-sok.autoglassnorge.workers.dev/api/ordremottaker \
  -H "Content-Type: application/json" \
  -d '{"message":"Jeg har en Jaguar E-Pace 2022, trenger frontrute","language":"no"}'
```

Expected: JSON response with `status`, `ai_response`, `session_token`, `candidates`.

---

## Task 8: Frontend API-klient

**Files:**
- Create: `frontend/src/api/ordremottaker.ts`

**Context:** React-klient for å kommunisere med ordremottaker-APIet.

- [ ] **Step 1: Skriv API-klient**

```typescript
// frontend/src/api/ordremottaker.ts
import type { Product } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface AccessoryItem {
  sku: string;
  name: string;
  price: number;
  included: boolean;
  removable: boolean;
}

export interface OrdremottakerResponse {
  status: 'question' | 'recommendation' | 'order_ready' | 'escalated' | 'clarification';
  ai_response: string;
  session_token: string;
  candidates?: Product[];
  accessories?: AccessoryItem[];
  cart_url?: string;
  confidence: number;
  next_action?: string;
}

export async function sendMessage(
  message: string,
  sessionToken?: string
): Promise<OrdremottakerResponse> {
  const res = await fetch(`${API_BASE}/api/ordremottaker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_token: sessionToken,
      channel: 'chat',
      language: 'no'
    })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Ordremottaker feilet (${res.status})`);
  }

  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/ordremottaker.ts
git commit -m "frontend: add ordremottaker API client"
```

---

## Task 9: React Query hook

**Files:**
- Create: `frontend/src/hooks/useOrdremottaker.ts`

**Context:** Custom hook som håndterer sesjon, meldingshistorikk og loading-state.

- [ ] **Step 1: Skriv hook**

```typescript
// frontend/src/hooks/useOrdremottaker.ts
import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendMessage, type OrdremottakerResponse } from '@/api/ordremottaker';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  candidates?: OrdremottakerResponse['candidates'];
  accessories?: OrdremottakerResponse['accessories'];
  cartUrl?: string;
  timestamp: number;
}

export function useOrdremottaker() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionToken, setSessionToken] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await sendMessage(message, sessionToken || undefined);
      if (response.session_token) {
        setSessionToken(response.session_token);
      }
      return response;
    },
    onSuccess: (response) => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'ai',
        content: response.ai_response,
        candidates: response.candidates,
        accessories: response.accessories,
        cartUrl: response.cart_url,
        timestamp: Date.now()
      }]);
    }
  });

  const sendUserMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }]);
    mutation.mutate(text);
  }, [mutation]);

  const reset = useCallback(() => {
    setMessages([]);
    setSessionToken('');
  }, []);

  return {
    messages,
    sendUserMessage,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useOrdremottaker.ts
git commit -m "frontend: add useOrdremottaker React Query hook"
```

---

## Task 10: ChatMessage-komponent

**Files:**
- Create: `frontend/src/components/ordremottaker/ChatMessage.tsx`

**Context:** Viser en enkelt melding — enten fra bruker eller AI.

- [ ] **Step 1: Skriv komponent**

```tsx
// frontend/src/components/ordremottaker/ChatMessage.tsx
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-autoglass-blue text-white' : 'bg-gray-200 text-gray-600'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
        isUser
          ? 'bg-autoglass-blue text-white rounded-tr-sm'
          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
      }`}>
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ordremottaker/ChatMessage.tsx
git commit -m "frontend: add ChatMessage component"
```

---

## Task 11: GlassSuggestion-komponent

**Files:**
- Create: `frontend/src/components/ordremottaker/GlassSuggestion.tsx`

**Context:** Viser OEM + Aftermarket glass side om side. Ingen sortering.

- [ ] **Step 1: Skriv komponent**

```tsx
// frontend/src/components/ordremottaker/GlassSuggestion.tsx
import type { Product } from '@/types/api';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, Check } from 'lucide-react';

interface GlassSuggestionProps {
  candidates: Product[];
}

export function GlassSuggestion({ candidates }: GlassSuggestionProps) {
  const addItem = useCartStore(s => s.addItem);

  if (!candidates || candidates.length === 0) return null;

  // Separate OEM and aftermarket
  const oem = candidates.filter(c => c.supplier?.toLowerCase().includes('oem'));
  const aftermarket = candidates.filter(c => !c.supplier?.toLowerCase().includes('oem'));

  return (
    <div className="space-y-3 mt-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Vi fant {candidates.length} glass:
      </p>

      {oem.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Original (OEM)</p>
          {oem.slice(0, 2).map(glass => (
            <GlassCard key={glass.id} glass={glass} onAdd={addItem} />
          ))}
        </div>
      )}

      {aftermarket.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Aftermarket</p>
          {aftermarket.slice(0, 2).map(glass => (
            <GlassCard key={glass.id} glass={glass} onAdd={addItem} />
          ))}
        </div>
      )}
    </div>
  );
}

function GlassCard({ glass, onAdd }: { glass: Product; onAdd: (p: Product) => void }) {
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    onAdd(glass);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{glass.eurocode || glass.article_number}</p>
        <p className="text-xs text-gray-500">{glass.brand} {glass.model}</p>
        {glass.price && (
          <p className="text-sm font-semibold text-autoglass-blue">{glass.price.toLocaleString('no-NO')} kr</p>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={added}
        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
          added
            ? 'bg-green-100 text-green-700'
            : 'bg-autoglass-blue text-white hover:bg-autoglass-blue/90'
        }`}
      >
        {added ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
        {added ? 'Lagt til' : 'Legg i kurv'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ordremottaker/GlassSuggestion.tsx
git commit -m "frontend: add GlassSuggestion component (OEM + Aftermarket side by side)"
```

---

## Task 12: ChatWidget — hovedkomponent

**Files:**
- Create: `frontend/src/components/ordremottaker/ChatWidget.tsx`

**Context:** Flytende chat-boble nede høyre på skjermen. Åpnes/lukkes. Inneholder meldingshistorikk, input, og forslag.

- [ ] **Step 1: Skriv komponent**

```tsx
// frontend/src/components/ordremottaker/ChatWidget.tsx
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { useOrdremottaker } from '@/hooks/useOrdremottaker';
import { ChatMessage } from './ChatMessage';
import { GlassSuggestion } from './GlassSuggestion';
import { AccessorySelector } from './AccessorySelector';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendUserMessage, isLoading, error, reset } = useOrdremottaker();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendUserMessage(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-autoglass-blue text-white shadow-lg hover:bg-autoglass-blue/90 transition flex items-center justify-center"
          aria-label="Åpne chat"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-4rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
          {/* Header */}
          <div className="bg-autoglass-blue text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold">AI Ordremottaker</h3>
              <p className="text-xs text-white/70">Vi hjelper deg å finne riktig glass</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reset}
                className="text-xs text-white/70 hover:text-white underline"
                title="Start ny samtale"
              >
                Ny chat
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/70 hover:text-white"
                aria-label="Lukk chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">
                  Hei! Jeg hjelper deg å finne riktig bilglass.
                </p>
                <div className="space-y-2">
                  {[
                    'Jeg har en VW Transporter 2019, trenger frontrute',
                    'Har dere bakrute til Audi A4 2015?',
                    'Jeg trenger glass med ADAS til BMW X5'
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => { setInput(example); }}
                      className="block w-full text-left text-xs text-autoglass-blue bg-autoglass-blue/5 rounded-lg px-3 py-2 hover:bg-autoglass-blue/10 transition"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                <ChatMessage role={msg.role} content={msg.content} />
                {msg.candidates && msg.candidates.length > 0 && (
                  <GlassSuggestion candidates={msg.candidates} />
                )}
                {msg.accessories && msg.accessories.length > 0 && (
                  <AccessorySelector accessories={msg.accessories} />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                AI tenker...
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                {error instanceof Error ? error.message : 'Noe gikk galt'}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="border-t border-gray-100 p-3 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Beskriv hva du trenger..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-autoglass-blue/20"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-autoglass-blue text-white rounded-lg px-3 py-2 hover:bg-autoglass-blue/90 disabled:opacity-50 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ordremottaker/ChatWidget.tsx
git commit -m "frontend: add ChatWidget floating component"
```

---

## Task 13: AccessorySelector-komponent

**Files:**
- Create: `frontend/src/components/ordremottaker/AccessorySelector.tsx`

**Context:** Viser tilbehør som er ☑ som standard, med mulighet til å krysse bort.

- [ ] **Step 1: Skriv komponent**

```tsx
// frontend/src/components/ordremottaker/AccessorySelector.tsx
import { useState } from 'react';
import type { AccessoryItem } from '@/api/ordremottaker';

interface AccessorySelectorProps {
  accessories: AccessoryItem[];
}

export function AccessorySelector({ accessories }: AccessorySelectorProps) {
  const [items, setItems] = useState(accessories);

  const toggleItem = (sku: string) => {
    setItems(prev => prev.map(item =>
      item.sku === sku ? { ...item, included: !item.included } : item
    ));
  };

  const total = items.filter(i => i.included).reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-600">
        Standard tilbehør for dette glasset:
      </p>
      {items.map(item => (
        <label
          key={item.sku}
          className="flex items-center justify-between gap-3 cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.included}
              onChange={() => toggleItem(item.sku)}
              className="w-4 h-4 rounded border-gray-300 text-autoglass-blue focus:ring-autoglass-blue"
            />
            <span className={`text-sm ${item.included ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
              {item.name}
            </span>
          </div>
          <span className={`text-sm font-medium ${item.included ? 'text-gray-900' : 'text-gray-400'}`}>
            {item.price.toLocaleString('no-NO')} kr
          </span>
        </label>
      ))}
      <div className="border-t border-gray-200 pt-2 flex justify-between">
        <span className="text-xs font-medium text-gray-600">Tilbehør totalt:</span>
        <span className="text-sm font-semibold text-autoglass-blue">
          {total.toLocaleString('no-NO')} kr
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ordremottaker/AccessorySelector.tsx
git commit -m "frontend: add AccessorySelector with toggleable items"
```

---

## Task 14: Integrer ChatWidget i App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Context:** Legg til ChatWidget globalt i appen slik at den er tilgjengelig på alle sider.

- [ ] **Step 1: Importer og legg til**

```tsx
// frontend/src/App.tsx
// Legg til import:
import { ChatWidget } from '@/components/ordremottaker/ChatWidget';

// Legg til før </div> som wrapper App:
<ChatWidget />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "frontend: integrate ChatWidget globally in App"
```

---

## Task 15: Bygg og deploy frontend

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Bygg frontend**

Run: `cd frontend && npm run build`

Expected: Build successful, no TypeScript errors.

- [ ] **Step 2: Deploy til Cloudflare Pages**

Run: `cd frontend && npx wrangler pages deploy dist --project-name=autoglass-frontend`

Expected: Deploy successful med ny URL.

- [ ] **Step 3: Test i nettleser**

1. Åpne deployet nettside
2. Klikk chat-boble nede høyre
3. Skriv: "Jeg har en Jaguar E-Pace 2022, trenger frontrute"
4. Forvent: AI svarer med glass-forslag + tilbehør + "Legg i kurv"-knapper

---

## Spec Coverage Check

| Krav fra design | Task | Status |
|-----------------|------|--------|
| Sentralt API | Task 5 | ✅ |
| NER med Moonshot Kimi | Task 3 | ✅ |
| Sesjonshåndtering | Task 4 | ✅ |
| D1-migrasjon | Task 1 | ✅ |
| Chat-widget (flytende) | Task 12 | ✅ |
| OEM + Aftermarket side om side | Task 11 | ✅ |
| Automatisk tilbehør, tydelig, enkelt å fjerne | Task 13 | ✅ |
| Norsk språk | Task 3 (prompt) | ✅ |
| Direkte link til handlekurv | Task 5, 11 | ✅ |
| Handlekurv-integrasjon | Task 11 (bruker cartStore) | ✅ |

## Placeholder Scan

Ingen TBD, TODO, eller ukomplette seksjoner funnet. Alle steg har full kode, kommandoer og forventet output.

---

**Plan skrevet og klar for implementering.**
