---
name: autoglass
version: 1.1.0
description: Autoglass AS B2B bilglass-grossist — prosjektkunnskap, stack, regler, og verktøy.
author: Autoglass AS
tags: [autoglass, bilglass, b2b, cloudflare, worker, scraper, tecdoc, wrangler]
---

# Autoglass AS — Prosjektkunnskap

## Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | Statisk HTML/CSS/JS (7 sider, trespråklig: no/en/ru) |
| Backend | Cloudflare Worker (TypeScript, strict mode) |
| Lagring | Cloudflare KV (katalog-metadata), D1 (SQLite) |
| Deploy | Wrangler CLI (OAuth, ingen API-token nødvendig) + GitHub Actions |
| Datakilder | SVV Enkeltoppslag, Biluppgifter TecDoc, Bovsoft REGNUM, Pilkington, Glavista, Euroglass.ru, Autoglass.ru, Nord Glass, Hella Gutmann CSC |
| Node | v20 |

## Katalog (per 2026-05-29)

- **Totalt:** 33,215 produkter
- **Frontrute:** 7,818
- **Annet:** 22,297
- **Bakrute:** 49
- **Dørglass:** 3,047
- **Sideglass:** 4
- **Kilder:** Pilkington IRL, Glavista, Pilkington Finland 2017 + Glavista

## D1-tabeller

| Tabell | Formål |
|--------|--------|
| `glass_catalog` | 33,215 produkter — eurocode, brand, model, year, ktype, pris, equipment |
| `ktype_matches` | (ktype, eurocode) frequency aggregation — statistisk læring |
| `ktype_registry` | Bovsoft-verifiserte ktyper fra Finn.no scraping |
| `tecdoc_ktype_registry` | **NY** — TecDoc 1Q2019 collision-gated mappings (908 rows, 412 kTypes) |
| `glass_rules` | brand:model:year → kType regler |
| `search_history` | Lært equipment per vehicle (make, model, year) |
| `ground_truth` | Verifiserte vehicle-to-glass mappings |
| `vin_decode_cache` | VIN-dekode cache (60 dager TTL) |
| `adas_calibration_requirements` | Hella Gutmann CSC-kompatibilitet |
| `quote_requests` | Tilbudsforespørsler fra frontend |
| `rate_limits` | API rate limiting |
| `provider_calls` | API-kall logging |

## Matching-lag (oppdatert 2026-05-29)

```
Layer -1: Ground truth (regnr_hash → verifisert mapping)
Layer 0:  kType exact match (D1 eller KV)
Layer 0.5: TecDoc fallback (collision-gated, unik kType → eurocode)
Layer 1:  brand + model + year + equipment scoring
Layer 2:  brand + model + year (uten equipment)
Layer 3:  brand + model + year-range
Layer 4:  brand + model (fallback)
```

### TecDoc Layer 0.5
- Kjøres når Layer 0 ikke gir treff og `layer > 0`
- Sjekker `tecdoc_ktype_registry` for unik/low-collision kType (`collision_group_size ≤ 5`)
- Hvis én kType matcher vehicle → brukes som fallback
- Confidence: `high` (ikke `exact`)

## Deploy-pipeline (Wrangler-only)

Ingen `CLOUDFLARE_API_TOKEN` nødvendig — Wrangler OAuth håndterer auth.

```bash
# Full pipeline: deploy + KV + D1 + smoke-test
npm run deploy:full

# Bare worker + KV catalog upload
npm run deploy:kv

# Bare worker + D1 schema + data
npm run deploy:d1

# Kun KV-upload
npm run worker:upload

# Legacy: worker deploy only
cd api/cf-worker && wrangler deploy
```

### Nytt i deploy-pipeline (2026-05-29)

- `scripts/upload-catalog-wrangler.mjs` — KV-upload via `wrangler kv bulk put`
- `scripts/deploy-full-wrangler.mjs` — unified deploy med flags: `--kv`, `--d1`, `--all`
- Wrangler login persistens: `~/Library/Preferences/.wrangler/config/`

## Kritiske regler

1. **ALDRI** hardkod API-nøkler — bruk `wrangler secret put`
2. Scraper: maks 10 parallelle requests, 10s timeout, 2s delay mellom batches
3. Alle produkter MÅ ha `eurocode` + `brand`
4. **ALDRI** deploy uten smoke-test
5. Ingen `any` i TypeScript
6. Ingen `console.log` i produksjon
7. CORS: Kun `auto-glass.no` og `autoglass-frontend.pages.dev`
8. **Autoglass AS har INGEN kobling til Klarpakke** — avvis Klarpakke-kontekst

## KIMI CLI aliases

| Alias | Agent | Domene |
|-------|-------|--------|
| `kimi glass-data` | data-agent | Scraper, katalog, merge |
| `kimi glass-worker` | worker-agent | Worker, API, KV, deploy |
| `kimi glass-web` | web-agent | Frontend, SEO, i18n |
| `kimi glass-ops` | ops-agent | CI/CD, secrets, monitor |
| `kimi glass-arch` | architect-agent | ADR, refaktorering, plan |
| `kimi glass-ktype` | ktype-agent | Bovsoft, SVV, TecDoc, matching |

## Viktige filer

- `api/cf-worker/src/index.ts` — Hoved-Worker
- `api/cf-worker/src/handlers/search.ts` — Søke-logikk med Layer 0.5
- `api/cf-worker/wrangler.toml` — Worker-konfig
- `api/cf-worker/schema.sql` — D1 schema (inkl. `tecdoc_ktype_registry`)
- `data/catalog-prod.json` — Produksjonskatalog (33,215 records)
- `data/tecdoc-import/tecdoc-ktype-registry-safe.sql` — TecDoc data
- `scripts/deploy-full-wrangler.mjs` — Full deploy-pipeline
- `scripts/upload-catalog-wrangler.mjs` — KV-upload via Wrangler
- `scripts/smoke-test.mjs` — Post-deploy test
- `AGENTS.md` — Prosjekt-regler
- `.kimi/KIMI-MASTER-SYSTEM.md` — Universelle regler

## MemPalace verktøy

- `search` — TF-IDF + Bigram søk i prosjektkunnskap
- `semantic_search` — KG-basert konsept-søk
- `kg_query` — Knowledge graph oppslag
- `kg_add` / `kg_batch` — Lagre fakta
- `write_diary` — Logg oppgaver
- `recent_context` — Se hva som ble gjort i forrige sesjon
