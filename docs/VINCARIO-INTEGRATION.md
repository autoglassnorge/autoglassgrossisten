# Vincario API Integration

**Dato:** 2026-05-21  
**Status:** ✅ Implementert i Worker  
**Type:** Vehicle enrichment (ikke direkte kType-kilde)

---

## Hva er Vincario?

Vincario er en VIN-dekodingstjeneste med fokus på det europeiske markedet. Den returnerer detaljerte kjøretøyspesifikasjoner (merke, modell, år, motor, karosseri, etc.) basert på VIN.

**Viktig:** Vincario returnerer **IKKE** TecDoc kType direkte. Den brukes som en **vehicle enrichment**-kilde for å:
- Bekrefte make/model/year med høyere nøyaktighet enn vPIC (spesielt for EU-biler)
- Berike kjøretøydata med motor, karosseri, drivverk, etc.
- Forbedre confidence scoring i resolveren

---

## API-detaljer

| | |
|---|---|
| **Base URL** | `https://api.vincario.com/3.2/` |
| **Auth** | API Key + Secret Key + Control Sum (SHA1) |
| **Rate limit** | 60 VINs/minutt |
| **Prising** | 3 gratis lookups/måned, deretter abonnement |
| **Per-lookup** | ~€0.22–0.49 avhengig av volum |
| **Ugyldige VINer** | Ikke belastet |

### Endepunkter

| ID | Beskrivelse | Kostnad |
|----|-------------|---------|
| `decode` | VIN → full vehicle spec | Per lookup |
| `info` | Liste over tilgjengelige felter | Gratis |
| `balance` | Gjenstående lookups | Gratis |
| `stolen-check` | Sjekk mot stjålet-database | Per lookup |
| `oem` | OEM VIN Lookup | Custom pricing |
| `vehicle-market-value` | Markedsverdi | Per lookup |

### Control Sum

```
controlSum = first_10_chars( SHA1( "VIN|ID|API_KEY|SECRET_KEY" ) )
```

VIN må være i **UPPER CASE**.

---

## Implementasjon

### Fil: `api/cf-worker/src/providers/vincario.ts`

```typescript
import { decodeVinVincario, getVincarioBalance } from "./providers/vincario";

const result = await decodeVinVincario(vin, {
  apiKey: env.VINCARIO_API_KEY,
  secretKey: env.VINCARIO_SECRET_KEY,
});

if (result.vehicle) {
  console.log(result.vehicle.make, result.vehicle.model, result.vehicle.year);
}
```

### Miljøvariabler (Wrangler secrets)

```bash
wrangler secret put VINCARIO_API_KEY
wrangler secret put VINCARIO_SECRET_KEY
```

---

## Integrasjon i resolver

Vincario er **Lag 3a** i den oppdaterte resolver-kjeden:

```
Lag 0: glass_rules (D1 cache)           ← gratis, selvlærende
Lag 1: SVV (regnr → VIN + vehicle)      ← gratis
Lag 2: NHTSA vPIC (VIN → specs)         ← gratis
Lag 3a: Vincario (VIN → EU specs)       ← freemium (~€0.22/VIN)
Lag 3b: MACS VIS (VIN → kType)          ← månedlig abonnement
Lag 3c: AutoGlassMatch (VIN → NAGS)     ← $1/lookup (kun US)
```

### Hvorfor Vincario før MACS VIS?

1. **Lavere kostnad**: €0.22/VIN vs MACS VIS månedlig abonnement
2. **Høyere EU-nøyaktighet**: Vincario er EU-fokusert, vPIC er US-fokusert
3. **Gratis testers**: 3 lookups/måned for å teste kvalitet
4. **Invalid VIN = gratis**: Du betaler kun for vellykkede dekodinger

---

## Begrensninger

| Begrensning | Forklaring |
|-------------|------------|
| **Ingen kType** | Vincario returnerer vehicle specs, ikke TecDoc kType |
| **Månedlig kvote** | 3 gratis, deretter abonnement kreves |
| **Rate limit** | 60 VINs/minutt |
| **EU-fokus** | Best dekning for europeiske kjøretøy |

---

## Alternativer for kType

Siden Vincario ikke gir kType, bruk disse kildene for direkte kType-oppslag:

| Kilde | Type | Dekning | Kostnad |
|-------|------|---------|---------|
| **MACS VIS** | VIN → kType | EU | Månedlig abonnement |
| **Biluppgifter** | regnr → vehicle + kType? | Sverige/Norge | Ukjent (kontakt api@biluppgifter.se) |
| **Bovsoft** | regnr → kType | Norge | Krevet (blokkert i Workers) |
| **TecAlliance** | VIN → kType | Global | Enterprise-avtale |

---

## Referanser

- [Vincario API Docs](https://vincario.com/api-docs/3.2/)
- [Vincario Pricing](https://vincario.com/pricing/)
- [Vincario GitHub](https://github.com/vincario)
