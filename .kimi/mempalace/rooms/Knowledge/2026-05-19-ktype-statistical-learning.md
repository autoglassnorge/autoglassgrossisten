# ADR-010: kType-basert statistisk læring for frontrute-matching

**Dato:** 2026-05-19  
**Status:** Godkjent  
**Beslutning:** Bruk Bovsoft REGNUM for kType-oppslag + statistisk læring over tid

---

## Kontekst

Autoglass AS trenger 100% eksakt frontrute-matching (samme glass som fabrikkoriginal). Dagens matching baserer seg på:
1. SVV Enkeltoppslag → merke + modell + år
2. D1-database → brand + model + year + equipment-flagg
3. VIN-dekoding (kun VW Transporter)

Dette gir "high" konfidens i beste fall, men ikke 100% garanti.

## Alternativer vurdert

| Alternativ | Kostnad | Nøyaktighet | Tidsramme |
|-----------|---------|-------------|-----------|
| A: TecDoc-abonnement (~€500/år) | Høy | 100% umiddelbart | Umiddelbart |
| B: Smart Hybrid (kType + Biluppgitter + VIN) | Gratis | ~90% | Umiddelbart |
| C: Statistisk læring (kType + treff-logging) | Gratis | 100% etter nok data | Måneder |

## Beslutning

**Valgt: Alternativ C (Statistisk læring)**

Begrunnelse:
- Ingen løpende kostnader
- Systemet blir bedre jo mer det brukes
- Bygger unik konkurransedyktig fordel over tid
- Kan kombineres med Alternativ A senere hvis nødvendig

## Implementasjon

### Bovsoft REGNUM API
- Endpoint: `http://54.38.179.43:150/bovsoft.regnum.run`
- Returnerer: kType (TecDoc type ID), VIN, merke, modell, år-fra/år-til
- Pris: pay-per-request (ikke abonnement)

### Worker-endringer (v2.1)
1. `fetchBovsoftVehicle()` — parser kType fra Bovsoft-respons
2. KV-cache for Bovsoft-data per regnr (30 dager)
3. `decodeVin()` — utvidet VIN-dekoding for BMW, Mercedes, Audi, Ford, Hyundai/Kia, Toyota
4. `scoreCandidate()` — kType-generasjons-verifikasjon gir +25 poeng

### D1-endringer
1. `glass_catalog.ktype INTEGER` — for direkte kType-oppslag (populeres fra leverandørdata)
2. `ktype_matches`-tabell — lagrer hvert regnr→kType→eurocode-treff
3. `queryKtypeMapping()` — statistisk oppslag: "kType X → eurocode Y med Z% sannsynlighet"

### Matching-flyt
```
Regnr → SVV → brand + model + year
     → Bovsoft → kType + VIN + year-range (cached 30 dager)

Layer 0: kType-exakt
  - queryByKtype(kType) → direkte treff i glass_catalog
  - queryKtypeMapping(kType) → statistisk mapping fra tidligere treff

Layer 1-3: Brand + model + year (eksisterende)
  - Med kType-generasjons-verifikasjon (+25 poeng i scoring)
  - Med utvidet VIN-dekoding

Lagring: insertKtypeMatch(regnr, kType, topEurocode)
```

## Konsekvenser

**Positive:**
- Gratis løsning
- Selvforbedrende over tid
- Unik data-fordel

**Negative:**
- Tar tid å bygge nok statistikk
- Krever mange søk før 100% nøyaktighet
- Bovsoft-konto må bekreftes først (status: 403 temp)

## Neste steg

1. Roter SVV API-nøkkel (Worker er nede pga 401)
2. Kontakt Bovsoft for konto-bekreftelse (id=461)
3. Deploy Worker v2.1
4. Kjør D1-migrering (`node scripts/apply-d1-migration.mjs`)
5. Overvåk kType-treff-statistikk i `/api/health`
