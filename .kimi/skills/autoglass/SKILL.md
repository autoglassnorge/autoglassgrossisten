---
name: autoglass
version: 1.0.0
description: Autoglass AS B2B bilglass-grossist — prosjektkunnskap, stack, regler, og verktøy.
author: Autoglass AS
tags: [autoglass, bilglass, b2b, cloudflare, worker, scraper]
---

# Autoglass AS — Prosjektkunnskap

## Stack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | Statisk HTML/CSS/JS (7 sider, trespråklig: no/en/ru) |
| Backend | Cloudflare Worker (TypeScript, strict mode) |
| Lagring | Cloudflare KV (katalog-metadata), D1 (SQLite) |
| Deploy | Cloudflare Worker + Pages, GitHub Actions |
| Datakilder | SVV Enkeltoppslag, Biluppgifter TecDoc, Bovsoft REGNUM, Pilkington, Glavista, Euroglass.ru, Autoglass.ru, Nord Glass |
| Node | v20 |

## D1-tabeller

- `glass_catalog` — 39,458 produkter med eurocode, brand, ktype, pris
- `ktype_matches` — regnr-prefix → kType mapping
- `glass_rules` — brand:model:year → kType regler
- `search_results` — VIN-prefix → equipment (statistisk læring)
- `vin_decode_cache` — VIN-dekode cache
- `provider_calls` — API-kall logging

## Matching-lag

```
Layer 0: kType exact match (best)
Layer 1: brand + model + year + equipment scoring
Layer 2: brand + model + year (uten equipment)
Layer 3: brand + model + year-range
Layer 4: brand + model (fallback)
```

## Kritiske regler

1. **ALDRI** hardkod API-nøkler — bruk `wrangler secret put`
2. Scraper: maks 10 parallelle requests, 10s timeout, 2s delay mellom batches
3. Alle produkter MÅ ha `eurocode` + `brand`
4. **ALDRI** deploy uten smoke-test
5. Ingen `any` i TypeScript
6. Ingen `console.log` i produksjon
7. CORS: Kun `auto-glass.no` og `autoglass-frontend.pages.dev`

## KIMI CLI aliases

| Alias | Agent | Domene |
|-------|-------|--------|
| `kimi glass-data` | data-agent | Scraper, katalog, merge |
| `kimi glass-worker` | worker-agent | Worker, API, KV, deploy |
| `kimi glass-web` | web-agent | Frontend, SEO, i18n |
| `kimi glass-ops` | ops-agent | CI/CD, secrets, monitor |
| `kimi glass-arch` | architect-agent | ADR, refaktorering, plan |
| `kimi glass-ktype` | ktype-agent | Bovsoft, SVV, matching |

## Viktige filer

- `api/cf-worker/src/index.ts` — Hoved-Worker
- `api/cf-worker/wrangler.toml` — Worker-konfig
- `data/catalog-prod.json` — Produksjonskatalog
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
