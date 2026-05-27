# vin-glass-resolver — Hybrid VIN → Glass/KType

Hybrid VIN-til-glass resolvermotor med 3 lag: gratis → intern cache/regler → betalt fallback.

---

## Arkitektur

```
VIN
  └─ Lag 1: NHTSA vPIC (gratis, ingen autentisering)
       └─ normalize -> [make:model:year:body:doors]
           └─ Lag 2a: glass_rules cache (confidence >= 0.90) ──────> RETURNER
               └─ Lag 2b: glass_rules rules (confidence >= 0.85) ──> RETURNER
                   └─ Lag 3: Betalt fallback
                         ├─ EU/NO: MACS VIS (KType/KBA)
                         └─ US:    AutoGlassMatch (NAGS)
                               └─ Lær: upsert i glass_rules
```

---

## Miljøvariabler

| Variabel             | Påkrevd | Beskrivelse                          |
|----------------------|---------|--------------------------------------|
| `SUPABASE_URL`       | Ja      | Supabase-prosjekt URL                |
| `SUPABASE_SERVICE_KEY` | Ja   | Supabase service role key            |
| `MACS_VIS_API_URL`   | Nei     | Standard: https://api.macsds.com/vis/v1 |
| `MACS_VIS_API_KEY`   | Nei*    | Påkrevd for EU/KType-fallback        |
| `AGM_API_URL`        | Nei     | Standard: https://api.autoglassmatch.com/v1 |
| `AGM_API_KEY`        | Nei*    | Påkrevd for US/NAGS-fallback         |

\* Uten betalt API-nøkkel kjører systemet kun gratis lag 1+2.

---

## SQL-migrasjon

```bash
# Kjør mot Supabase
psql $DATABASE_URL -f scripts/migrations/0010_vin_glass_hybrid.sql

# Eller med supabase CLI
supabase db push
```

---

## Bruk fra kode

```js
import { resolveGlass } from './lib/vin-glass-resolver.mjs';

const result = await resolveGlass({
  vin: 'WVWZZZAUZLP012345',
  opening: 'windshield',
  market: 'EU',
  features: {
    camera: true,
    hud: false,
    rainSensor: true,
    heated: false,
  },
  mode: 'auto', // 'auto' | 'free_only' | 'paid_only'
});

console.log(result);
// {
//   requestId: 'uuid',
//   status: 'resolved',
//   resolutionPath: ['vpic', 'macs_vis'],
//   paidLookupUsed: true,
//   match: {
//     ktype: '12345',
//     confidence: 0.96,
//     source: 'macs_vis'
//   },
//   providerCost: 0
// }
```

---

## CLI-test

```bash
# Enkel test direkte fra terminal
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  node scripts/lib/vin-glass-resolver.mjs WVWZZZAUZLP012345 windshield EU
```

---

## Konfidensterskler

| Terskel | Verdi | Handling                                |
|---------|-------|-----------------------------------------|
| ACCEPT  | ≥0.90 | Auto-accept, returner direkte           |
| RULES   | ≥0.85 | Intern regeltreff godkjent              |
| PAID    | ≥0.60 | Betalt fallback-svar godkjent           |
| UNDER   | <0.60 | Sendes til manual_review_queue          |

---

## Tabeller

| Tabell                       | Formål                                      |
|------------------------------|---------------------------------------------|
| `vin_decode_cache`           | Cache for gratis vPIC-dekoding (60 dg TTL)  |
| `glass_resolution_requests`  | Alle resolve-forespørsler med status        |
| `glass_match_candidates`     | Kandidater fra regler og leverandører       |
| `glass_rules`                | Lærende regelbase – vokser med bruk         |
| `provider_calls`             | Observability: kost, latency, feil          |
| `manual_review_queue`        | Lavkonfidens / ingen match → manuell review |

---

## Kostkontroll

- vPIC: **gratis**, ingen API-nøkkel nødvendig.
- MACS VIS: månedlig abonnement, ikke per kall.
- AutoGlassMatch: **$1 per vellykket oppslag**, de 10 første gratis.
- Etter første betalt match lagres resultatet i `glass_rules` → neste oppslag på samme modell er **gratis**.

---

Generert: 2026-05-21
