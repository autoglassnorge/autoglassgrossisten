---
name: bilglass-test
description: Kjør test-suite for Bilglass: D1-validering, KV-konsistens, regnr-søk, smoke-test. Rapporter resultater og feil.
---

# Bilglass Test

## When to Use

- Før deploy (obligatorisk)
- Etter data-endringer (catalog, priser, ktype)
- Etter Worker-API endringer
- Ved mistanke om regresjon
- Ved debugging av matching/søk

## Test Layers

### Layer 1: Data-kvalitet
```bash
# Valider catalog-prod.json
node scripts/validate-catalog.mjs

# Sjekk KV-konsistens
node scripts/verify-kv.mjs

# Data-kvalitetsrapport
node scripts/data-quality-report.mjs
```

### Layer 2: API / Worker
```bash
# Smoke-test (helse, søk, matching)
node scripts/smoke-test.mjs

# Test spesifikke regnr
node scripts/search-ground-truth.mjs --regnr EL19848
node scripts/search-ground-truth.mjs --regnr KJ43035
```

### Layer 3: Frontend
```bash
# E2E-tester (hvis tilgjengelig)
# cd e2e && npm test
```

### Layer 4: kType-dekning
```bash
# Rapporter kType-dekning
node scripts/ktype-coverage.mjs
```

## The Test Gate

```
NO DEPLOY IF ANY LAYER FAILS
```

## Process

1. **Kjør Layer 1** — fiks datafeil først
2. **Kjør Layer 2** — fiks API-feil
3. **Kjør Layer 3** — fiks frontend-feil (hvis E2E finnes)
4. **Rapporter** — sum passerende/failede tester
5. **Deploy?** — Kun hvis alle kritiske lag er grønne

## Common Failures

| Feil | Årsak | Fix |
|------|-------|-----|
| `eurocode missing` | Beriket data ikke syncet | Kjør `npm run eurocode:pipeline` |
| `KV mismatch` | Cache ikke invalidert | Bump `CACHE_VERSION` |
| `regnr not found` | SVV API nede / rate limit | Sjekk Bovsoft cache fallback |
| `kType mismatch` | Bovsoft vs TecDoc kollisjon | Sjekk `ktype_registry` vs `tecdoc_ktype_registry` |
| `price stale` | Pris-scrape feilet | Kjør `npm run price:pipeline` |

## Don'ts

- **ALDRI** ignorer smoke-test feil
- **ALDRI** deploy med data-valideringsfeil
- **ALDRI** anta at "det funket i går" = OK i dag
