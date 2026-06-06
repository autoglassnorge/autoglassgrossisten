# Design: AI Bilglass-Ordremottaker — Verdens beste B2B bestillingsløsning

**Dato:** 2026-06-04  
**Eier:** Tomar / Autoglass AS (30 års erfaring som ordremottaker)  
**Agent:** `kimi glass-ordre`  
**Status:** Design godkjent — klar for implementasjon

---

## 1. Visjon

En **conversational AI** som tar imot B2B-kundehenvendelser på naturlig språk via chat (fase 1), e-post (fase 2) og telefon (fase 3). AI-en finner riktig bilglass, viser OEM + Aftermarket side om side, legger til tilbehør automatisk, og sender kunden direkte til handlekurv med én klikk.

> *"Jeg har en Jaguar E-Pace 2022, trenger frontrute"* → AI finner riktig glass på 5 sekunder → kunden trykker "Legg i handlekurv" → ordre bekreftes på e-post.

---

## 2. Kanal-roadmap

| Fase | Kanal | Status | Kompleksitet |
|------|-------|--------|--------------|
| **1** | **Web Chat** (React-widget på nettsiden) | MVP | Lav |
| **2** | **E-post** (innkommende/utgående) | Etter chat | Medium |
| **3** | **Telefon** (STT + TTS) | Siste | Høy |

Alle kanaler bruker **samme sentrale API** (`/api/ordremottaker`).

---

## 3. Kunde-identifikasjon

### Registrerte kunder (innlogget)
- Kjenner kunden ved navn: *"Hei Nordic Bilglass! Forrige gang bestilte dere 12 frontruter til VW."*
- Viser kundespesifikke avtalepriser
- Henter ordrehistorikk for proaktive forslag

### Ukjente kunder (ikke innlogget)
- AI spør: *"Jeg finner ikke din avtale — ringer du fra et verksted? Hva er org.nr?"*
- Fallback til standardpriser med merking: *"Standardpris — kontakt oss for avtalepris"*
- Kan fortsette bestilling uten innlogging, men får ikke kundespesifikke priser

---

## 4. Språk

| Prioritet | Språk | Status |
|-----------|-------|--------|
| **1** | **Norsk** | Fase 1 — MVP |
| 2 | Svensk | Fase 4 (når norsk er 95%+ nøyaktig) |
| 3 | Dansk | Fase 4 |
| 4 | Engelsk | Fase 4 |

Moonshot Kimi K2.5 håndterer alle fire, men **testing og tuning gjøres på norsk først**.

---

## 5. Bestillingsflyt (steg-for-steg)

```
Kunde: "Jeg har en Jaguar E-Pace 2022, trenger frontrute"
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. NER + Intent                                            │
│     Extract: make=Jaguar, model=E-Pace, year=2022,          │
│              position=frontrute, intent=bestill              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Kunde-identifikasjon                                    │
│     Innlogget? → Vis avtalepriser + historikk               │
│     Ukjent?    → "Jeg finner ikke din avtale..."           │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Glass-oppslag                                           │
│     Søk D1: brand=JAGUAR, year=2022, type=frontrute         │
│     Returner: OEM + Aftermarket side om side                │
│     Sorterer IKKE — kunden velger selv                      │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Utstyrsverifikasjon (hvis >1 kandidat)                  │
│     AI: "Har bilen ADAS-kamera i ruta?"                     │
│     Kunde: "Ja" → Filtrer til ADAS-kompatible               │
│     AI: "Har bilen regnsensor?"                             │
│     Kunde: "Nei" → Filtrer bort regnsensor-glass            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Tilbehør (automatisk, tydelig, enkelt å fjerne)         │
│     ☑ Pyntelist — 245 kr                                    │
│     ☑ Lim — 189 kr                                          │
│     ☑ Klips (sett) — 89 kr                                  │
│     ☐ Kalibrering — kunden gjør selv                        │
│     Total: 2.845 + 523 = 3.368 kr                           │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Direkte link til handlekurv                             │
│     Kunden trykker: [Legg i handlekurv]                     │
│     URL: /kasse?items=sku1,sku2,sku3&customer=123           │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  7. E-postbekreftelse                                       │
│     Til: kunde@verksted.no                                  │
│     Emne: Ordrebekreftelse — Autoglass AS                   │
│     Inneholder: Ordrenr, vareliste, total, leveringstid     │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Tilbehør-regler

| Glass-type | Standard tilbehør | Valgfritt |
|-----------|-------------------|-----------|
| Frontrute | Pyntelist, lim, klips | Kalibrering (kunde gjør selv) |
| Bakrute | Pyntelist, lim, klips | — |
| Sidedør | Klips, tetningslist | — |

**UI-krav:**
- Alle tilbehør er ☑ som standard (huket av)
- Kunden kan krysse bort med ett klikk
- Pris oppdateres sanntid
- Tydelig tekst: *"Følgende tilbehør er standard for dette glasset:"*

---

## 7. Lagerstatus

**Fase 1 (MVP):** Estimert lagerstatus basert på salgsstatistikk
- *"Vanligvis på lager"* — >10 solgt siste måned
- *"Bestillingsvare — ca 3-5 dager"* — sjelden solgt
- **Integrasjon med lager/ERP kommer i egen fase**

---

## 8. Handoff Panel (eskalering)

Når AI er usikker (<70% confidence) eller kunden ber om menneske:

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 → 👤 ESKALERING                                         │
├─────────────────────────────────────────────────────────────┤
│  Kunde: Nordic Bilglass AS (org.nr 999999999)               │
│  Samtale: 7 meldinger                                       │
├─────────────────────────────────────────────────────────────┤
│  AI har funnet:                                             │
│  • Jaguar E-Pace 2022 frontrute — 3 kandidater              │
│  • Usikkerhet: ADAS-variant (2 av 3 har ADAS)               │
│  • Kunde har ikke svart på ADAS-spørsmål                    │
├─────────────────────────────────────────────────────────────┤
│  [Overta samtale]  [Se kundehistorikk]  [Avslutt]           │
└─────────────────────────────────────────────────────────────┘
```

**Krav:** Én-klikk-overtakelse. Ordremottaker ser hele samtalen + AI-forslag.

---

## 9. Teknisk arkitektur

### Sentralt API
```
POST /api/ordremottaker
{
  "channel": "chat",           // chat | email | phone
  "customer_id": 123,          // null hvis ukjent
  "message": "Jeg har en Jaguar E-Pace 2022...",
  "session_token": "abc123",
  "language": "no"
}

Response:
{
  "status": "question",        // question | recommendation | order_link | escalated
  "ai_response": "Jeg fant 3 frontruter til Jaguar E-Pace 2022...",
  "candidates": [...],         // Glass-kandidater
  "accessories": [...],        // Standard tilbehør
  "cart_url": "/kasse?...",    // Hvis klar for bestilling
  "confidence": 0.85,
  "next_action": "ask_adas"    // Hva AI trenger neste
}
```

### LLM-prompt (Moonshot Kimi K2.5)
```
Du er en erfaren ordremottaker hos Autoglass AS med 30 års erfaring.
Du hjelper B2B-kunder (verksteder, mekanikere) med å finne riktig bilglass.

Kundens melding: "{{message}}"

1. Identifiser kjøretøy: merke, modell, år, regnr, VIN, posisjon
2. Hvis usikkerhet > 30%: stil ETT kort spørsmål
3. Når kjøretøy er klart: søk etter glass
4. Vis OEM og Aftermarket side om side (ikke sorter)
5. Foreslå tilbehør automatisk
6. Avslutt med direkte link til handlekurv

Svar på norsk. Vær profesjonell, effektiv og hjelpsom.
```

### D1-tabeller (utvidelse av eksisterende)
```sql
-- B2B-kunder
CREATE TABLE b2b_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_nr TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  price_tier TEXT DEFAULT 'standard',
  payment_terms TEXT DEFAULT 'faktura',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ordrehistorikk
CREATE TABLE order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  regnr TEXT,
  vin TEXT,
  glass_sku TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price_per_unit REAL,
  total REAL,
  accessories TEXT, -- JSON
  status TEXT DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id)
);

-- Kundespesifikke priser
CREATE TABLE customer_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  price REAL NOT NULL,
  valid_from DATE,
  valid_to DATE,
  FOREIGN KEY (customer_id) REFERENCES b2b_customers(id),
  UNIQUE(customer_id, sku)
);

-- AI-sesjoner
CREATE TABLE ai_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  channel TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  context TEXT, -- JSON: vehicle, candidates, answers
  status TEXT DEFAULT 'active',
  assigned_human INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. Implementerings-faser

| Fase | Hva | Tid | Avhengigheter |
|------|-----|-----|---------------|
| **1** | Chat-widget + Norsk + standardpriser + handlekurv | 2 uker | Eksisterende API |
| **2** | Kunderegister + kundespesifikke priser + historikk | 1 uke | B2B-kundeliste |
| **3** | Automatisk tilbehør | 3 dager | Tilbehørs-database |
| **4** | E-post-AI | 3 dager | SMTP/e-post-tjeneste |
| **5** | Svensk + dansk + engelsk | 1 uke | Fase 1-4 ferdig |
| **6** | Lager/ERP-integrasjon | 1-2 uker | ERP-API tilgjengelig |
| **7** | Telefon (STT/TTS) | 2-3 uker | Telefonisystem-integrasjon |
| **8** | UNI Micro | 2 uker | UNI Micro API-tilgang |
| **9** | Handoff Panel | 1 uke | Admin-grensesnitt |

---

## 11. KPI-mål

| Metrikk | Mål | Måles |
|---------|-----|-------|
| Konverteringsrate | >60% | Ordre / henvendelser |
| Nøyaktighet | >95% | Korrekte glass / totale |
| Gj.snitt turer | <4 | Meldinger per ordre |
| Eskaleringsrate | <10% | Overført til menneske |
| Tid til tilbud | <10s | Første respons med pris |
| Kundetilfredshet | >4.5/5 | Post-ordre evaluering |

---

*Godkjent av Tomar / Autoglass AS*  
*Design-fase fullført — klar for implementeringsplan*
