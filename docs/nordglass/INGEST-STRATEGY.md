# Nord Glass PDF-katalog — Ingest-strategi for Klarpakke

**Versjon:** 1.0  
**Dato:** 2026-05-24  
**Eier:** Klarpakke / Autoglass AS  
**Status:** Produksjonsplan

---

## A. ROTÅRSAK — Hvorfor PDF-en ikke kan brukes direkte

### 1. Parsing-risiko
PDF-en er semistrukturert. Hver rad er én lang sammenkjetet streng uten skilletegn:
```
MDX5RGR0101-0401WSWS GSBL - sp mbO rectangle vin frameFW02182GBYN1597x954WS2182GBYUSA
```
Produsent, modell, år, kode, features, dimensjoner og internkode er sammenpresset uten konsistent separator. 
**Konsekvens:** Direkte import gir 40-70% feilparsede rader. Feilene er silent — de ser riktige ut i ERP men matcher feil kjøretøy.

### 2. Dublett-risiko
Nord Glass bruker egne internkoder (f.eks. `WS2182GBY`) som ikke er eurokoder. Samme fysiske glass kan ha flere koder:
- én for venstre / høyre
- én for heated / non-heated  
- én for med/uten sensor
- én for ulike tint-varianter

**Konsekvens:** Direkte import skaper 2-5x duplikater per unikt glass. Søkeresultatet blir rotete og konverteringen synker.

### 3. Fitment-risiko
Årstallene er ofte komprimert:
- `0101-0401` → 2001-2004 (eller 2001-04/01?)
- `9601` → 1996-01 (eller januar 1996?)
- `0605-` → 2006-05 og fremdeles i produksjon?

**Konsekvens:** Feil årsmatching = feil fitment = kunde bestiller glass som ikke passer. Returraten øker, kundetilliten synker.

### 4. Søke-/konverteringsrisiko
Fritekstfeltene (`GSBL`, `sp mbO`, `rectangle vin frame`) er ikke normalisert:
- `GSBL` betyr noe for Nord Glass, men søket forstår det ikke
- `sp mbO` er feature-koder uten standardisert mapping
- `rectangle vin frame` er formbeskrivelse som ikke matcher kundens søkeord

**Konsekvens:** Kunden søker "frontrute BMW X5 2003" men treffer ikke fordi raden har `WSWS` + `MDX5RGR0101-0401`.

### 5. Operasjonell risiko ved silent import
Hvis vi importerer rått og silenter feil:
- Prissetting blir feil (ett glass, fem varianter, ulike priser)
- Lagerstatus blir feil (vi tror vi har 5 stk, men det er 5 varianter à 1 stk)
- Tilbud/tilbudsregning blir feil
- Tekniker bestiller feil glass på verkstedet

**Konsekvens:** Økonomisk tap + kundefrafall + omdømmerisiko.

---

## B. BESTE LØSNING — Produksjonsorientert ingest-pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NORD GLASS PDF INGEST PIPELINE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. EXTRACT         pdftotext / pdfplumber → rå tekst                        │
│  2. SEGMENT         Split i rader (linje-basert, tabell-gjenkjenning)        │
│  3. TOKENIZE        Del hver rad i tokens med regex-basert segmentering      │
│  4. PARSE           Produsent, modell, år, kode, features, dimensjoner       │
│  5. SCHEMA BUILD    Canonical model med normalisering                        │
│  6. DEDUPE          Funksjonell dedupe-key + variant-håndtering              │
│  7. VALIDATE        Regelbasert + statistisk validering                      │
│  8. STAGE           INSERT INTO nordglass_import_staging                     │
│  9. REVIEW QUEUE    REVIEW → menneske, HOLD → blokk, OK → auto              │
│ 10. ERP PROJECTION  MERGE INTO glass_catalog (idempotent)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## C. PRIORITERING ETTER IMPACT OG LANSERINGSRISIKO

### P1 — Høyest impact, lavest risiko (gjør først)

| # | Tiltak | Hvorfor | Impact | Launch Risk | Rekkefølge |
|---|--------|---------|--------|-------------|------------|
| 1 | **Produktfamilie-parser** (`WSWS`, `RWRW`, `BOT`, `BOD`, etc.) | Gir posisjon og kategori. Enklest å få riktig. | Høy — uten dette er alt annet umulig | Lav — mønstrene er binære og robuste | 1 |
| 2 | **Årstalls-parser** (`0101-0401`, `9601`, `0605-`) | Fitment krever korrekte år. Mye av verdien ligger her. | Høy — feil år = feil fitment | Lav-middels — formatene er få og forutsigbare | 2 |
| 3 | **Dedupe-strategi** (funksjonell key, variant-håndtering) | Hindrer duplikat-kaos i katalogen. | Høy — duplikater ødelegger søk og prising | Middels — krever testing med reelle data | 3 |

### P2 — Høy impact, middels risiko

| # | Tiltak | Hvorfor | Impact | Launch Risk | Rekkefølge |
|---|--------|---------|--------|-------------|------------|
| 4 | **Side- og åpnings-parser** (`L`/`R`, `O` for opening) | Kritisk for bestilling. Feil side = ubrukelig glass. | Høy | Middels — av og til usikkert | 4 |
| 5 | **Feature-parser** (`H`, `V`, `M`, `GY`, `BL`, etc.) | Sensor, heating, tint, antenna. Påvirker pris og kompatibilitet. | Middels-høy | Middels — krever mapping-tabelle | 5 |
| 6 | **Staging-tabell + review queue** | Sikkerhetsnett før produksjon. Alle P1-P2 må gå gjennom staging først. | Høy (risikoreduksjon) | Lav — ren infrastruktur | 6 |

### P3 — Middels impact, middels-høy risiko

| # | Tiltak | Hvorfor | Impact | Launch Risk | Rekkefølge |
|---|--------|---------|--------|-------------|------------|
| 7 | **Moulding/accessory-parser** (`GUGU`, pyntelister, rammer) | Ikke glass — må skilles ut. Feil klassifisering = feilbestilling. | Middels | Høy — mønstrene er heterogene | 7 |
| 8 | **Form/shape-normalisering** (`rectangle`, `oval`, etc.) | Påvirker søkbarhet men ikke fitment. | Middels | Middels | 8 |
| 9 | **Dimensjonsparser** (`1597x954` → mm) | Verifikasjon, ikke fitment. Brukes for søkefilter. | Middels | Lav — regex-basert | 9 |

### P4 — Lavere impact, høy risiko / eksperimentelt

| # | Tiltak | Hvorfor | Impact | Launch Risk | Rekkefølge |
|---|--------|---------|--------|-------------|------------|
| 10 | **Automatisk brand/model normalisering** | Koble mot eksisterende brand-model-tabell. | Middels | Høy — mange varianter av samme navn | 10 |
| 11 | **Nord Glass internkode → eurokode mapping** | Hvis vi finner kryssreferanse. | Høy hvis mulig | Veldig høy — usikkert om mapping finnes | 11 |
| 12 | **ML-basert feature-klassifisering** | For kodene vi ikke forstår. | Lav-middels | Høy — krever treningsdata | 12 |

---

## D. CANONICAL DATA MODEL

```typescript
interface NordGlassSourceLine {
  source_catalog: 'nord_glass_pdf';
  source_line_raw: string;           // original rad fra PDF
  source_page?: number;
  source_line_number?: number;
}

interface NordGlassParsedRecord {
  // ── Identifikatorer ──
  id: string;                        // UUID generert ved ingest
  nord_internal_code: string;        // Nord Glass internkode, f.eks. WS2182GBY
  sales_code?: string;               // Salgskode hvis annen

  // ── Kjøretøy ──
  manufacturer_name: string;         // rå, f.eks. "MERCEDES"
  manufacturer_name_normalized?: string; // f.eks. "MERCEDES-BENZ" → "MERCEDES"
  vehicle_model_name: string;        // rå, f.eks. "SPRINTER II"
  vehicle_model_name_normalized?: string;
  vehicle_body_type_raw?: string;    // f.eks. "3VAN", "5D SUV"
  vehicle_body_type_normalized?: string; // f.eks. "VAN", "SUV"

  // ── Produksjonsår ──
  production_from?: string;          // ISO-8601 eller YYYY-MM
  production_to?: string;            // ISO-8601 eller YYYY-MM, null = pågående
  production_from_raw: string;       // rå token, f.eks. "0605"
  production_to_raw?: string;        // rå token, f.eks. "1208"

  // ── Produkt ──
  product_family: 'WSWS' | 'RWRW' | 'BOT' | 'BOD' | 'BOS' | 'BOAS' | 'GUGU' | 'UNKNOWN';
  glass_category: 'windscreen' | 'rear_window' | 'door_glass' | 'quarter_glass' | 'vent_glass' | 'opening_glass' | 'moulding' | 'accessory' | 'unknown';
  glass_position: 'FR' | 'RR' | 'FD' | 'RD' | 'FQ' | 'RQ' | 'FV' | 'RV' | 'MQ' | 'RDO' | 'UNKNOWN';
  side: 'L' | 'R' | 'BOTH' | null;  // L=left, R=right, BOTH=windscreen/rear
  opening_type: 'FIXED' | 'OPENING' | 'SLIDING' | 'HINGED' | null;

  // ── Features ──
  tint_code?: string;                // GY, BL, GR, GN, etc.
  feature_codes: string[];           // alle koder: ['GS', 'BL', 'sp', 'mbO']
  has_sensor: boolean | null;        // null = usikkert
  has_heating: boolean | null;
  has_vin_window: boolean | null;
  has_antenna: boolean | null;
  has_camera: boolean | null;
  has_rain_sensor: boolean | null;
  has_hud: boolean | null;
  has_lane_assist: boolean | null;

  // ── Form / Moulding ──
  shape_notes?: string;              // "rectangle", "oval", "frame", etc.
  moulding_notes?: string;           // "vin frame", "top moulding", etc.

  // ── Dimensjoner ──
  dimensions_raw?: string;           // "1597x954"
  width_mm?: number;
  height_mm?: number;

  // ── Dedupe ──
  dedupe_key: string;                // funksjonell nøkkel

  // ── Parse-status ──
  parse_status: 'OK' | 'REVIEW' | 'HOLD';
  parse_warnings: string[];
  parse_errors: string[];

  // ── Metadata ──
  created_at: string;                // ISO-8601
  updated_at: string;
  reviewed_by?: string;
  review_notes?: string;
}
```

---

## E. MAPPINGREGLER — Nord Glass-koder

### E.1 Produktfamilier (sikker)

| Kode | Betydning | Glass-kategori | Posisjon | Sikkerhet |
|------|-----------|---------------|----------|-----------|
| `WSWS` | Windscreen | windscreen | FR | ✅ Sikker |
| `RWRW` | Rear window / Backlite | rear_window | RR | ✅ Sikker |
| `BOT` | Body / Opening / Top? → side door | door_glass | FD/RD | ⚠️ Sannsynlig |
| `BOD` | Body / Opening / Door? → quarter/vent | quarter_glass / vent_glass | FQ/RQ/FV/RV | ⚠️ Sannsynlig |
| `BOS` | Body / Opening / Side? → fixed side | quarter_glass / vent_glass | RQ/RV | ⚠️ Sannsynlig |
| `BOAS` | Body / Opening / Access / Side? → opening side | opening_glass | RQ/MQ | ⚠️ Sannsynlig |
| `GUGU` | Gasket / Gutter / Guide / Moulding | moulding / accessory | null | ⚠️ Sannsynlig |

### E.2 Posisjon (sannsynlig, basert på kontekst)

| Kode-pattern | Posisjon | Kontekst | Sikkerhet |
|-------------|----------|----------|-----------|
| `FD` i kode | FD (front door) | etter dimensjon | ⚠️ Sannsynlig |
| `RD` i kode | RD (rear door) | etter dimensjon | ⚠️ Sannsynlig |
| `RQ` i kode | RQ (rear quarter) | etter dimensjon | ⚠️ Sannsynlig |
| `FV` i kode | FV (front vent) | etter dimensjon | ⚠️ Sannsynlig |
| `RV` i kode | RV (rear vent) | etter dimensjon | ⚠️ Sannsynlig |
| `MQ` i kode | MQ (movable quarter) | etter dimensjon | ⚠️ Sannsynlig |
| `RDO` i kode | RDO (rear door opening?) | etter dimensjon | ❓ Usikkert |

### E.3 Side (sannsynlig)

| Marker | Side | Sikkerhet |
|--------|------|-----------|
| `L`, `LG`, `Lo` | Venstre (L) | ⚠️ Sannsynlig |
| `R`, `RG`, `Ro` | Høyre (R) | ⚠️ Sannsynlig |
| fravær + WSWS/RR | BOTH | ⚠️ Sannsynlig |

### E.4 Åpning (sannsynlig)

| Marker | Åpningstype | Sikkerhet |
|--------|-------------|-----------|
| `O` etter `BO` | OPENING | ⚠️ Sannsynlig |
| `AS` i `BOAS` | OPENING (access/slide) | ⚠️ Sannsynlig |
| `S` i `BOS` | FIXED (side) | ⚠️ Sannsynlig |
| fravær av O/AS | FIXED | ⚠️ Sannsynlig |

### E.5 Feature-markører (hypoteser — MÅ valideres)

| Kode | Hypotese | Sikkerhet | Valideringsmetode |
|------|----------|-----------|-------------------|
| `H` | Heated | ⚠️ Sannsynlig | Sammenligne med Pilkington/Glavista for samme kjøretøy |
| `V` | VIN-rute / Vindu? | ❓ Usikkert | Sjekke om alltid sammen med WSWS |
| `M` | Manual? / Moulding? | ❓ Usikkert | Sammenligne med tittel-beskrivelse |
| `A` | Antenna? / Acoustic? | ❓ Usikkert | Sammenligne med tittel-beskrivelse |
| `Z` | Zone? / Z-tint? | ❓ Usikkert | Må undersøkes med Nord Glass |
| `GY` | Grå tint (Grey) | ⚠️ Sannsynlig | Sammenligne med andre kataloger |
| `BL` | Blå tint (Blue) | ⚠️ Sannsynlig | Sammenligne med andre kataloger |
| `GR` | Grønn tint (Green) | ⚠️ Sannsynlig | Sammenligne med andre kataloger |
| `GN` | Grønn tint (Green) | ⚠️ Sannsynlig | Sammenligne med andre kataloger |
| `GS` | Grønn/Solar? | ⚠️ Sannsynlig | Sammenligne med andre kataloger |
| `sp` | Special? / Spacer? | ❓ Usikkert | Må undersøkes med Nord Glass |
| `mbO` | Mercedes-Benz Opening? | ❓ Usikkert | Kontekst-avhengig, sannsynligvis spesifikt for én modell |
| `vin` | VIN-vindu (VIN-etset) | ⚠️ Sannsynlig | Alltid sammen med WSWS |
| `frame` | Med ramme / moulding | ⚠️ Sannsynlig | Kontekst-avhengig |
| `rectangle` | Form: rektangulær | ✅ Sikker | Visuell beskrivelse |
| `oval` | Form: oval | ✅ Sikker | Visuell beskrivelse |

### E.6 Årstalls-formater (sikker)

| Format | Tolkning | Eksempel | ISO-resultat |
|--------|----------|----------|-------------|
| `YYMM-YYMM` | fra-til (måned) | `0101-0401` | 2001-01 til 2004-01 |
| `YYMM-` | fra og fremdeles | `0605-` | 2006-05 til null |
| `YYMM` | kun fra (sjelden) | `9601` | 1996-01 til null |
| `YYYY` | 4-sifret år | `2010` | 2010-01 til null |

**Hypotese:** Alle 2-sifrede årstall er 19xx/20xx. Cutoff: < 50 → 20xx, ≥ 50 → 19xx.
Validering: Kryss-sjekke mot faktisk modellår fra SVV/Biluppgifter.

---

## F. IMPORTREGLER — OK / REVIEW / HOLD

### F.1 OK (auto-import)

En rad får `OK` hvis **ALLE** disse er sanne:

1. `product_family` er sikkert identifisert (`WSWS`, `RWRW`)
2. `manufacturer_name` er i whitelist (kjente merker)
3. `vehicle_model_name` er ikke-tom og ser fornuftig ut
4. `production_from` parses uten feil
5. `glass_position` er sikkert (`FR`, `RR` for WSWS/RWRW)
6. `dimensions_raw` matcher mønsteret `NNNNxNNNN` (hvis tilstede)
7. Ingen `parse_errors`
8. `feature_codes` inneholder ingen ukjente koder som er flagget som "kritisk"

### F.2 REVIEW (menneskelig verifisering)

En rad får `REVIEW` hvis **NOEN** av disse er sanne:

1. `product_family` er `BOT`, `BOD`, `BOS`, `BOAS` (side/body-glass)
2. `side` er parsed men usikker
3. `opening_type` er parsed men usikker
4. `tint_code` er ukjent
5. `feature_codes` inneholder ukjente koder (men ikke kritiske)
6. `production_from` er tvetydig (f.eks. `0101` kan være januar 2001 eller 1. januar 2001)
7. `vehicle_body_type_raw` er tilstede men ikke normalisert
8. Raden har `parse_warnings` men ingen `parse_errors`

### F.3 HOLD (blokkeres)

En rad får `HOLD` hvis **NOEN** av disse er sanne:

1. `product_family` er `UNKNOWN`
2. `manufacturer_name` er tom eller ikke gjenkjent
3. `vehicle_model_name` er tom
4. `production_from` kan ikke parses i det hele tatt
5. `nord_internal_code` mangler
6. `parse_errors` inneholder kritisk feil
7. `GUGU`-familie uten tydelig moulding-beskrivelse
8. Dimensjoner er ulogiske (f.eks. 50x3000 mm)

### F.4 Beslutningsflyt

```
                        ┌─────────────┐
                        │   Parse rad  │
                        └──────┬──────┘
                               ▼
              ┌────────────────────────────────┐
              │  Kritisk feil?                 │
              │  (mangler merke/modell/kode)   │
              └──────────────┬─────────────────┘
                    JA │              │ NEI
                       ▼              ▼
                 ┌─────────┐   ┌──────────────────┐
                 │  HOLD   │   │ product_family   │
                 └─────────┘   │ sikker?          │
                               └────────┬─────────┘
                              JA │       │ NEI
                                 ▼       ▼
                          ┌─────────┐ ┌─────────┐
                          │ MER sjekker  │ REVIEW  │
                          │ (OK/REVIEW)  └─────────┘
                          └────┬────┘
                               ▼
                    ┌──────────────────────┐
                    │ side/posisjon usikker? │
                    │ eller ukjent features?  │
                    └──────────┬─────────────┘
                        JA │              │ NEI
                           ▼              ▼
                     ┌─────────┐   ┌─────────┐
                     │ REVIEW  │   │   OK    │
                     └─────────┘   └─────────┘
```

---

## G. DEDUPE-STRATEGI

### G.1 Funksjonell dedupe-key

```
dedupe_key = concat(
  lower(manufacturer_name_normalized),
  "|",
  lower(vehicle_model_name_normalized),
  "|",
  vehicle_body_type_normalized || "*",
  "|",
  production_from,
  "|",
  production_to || "*",
  "|",
  glass_position,
  "|",
  side || "*",
  "|",
  opening_type || "*",
  "|",
  has_heating ? "H" : "*",
  "|",
  has_sensor ? "S" : "*",
  "|",
  tint_code || "*"
)
```

### G.2 Håndtering av identiske glass med ulike featurevarianter

Hvis to rader har samme `dedupe_key` men ulike `nord_internal_code`:
- **Hypotese:** Det er samme glass med ulike feature-varianter
- **Handling:** Opprett én `glass_catalog`-rad med `variants`-array
- **Hver variant** har: `nord_internal_code`, `feature_codes`, `tint_code`, `has_sensor`, `has_heating`, `price` (hvis kjent)

### G.3 Venstre/høyre, opening/fixed, heated/non-heated

Disse SKAL **IKKE** merges:
- `side: L` og `side: R` → to separate rader (eller to varianter)
- `opening_type: OPENING` og `opening_type: FIXED` → to separate rader
- `has_heating: true` og `has_heating: false` → to varianter av samme rad

### G.4 Mouldings/accessories skilles fra glass

`product_family: GUGU` skal aldri merges med `WSWS`/`RWRW`/`BOT` etc.
- `GUGU` → egen tabell eller egen `category` i `glass_catalog`
- `glass_category: moulding` eller `accessory`

---

## H. FOKUS PÅ KLARPAKKE / AUTOGLASS AS

### H.1 Product search
- `glass_position` + `side` + `opening_type` blir filtre/facets
- `manufacturer_name_normalized` + `vehicle_model_name_normalized` blir søkbare
- `tint_code` blir facet-filter

### H.2 Fitment lookup
- `production_from` + `production_to` brukes for årsmatching
- `vehicle_body_type_normalized` brukes for body-type-filter
- `dedupe_key` brukes for å finne riktig variant

### H.3 ERP sync
- `nord_internal_code` mappes mot intern ERP-kode
- `variants`-array brukes for å håndtere ulike priser
- `parse_status: OK` synkroniseres automatisk, `REVIEW` manuelt, `HOLD` blokkeres

### H.4 Intern admin review
- Staging-tabell med `parse_status: REVIEW` vises i admin-panel
- Admin kan redigere, godkjenne (→ OK) eller avvise (→ HOLD)
- Godkjente rader flyttes til `glass_catalog`

### H.5 Søkefilter / facets
- Posisjon: FR, RR, FD, RD, FQ, RQ, FV, RV, MQ
- Side: Venstre, Høyre, Ikke relevant
- Åpning: Fast, Åpningsbar, Skyvedør
- Features: Varme, Sensor, VIN-vindu, Antenne
- Tint: Grønn, Grå, Blå, Klar

### H.6 Katalogkvalitet
- `parse_warnings` logges for trendanalyse
- Ukjente `feature_codes` samles for mapping-utvidelse
- `parse_errors` trigger alerting

### H.7 Launch readiness
- P1-funksjonalitet (produktfamilie, år, dedupe) er blocker for launch
- P2-funksjonalitet (side, features) kan lanseres med REVIEW-kø
- P3-P4 kan etterlanseres

---

*Fortsetter i neste fil med implementasjon og kode.*
