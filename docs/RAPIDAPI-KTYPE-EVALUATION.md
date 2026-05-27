# Evaluering: RapidAPI "Global Vehicle List K-Type & HSN-TSN Data API"

**Dato:** 2026-05-24  
**Evaluator:** Kimi glass-worker  
**Status:** ❌ **AVVIST — API finnes ikke lenger**

---

## 1. Funn fra undersøkelse

### 1.1 RapidAPI-sjekk (live)
- URL: `https://rapidapi.com/fhdenniswittmann/api/global-vehicle-list-k-type-hsn-tsn-data-api-for-car-pats`
- **Resultat:** `Page Not Found — API not found.`
- Playwright headless-test bekrefter: API er fjernet fra RapidAPI-plattformen.

### 1.2 Wayback Machine (grundig søk)
- **CDX API-søk** (alle varianter av URL): 0 treff
- **Direct snapshot-søk** (`/web/2024/...`, `/web/2023/...`, `/web/2022/...`): 0 treff
- **Bredt søk** (`rapidapi.com/*vehicle-list*`, `rapidapi.com/*k-type*`): 0 treff
- **Utviklersøk** (`rapidapi.com/fhdenniswittmann/*`): 0 treff
- **Domenesøk** (`rapidapi.com` filtrert for `k-type`/`hsn`): 0 treff blant 1001 arkiverte sider
- **Google Cache**: 404 Not Found
- **Konklusjon:** APIen har aldri eksistert i noe offentlig arkiv. Ingen mulighet for rekonstruksjon av schema/endpoints.

### 1.3 GitHub / kodekilder
- GitHub Code Search: 0 treff for API-navnet.
- Ingen repos, gists, eller issues som refererer til denne APIen.
- **Konklusjon:** Ingen third-party verifikasjon eller eksempelbruk.

### 1.4 RapidAPI-nøkkel-test
- Eksisterende nøkkel i prosjektet (`RAPIDAPI_KEY`) er markert som DEPRECATED (Autoways fjernet 2026-05-21).
- Nøkkelen er gyldig mot RapidAPI generelt, men abonnementet er inaktivt.
- **Konklusjon:** Selv om APIen hadde eksistert, hadde vi ikke hatt aktivt abonnement.

---

## 2. Evalueringstabell

| Kriterium | Score (1–10) | Begrunnelse |
|-----------|-------------|-------------|
| **Tilgjengelighet** | 0/10 | API fjernet fra RapidAPI. Wayback Machine: 0 treff på 6 ulike søkemønstre. Google Cache: 404. |
| **Dokumentasjon** | 0/10 | Ingen schema, swagger, eller OpenAPI-spec funnet. |
| **Datakvalitet (kType)** | N/A | Kan ikke verifiseres. |
| **Datakvalitet (HSN/TSN)** | N/A | Kan ikke verifiseres. |
| **Norsk dekning** | N/A | Ukjent. Trolig tysk/centralsk fokus basert på HSN/TSN. |
| **Pris** | N/A | Ingen prisinformasjon tilgjengelig. |
| **Rate limits** | N/A | Ukjent. |
| **Integrasjonsrisiko** | 10/10 (høyest) | API kan forsvinne igjen. Ingen SLA. |
| **Support/vedlikehold** | 0/10 | Utvikler (fhdenniswittmann) har fjernet APIen. |
| **GDPR-kompliant** | N/A | Ukjent. |

**Samlet vurdering:** ❌ **IKKE EGNET** — API finnes ikke. Selv om det gjenopplives, er risikoen for forsvinning uakseptabel høy.

---

## 3. Teoretisk integrasjon (hvis API hadde eksistert)

For fullstendighet, beskrives hvordan en fungerende versjon ville blitt integrert:

### 3.1 Datamodell — ny kilde
```sql
ALTER TABLE ktype_matches ADD COLUMN source TEXT DEFAULT 'bovsoft';
UPDATE ktype_matches SET source = 'bovsoft' WHERE source IS NULL;
```

Ny kilde: `source = 'rapidapi_vehicle_ktype'`

### 3.2 Confidence-score
| Kilde | Confidence | Begrunnelse |
|-------|-----------|-------------|
| `bovsoft` (regnr-oppslag) | 0.7 | Direkte kType fra norsk regnr. |
| `rapidapi_vehicle_ktype` | 0.5 | kType fra tysk/HSN-basert database. Trolig korrekt, men krever validering mot norsk kontekst. |
| `ebay_oe_lookup` | 0.4 | Indirekte via OE-nummer. |
| `apify_tecdoc` | 0.6 | Direkte TecDoc-data. |

**Anbefalt minimum for writeback:**
- En kilde med confidence ≥ 0.5 + brand/model/year-match mot katalog
- ELLER to uavhengige kilder som gir samme kType→eurocode-mapping

### 3.3 Kobling til eksisterende tabeller

**`ktype_matches` (utvidelse):**
```sql
ALTER TABLE ktype_matches ADD COLUMN source TEXT DEFAULT 'bovsoft';
ALTER TABLE ktype_matches ADD COLUMN confidence_score REAL DEFAULT 0.7;
ALTER TABLE ktype_matches ADD COLUMN metadata JSON;

-- Eksempel-innsetting fra RapidAPI
INSERT INTO ktype_matches (ktype, eurocode, hit_count, source, confidence_score, metadata)
VALUES (12345, '1234ABCD', 1, 'rapidapi_vehicle_ktype', 0.5, '{"hsn":"1234","tsn":"567"}');
```

**`glass_variants` (brukes ikke aktivt, men for fremtidig OE-linking):**
```sql
-- Hvis RapidAPI returnerer OE-numre i tillegg til kType
ALTER TABLE glass_variants ADD COLUMN oe_numbers TEXT;
ALTER TABLE glass_variants ADD COLUMN hsn_tsn TEXT;
```

**`oe_ktype_links` (hypotetisk fremtidig tabell):**
```sql
CREATE TABLE oe_ktype_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oe_number TEXT NOT NULL,
  ktype INTEGER NOT NULL,
  source TEXT,
  confidence_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 Writeback-kriterier

Før en kType→eurocode-mapping skrives tilbake til D1, kreves:

1. **Minimum 1 bekreftet kilde** med confidence ≥ 0.5
2. **Brand+model+år-match** mot eksisterende katalog (prefix4 eller fuzzy)
3. **Ingen konflikt** med eksisterende mapping (samme kType→eurocode fra annen kilde øker hit_count)
4. **For nye kTyper:** Minst 2 uavhengige regnr som gir samme kType for samme modell

---

## 4. Alternative kilder (anbefalt fremgang)

Siden RapidAPI-kilden er utilgjengelig, anbefales følgende prioritet for kType-berikning:

| Prioritet | Kilde | Dekning | Kostnad | Status |
|-----------|-------|---------|---------|--------|
| 1 | **Bovsoft** (eksisterende) | Norske regnr → kType | Gratis (360 req/dag) | ✅ Aktiv — 132 kTyper funnet |
| 2 | **SVV Enkeltoppslag** | Norske regnr → tekniske data | Gratis (50 000 req/dag) | ⚠️ API-nøkkel utløpt — må fornyes |
| 3 | **TecDoc API** (via Apify/Biluppgifter) | OE-numre → kType | €500–1000/år | ⚠️ Krever abonnement |
| 4 | **eBay API** | OE-numre → produktdata | Gratis (5000 req/dag) | ⚠️ Krever developer-registrering |
| 5 | **Mygrant/Pilkington PDF-er** | Direkte kType i noen kataloger | Gratis (eksisterende data) | 🔍 Under utvikling |
| 6 | **Manuell innsamling** | Ordrehistorikk + mekaniker-input | Gratis | ✅ Pågående — 28 ordrer parsed |

---

## 5. Anbefaling

> **AVVIS RapidAPI-kilden.** Den er fjernet fra plattformen, har ingen arkiver, og representerer en uakseptabel forretningsrisiko (forsvunnet utvikler, ingen SLA).
>
> **Fokuser i stedet på:**
> 1. Fornye SVV API-nøkkel (gratis, 50k kall/dag, norske data)
> 2. Aktivere eBay API for OE-numre
> 3. Fortsette Bovsoft-bootstrapping (128 gratis requests gjenstår)
> 4. Bygge intern "ordre→kType" pipeline fra mekanikeres daglige ordrer

---

**Sist oppdatert:** 2026-05-24
