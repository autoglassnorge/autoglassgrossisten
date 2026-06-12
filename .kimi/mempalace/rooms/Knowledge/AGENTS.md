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

### KIMI Code 0.14.2 (oppdatert 2026-06-12)

Prosjektet er optimalisert for **KIMI Code 0.14.2** med følgende nye features:

| Feature | Hva det gjør | Konfigurasjon |
|---|---|---|
| **Sub-skill discovery** | Hierarkisk skill-gruppering med `has-sub-skill: true` | `KIMI_CODE_EXPERIMENTAL_SUB_SKILL=true` |
| **Built-in skills som slash commands** | Skills vises som `/skill-name` kommandoer — nå også som dotted slash commands | Automatisk — aktivert i 0.14.2 |
| **Sampling-parametere** | `temperature` og `top_p` for modell-kontroll | `[model]` seksjon i `config.toml` |
| **Fast subagent timeout** | 30-min timeout for subagents | `agent_task_timeout_s = 900` (overstyrt fra 1800s) |
| **No auto-update** | Deaktiverer auto-update sjekk | `KIMI_CODE_NO_AUTO_UPDATE` env var |
| **Bedre session resume** | Raskere og mer pålitelig gjenopptakelse av lange sesjoner | Innebygd i 0.14.2 |
| **Bedre stdout/stderr-streaming** | Sanntids output fra Bash-verktøy | Innebygd i 0.14.2 |
| **Mer stabil config-håndtering** | Færre config-parsing feil | Innebygd i 0.14.2 |

**Standardmodell:** [Kimi K2.7 Code](https://docs.moonshot.cn/kimi-code/models) — Kimis sterkeste coding-modell. 256K context, bedre long-context instruksjonsfølge, **kun thinking mode** (non-thinking støttes ikke).

**Viktige env vars for 0.14.2:**
```bash
export KIMI_CODE_EXPERIMENTAL_SUB_SKILL=true  # Aktiver sub-skill discovery
export KIMI_MODEL_TEMPERATURE=0.6              # Lavere = mer deterministisk (valgfritt)
export KIMI_MODEL_TOP_P=0.95                   # Nucleus sampling (valgfritt)
export KIMI_MODEL_THINKING_KEEP=true           # Preserved-thinking passthrough (valgfritt)
export KIMI_CODE_NO_AUTO_UPDATE=true           # Deaktiver auto-update (valgfritt)
```

> **Merk:** Gamle `kimi-cli` fases gradvis ned. KIMI Code CLI (`kimi-code` / `kimi`) er den nye retningen. Se [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code).

---

### Token-sparing (0.14.2)

Disse innstillingene er justert for å redusere token-forbruk uten å svekke kvalitet:

| Komponent | Innstilling | Fra | Til | Begrunnelse |
|---|---|---|---|---|
| `config.toml` | `read_max_bytes` | 50000 | 35000 | Bakgrunns-output fra scrapere sjelden trenger >35KB |
| `config.toml` | `notification_tail_chars` | 5000 | 3000 | 3000 chars dekker feilmeldinger/sammendrag |
| `mcp-server.mjs` | `fileWatcherDebounceMs` | 2000ms | 3000ms | Færre unødvendige reindexeringer |
| `mcp-server.mjs` | `maxToolOutputChars` | 75000 | 20000 | Fast grense, oppdatert for 256K K2.7 context |
| `mcp-server.mjs` | `maxResultChars` | 2500 | 600 | Fokus på mest relevante snippets |
| `mcp-server.mjs` | `cacheSize` | 500 | 100 | Tilstrekkelig for Bilglass-prosjektet |

**Prinsipp:** Spar tokens på output-grenser og unødvendige reindexeringer, ikke på system-prompts eller thinking-output.

### CLI-aliaser
```bash
kimi glass-data        # Data pipeline — scraper, merge, kvalitet
kimi glass-worker      # Cloudflare Worker — API, KV, deploy
kimi glass-web         # Frontend — HTML, CSS, JS, SEO, i18n
kimi glass-ops         # DevOps — CI/CD, secrets, monitor
kimi glass-arch        # Lead architect — ADR, refaktorering, plan
kimi glass-ktype       # kType specialist — Bovsoft, SVV, statistisk læring
kimi glass-orchestrator # Orchestrator — task-routing, Superpowers, verifikasjon (start ALLTID her)
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
| **orchestrator-agent** | `.kimi/agents/autoglass-orchestrator.yaml` | `.md` | **Task-routing, Superpowers-prosess, verifikasjon** |

### Custom Slash-Skills (0.14.2 — `/skill-name` og dotted slash-kommandoer)

**Hierarkisk struktur** (`has-sub-skill: true`):

```
.kimi/skills/
├── autoglass/                      # Standalone: prosjektkunnskap
│   └── SKILL.md
└── bilglass-workflows/             # Parent (has-sub-skill: true)
    ├── SKILL.md                    # Container — liste alle workflows
    ├── deploy/                     # Child
    │   └── SKILL.md                # Deploy: D1 + KV + Worker + Pages
    ├── test/                       # Child
    │   └── SKILL.md                # Test: data + API + smoke + kType
    └── pricing/                    # Child
        └── SKILL.md                # Pricing: scrape + sync + valider
```

| Skill | Slash-kommando | Hva det gjør |
|---|---|---|
| `bilglass-workflows` | `/bilglass-workflows` | Liste alle tilgjengelige workflows |
| `deploy` | `/bilglass-workflows/deploy` | Deploy til Cloudflare med smoke-test |
| `test` | `/bilglass-workflows/test` | Kjør full test-suite |
| `pricing` | `/bilglass-workflows/pricing` | Oppdater prisdatabase |
| `autoglass` | `/autoglass` | Prosjektkunnskap, stack, regler |

> **Bruk:** Skriv `/bilglass-workflows/deploy` i KIMI CLI for å aktivere deploy-skillen. Sub-skill discovery (med `KIMI_CODE_EXPERIMENTAL_SUB_SKILL=true`) gjør at child-skills automatisk listes under parent.

### Master System Prompt
`./.kimi/KIMI-MASTER-SYSTEM.md` — universelle regler injisert i alle agent-sessioner.

### MemPalace v3.5.0 (isolert fra Klarpakke)
`./.kimi/mempalace/mcp-server.mjs` — prosjekt-spesifikk kunnskapshåndtering.
- **KG:** `search`, `kg_query`, `kg_add`, `kg_batch` for prosjektkunnskap
- **Diary:** `write_diary`, `read_diary` for session-logging
- **Skills:** `.kimi/skills/autoglass/SKILL.md` — prosjektkunnskap for KIMI CLI v1.39.0+ discovery
- **Isolasjon:** Ingen avhengighet til Klarpakke — all data ligger i `~/bilglass/.kimi/mempalace/`
- **Output cap:** ~75K tegn per tool-resultat (KIMI CLI v1.32.0+ 100K cap kompatibel)

### MCP-verktøy (Autoglass — selvstendige)
`./.kimi/mcp/autoglass-mcp.mjs` — prosjekt-spesifikke verktøy for agentene.
| Verktøy | Hva det gjør |
|---|---|
| `deploy_status` | Sjekk Worker, KV, D1, Pages status |
| `run_smoke_test` | Kjør smoke-test suite |
| `catalog_quality` | Valider catalog-prod.json mot kvalitets-gate |
| `ktype_coverage` | Rapporter kType-dekning fra D1 |
| `search_ground_truth` | Test regnr mot alle matching-lag |
| `price_sync_status` | Siste pris-synkronisering |

**MCP-servere (alle selvstendige, ingen Klarpakke):**
- `mempalace` — prosjektkunnskap
- `perplexity` — AI-research
- `filesystem` — filoperasjoner
- `github` — repo/PR/issues
- `autoglass` — prosjekt-spesifikke verktøy

### Prosjekt-config & Hooks v2.0
`./.kimi/config.toml` — prosjekt-spesifikk KIMI-konfigurasjon.

**Session-start (`./.kimi/hooks/session-start.sh`):**
- Aktive blockers fra PROJECT_STATE.md
- Siste session-summary
- D1 lokale metrikker (glass_catalog, ktype_registry, etc.)
- Katalog-status (størrelse, sist endret)
- Åpne PRs (hvis gh CLI er tilgjengelig)

**Session-end (`./.kimi/hooks/session-end.sh`):**
- Git diff + session summary
- **Auto-smoke-test** hvis Worker-filer ble endret
- **Auto-kvalitets-gate** hvis data-filer ble endret
- **Auto-diary** via MemPalace
- Oppsummering av verifikasjons-resultater

### Superpowers Skill-auto-activation
| Oppgavetype | Auto-aktiver |
|---|---|
| Bug, crash, feil | `systematic-debugging` |
| Før deploy, "ferdig" | `verification-before-completion` |
| Feature >3 filer | `writing-plans` + `subagent-driven-development` |
| >1 uavhengig oppgave | `dispatching-parallel-agents` |
| Ny kode, bugfix | `test-driven-development` |
| Klar for merge | `finishing-a-development-branch` |
| Uklare krav | `brainstorming` |

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
│   ├── catalog-prod.json        # 27 184 records, 99.8% med eurocode (produksjon)
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

# Eurocode-pipeline (autoglass-by-eurocode.json → catalog-prod.json → D1)
npm run catalog:enrich:eurocode      # Fyll manglende eurocodes fra autoglass-by-eurocode.json
npm run catalog:sync:d1              # Sync beriket catalog til lokal D1
npm run catalog:sync:d1:sql          # Generer SQL-filer for remote D1 deploy
npm run eurocode:pipeline            # Full pipeline (enrich + sync)

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

### Eurocode Pipeline (2026-06-04)
**Problem:** Kun 42.5% av 27,184 produkter i `catalog-prod.json` hadde eurocode. 57.7% (15,603) manglet.
**Rotårsak:** Autodoc scraping blokkert av Cloudflare. TecDoc-dump mangler article→kType linkages.
**Løsning:** `data/autoglass-by-eurocode.json` (20,504 entries fra auto-glass.no) innholdt beriket data med eurocodes, properties, typeCodeDesc. `scripts/merge-eurocode-enrichment.mjs` matcher 98.7% på article_number og fyller 15,585 manglende eurocodes.
**Resultat:** 99.83% eurocode-dekning (27,139 av 27,184). 26,846 records beriket med properties (ADAS, regnsensor, HUD, etc.).
**D1 Sync:** `scripts/sync-catalog-to-d1.mjs` syncer 27,139 records til D1 i 55 chunks. Schema oppdatert med `type_description` og `properties` kolonner. UNIQUE constraint fjernet fra `eurocode` (samme eurocode dekker flere kjøretøy).
**Kommandoer:** `npm run eurocode:pipeline` (enrich + D1 sync).
**Lærdom:** auto-glass.no er den primære eurocode-kilden — ikke Autodoc/TecDoc. Berik data derfra først.

---

**Sist oppdatert:** 2026-06-12  
**Versjon:** 3.4 (+KIMI + MemPalace token-optimalisering)
