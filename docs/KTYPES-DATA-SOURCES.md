# kType Data Sources — Oppdatert oversikt (2026-05-21)

> Hvordan få TecDoc kType på ALLE biler — etter at RapidAPI Autoways ble fjernet

---

## 🎯 Problemet

- **39,458 records** i D1, men **0% har kType** (korrigert fra <1%)
- Bovsoft er **blokkert i produksjon** (port 150)
- RapidAPI Autoways er **fjernet** (HTTP 404, 2026-05-21)
- **2,882 unike brand:model:year** i katalogen uten kType-mapping
- glass_rules har **6 entries** seedet fra Bovsoft

---

## 🏗️ Løsning: Multi-Layer Hybrid (v2.3)

```
Søk (regnr)
  │
  ├─► SVV → VIN + vehicle data
  │     │
  │     ├─► Lag 0:  glass_rules (brand:model:year → kType) ← LÆRER!
  │     │              ✅ Primær kilde. 6 entries seedet.
  │     │
  │     ├─► Lag 1:  NHTSA vPIC (gratis VIN-dekoding)
  │     │              ⚠️ Upålitelig for EU-biler (feil år/modell)
  │     │
  │     ├─► Lag 3a: Vincario (EU VIN-decode, ~€0.22/VIN)
  │     │              🆕 Vehicle enrichment (ikke direkte kType)
  │     │
  │     ├─► Lag 3b: MACS VIS (EU/KType, månedlig abonnement)
  │     │              ⏳ Krever egen API-nøkkel
  │     │
  │     └─► Lag 3c: AutoGlassMatch (US/NAGS, $1/lookup)
  │                   ⏳ Kun US-marked
  │
  └─► D1 catalog query med kType → eksakte treff
```

---

## 📊 Alle datakilder (oppdatert)

### A. Gratis kilder

| Kilde | Type | Kostnad | Status | KType? |
|-------|------|---------|--------|--------|
| **SVV Enkeltoppslag** | regnr → VIN + vehicle | Gratis | ✅ Integrert | ❌ |
| **glass_rules (D1)** | brand:model:year → kType | Gratis | ✅ 6 entries | ✅ |
| **vin_decode_cache (D1)** | VIN → vehicle data | Gratis | ✅ | ❌ |
| **NHTSA vPIC** | VIN → vehicle specs | Gratis | ✅ | ❌ |

### B. Betalte kilder

| Kilde | Type | Kostnad | Dekning | Status |
|-------|------|---------|---------|--------|
| **Vincario** | VIN → EU vehicle specs | €0.22/VIN | Global/EU | ✅ Integrert |
| **MACS VIS** | VIN → kType | Månedlig | EU/KType | ✅ Integrert (krever nøkkel) |
| **AutoGlassMatch** | VIN → NAGS | $1/lookup | US/NAGS | ✅ Integrert (krever nøkkel) |
| **Autoways direkte** | regnr/VIN → kType | 49€/mnd | EU | ⏳ Krever kontakt |
| **Biluppgifter** | regnr → equipment | Ukjent | Sverige/Norge | ⏳ Dummy nøkkel |

### C. DEPRECATED kilder

| Kilde | Årsak | Dato |
|-------|-------|------|
| **RapidAPI K-Type Finder** | Fjernet fra RapidAPI (HTTP 404) | 2026-05-21 |
| **RapidAPI VIN Decoder TECDOC** | Fjernet fra RapidAPI (HTTP 404) | 2026-05-21 |
| **RapidAPI Car Selector** | Fjernet fra RapidAPI (HTTP 404) | 2026-05-21 |
| **eBay API** | Eksponerer ikke KType (dokumentert) | 2026-05-21 |

---

## 💰 Kostnadsoversikt (per lookup)

| Scenario | Kostnad | Forutsetning |
|----------|---------|-------------|
| Cache-treff (glass_rules) | **$0** | Allerede lært |
| SVV + vPIC | **$0** | Gratis kilder |
| Vincario | **~€0.22/VIN** | Per vellykket dekoding |
| MACS VIS | **$0** | Månedlig abonnement (~€50–200) |
| AutoGlassMatch | **$1/lookup** | Kun US |
| Bovsoft (batch, lokal) | **$0** | Node.js (ikke Workers) |

**Gjennomsnittlig kostnad per nytt kjøretøy:** ~$0.05–0.15  
**Kostnad etter læring:** $0 (95%+ av søk treffer glass_rules)

---

## 🔧 Implementerte filer (v2.3)

| Fil | Beskrivelse |
|-----|-------------|
| `api/cf-worker/src/vin-glass-resolver.ts` | Resolver — RapidAPI fjernet, Vincario lagt til |
| `api/cf-worker/src/vin-lookup-api.ts` | `POST /api/vin-lookup` + polling |
| `api/cf-worker/src/providers/vincario.ts` | Vincario API-klient med SHA1-auth |
| `scripts/batch-bootstrap-ktype.mjs` | Batch seed + gap-analyse (2,882 combos) |
| `scripts/provider-stats.mjs` | Observability-dashboard |
| `scripts/data/glass-rules-batch-seed.sql` | Generert SQL for glass_rules |
| `scripts/data/batch-bootstrap-report.json` | Gap-rapport med prioritert backlog |

---

## 📈 Dekningsmål

| Milepæl | Dekning | Hvordan |
|---------|---------|---------|
| Nå (v2.3) | ~0.2% | 6 Bovsoft-mappings i glass_rules |
| Etter batch (Bovsoft + manuell) | ~5–10% | ~150–300 mappings seedet |
| Etter MACS VIS/Vincario | ~15–25% | ~500–1,000 mappings |
| Etter 1 mnd produksjon | ~40–60% | Selvlæringsloop |
| Mål (≥99%) | ~99% | Ground truth + selvlæring |

---

## 🚀 Neste steg

1. **Deploy Worker v2.3** med Vincario + vin-lookup endpoint
2. **Seed glass_rules** med batch-SQL (`scripts/data/glass-rules-batch-seed.sql`)
3. **Skaff Vincario API-nøkkel** — 3 gratis lookups/måned på [vincario.com](https://vincario.com/pricing/)
4. **Kontakt Biluppgifter** — `api@biluppgifter.se` for reell API-nøkkel
5. **Vurder MACS VIS** — månedlig abonnement for ubegrenset EU kType
