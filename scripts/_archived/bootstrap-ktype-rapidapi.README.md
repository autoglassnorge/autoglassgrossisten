# kType Bootstrap Strategy — Tenk som en hacker

## Problem

- **39,458 records** i D1, men **<1% har kType**
- Bovsoft er **blokkert i produksjon** (Cloudflare Workers blokkerer port 150)
- Kun **6 regnr** cached i KV
- **SU18018** returnerer bare **1 resultat** fordi kType 17370 matcher bare 1 record

## Løsning: Multi-Layer Hybrid + RapidAPI Bootstrap

### Arkitektur

```
Søk (regnr)
  │
  ├─► SVV → VIN + vehicle data
  │     │
  │     ├─► Layer -1: Ground truth (verifiserte mappings)
  │     │
  │     ├─► Layer 0:  glass_rules (brand:model:year → kType)
  │     │              ← LÆRER FRA HVERT SØK
  │     │
  │     ├─► Layer 1:  Bovsoft (hvis tilgjengelig)
  │     │
  │     ├─► Layer 2:  RapidAPI K-Type Finder (regnr/VIN → kType)
  │     │              100M+ vehicles, freemium
  │     │
  │     ├─► Layer 3:  RapidAPI VIN Decoder TECDOC (VIN → kType + specs)
  │     │              EU-fokus, freemium
  │     │
  │     ├─► Layer 4:  vPIC (NHTSA, gratis, US-biler)
  │     │
  │     ├─► Layer 5:  MACS VIS (hvis API-nøkkel)
  │     │
  │     └─► Layer 6:  AutoGlassMatch (hvis API-nøkkel, US/NAGS)
  │
  └─► D1 catalog query med kType → eksakte treff
```

### Hva er nytt

| Komponent | Beskrivelse |
|-----------|-------------|
| `glass_rules` (D1) | Lærende regelbase: `brand:model:year → kType`. Etter første betalt treff er neste søk **gratis**. |
| `vin_decode_cache` (D1) | Cache for VIN-dekoding (60 dager). Unngår gjentatte SVV/vPIC-kall. |
| `provider_calls` (D1) | Observability: logger alle eksterne kall med kostnad, latency, suksessrate. |
| K-Type Finder | RapidAPI, **freemium**, 100M+ vehicles, regnr/VIN → kType |
| VIN Decoder TECDOC | RapidAPI, **freemium**, EU-fokus, VIN → kType + full specs |

### Kostnader

| Kilde | Pris | Dekning |
|-------|------|---------|
| SVV (Norge) | Gratis | Norske kjøretøy |
| vPIC (NHTSA) | Gratis | US-biler (også EU-biler solgt i USA) |
| glass_rules (intern) | Gratis | Alt vi har sett før |
| K-Type Finder | Freemium | 100M+ vehicles globalt |
| VIN Decoder TECDOC | Freemium | EU (DE, AT, BE, ES, FR, IT, PT) |
| MACS VIS | Månedlig abonnement | EU/KType |
| AutoGlassMatch | $1/lookup | US/NAGS |

### Hvordan få 100% dekning

**Fase 1: Real-time learning (gratis)**
- Hvert brukersøk prøver `glass_rules` først
- Hvis miss → prøv RapidAPI → lagre i `glass_rules`
- Etter ~1,000 unike søk har vi dekket de fleste populære biler

**Fase 2: Batch bootstrap (freemium)**
```bash
# 1. Skaff RapidAPI-nøkkel (gratis tier)
# https://rapidapi.com/autowaysnet/api/ktype-finder-tecdoc

# 2. Kjør bootstrap
export RAPIDAPI_KEY=xxx
export SVV_API_KEY=yyy
node scripts/bootstrap-ktype-rapidapi.mjs
```

**Fase 3: Kontinuerlig læring**
- `glass_rules` vokser automatisk med hvert søk
- Ingen kostnad for gjentatte søk
- Dekning øker eksponensielt over tid

### Hvorfor dette fungerer

1. **Pareto-prinsippet**: 20% av bilmodellene utgjør 80% av søkene
2. **Glass_rules er gratis etter første treff**: Populære biler blir gratis neste gang
3. **Multi-API redundancy**: Hvis én API misser, prøver neste
4. **EU-fokus**: RapidAPI-kildene dekker Europa spesifikt

### Neste steg

1. ✅ Oppdatert `vin-glass-resolver.ts` med RapidAPI-støtte
2. ✅ Oppdatert `index.ts` med hybrid kType-oppslag
3. ⏳ Skaff RapidAPI-nøkkel og test
4. ⏳ Kjør batch-bootstrap med populære norske regnr
5. ⏳ Deploy til produksjon
