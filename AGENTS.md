# 🤖 Autoglass AS — AI Engineer Guide

**Prosjekt:** Autoglass AS B2B grossistnettside for bilglass  
**Eier:** Tomar / Autoglass AS  
**Stack:** Vanilla JS, Cloudflare Workers, Biluppgifter API, TecDoc  
**Data:** 37 581+ Pilkington/Glavista/Euroglass/Autoglass produkter, regnr→glass matching  
**Status:** Produksjon (Worker + Pages + KV deployet)  
**Node:** v22 (se `.nvmrc`)

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
kimi glass-ktype   # kType specialist — Bovsoft, SVV, statistisk læring
```

### Agent-filer
| Agent | YAML | MD | Domene |
|-------|------|-----|--------|
| data-agent | `.kimi/agents/autoglass-data-agent.yaml` | `.md` | Scraper, merge, kvalitet |
| worker-agent | `.kimi/agents/autoglass-worker-agent.yaml` | `.md` | Worker, API, KV |
| web-agent | `.kimi/agents/autoglass-web-agent.yaml` | `.md` | Frontend, SEO, i18n |
| ops-agent | `.kimi/agents/autoglass-ops-agent.yaml` | `.md` | Deploy, CI/CD, monitor |
| architect-agent | `.kimi/agents/autoglass-architect-agent.yaml` | `.md` | ADR, refaktorering |
| ktype-agent | `.kimi/agents/autoglass-ktype-agent.yaml` | `.md` | Bovsoft, SVV, kType |

### Master System Prompt
`./.kimi/KIMI-MASTER-SYSTEM.md` — universelle regler injisert i alle agent-sessioner.

### MemPalace v3.5.0 (isolert fra Klarpakke)
`./.kimi/mempalace/mcp-server.mjs` — prosjekt-spesifikk kunnskapshåndtering.
- **KG:** `search`, `kg_query`, `kg_add`, `kg_batch` for prosjektkunnskap
- **Diary:** `write_diary`, `read_diary` for session-logging
- **Skills:** `.kimi/skills/autoglass/SKILL.md` — prosjektkunnskap for KIMI CLI v1.39.0+ discovery
- **Isolasjon:** Ingen avhengighet til Klarpakke — all data ligger i `~/bilglass/.kimi/mempalace/`
- **Output cap:** ~75K tegn per tool-resultat (KIMI CLI v1.32.0+ 100K cap kompatibel)

### Prosjekt-config & Hooks
`./.kimi/config.toml` — prosjekt-spesifikk KIMI-konfigurasjon.
`./.kimi/hooks/session-start.sh` — leser blockers ved session-start.
`./.kimi/hooks/session-end.sh` — git-diff + session-summary ved session-slutt.

---

## 📁 Prosjektstruktur

```
~/bilglass/
├── .kimi/                  # Agent-infrastruktur + MemPalace
│   ├── agents/             # 6 YAML+MD agent-par (inkl. ktype)
│   ├── mempalace/          # Isolert MemPalace MCP
│   │   ├── mcp-server.mjs  # Zero-dep MCP-server (v3.5.0)
│   │   ├── kg.json         # Knowledge graph
│   │   └── data/           # Index cache + diary
│   ├── skills/             # KIMI CLI v1.39.0+ skill discovery
│   │   └── autoglass/      # Prosjektkunnskap-skill
│   ├── hooks/              # Session start/end
│   ├── mcp.json            # Prosjekt-spesifikk MCP-config
│   ├── config.toml         # Prosjekt-spesifikk KIMI-config
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
│   ├── csc-parsed/
│   │   └── finn-search-queries.json  # 503 søke-spørringer (Hella Gutmann)
│   ├── finn-no-regnr/           # Scraper-output (Finn.no annonser)
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
npm run scrape:finn-targeted       # Målrettet Finn.no scraper (Hella Gutmann)
npm run scrape:finn-targeted:test  # Test-modus (10 spørringer)

# kType-pipeline
npm run verify:bovsoft             # Verifiser regnr mot Bovsoft API
npm run generate:ktype-inserts     # Generer D1 SQL inserts
node scripts/bootstrap-bovsoft-v2.mjs  # Forbedret Bovsoft bootstrap

# Pris-oppdatering
npm run price:check                  # Dry-run pris-sjekk
npm run price:update                 # Oppdater priser fra auto-glass.no
npm run price:update:full            # Full scraping (alle kategorier)
npm run price:login                  # Forny cookies for scraping
npm run price:sync                   # Synkroniser CSV-priser til catalog
npm run price:pipeline               # Full pipeline (scrape + sync)

# Bygg data
npm run build:prefix4                # Bygg prefix4-cache
npm run merge                        # Merge kataloger til master

# Worker
cd api/cf-worker && wrangler dev     # Lokal utvikling
npm run worker:deploy                # Deploy til Cloudflare
npm run worker:upload                # Last opp katalog til KV

# Full deploy (D1 schema + TecDoc data + Worker)
node scripts/deploy-full.mjs         # One-shot full deploy
source scripts/wrangler-with-env.sh  # Load API token from .env.local

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
        ground_truth (Layer -1) ← verifiserte mappings
                    ↓
        kType exact match (Layer 0) ← Bovsoft / glass_rules
                    ↓
        TecDoc fallback (Layer 0.5) ← collision-gated (412 kTypes)
                    ↓
        brand:model:year (Layer 1-3) ← prefix4 + fuzzy scoring
                    ↓
    4-lags matching + flagg-scoring → resultat
```

### kType-pipeline

```
Finn.no → Bovsoft → ktype_registry → Worker API → Frontend
```

- **Finn.no:** Målrettet scraping av Hella Gutmann-annonser (`scrape:finn-targeted`)
- **Bovsoft:** Regnr-verifisering og kType-oppslag (`verify:bovsoft`)
- **ktype_registry:** D1-tabell for kType → kjøretøy-mapping
- **Worker API:** Oppslag mot `ktype_registry` før prefix4-fallback
- **Frontend:** viser kType-spesifikk matching der tilgjengelig

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
| 2026-05-21 | Daglig pris-sjekk fra auto-glass.no | Godkjent |
| 2026-05-24 | Bovsoft kType-bootstrap over prefix4-matching | Godkjent |

---

## 🚨 Kjente Feil & Lærdommer

### kType Bootstrap (2026-05-24)
**Løsning:** Bovsoft API (`getktypefornumplatenorway`) med series-basert regnr-oppslag.
**Resultat:** 132 unike ktyper oppdaget fra 153 norske regnr. 67 ktyper med 1,537 mappings i D1.
**Dekning:** 498 produkter (1.26%) med direkte ktype i `glass_catalog`. 26 merker representert.
**Verktøy:** `scripts/discover-regnr-by-series.mjs` + `scripts/process-discovered-regnr.mjs`.
**Lærdom:** Prefix4-matching er for grov — mange ktyper matcher samme eurocode. Dedupe-script (hit_count-ratio > 0.5) nødvendig.

### loadCatalog-buggen (2026-05-18)
**Feil:** `loadCatalog()` sjekket `catalog_records` (metadata-objekt) som om det var `GlassRecord[]`.
**Konsekvens:** Worker krasjet med error 1101 ved hvert katalog-oppslag.
**Fiks:** Fjern `if (cached) return cached` — last alltid chunks.
**Lærdom:** KV-metadata og KV-data er separate konsepter.

### Pris-synkronisering (2026-05-21)
**Løsning:** Daglig sample (200 kategorier) + ukentlig full scrape fra auto-glass.no.
**Threshold:** >1% endringsrate → trigger full scrape.
**Auth:** Cookie-basert (Playwright login ved utløp).
**Sync:** `scripts/sync-prices-to-catalog.mjs` oppdaterer `catalog-prod.json`.

---

**Sist oppdatert:** 2026-05-27  
**Versjon:** 2.4 (+Finn.no/Bovsoft kType-pipeline)
