# 🤖 Autoglass AS — AI Engineer Guide

**Prosjekt:** Autoglass AS B2B grossistnettside for bilglass  
**Eier:** Tomar / Autoglass AS  
**Stack:** Vanilla JS, Cloudflare Workers, Biluppgifter API, TecDoc  
**Data:** 27,184 Pilkington/Glavista/Euroglass/Autoglass produkter, regnr→glass matching  
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

### KIMI Code 0.11.0 (oppdatert 2026-06-05)

Prosjektet er optimalisert for **KIMI Code 0.11.0** med følgende nye features:

| Feature | Hva det gjør | Konfigurasjon |
|---|---|---|
| **Sub-skill discovery** | Hierarkisk skill-gruppering med `has-sub-skill: true` | `KIMI_CODE_EXPERIMENTAL_SUB_SKILL=true` |
| **Built-in skills som slash commands** | Skills vises som `/skill-name` kommandoer | Automatisk — aktivert i 0.11.0 |
| **Sampling-parametere** | `temperature` og `top_p` for modell-kontroll | `[model]` seksjon i `config.toml` |
| **Fast subagent timeout** | 30-min timeout for subagents | `agent_task_timeout_s = 900` (overstyrt fra 1800s) |
| **No auto-update** | Deaktiverer auto-update sjekk | `KIMI_CODE_NO_AUTO_UPDATE` env var |

**Viktige env vars for 0.11.0:**
```bash
export KIMI_CODE_EXPERIMENTAL_SUB_SKILL=true  # Aktiver sub-skill discovery
export KIMI_MODEL_TEMPERATURE=0.6              # Lavere = mer deterministisk (valgfritt)
export KIMI_MODEL_TOP_P=0.95                   # Nucleus sampling (valgfritt)
export KIMI_MODEL_THINKING_KEEP=true           # Preserved-thinking passthrough (valgfritt)
export KIMI_CODE_NO_AUTO_UPDATE=true           # Deaktiver auto-update (valgfritt)
```

### CLI-aliaser
```bash
kimi glass-data        # Data pipeline — scraper, merge, kvalitet
kimi glass-worker      # Cloudflare Worker — API, KV, deploy
kimi glass-web         # Frontend — HTML, CSS, JS, SEO, i18n
kimi glass-ops         # DevOps — CI/CD, secrets, monitor
kimi glass-arch        # Lead architect — ADR, refaktorering, plan
kimi glass-ktype       # kType specialist — Bovsoft, SVV, statistisk læring
kimi glass-ordre       # Ordremottaker LLM — conversational AI, automatisert bestilling
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
| **ordremottaker-agent** | `.kimi/agents/autoglass-ordremottaker-agent.yaml` | `.md` | **Conversational AI, automatisert ordremottak** |
| **orchestrator-agent** | `.kimi/agents/autoglass-orchestrator.yaml` | `.md` | **Task-routing, Superpowers-prosess, verifikasjon** |

### Custom Slash-Skills (0.11.0 — `/skill-name` kommandoer)

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

**Hvorfor MemPalace er verdt det:**

| Uten MemPalace | Med MemPalace |
|---|---|
| KIMI husker ingenting på tvers av sesjoner | KG + Diary gir persistens |
| Agent må lese 10+ filer for å forstå kontekst | `search` finner relevant kontekst på <100ms |
| Samme feil gjentas | Diary viser hva som ble prøvd før |
| Ingen sporbarhet | KG lagrer arkitektur-beslutninger med tidsstempel |

**Token-matematikk:**
- **KIMI CLI uten MemPalace:** Hver sesjon starter fra null → agent må lese AGENTS.md + PROJECT_STATE.md + kritiske filer = ~15-25K tokens
- **KIMI CLI med MemPalace:** `search("deploy pipeline")` → 5 treff à 600 tegn = ~3K tokens. **Sparing: 80% færre tokens per sesjonstart**

**MemPalace-optimaliseringer (2026-06-05):**

| Parameter | Før | Etter | Effekt |
|---|---|---|---|
| `maxToolOutputChars` | 75000 | **20000** | ~55K tokens spart per query |
| `maxResultChars` | 2500 | **600** | ~19K tokens spart (limit=5) |
| `cacheSize` | 500 | **100** | Mindre minnebruk |
| Default `limit` | 10 | **5** | Halverer antall treff |
| `rooms/` | 0 filer | **30 filer** | Søkbar indeks av prosjektdokumentasjon |
| `diary.jsonl` | 11 entries | **16 entries** | Økt læring på tvers av sesjoner |

**Hvordan MemPalace gjør KIMI Code bedre:**

1. **Session Memory** — KIMI CLI har ikke nativ persistens. MemPalace lagrer hva som ble gjort, slik at neste agent vet at " deploy-pipeline ble endret til Wrangler OAuth den 29. mai" uten å måtte lete gjennom git-historikk.

2. **Ground Truth Tracking** — KG lagrer verifiserte facts: `deploy_pipeline → uses_tool → wrangler_cli_oauth`. Neste gang noen spør "hvordan deployer vi?" finner `kg_query` dette direkte.

3. **Error Pattern Recognition** — Diary viser at "SVV API feilet 3 ganger i mai, Bovsoft cache ble implementert som workaround". Nye agenter unngår å gjenta samme feil.

4. **Kontekst-effektivitet** — Med `search_ground_truth` kan agenten spørre "hva vet vi om kType-matching?" og få et sammendrag på 3K tokens i stedet for å lese 5 filer à 5K tokens.

5. **Architecture Decision Records** — KG-fakta med `validFrom` gir tidsreise. "Hvorfor bruker vi KV og ikke D1 for katalog?" → `kg_query("kv-vs-d1")` gir ADR med begrunnelse.

**Best Practices:**
- **FØR** >3 filer endres: `search` for relatert kontekst (sparer tokens)
- **ETTER** signifikante oppgaver: `write_diary` (bygger læring)
- **ETTER** arkitektur-endringer: `kg_add` eller `kg_batch` (dokumenter beslutninger)
- **Ved debugging:** `recent_context` for å se hva som ble gjort i forrige sesjon

**Verktøy:**
- `search` — TF-IDF + Bigram søk i prosjektkunnskap (bruk FØRST)
- `semantic_search` — KG-basert konsept-søk (når søkeord varierer)
- `kg_query` — Knowledge graph oppslag
- `kg_add` / `kg_batch` — Lagre fakta
- `write_diary` — Logg oppgaver
- `read_diary` — Se historikk
- `recent_context` — Se hva som ble gjort i forrige sesjon
- `get_status` — Server-metrikker og cap-warning

**Isolasjon:** Ingen avhengighet til Klarpakke — all data ligger i `~/bilglass/.kimi/mempalace/`

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
│   ├── deploy.yml              # Hoved deploy-pipeline (Wrangler action v3)
│   ├── deploy-mirror.yml       # WP mirror til Pages
│   ├── daily-scrape.yml        # Daglig scraper-cron
│   ├── daily-price-check.yml   # Daglig pris-sjekk
│   ├── uptime.yml              # Timevis uptime-sjekk
│   ├── verify.yml              # PR-gate
│   ├── bovsoft-kv-sync.yml     # Bovsoft → KV sync
│   ├── d1-migrate.yml          # D1 schema-migrasjon
│   ├── d1-nordglass-import.yml # Nordglass import til D1
│   ├── d1-position-migration.yml # Posisjon-migrasjon
│   ├── scrape-catalog.yml      # Katalog-scraping
│   ├── sync-d1-catalog.yml     # Catalog → D1 sync
│   └── tecdoc-import.yml       # TecDoc import
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
npm run scrape:finn-broad          # Bred Finn.no scraper (ALLE annonser)
npm run scrape:finn-broad:test     # Test-modus (3 sider)
npm run scrape:finn-broad:resume   # Gjenoppta avbrutt scraping

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

- **Finn.no (targeted):** Målrettet scraping av Hella Gutmann-annonser (`scrape:finn-targeted`)
- **Finn.no (broad):** Bred scraping av ALLE norske bilannonser for regnr (`scrape:finn-broad`)
- **Bovsoft:** Regnr-verifisering og kType-oppslag (`verify:bovsoft`)
- **ktype_registry:** D1-tabell for kType → kjøretøy-mapping
- **Worker API:** Oppslag mot `ktype_registry` før prefix4-fallback
- **Frontend:** viser kType-spesifikk matching der tilgjengelig

### kType Family Matching (NY — 2026-06-08)
Når eksakt kType-matching (Layer 0/0.5) ikke gir treff, brukes kType Family:
1. Bygg vehicle-fingerprint fra SVV/Bovsoft (make, model, year, bodyType, fuelType, etc.)
2. Sammenlign med `ktype_families.equipment_criteria` (JSON-array av equipment-features)
3. Jaccard-similarity scoring: |intersection| / |union|
4. Equipment-first weighting: kamera, regnsensor, HUD, etc. scorer høyere
5. Best match → slå opp `glass_catalog` via `ktype_family_members.eurocode`
6. Confidence: `high` (ikke `exact`)

**Resultat:** kType-dekning økt fra 4% til 24.4% (6x forbedring)
**D1-tabeller:** `ktype_families` (25,383), `ktype_family_members` (79,928)

---

## 🔐 Secrets (ikke commit!)

- `SVV_API_KEY` — SVV Enkeltoppslag API
- `BILUPPGIFTER_API_KEY` — Biluppgifter TecDoc + OEM
- `CLOUDFLARE_API_TOKEN` — Cloudflare API
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare konto
- `GLASS_KV_NAMESPACE_ID` — KV namespace
- `UNI_MICRO_OAUTH_TOKEN` — UNI Micro (fremtidig)

**Secret-håndtering (2026-06-05):**

| Miljø | Hvordan settes | Kommando |
|---|---|---|
| **Lokal utvikling** | `.env.local` | `source scripts/wrangler-with-env.sh` |
| **GitHub Actions** | `secrets.*` | Konfigurer i repo Settings → Secrets |
| **Wrangler/Worker** | **MANUELL** `wrangler secret put` | `wrangler secret put SVV_API_KEY --name autoglass-glass-sok` |

> ⚠️ **VIKTIG:** Deploy-pipeline (`deploy.yml`) setter **IKKE** secrets automatisk lenger. Secrets må settes manuelt én gang via `wrangler secret put`. Dette sparer 30-40 sekunder per deploy og unngår rate limiting fra Cloudflare API.

**Verktøy:** `node scripts/sync-secrets.mjs` (synkroniserer `.env.local` → Wrangler secrets, kjøres manuelt)

---

## 🎙️ Ordremottaker LLM-Agent (NY — 2026-06-04)

**Eier:** Tomar (30 års erfaring som ordremottaker)  
**Agent:** `kimi glass-ordre`  
**Fil:** `.kimi/agents/autoglass-ordremottaker-agent.yaml` + `.md`

### Visjon
En **conversational AI** som tar imot kundehenvendelser på naturlig språk — via telefon (transkribert), chat, e-post eller direkteinput — og automatisk finner riktig glass med færrest mulig klikk.

### Kundesitat agenten må forstå
- *"Jeg trenger en frontrute til en VW Transporter 2005"*
- *"Har dere glass til en Audi A4 med kamera i ruta?"*
- *"Jeg har knust sideruten på venstre side"*
- *"Hallooo, jeg har knust ruta på bilen min"*
- *"Jeg trenger det samme som sist"*

### Workflow
1. **NER + Intent** — LLM ekstraherer merke/modell/år/regnr/VIN/posisjon/utstyr
2. **Glass-oppslag** — regnr→SVV→kType→D1, VIN→decode→D1, eller fuzzy match
3. **Equipment-verifikasjon** — rule-based + LLM-dialog for usikkerhet
4. **Tilbehør + pris** — list, lim, kalibrering, montering, MVA
5. **Ordre** — handlekurv (B2C) eller UNI Micro (B2B, fremtidig)

### kType Family Integrasjon (2026-06-08)
Ordremottaker bruker nå kType Family matching som fallback:
- Når kunde sier "frontrute til VW Transporter 2005" uten regnr
- NER ekstraherer make+model+year
- Layer 0 (kType exact) prøves først
- Deretter kType Family (Layer 0.6) for equipment-verifisering
- Dialog-system spør utstyrsspørsmål basert på family-criteria
- Konverteringsrate: 60%+ mål, nøyaktighet: 95%+

### KPI-mål
| Metrikk | Mål |
|---------|-----|
| Konverteringsrate | >60% |
| Nøyaktighet | >95% |
| Gjennomsnittlig turer | <4 |
| Eskaleringsrate | <10% |
| Tid til tilbud | <10s |

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
| 2026-06-05 | Wrangler action + caching + manuell secret-håndtering | Godkjent |
| 2026-06-07 | TecDoc v16 full D1 synkronisering — catalog-prod.json → D1 med kType | Godkjent |
| 2026-06-08 | kType Family matching (Jaccard + equipment-first) | Godkjent |
| 2026-06-08 | Ordremottaker LLM integrert med kType Family | Godkjent |

---

## 🚨 Kjente Feil & Lærdommer

### kType Bootstrap (2026-05-24)
**Løsning:** Bovsoft API (`getktypefornumplatenorway`) med series-basert regnr-oppslag.
**Resultat:** 132 unike ktyper oppdaget fra 153 norske regnr. 67 ktyper med 1,537 mappings i D1.
**Dekning:** 498 produkter (1.26%) med direkte ktype i `glass_catalog`. 26 merker representert.
**Verktøy:** `scripts/discover-regnr-by-series.mjs` + `scripts/process-discovered-regnr.mjs`.
**Lærdom:** Prefix4-matching er for grov — mange ktyper matcher samme eurocode. Dedupe-script (hit_count-ratio > 0.5) nødvendig.

### TecDoc kType Deploy v16 (2026-06-07)
**Fase 1 — v16 SQL:** Deploy TecDoc 1Q2019 kType-mapping til D1 via genererte SQL-filer. ktype_registry (80,040 rader) og glass_rules (1,568 rader) allerede deployet. glass_catalog fikk 935 nye kType-mappinger (4.52% dekning). v16-SQL ble generert mot 33,215-produkt katalog, men D1 hadde bare 20,693 — lav treffrate.

**Fase 2 — Full D1 synkronisering:** Siden v16-SQL traff lite, ble `catalog-prod.json` (27,184 records, 1,099 med kType fra Bovsoft + TecDoc eurocode-mapping) brukt som master og synkronisert til D1. 45 records manglet eurocode og ble filtrert ut. Resultat: 27,139 records i D1, 1,099 med kType (4.05% dekning).
**Verktøy:** `scripts/sync-catalog-to-d1.mjs` genererer chunked SQL → kombinert til én 16MB fil. Viktig: fjern `COMMIT;` statements før D1-deploy (Wrangler D1 støtter ikke transaksjoner).
**Resultat:** Worker deployet (v0978a808), røyktest 6/6 OK. Andre tabeller intakte: ktype_registry (80,115), tecdoc_ktype_registry (908), glass_rules (1,667), ktype_matches (815).
**Lærdom:** Når SQL-generert mapping gir lav dekning, synkroniser master JSON-katalog til D1 direkte. Bruk catalog-prod.json som SSoT. D1 støtter ikke `COMMIT;` i SQL.

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

### kType Kilde-Evaluering (2026-06-07)
**Bakgrunn:** Bovsoft credits tømt (402-feil). Søkt etter alternative regnr→kType kilder.
**Testet kilder:**
| Kilde | Status | Pris | Konklusjon |
|---|---|---|---|
| Bovsoft v2 | Credits tømt, men 68 kTypes deployet | Pay-as-you-go | ✅ Beste hittil, avvent credit-reset |
| RapidAPI K-Type Finder | **Fjernet** fra RapidAPI (Autoways nedlagt 2026-05-21) | — | ❌ Utilgjengelig |
| Biluppgifter API | Nøkkel utløpt (`Invalid token`) | Abonnement | ❌ Krever fornyelse |
| Apify TecDoc Actor | $69/mnd + usage, parts-catalog | — | ⚠️ Ikke kType-lookup |
| TecAlliance IDP API | Offisiell TecDoc API, lansert mai 2026 | Lisens | ✅ **Anbefalt langsiktig** |
| Autodoc scraping | Blokkert av Cloudflare | — | ❌ Ikke viable |
| Finn.no (targeted) | ~25 timer for 503 queries | Gratis | ⚠️ For tregt, parkert |
| Finn.no (broad) | Uendelig sider, 1 req/sek | Gratis | ✅ Ny scraper: `scrape:finn-broad` |

**Resultat:** 68 nye kTypes fra Bovsoft v2 deployet til D1 `ktype_registry`. Total: 80,183 rader.
**Anbefaling:** Kontakt TecAlliance (tecalliance.com) for IDP Data Receiver API-pristilbud. Tilbyr KTypes, delta-sync, offisiell støtte. Alternativ: avvent Bovsoft credit-reset.
**Lærdom:** Regnr→kType er en knapp ressurs. Bovsoft fungerer men er uforutsigbar. Offisiell TecDoc API er eneste skalerbare langsiktige løsning.

---

### Wrangler/GitHub Optimalisering (2026-06-05)
**Problem:** Deploy-pipeline brukte `npm install -g wrangler` (tregt, ukontrollert versjon) og `wrangler secret put` i hver deploy (30-40s ekstra, rate limiting).
**Løsning:**
1. `cloudflare/wrangler-action@v3` — offisiell action, caching innebygd
2. `cloudflare/pages-action@v1` — for Pages deploy
3. `actions/cache@v4` — for `~/.npm` og `node_modules`
4. **Fjernet** `wrangler secret put` fra deploy-pipeline — secrets settes manuelt én gang
5. `sleep 60` → `sleep 15` — raskere verifikasjon
6. Node 20 → 22 i alle 12 workflows
7. Worker `package.json`: wrangler ^3.114, @cloudflare/workers-types ^4.20250501.0, TS ^5.8
8. `wrangler.toml`: compatibility_date="2025-06-01", compatibility_flags=["nodejs_compat"], minify=true, cron="0 * * * *"
**Resultat:** Deploy ~45-60 sekunder raskere. Ingen rate limiting. Kontrollert wrangler-versjon.
**Lærdom:** Bruk offisielle actions, ikke `npm install -g`. Secrets i CI = tregt og skjørt. Manuell secret-håndtering er tryggere for produksjon.

---

**Sist oppdatert:** 2026-06-08  
**Versjon:** 3.0 (+kType Family, Ordremottaker LLM-integrasjon)
