# Design: AI Bilglass-Ordremottaker — LLM Dialogue Engine

**Dato:** 2026-06-04  
**Eier:** Tomar / Autoglass AS (30 års erfaring som ordremottaker)  
**Agent:** `kimi glass-ordre`  
**Status:** Design godkjent — klar for implementasjon  
**Tilnærming:** A — LLM Dialogue Engine (Professor Autoglass har full kontroll)

---

## 1. Visjon

Professor Autoglass er en **conversational AI** som tar imot B2B-kundehenvendelser på naturlig språk. AI-en har **full kontroll** over dialogen — den tolker brukerens input fritt, stiller kun spørsmål som er nødvendige, og filtrerer kandidater via smart matching (LLM tolker → strukturerte verdier → deterministisk filter).

> *"SU18018, trenger frontrute"* → AI finner VW Transporter 2005 → spør naturlig om varme/antenne → filtrerer → viser riktig glass på 10 sekunder.

**Primær søkekanal:** Professor Autoglass erstatter ALLE tidligere søkefelt (header + hovedside).

---

## 2. Arkitektur — Høynivå

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Bruker     │────→│  Backend        │────→│  LLM         │
│  (chat)     │     │  (tolker +      │     │  (Professor  │
└─────────────┘     │   filtrerer)    │     │   Autoglass) │
     ↑              └─────────────────┘     └──────────────┘
     │                      ↑                        │
     └──────────────────────┘                        │
              Returnerer JSON:                       │
              { message, action, extracted }         │
```

**Flyt per tur:**
1. Backend bygger kontekst (system prompt + kandidater + historikk + eurocode-koder)
2. Kaller Workers AI (`@cf/moonshotai/moonshot-auto`)
3. LLM returnerer JSON med hva den vil gjøre
4. Backend tolker `action` + `extracted`, kjører `filterByEquipment`, lagrer i session
5. Returnerer til frontend

---

## 3. UI/UX — Professor Autoglass som Primær Søkekanal

### Nåværende (erstattes)
- Header: Regnr-søkefelt
- Hovedside: Stort søkefelt (regnr/VIN/eurocode) + AI-chat knapp nede
- To separate søkeopplevelser

### Nytt (Professor Autoglass er PRIMÆR)
- **Header**: "Spør Professor Autoglass" knapp med professor-avatar → åpner chat-overlay
- **Hovedside**: Professor Autoglass-chat som HOVED-element
  - Stor chat-boble med professor-avatar (🧑‍🏫) øverst
  - Moderne layout, sentrert, stor og tydelig
  - Velkomstmelding: *"Hei! Jeg er Professor Autoglass. Fortell meg hva du trenger — regnr, merke/modell, eller eurocode."*
  - Ingen separat søkefelt lenger
- **Resultater**: Kandidater vises inline i chatten, ikke på egen side
- **Mobile**: Fullskjerm chat som i dag, men nå er det primær entry point

### Layout (desktop)
```
┌─────────────────────────────────────────┐
│  [Logo]  Spør Professor Autoglass  [🧑‍🏫]│  ← Header
├─────────────────────────────────────────┤
│                                         │
│     ┌─────────────────────────────┐     │
│     │      🧑‍🏫                    │     │
│     │   Professor Autoglass       │     │
│     │                             │     │
│     │  "Hei! Jeg hjelper deg å    │     │
│     │   finne riktig bilglass.    │     │
│     │   Fortell meg regnr eller   │     │
│     │   merke/modell!"            │     │
│     │                             │     │
│     │  [____________________] [→] │     │
│     └─────────────────────────────┘     │
│                                         │
│     (Kandidater vises under her)        │
│                                         │
└─────────────────────────────────────────┘
```

---

## 4. System Prompt — Professor Autoglass Persona

```
Du er Professor Autoglass, en erfaren bilglass-ekspert med 30 års erfaring hos Autoglass AS.
Du hjelper B2B-kunder (verksteder, mekanikere, bilglass-montører) med ALT innen bilglass.

DIN KUNNSKAP OMFATTER:
- Identifisere riktig bilglass (regnr, VIN, eurocode, merke/modell)
- Tolke eurocode-koder og forklare farger/features
- Installasjonsteknikker og limtyper (f.eks. spesial-lim for oppvarmet glass)
- ADAS-kalibrering og kamera-justerte ruter
- Forsikring og erstatning (hvilke glass dekkes, egenandel)
- OEM vs aftermarket — kvalitetsforskjeller, når velge hva
- Lover og regler (krav til bilglass, trafikkreglene)
- Sesongtips (vinter: steinsprut, sommer: varmerefleksjon)
- Tilbehør: pyntelist, klips, tetningslist, kalibrering
- Glass-typer: laminert, herdet, akustisk, coated, HUD-kompatible
- Rådgivning ved usikkerhet — "Jeg tror dette er riktig, men sjekk med leverandør"

REGELVERK FOR BESTILLING:
1. ALLTID spør om posisjon først hvis ukjent (frontrute, bakrute, siderute, dørrute)
2. Deretter: se på kandidater, finn hva som skiller dem, spør NATURLIG
3. Bruk eurocode-koder for å forklare forskjeller: "2525AGNEL = grønn med varmetråder"
4. Vis ALDRI mer enn 5 kandidater
5. OEM-only: foretrekk OEM, marker aftermarket tydelig hvis ingen OEM finnes
6. Spør MINST mulig — hvis bare 1-3 kandidater etter filtrering, vis dem med en gang
7. "Vet ikke" er OK — ikke press brukeren
8. Vær vennlig, profesjonell og effektiv

EUROCODE-KODER DU KJENNER:
Farger: GN=helfarget grønn, GY=grønn med grå skyggefelt, GNEL=grønn elektrisk,
        GB=grønn med blå skygge, BZ=bronse, BZB=bronse med blå skygge,
        GG=grønn med grønn skygge, GD=mørk grønn, YP=sotet,
        BL=blå, BB=blå med blå skygge, CL=klar
Features: EL=varmetråder, M=regnsensor, ENC=innkapslet (vulkanisert list),
          ANT=antenne, CS=coated, P=Privacy, H=oppvarmet,
          Z=z-bøy, UV=UV-beskyttet, A=antenne, C=klar
Posisjoner: FV=foran venstre, FH=foran høyre, BV=bak venstre, BH=bak høyre

SVAR ALLTID PÅ NORSK.
Returner ALLTID valid JSON i dette formatet:
{
  "message": "...",
  "action": "ask_question|extract_info|show_results|clarify|confirm",
  "extracted": { ... },
  "confidence": 0.0-1.0
}
```

---

## 5. Backend — LLM Dialogue Handler

**Ny fil:** `api/cf-worker/src/lib/ordremottaker-llm-dialogue.ts`

### Hovedfunksjon: `generateDialogueTurn(env, session, candidates, vehicleInfo)`

```typescript
interface DialogueContext {
  systemPrompt: string;      // Persona + regler + koder
  candidates: Candidate[];   // Nåværende kandidater med properties
  history: Message[];        // Siste 10 meldinger
  extracted: Record<string, string>; // Allerede kjente felter
  vehicle: VehicleInfo | null;
}

interface LlmResponse {
  message: string;
  action: 'ask_question' | 'extract_info' | 'show_results' | 'clarify' | 'confirm';
  extracted: ExtractedFields;
  confidence: number;
}
```

**Steg:**
1. Bygger `DialogueContext` fra session + kandidater
2. Kaller Workers AI med kontekst
3. Parser JSON-respons (med fallback)
4. Validerer `action` og `extracted`
5. Returnerer `LlmResponse`

### Fallback-håndtering
Hvis LLM returnerer ugyldig JSON eller feiler:
- Logger warning
- Fallback til dagens `buildEquipmentQuestion` rigid flow
- Frontend merker ingen forskjell

---

## 6. JSON Response Format

LLM returnerer ALLTID valid JSON:

```json
{
  "message": "Hei! Jeg fant flere glass til din VW Transporter. Ser at noen har varmetråder og regnsensor, mens andre er uten — har bilen din varme i frontruta?",
  "action": "ask_question",
  "extracted": {
    "position": "frontrute",
    "heated": null,
    "rain_sensor": null
  },
  "confidence": 0.9
}
```

### Gyldige actions

| Action | Beskrivelse | Frontend-status |
|--------|-------------|----------------|
| `ask_question` | Spør om noe spesifikt | `question` — viser Ja/Nei/Vet ikke knapper |
| `extract_info` | Brukeren ga info, lagre uten å spørre igjen | `clarification` |
| `show_results` | Vis kandidater + tilbehør | `recommendation` |
| `clarify` | Be om mer info (regnr, merke, etc.) | `clarification` |
| `confirm` | "Er dette riktig?" før show_results | `question` |

---

## 7. Extracted Fields & Smart Matching

### ExtractedFields interface
```typescript
interface ExtractedFields {
  position?: 'frontrute' | 'bakrute' | 'dørrute' | 'siderute';
  adas?: 'ja' | 'nei' | 'vet_ikke';
  ldw?: 'ja' | 'nei' | 'vet_ikke';
  heated?: 'ja' | 'nei' | 'vet_ikke';
  heated_type?: 'full' | 'camera';
  rain_sensor?: 'ja' | 'nei' | 'vet_ikke';
  hud?: 'ja' | 'nei' | 'vet_ikke';
  antenna?: 'ja' | 'nei' | 'vet_ikke';
  coated?: 'ja' | 'nei' | 'vet_ikke';
  acoustic?: 'ja' | 'nei' | 'vet_ikke';
}
```

### Smart Matching Flow
```
User: "har varme i frontruta"
  ↓
LLM tolker → extracted: { position: "frontrute", heated: "ja" }
  ↓
Backend: merge med session.answers → filterByEquipment(candidates, answers)
  ↓
Filtrerte kandidater → lagre i session → neste runde
```

### "Vet ikke"-håndtering
- `'vet_ikke'` lagres i session
- `filterByEquipment` skipper feltet (filtrerer IKKE bort)
- LLM ser at brukeren svarte "vet ikke" og justerer neste spørsmål

---

## 8. Session State (utvidet)

```typescript
interface SessionContext {
  messages: { role: "user" | "ai"; content: string; timestamp: number }[];
  vehicle?: { make: string; model: string; year: number };
  candidates?: number[]; // glass IDs
  answers: Record<string, string>; // extracted felter
  cartItems: { sku: string; qty: number }[];
  status: "active" | "completed" | "escalated";
  pending_question?: string | null;
  candidate_data?: string; // JSON-serialiserte kandidater
  dialogue_state?: 'needs_position' | 'filtering' | 'ready_to_show' | 'showing_results';
}
```

### Session-livssyklus
| Tilstand | Hva skjer |
|----------|-----------|
| `needs_position` | Posisjon ukjent, AI må spørre først |
| `filtering` | Posisjon kjent, AI filtrerer via spørsmål |
| `ready_to_show` | 1-3 kandidater, AI kan vise resultater |
| `showing_results` | Kandidater vist, venter på valg/feedback |

---

## 9. Error Handling & Fallback

| Scenario | Håndtering |
|----------|-----------|
| LLM returnerer ugyldig JSON | Fallback til dagens rigid `buildEquipmentQuestion` flow |
| LLM API feiler (timeout/500) | "Beklager, jeg må tenke litt lenger. Et øyeblikk..." + retry |
| LLM gir ukjent action | Logg warning, default til `clarify` |
| Ingen kandidater etter filtrering | "Beklager, ingen glass passer etter filtrering. Vil du se alle alternativer?" |
| Extracted har ukjent verdi | Ignorer feltet, logg warning |
| Session mangler candidate_data | Kjør nytt søk fra scratch |

---

## 10. Frontend-endringer

### Nye/endrede filer

| Fil | Endring |
|-----|---------|
| `frontend/src/components/ProfessorAutoglass.tsx` | HOVED-komponent, erstatter søkefelt |
| `frontend/src/components/ProfessorAvatar.tsx` | Professor-avatar (egen karakter, ikke generisk ikon) |
| `frontend/src/components/ChatBubble.tsx` | Stor chat-boble med meldinger |
| `frontend/src/pages/HomePage.tsx` | Professor Autoglass som primær element |
| `frontend/src/components/SearchHeader.tsx` | Erstatt søkefelt med "Spør Professor Autoglass" knapp |

### Professor-avatar
- **AI-generert bilde** — vennlig professor i 50-årene med briller, labfrakk, og varmt smil
- **Stil:** Profesjonell men uformell, B2B-vennlig, moderne
- **Formater:** 
  - Hovedbilde: 512x512px (chat-boble, header)
  - Thumbnail: 128x128px (meldinger, knapper)
  - SVG-versjon for skalerbarhet
- **Generering:** Stable Diffusion / DALL-E / Midjourney med prompt:
  > "Friendly professor in his 50s with glasses and a lab coat, warm smile, professional but approachable, modern corporate style, transparent background, high quality portrait"
- **Konsistent bruk:** Header, chat-boble, loading-tilstander, e-postsignatur (fremtidig)
- **Fallback:** Tekst "PA" i Autoglass-blå sirkel hvis bilde ikke laster

### Responsiv oppførsel
| Skjerm | Oppsett |
|--------|---------|
| Desktop | Chat-boble sentrert, ~600px bred, professor-avatar øverst |
| Tablet | Samme, men ~500px bred |
| Mobile | Fullskjerm chat-overlay, stor tekst, tappemål ≥44px |

### Knapper
- `status === 'question'`: Store Ja/Nei/Vet ikke-knapper
- `status === 'recommendation'`: Kandidat-kort med "Velg dette glasset"
- Alltid: Tekst-input for fri tekst

---

## 11. OEM-Only Business Rule

Expert-stat: **"Vil selger kun OEM"**

### Implementasjon
- Katalogen har `oem` flagg på hver post
- `filterByOEM(candidates)` — sorterer OEM først, markerer aftermarket
- Hvis ingen OEM: "Vi har dessverre ikke dette glasset på lager. Vil du ha et tilbud på OEM?"
- Tilbehør: OEM-tilbehør anbefales, aftermarket tilbehør markeres

### UI
- OEM: ✅ Original
- Aftermarket: ℹ️ Ettermarkedsalternativ (lavere pris)

---

## 12. Testing

### 1. Prompt evaluering
- 10 kjente scenarioer
- Sjekk at LLM velger riktig action
- Sjekk at extracted verdier er korrekte

### 2. JSON-parsing
- Unit-tester for `parseLlmResponse`
- Ugyldig JSON → fallback
- Manglende felter → default verdier

### 3. Filtrering
- Integration-tester for `filterByEquipment` med LLM-extracted verdier
- "Vet ikke" skal ikke filtrere bort
- Kombinasjon av flere felter

### 4. Fallback
- Test at rigid flow fungerer når LLM feiler
- Frontend skal ikke merke forskjell

### 5. E2E
- Full dialog-flow med Playwright
- Regnr → posisjon → equipment → resultat
- VIN → søk → resultat
- Eurocode → direkte lookup

---

## 13. Implementerings-faser

| Fase | Hva | Tid | Avhengigheter |
|------|-----|-----|---------------|
| **1** | LLM Dialogue Engine (backend) | 3 dager | Eksisterende API |
| **2** | System prompt + eurocode-koder | 1 dag | Kode-samling fra ekspert |
| **3** | Frontend: Professor som primær søk | 2 dager | Fase 1 |
| **4** | OEM-only filtering | 1 dag | Fase 1 |
| **5** | Fallback til rigid flow | 1 dag | Fase 1 |
| **6** | Testing + tuning | 2 dager | Fase 1-5 |

---

## 14. Oppsummering av endringer

| Komponent | Fra | Til |
|-----------|-----|-----|
| Backend handler | Rigid spørsmålskjede | LLM Dialogue Engine |
| Backend LLM | `generateDialogue` (enkelt) | `ordremottaker-llm-dialogue.ts` (kontekst-rik) |
| System prompt | Generisk | Professor Autoglass persona + eurocode-koder |
| Session state | Standard | Utvidet med `dialogue_state` |
| Frontend søk | Regnr-felt + AI-chat | Professor Autoglass som PRIMÆR |
| Frontend header | Søkefelt | "Spør Professor Autoglass" knapp |
| Frontend chat | Liten widget | Stor chat-boble med professor-avatar |
| Filtrering | `buildEquipmentQuestion` rigid | LLM tolker → `filterByEquipment` smart |

---

*Godkjent av Tomar / Autoglass AS*  
*Design-fase fullført — klar for implementeringsplan*
