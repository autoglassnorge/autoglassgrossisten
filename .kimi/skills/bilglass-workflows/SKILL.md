---
name: bilglass-workflows
description: Bilglass AS — operasjonelle workflows. Deploy, test, og pricing-prosesser for Cloudflare-plattformen.
has-sub-skill: true
---

# Bilglass Workflows

Container skill for alle operasjonelle workflows i Bilglass AS-prosjektet.

## When to Use

- Du skal **deploye** til Cloudflare (Pages, D1, KV, Worker)
- Du skal **teste** plattformen (data-kvalitet, API, smoke-test)
- Du skal **oppdatere priser** fra leverandører

## Sub-skills

| Skill | Kommando | Formål |
|---|---|---|
| `deploy` | `/bilglass-workflows/deploy` | Deploy med pre-flight, migration, smoke-test |
| `test` | `/bilglass-workflows/test` | Kjør 4-lags test-suite |
| `pricing` | `/bilglass-workflows/pricing` | Oppdater prisdatabase med dry-run |

> **Tips:** Skriv `/bilglass-workflows` i KIMI CLI for å se alle tilgjengelige workflows.

## Don'ts

- **ALDRI** deploy uten smoke-test
- **ALDRI** oppdater priser uten dry-run
- **ALDRI** ignorer testfeil før deploy
