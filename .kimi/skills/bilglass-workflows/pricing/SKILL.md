---
name: bilglass-pricing
description: Oppdater Bilglass-prisdatabase. Hent data fra leverandører (auto-glass.no), valider endringer, og sync til D1 + KV.
---

# Bilglass Pricing

## When to Use

- Priser er utdaterte (sjekk `price_sync_status`)
- Ny leverandørdata tilgjengelig
- Sesongjusterte priser
- Kampanje-priser
- Etter catalog-berikning (nye produkter mangler pris)

## Datakilder

| Kilde | Type | Pålitelighet |
|-------|------|-------------|
| auto-glass.no | Web-scrape | Primær |
| Pilkington feed | CSV/JSON | Sekundær |
| Glavista feed | CSV/JSON | Sekundær |
| Manuell input | Admin | Backup |

## Process

### 1. Dry-run (ALLTID først)
```bash
# Sjekk hvilke priser som vil endres
npm run price:check
```

### 2. Scrape (hvis nødvendig)
```bash
# Sample-scrape (200 kategorier, ~5 min)
npm run price:update

# Full scrape (alle kategorier, ~30 min)
npm run price:update:full

# Hvis auth feilet:
npm run price:login
```

### 3. Sync til Catalog
```bash
# Sync CSV-priser til catalog-prod.json
npm run price:sync
```

### 4. Valider endringsrate
```bash
# Sjekk diff
# Threshold: >1% endringsrate = normal
# >10% = undersøk årsak
node scripts/data-quality-report.mjs --focus=prices
```

### 5. Commit + Deploy
```bash
# 1. Kjør smoke-test
node scripts/smoke-test.mjs

# 2. Hvis OK: deploy via /bilglass-deploy
```

## The Pricing Gate

```
NO PRICE UPDATE WITHOUT DRY-RUN FIRST
NO DEPLOY WITHOUT POST-PRICE SMOKE-TEST
```

## Common Failures

| Feil | Årsak | Fix |
|------|-------|-----|
| `Auth error` | Cookies utløpt | `npm run price:login` |
| `0 changes` | Scrape feilet silently | Sjekk scraper-output, retry |
| `Price spike` >50% | Feil parsing av DOM | Sjekk selector, manuell verifikasjon |
| `Missing prices` | Nye produkter uten pris | Kjør full scrape + sync |

## Don'ts

- **ALDRI** oppdater priser uten dry-run
- **ALDRI** ignorer >10% endringsrate uten årsak
- **ALDRI** deploy pris-endringer rett før helg
- **ALDRI** overskriv manuelt justerte priser uten godkjenning
