# MACS VIS Setup Guide

**Dato:** 2026-05-21  
**Status:** Integrert i resolver, krever API-nøkkel  
**Type:** EU/KType oppslag (månedlig abonnement)

---

## Hva er MACS VIS?

MACS VIS (Vehicle Identification Service) er en betalt API-tjeneste som dekoder VIN-er til TecDoc kType for europeiske kjøretøy. Tjenesten returnerer en liste med kType-kandidater med tilhørende sannsynlighet.

**Returnerer:** `ktype` (TecDoc-type-nummer) + `probability` (0.0–1.0)

---

## Prising

| Volum | Pris | Kommentar |
|-------|------|-----------|
| Test | Kontakt MACS | Demo-konto tilgjengelig |
| Månedlig | ~€50–200/mnd | Avhengig av volum og funksjoner |
| Enterprise | Custom SLA | Dedikert support + høyere rate limits |

### Kostnadsberegning

| Scenario | Kostnad |
|----------|---------|
| 1 000 lookups/mnd | ~€50–100/mnd |
| 10 000 lookups/mnd | ~€150–250/mnd |
| 100 000 lookups/mnd | Enterprise-avtale |

---

## Kom i gang

### 1. Skaff API-nøkkel

Kontakt MACS direkte:
- **Nettside:** https://www.macsds.com/ (eller søk etter "MACS VIS API")
- **E-post:** support@macsds.com (typisk)
- **Demo:** Be om test-konto med 10–50 gratis lookups

### 2. Sett miljøvariabler

```bash
cd api/cf-worker
npx wrangler secret put MACS_VIS_API_KEY
# Lim inn API-nøkkelen fra MACS
```

### 3. Test lokalt

```bash
cd api/cf-worker
npx wrangler dev
```

I en annen terminal:
```bash
curl -X POST http://localhost:8787/api/vin-lookup \
  -H "Content-Type: application/json" \
  -d '{"vin":"TMBJE73T7B9015131","regnr":"BS12345"}'
```

### 4. Mock-modus (for utvikling uten nøkkel)

Sett `MACS_VIS_MOCK_MODE=true` i kode eller miljø:

```typescript
// I vin-glass-resolver.ts
const MACS_VIS_MOCK_MODE = env.MACS_VIS_MOCK_MODE === "true";
```

I mock-modus returnerer resolver en forhåndsdefinert kType for kjente VIN-er:
- `TMBJE73T7B9015131` → kType 32787 (Skoda Superb)
- `YV1...` (Volvo) → kType 6272

---

## Test-prosedyre

### Steg 1: Verifiser at nøkkel fungerer

```bash
node scripts/test-macs-vis.mjs
```

Forventet output:
```
🧪 MACS VIS Test
API Key: ****1234
Mock Mode: false

VIN: TMBJE73T7B9015131
Status: 200
kType: 32787
Confidence: 0.95
Latency: 245ms
```

### Steg 2: Verifiser i resolver

```bash
node scripts/test-resolve-e2e.mjs BS12345
```

Forventet output:
```
✅ Resolved via macs_vis
kType: 32787
Path: [svv, vpic, macs_vis]
```

### Steg 3: Verifiser i D1

```bash
npx wrangler d1 execute glass-catalog-db --local --command="SELECT * FROM glass_rules WHERE source = 'macs_vis' LIMIT 5"
```

---

## Troubleshooting

| Problem | Årsak | Løsning |
|---------|-------|---------|
| `401 Unauthorized` | Ugyldig API-nøkkel | Sjekk at nøkkel er riktig kopiert |
| `429 Too Many Requests` | Rate limit overskredet | Reduser frekvens eller oppgrader plan |
| `404 Not Found` | VIN ikke i MACS-database | Prøv vPIC eller Vincario i stedet |
| Tom respons | EU-VIN, men ikke i TecDoc | Sjelden for nye modeller |

---

## Referanser

- `api/cf-worker/src/vin-glass-resolver.ts` — MACS VIS-integrasjon
- `scripts/test-macs-vis.mjs` — Testscript
- `docs/KTYPES-DATA-SOURCES.md` — Oversikt over alle kilder
