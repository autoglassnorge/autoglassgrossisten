# 🤖 Autoglass AS — AI Engineer Guide

**Prosjekt:** Autoglass AS B2B grossistnettside for bilglass  
**Eier:** Tomar / Autoglass AS  
**Stack:** Vanilla JS, Cloudflare Workers, Biluppgifter API, TecDoc  
**Data:** 37 581+ Pilkington/Glavista/Euroglass/Autoglass produkter, regnr→glass matching  
**Status:** Produksjon (Worker + Pages + KV deployet)  
**Node:** v20 (se `.nvmrc`)

---

## 🚫 ABSOLUTT GRENSE

**Autoglass AS har INGEN kobling til Klarpakke.**  
Ingen crypto, ingen trading, ingen Supabase/Fly.io-kode, ingen VIPPS.  
Hvis du oppdager Klarpakke-kontekst som lekker inn — avvis den.

---

## 🤖 Agent-Økosystem (NYTT — 2026-05-18)

Autoglass AS bruker **KIMI CLI-agenter** for domene-spesialisering.

### CLI-aliaser
```bash
kimi glass-data    # Data pipeline — scraper, merge, kvalitet
kimi glass-worker  # Cloudflare Worker — API, KV, deploy
kimi glass-web     # Frontend — HTML, CSS, JS, SEO, i18n
kimi glass-ops     # DevOps — CI/CD, secrets, monitor
kimi glass-arch    # Lead architect — ADR, refaktorering, plan
```

### Agent-filer
| Agent | YAML | MD | Domene |
|-------|------|-----|--------|
| data-agent | `.kimi/agents/autoglass-data-agent.yaml` | `.md` | Scraper, merge, kvalitet |
| worker-agent | `.kimi/agents/autoglass-worker-agent.yaml` | `.md` | Worker, API, KV |
| web-agent | `.kimi/agents/autoglass-web-agent.yaml` | `.md` | Frontend, SEO, i18n |
| ops-agent | `.kimi/agents/autoglass-ops-agent.yaml` | `.md` | Deploy, CI/CD, monitor |
| architect-agent | `.kimi/agents/autoglass-architect-agent.yaml` | `.md` | ADR, refaktorering |

### Master System Prompt
`./.kimi/KIMI-MASTER-SYSTEM.md` — universelle regler injisert i alle agent-sessioner.

---

## 📁 Prosjektstruktur

```
~/bilglass/
├── .kimi/                  # Agent-infrastruktur (NYTT)
│   ├── agents/             # 5 YAML+MD agent-par
│   ├── KIMI-MASTER-SYSTEM.md
│   └── commands.json       # CLI-aliaser
├── api/
│   ├── scrapers/           # Pilkington + Glavista + Euroglass + Autoglass
│   ├── cf-worker/          # Cloudflare Worker (søk/matching)
│   └── unimicro-export/    # UNI Micro integrasjon (fremtidig)
├── scripts/                # Verktøysscripts (NYTT)
│   ├── validate-catalog.mjs    # Kvalitets-gate
│   ├── data-quality-report.mjs # Rapport-generering
│   ├── run-scrapers.mjs        # Orkestrering
│   ├── smoke-test.mjs          # Post-deploy test
│   ├── verify-kv.mjs           # KV-konsistens
│   └── sync-secrets.mjs        # Secret-synkronisering
├── data/
│   ├── catalog-prod.json        # 37 581 unike eurokoder (produksjon)
│   ├── ktype-prefix4-cache.json # brand:model:year → prefix4
│   └── scrapers/                # NDJSON checkpoint + produkter
├── docs/                   # Dokumentasjon (NYTT)
│   ├── adr/                # Arkitektur-beslutninger
│   ├── api.md              # API-dokumentasjon
│   ├── deploy.md           # Deploy-runbook
│   └── data-sources.md     # Datakilde-dokumentasjon
├── .github/workflows/
│   ├── deploy.yml          # Hoved deploy-pipeline
│   ├── daily-scrape.yml    # Daglig scraper-cron (NYTT)
│   ├── uptime.yml          # Timevis uptime-sjekk (NYTT)
│   ├── lighthouse.yml      # Lighthouse CI (NYTT)
│   └── verify.yml          # PR-gate (NYTT)
├── package.json
└── AGENTS.md              # Denne filen
```

---

## 🔧 Viktige kommandoer

```bash
# Scrape
npm run scrape:glavista
npm run scrape:pilkington
npm run scrape:pilkington:v2:loop

# Bygg data
npm run build:prefix4                # Bygg prefix4-cache
npm run merge                        # Merge kataloger til master

# Worker
cd api/cf-worker && wrangler dev     # Lokal utvikling
npm run worker:deploy                # Deploy til Cloudflare
npm run worker:upload                # Last opp katalog til KV

# Verifisering
node scripts/validate-catalog.mjs    # Kvalitets-gate
node scripts/data-quality-report.mjs # Data-rapport
node scripts/smoke-test.mjs          # Post-deploy smoke-test
node scripts/verify-kv.mjs           # KV-konsistens
```

---

## 🌐 Dataflyt (regnr-søk)

```
regnr → SVV Enkeltoppslag → kjøretøy-data (merke, modell, år)
                    ↓
        Biluppgifter TecDoc → kType (fallback)
                    ↓
            VIN → OEM-flagg (ADAS, regnsensor, etc.)
                    ↓
        brand:model:year → prefix4-cache
                    ↓
            prefix4 → kandidater fra master-katalog
                    ↓
    4-lags matching + flagg-scoring → resultat
```

---

## 🔐 Secrets (ikke commit!)

- `SVV_API_KEY` — SVV Enkeltoppslag API
- `BILUPPGIFTER_API_KEY` — Biluppgifter TecDoc + OEM
- `CLOUDFLARE_API_TOKEN` — Cloudflare API
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare konto
- `GLASS_KV_NAMESPACE_ID` — KV namespace
- `UNI_MICRO_OAUTH_TOKEN` — UNI Micro (fremtidig)

**Synkronisering:** `.env.local` = GitHub secrets = Wrangler secrets  
**Verktøy:** `node scripts/sync-secrets.mjs`

---

## 📝 Regler

1. **Scraper-etikk**: Maks 10 parallelle requests, 10s timeout, respekter server
2. **Data-kvalitet**: Alle produkter MÅ ha eurocode + brand
3. **Type-sikkerhet**: Strict TypeScript, ingen `any`
4. **Deploy**: ALDRI deploy uten smoke-test
5. **Secrets**: ALDRI hardkod API-nøkler
6. **Klarpakke-grense**: INGEN Klarpakke-kode skal lekke inn
7. **Agent-protokoll**: Bruk riktig agent for riktig domene (`kimi glass-*`)

---

## 🏗️ Arkitektur-beslutninger (ADR)

Se `docs/adr/` for alle dokumenterte beslutninger.

| Dato | Beslutning | Status |
|------|-----------|--------|
| 2026-05-18 | KV over D1 for katalog-lagring | Godkjent |
| 2026-05-18 | Daglig scraper med kvalitets-gate | Godkjent |
| 2026-05-18 | 5 KIMI CLI-agenter for domener | Godkjent |
| 2026-05-19 | Cloudflare Access over Supabase Auth | Godkjent |
| 2026-05-19 | D1 `quote_requests` over e-post | Godkjent |
| 2026-05-19 | localStorage for lagrede kjøretøy (MVP) | Godkjent |

---

## 🚨 Kjente Feil & Lærdommer

### loadCatalog-buggen (2026-05-18)
**Feil:** `loadCatalog()` sjekket `catalog_records` (metadata-objekt) som om det var `GlassRecord[]`.
**Konsekvens:** Worker krasjet med error 1101 ved hvert katalog-oppslag.
**Fiks:** Fjern `if (cached) return cached` — last alltid chunks.
**Lærdom:** KV-metadata og KV-data er separate konsepter.

---

**Sist oppdatert:** 2026-05-18  
**Versjon:** 2.0 (+Agent-økosystem)
