---
name: ordremottaker
description: Autoglass AS — Ordremottaker LLM workflow. Konfigurasjon, testing, og deploy av conversational AI for automatisk ordremottak.
---

# Ordremottaker LLM Workflow

## When to Use

- Du skal **teste** Ordremottaker LLM-pipeline
- Du skal **endre** NER, dialog, eller matching-logikk
- Du skal **deploye** Ordremottaker-endepunkt til Worker
- Du skal **debugge** equipment-dialog eller year-korrigering

## Pipeline

```
Kundeinput → NER (make/model/year/regnr/VIN) → Glass-oppslag (Layer 0→0.6)
  → Equipment-verifisering (dialog) → Tilbehør → Pris → Ordre
```

## Konfigurasjon

| Parameter | Verdi | Fil |
|---|---|---|
| Konverteringsrate-mål | >60% | `AGENTS.md` |
| Nøyaktighet-mål | >95% | `AGENTS.md` |
| Maks turer | <4 | `AGENTS.md` |
| Equipment-threshold | 0.6 Jaccard | `ktype-family-matcher.ts` |

## Testing

```bash
# Test NER + equipment-dialog
npm run test:ordremottaker

# Test kType Family matching
npm run test:ktype-family

# End-to-end test med sample inputs
node scripts/test-ordremottaker.mjs
```

## Deploy

```bash
# Deploy bare Ordremottaker-endepunkt
cd api/cf-worker && wrangler deploy

# Full deploy (Worker + D1 + KV)
npm run deploy:full
```

## Don'ts

- **ALDRI** endre equipment-dialog uten å teste med 10+ sample inputs
- **ALDRI** senke Jaccard-threshold under 0.5 uten Tomars godkjenning
- **ALDRI** deploy uten smoke-test av Ordremottaker-endepunkt
