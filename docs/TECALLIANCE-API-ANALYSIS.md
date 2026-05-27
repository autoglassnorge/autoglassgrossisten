# TecAlliance API Analysis — `developer.tecalliance.cn`

**Dato:** 2026-05-21  
**Analytiker:** Kimi Code CLI  
**Status:** ✅ Fullført  
**Relevans for Autoglass AS:** Lav (Asia Pacific/China fokus), men strategisk verdi for fremtidig TecDoc Europe-forhandling

---

## 1. Hva er TecAlliance?

TecAlliance er selskapet som **eier og drifter TecDoc** — verdens største standardiserte reservedelsdatabase for bilindustrien. Selskapet er eid av 34 store aktører (Bosch, Continental, Rheinmetall, ZF, etc.) og opererer i 140 land.

**Viktig distinksjon:**
- `developer.tecalliance.cn` = **Kina/Asia Pacific** fokusert portal
- `tecalliance.net` = **Global/Europa** (annen portal, annen prising)
- `biluppgifter.se` = **Norsk/Svensk reseller** av TecDoc-data (allerede i stacken)

---

## 2. API-produkter på developer.tecalliance.cn

| Produkt | Beskrivelse | Endpoint (eksempel) | Relevans for Norge |
|---------|-------------|---------------------|-------------------|
| **Vehicle Identification API** | VIN → kType, Katashiki → kType | `vin.tecalliance-sea.com` | ❌ Asia Pacific kun |
| **TecDoc API (China)** | Parts-søk via kType | `onedb.tecalliance.cn/api/articles` | ❌ China-only data |
| **ChinaID API** | Kinesisk salgsversjonsdata | `onedb.tecalliance.cn/api/articles/chinaid` | ❌ Kina-only |
| **Webservice Pegasus** | Original SOAP-basert TecDoc API | `api.tecalliance.cn/data/api/tecdoc` | ❌ Legacy, China-only |

### 2.1 Vehicle Identification API — SEA (Asia Pacific)

**Endpoint:** `https://vin.tecalliance-sea.com/api/getVehicleByNumberType`

**Request:**
```json
{
  "numberType": 2,
  "language": "en",
  "country": "th",
  "number": "SALLMAM23AA310721",
  "token": "YOUR_API_TOKEN"
}
```

**Response:**
```json
{
  "stateCode": 200,
  "data": [{
    "kType": "23050",
    "manuName": "LAND ROVER",
    "modelName": "RANGE ROVER (2002-2012)",
    "typeName": "3.6 TD 8 4x4",
    "yearOfConstrFrom": "2006/04/01",
    "yearOfConstrTo": "2012/08/01",
    "ccmTech": "3628",
    "fuelType": "Diesel",
    "powerHpFrom": "272"
  }]
}
```

**Støttede land (SEA):**
- Thailand (th), Malaysia (my), Indonesia (id), Philippines (ph)
- Vietnam (vn), Korea (kr), Singapore (sg), Taiwan (tw), Japan (jp)

**→ Norge/Europa er IKKE med.**

### 2.2 Katashiki Search (kType) — SEA

**Endpoint:** `https://vin.tecalliance-sea.com/api/vehicles/katashiki`

Input: Japansk Katashiki-nummer (f.eks. `DBA-NA9`) → Output: kType + kjøretøydata.

**→ Kun relevant for japanske importbiler.**

### 2.3 VIN Search — China

**Endpoint:** `https://vin.tecalliance.cn/api/getVehicleByNumberType` (antatt)

Kina-spesifikk VIN-dekoding. **→ Ikke relevant for Norge.**

---

## 3. Autentisering & Tilgang

### 3.1 API Key / Token

| Krav | Detalj |
|------|--------|
| **Hvordan få** | Kontakt "TecAlliance solution manager" |
| **Header** | `Authorization: YOUR_API_KEY` |
| **Gratis tier** | ❌ Ingen. Må være betalende kunde |
| **Test-konto** | ✅ "Free API testing account" via tecalliance-sea.com (SEA only) |

### 3.2 Prising

Ingen offentlig prisliste funnet. Basert på bransjekjennskap:
- TecDoc API-lisenser er typisk **€500–€5000+/år** avhengig av volum og region
- Enterprise-avtaler med volumrabatt er vanlig
- Direct API-tilgang (uten reseller) kan være rimeligere enn via mellomledd

---

## 4. Autoways-forbindelsen

**Hypotese:** Autoways (som ble fjernet fra RapidAPI) var en **unauthorized/reseller** av TecDoc/TecAlliance-data. Deres APIer:
- `ktype-finder-tecdoc` (RapidAPI)
- `car-selector-api` (RapidAPI)
- `vin-decoder-tecdoc` (RapidAPI)

...returnerte kType-data som i praksis var TecDoc-data pakket inn i et enklere API-grensesnitt.

**Lærdom:** Når Autoways forsvant fra RapidAPI, mistet vi en **uoffisiell kanal** til TecDoc-data. Den **offisielle kanalen** er TecAlliance direkte, eller autoriserte resellere som Biluppgifter.

---

## 5. Relevans-vurdering for Autoglass AS

### 5.1 Direkte bruk: LAV

| Problem | Forklaring |
|---------|------------|
| Geografi | Portalen dekker Asia Pacific og Kina, ikke Europa/Norge |
| Data-scope | Norske registreringsnummer (SVV) → ingen mapping til SEA-systemet |
| VIN-dekoding | Europeiske VIN-er (WMI-start med `W`, `S`, `Z`, etc.) dekkes ikke av SEA-APIet |

### 5.2 Strategisk verdi: MIDDELS

| Mulighet | Verdi |
|----------|-------|
| **TecDoc Europe API** | Kontakt TecAlliance for europeisk API-tilgang. Dette er **primærkilden** til kType-data. |
| **Forhandlingsposisjon** | Som B2B grossist med 37,581 produkter kan Autoglass AS kvalifisere for partner-prising |
| **Direkte vs. Reseller** | Direkte TecAlliance-avtale kan være rimeligere og raskere enn Biluppgifter |
| **Data-kvalitet** | Direkte tilgang = ferskere data, bedre SLA, flere felter |

---

## 6. Anbefalinger

### Kortsiktig (nå–1 måned)
1. **Fortsett med Biluppgifter** som hovedkilde for kType/TecDoc-data
2. **Seed glass_rules aggressivt** med data fra Bovsoft, manuell innlogging, og bruker-søk
3. **Kontakt `api@biluppgifter.se`** for å:
   - Bekrefte reell API-nøkkel
   - Spørre om kType-endepunkt (ikke bare generell vehicle data)
   - Forhandle pris/volum for norsk B2B-grossist

### Mellomlang sikt (1–3 måneder)
4. **Kontakt TecAlliance direkte** for europeisk API-tilbud:
   - E-post: Via kontaktskjema på `tecalliance.net`
   - Henvis til: 37,581 produkter, Norge/EU-marked, B2B grossist
   - Spør om: TecDoc OneDB API for Europa, VIN → kType, parts-linkage
   - Be om: Test-konto / POC-tilgang

### Lang sikt (3–12 måneder)
5. **Evaluer direkte TecAlliance-avtale** vs. Biluppgifter-reseller basert på:
   - Pris per 1000 kall
   - Data-oppdateringsfrekvens
   - SLA og support
   - VIN-dekodingsdekning for europeiske biler

---

## 7. Konklusjon

> `developer.tecalliance.cn` er **ikke direkte brukbar** for Autoglass AS i Norge, men TecAlliance som selskap er **den ultimate datakilden** for kType/TecDoc-data i Europa.
>
> Den kinesiske portalen er et **vindu** inn i TecAlliances API-arkitektur, men den europeiske avdelingen opererer under andre endepunkter og avtaler.
>
> **Beste vei videre:** Fortsett med Biluppgifter (reseller) i dag, forhandl direkte med TecAlliance Europe i morgen.

---

## 8. Referanser

- TecAlliance Developer Portal (China): https://developer.tecalliance.cn/
- TecAlliance SEA Web Catalogue: https://www.tecalliance-sea.com/
- TecAlliance Global: https://www.tecalliance.net/
- TecDoc Catalogue: https://www.tecalliance.cn/ (web-katalog, gratis)
- Autoways RapidAPI (DEAD): https://rapidapi.com/autowaysnet/ (404)
- Biluppgifter: https://www.biluppgifter.se/api (allerede i stacken)
