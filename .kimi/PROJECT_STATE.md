# bilglass — Project State

> **Single source of truth for all AI assistants (Kimi CLI, Claude, Perplexity Computer).**
> Read this before doing work. Update your section when you complete something significant.
> Commit changes alongside related code. `git log .kimi/PROJECT_STATE.md` shows decision history.

---

## Meta

| Field | Value |
|---|---|
| Project | Autoglass AS — B2B grossistnettside for bilglass |
| Repo path | `/Users/taj/bilglass` |
| Stack | Cloudflare Worker + D1 + KV + Pages |
| Owner | Tom Arne Jensen (post@klarpakke.no) |
| Last updated | 2026-06-12 16:18 CEST |
| Last updated by | kimi-code |
| Worker version | v2.5 (kType Family + Ordremottaker LLM) |

---

## Architecture decisions (locked)

- **Matching strategy:** Layer -1 = ground_truth → Layer 0 = kType exact match → Layer 0.5 = TecDoc fallback (collision-gated) → Layer 1-4 = brand/model/year/equipment scoring
- **kType source hierarchy:** Bovsoft REGNUM API (primary) → TecDoc 1Q2019 (collision-gated fallback) → Biluppgifter.se (future)
- **Vehicle lookup:** SVV Enkeltoppslag (primary) + Bovsoft (cross-validation + kType)
- **Statistical learning:** D1 table `ktype_matches` records every successful regnr→ktype→eurocode hit
- **Cache:** KV stores Bovsoft responses 30 days, keyed by `bovsoft:<regnr>`
- **Confidence levels:** `exact` | `high` | `medium` | `low` | `none`
- **Target SLA:** 100% eksakt frontrute-matching (samme glass som fabrikkoriginal)
- **Learning engine:** D1 `glass_rules` + `search_results` (VIN-prefix → equipment læring)
- **kType Family matching:** Når exact+kType registry ikke gir treff, brukes Jaccard-similarity på `ktype_families.equipment_criteria` vs vehicle-fingerprint. Equipment-first scoring. Confidence: `high`.
- **Ordremottaker LLM:** 6-steg pipeline med NER → Glass-oppslag (Layer 0→0.6) → Equipment-dialog → Tilbehør → Pris → Ordre. Integrert med kType Family for fuzzy matching.
- **Nord Glass:** 9,524 rader importert til D1 staging (OK: 8,629, REVIEW: 888, HOLD: 7)
- **kType coverage:** D1 remote: `ktype_registry` **69,893** rader, `tecdoc_ktype_registry` **908** rader, `glass_rules` **1,639** rader, `glass_catalog` **27,139** rader
- **kType families:** `ktype_families` **25,383** families, `ktype_family_members` **79,928** rows
- **kType exact + family matching:** 24.4% dekning (6x forbedring fra 4%)
- **TecDoc 1Q2019:** GitHub `tecdocSQL/tecdocdatabase1Q2019` — 69,871 kType mappings parsed from manufacturers+models+passengercars CSVs
- **Bovsoft:** 118 verified results, 333 remaining searches (~$0.12/search). Port 150 (gratis, regnr→kType)
- **Biluppgifter.se:** API-nøkkel placeholder (`din_biluppgifter_nokkell_her`). Unused `GET /api/v1/tecdoc/regno/{regnr}?country_code=NO` endpoint returns `tecdoc_id` (kType)
- **Apify TecDoc:** Script klart (`scripts/apify-tecdoc-scraper.mjs`), venter på `APIFY_TOKEN` (~$14 én gang)

---

## Current blockers

| Prio | Blocker | Status |
|---|---|---|
| P1 | **Biluppgifter.se:** API-nøkkel mangler — ubrukt `tecdoc/regno` endpoint som gir kType direkte | Åpen |
| P2 | Bovsoft: 333 remaining searches — strategisk bruk på high-value unmatched models | Åpen |
| P2 | kType Family: Jaccard-threshold (0.6) monitorere accuracy | Overvåkning |
| P2 | Ingen overvåkning av kType-læringskurven | Delvis løst — Family matching gir 6x dekning |
| P3 | Ingen `exact_match` flagg i API-respons | Planlagt |

> Historiske blockers (✅): SVV 401, Bovsoft 403, glass_variants duplikater, MAX-merge for boolske felt, ktype_matches GDPR, Bovsoft logging, **Remote deploy** (D1 data er nå på plass).

---

## Open technical debt

- `fetchSvvEnkeltoppslag` returnerer `null` for alle feiltyper (401, 404, 503) — caller kan ikke skille reelle feil fra "ingen treff"
- `fetchBovsoftVehicle` har `if (!res.ok) return null` — kaster bort `data.status` (200/401/403/402/404) som er kritisk for diagnose
- Ingen rate limiting på Worker-endepunkter
- `vehicle.k_type = 0` som default — magisk verdi, bør være `null`
- Ingen Sentry/observability i Worker
- `scoreCandidate()` bruker magiske poengverdier (15, 12, 10, etc.) uten dokumentasjon — vanskelig å debugge
- Ingen `exact_match: boolean` i API-respons — frontend vet ikke om den kan stole på resultatet
- VAG-biler (3,638 records) har ingen PR-kode-dekoding — kunne utelukket mange feilaktige kandidater
- Biluppgitter API-nøkkel utløpt — equipment-gjetting bruker kun catalog-signatures (mindre nøyaktig)

---

## Recent activity

### 2026-06-08 (Kimi CLI — kType Family matching + Ordremottaker LLM-integrasjon)
- **kType Family matching:** Bygget fra TecDoc 1Q2019 equipment-criteria
  - `ktype_families`: 25,383 families med equipment-criteria JSON
  - `ktype_family_members`: 79,928 kType → eurocode mappings
  - Jaccard-similarity scoring med equipment-first weighting
  - Deployet til remote D1
- **Ordremottaker LLM:** Integrert med kType Family som fallback
  - NER + equipment-dialog + year-korrigering
  - Equipment-svar tolkes som kunnskap (ikke bare bekreftelse)
  - Session-state i `glass_resolution_requests`
- **Resultat:** kType-dekning 4% → 24.4% (6x forbedring)
- **Deploy:** Worker v2.5 deployet

### 2026-05-30 (Kimi CLI — Git cleanup, PROJECT_STATE sync, MemPalace wing-fix)
- **Git cleanup:** Commited 48 endringer i 3 commits + .gitignore-oppdatering
  - Commit 1: Worker-kildekode (TecDoc fallback, collision gating, VIN resolver, scripts)
  - Commit 2: tecdoc-import v5 SQL-artefakter
  - Commit 3: Manglende scripts, kg.json, autodoc-probe tools
- **.gitignore:** Lagt til MemPalace cache, autodoc-probe, genererte CSV-chunks, intermediate matchers (v6-v14)
- **PROJECT_STATE.md:** Oppdatert med faktisk D1-status (80k+ ktype_registry, 908 tecdoc_ktype_registry)
- **Blocker-status:** Fjernet "Remote deploy" — D1-data er verifisert på plass i produksjon

### 2026-05-29 (Kimi CLI — kType-beriking v5 + KIMI CODE modernisering)
- **kType-beriking via tecdocSQL/tecdocdatabase1Q2019:** 80,115 ktype_registry-rader i D1 remote
- **TecDoc fallback (Layer 0.5):** Collision-gated med `collision_group_size <= 5` — unik+lav-kollisjon kTypes gir `exact` confidence
- **New source files:** `tecdoc-resolver.ts`, `queryTecdocByKtype()`, `queryTecdocKtypeByVehicle()`
- **KIMI CODE modernisering:** `install-and-migrate.sh`, hooks, agent-YAML v2, SKILL.md
- **ADR:** `docs/adr/2026-05-29-tecdoc-integration-analysis.md`
- **Deploy:** Worker deployet 29. mai 22:38 (commit `8789e9a`)

### 2026-05-28 (Kimi CLI session — TecDoc 1Q2019 kType enrichment v5)
- **Analysert:** `tecdocSQL/tecdocdatabase1Q2019` — piratkopiert TecDoc 1Q2019 DVD-dump (~100 GB, English only)
- **Lastet ned:** `manufacturers.csv` + `models.csv` + `passengercars.csv` (~8 MB) → 69,871 kType mappings
- **Matching pipeline v5:** Fuzzy brand+model+year matching med aliases (GELANDEWAGEN→G-KLASSE, GUILETTA→GIULIETTA)
- **Resultat:** 11,294 `glass_catalog` records med kType (**60.3%** dekning) — opp fra 609 (1.54%)
- **D1 lokal:** 907 `ktype_registry` + 1,248 `glass_rules` + 11,294 `glass_catalog.ktype`
- **SQL generert:** `data/tecdoc-import/remote-deploy-v5.sql` (klar for `--remote` deploy)
- **OEM-matching:** Ikke mulig — kun 149 OEM-numre i enriched-katalog (0 i produksjon)
- **SVV-scraping:** Hjelper ikke med kType — SVV returnerer ikke kType, og vi har allerede 3,122 unike regnr
- **Anbefaling:** Biluppgifter.se `tecdoc/regno` som primær kilde, Bovsoft strategisk (333 søk), remote deploy nå
- **Schema oppdatert:** `schema.sql` + `ktype_registry`-tabell opprettet i lokal D1
- **MemPalace:** 18 nye KG-fakta lagt til

### 2026-05-19 (Kimi CLI session)
- Implementerte Alternativ C: Statistisk læring
- Worker v2.1: Bovsoft-integrasjon, kType-parsing, KV-cache, utvidet VIN-dekoding (BMW, MB, Audi, Ford, Hyundai/Kia, Toyota)
- D1: La til `glass_catalog.ktype` kolonne + `ktype_matches`-tabell
- Migration: `0002_add_ktype.sql`
- Test-script: `scripts/test-bovsoft.mjs` oppdatert
- ADR: `docs/adr/2026-05-19-ktype-statistical-learning.md`
- **Status:** TypeScript kompilerer rent (0 feil), 1449 linjer i `src/index.ts`
- **Commit:** Ikke commitet ennå — venter på hardening-patch


### 2026-05-22 04:21 (Perplexity Computer — glass sensor schema bootstrap)
- Opprettet migrasjon `api/cf-worker/migrations/0009_glass_variant_features.sql` for å utvide `glass_variants` med sensor-/fitment-felter og egen `glass_variant_evidence`-tabell.
- Patchet `scripts/import-glass-variants-to-d1.mjs` slik at import nå kan skrive `mounting_json`, `post_install_json`, sensorfelter, ADAS/HUD/RLS-felter og provenance-felter (`match_type`, `match_score`, `input_file`).
- Status: kode endret, men migrasjon og dry-run/remote import er ikke kjørt fra denne sesjonen. Neste steg er å kjøre D1-migrasjon + dry-run import lokalt via KIMI/terminal.

### 2026-05-22 05:10 (Kimi CLI — feature-preserving merge fix + re-import)
- **Problem identifisert:** Ved re-import av `glass_variants` falt `encapsulation` fra 2 → 1 og `solar` fra 4 → lavere, fordi `ON CONFLICT DO UPDATE` brukte "last write wins" (`excluded.felt = glass_variants.felt`). Svakere input (f.eks. fra features_json utten ENCAC) overskrev sterkere input (fra description-heuristikk).
- **Fix:** Patchet `scripts/import-glass-variants-to-d1.mjs` — 12 boolske feature-felt endret fra direkte assignment til `MAX(excluded.felt, glass_variants.felt)`:
  - `camera_present`, `rain_sensor_present`, `hud_present`, `hud_compatible`, `heated`, `heated_wiper_park`, `acoustic`, `solar`, `antenna`, `encapsulation`, `adas_calibration_required`, `sensor_initialization_required`, `hud_verification_required`
- **Verifisert i prod etter re-import:**
  - `total=18` (idempotent — ingen nye duplikater)
  - `encap=4` (fra 1 — MAX-merge gjenopprettet tapte verdier)
  - `solar=7` (fra 4 — flere sanne verdier bevart)
  - `cam=1`, `adas=1` (stabilt)
- **Lanseringsrisiko redusert:** Fra "kritisk" (duplikat-volum) til "moderat" (feature-integritet nå monoton, men input-datakvalitet avhenger fortsatt av scraper/parser).
- **Node/Wrangler-inkonsistens notert:** `.nvmrc` = v20, Wrangler krever v22+. **Fikset 30. mai** — `.nvmrc` = v22.

### 2026-05-19 22:10 (Perplexity Computer — v2.2 hardening LEVERT)
- **Worker v2.2:** `src/index.ts` 1449 → 1602 linjer, TypeScript kompilerer rent (exit 0)
- **Patch 1 — SVV taxonomy:** `fetchSvvEnkeltoppslag` returnerer discriminated union `SvvFetchResult`. 401/403 → HTTP 503 + Retry-After: 3600. 404 → HTTP 404. 5xx → HTTP 503 + Retry-After: 60.
- **Patch 2 — Bovsoft logging:** parser `data.status` separat fra HTTP-status. Logger 401 (feil seccode), 402 (zero balance), 403 (pending), 404 (regnr unknown). `countFREERequests < 50` gir advarsel.
- **Patch 3 — GDPR-fiks:** `insertKtypeMatch(db, ktype, eurocode)` — regnr fjernet fra parametere OG fra tabell. Migration `0003_fix_ktype_matches.sql` dropper gammel tabell og recreater med `(ktype, eurocode, hit_count, first_seen, last_seen)`.
- **Bonus 1 — KTYPE_CONFIDENCE_THRESHOLD=3:** Layer 0 trigger ikke før en mapping er sett 3+ ganger. Hindrer cache poisoning.
- **Bonus 2 — ingen feil-caching:** kun `httpStatus === 200` lagres i KV. Auth-feil og upstream-feil cachet aldri.
- **HTTP-kontrakt-endring:** `searchByRegnr` returnerer nå `{ httpStatus, retryAfter?, body }`. Handler i `/api/glass` bruker `result.httpStatus` for korrekt statuskode.
- **Deploy klar:** `scripts/apply-hardening.sh` kører git branch + commit + push i én kommando.

### 2026-05-24 (Kimi CLI — Bovsoft Batch #2 + D1-import)
- **Bovsoft Batch #2:** 44 regnr fra ordrehistorikk → 43 success → 761 totale ktype_matches (+156) → 609 glass_catalog med kType (+85)
- **D1-import:** Alle ktype-matches og glass-ktype-updates importert til remote D1 via `--command` SQL (wrangler `--file` feiler intermittent pga OAuth)
- **Lærdom:** Bovsoft `countFREERequests` forblir 128 på tvers av alle kall — muligens daily-reset eller cached/stale. Ingen hard limit observert (~104 calls).

### 2026-05-23 18:00–23:00 (Kimi CLI — AJ93567 deep-dive + CEO-rapport)
- **Case AJ93567:** 2021 PEUGEOT 208 Allure (GB-import), kType 136530. 3 frontrutevarianter identifisert.
- **13+ kilder skannet:** Ingen ga equipment-nivå detaljer for denne VIN-en. Biluppgitter token utløpt.
- **Konklusjon:** 100% digital matching krever TecDoc/Service Box. Fysisk eurokode på glasset er eneste gratis 100% metode.
- **CEO-rapport skrevet:** `docs/CEO-RAPPORT-AJ93567-GLASS-MATCHING.md` — forklarer strategi 1+2+3 (TecDoc + Learning + Biluppgifter)
- **Time med Biluppgitter.se:** 24. mai for å fornye API-nøkkel

### 2026-05-23 14:00–16:00 (Kimi CLI — Nord Glass PDF parser bugfix)
- **Problem:** `tokenize.ts` regex `\b(WSWS|BOT|...)\b` feilet på sammenhengende år+familie (f.eks. `0401WSWS` — `\b` matcher ikke digit→letter boundary).
- **Fix:** Endret `PRODUCT_FAMILY_RE` til å ikke kreve word boundary. Endret `DIMENSIONS_RE` fra `/\b...\b/` til `/.../` (samme grunn: `GBYN1597x954` har ingen boundary mellom N og 1).
- **Fix:** Tokenize-logikk oppdatert til å først finne internkode-mønster, deretter dimensjoner i rest-segmentet. Gir renere features-segment.
- **Fix:** Fjernet dobbel validering i `importer.ts` (`toStagingRow` kalt `validate()` på nytt → dupliserte warnings → status degraded til REVIEW).
- **Fix:** La til `source_line_raw` på `NordGlassParsedRecord` + parseLine setter feltet.
- **Resultat (4 test-linjer):** 2 OK (WSWS), 2 REVIEW (BOT uten side, BOAS uten side), 0 HOLD. Tidligere: 1 OK, 4 HOLD.
- **CLI:** `npx tsx lib/nordglass/extract.ts full <pdf> [output.sql]` fungerer.
- **Resultat:** 9,524 records ekstrahert fra PDF via `scripts/extract-nordglass.py` (pdfplumber)
  - OK: 8,629 (90.6%)
  - REVIEW: 888 (9.3%)
  - HOLD: 7 (0.07%)
  - Output: `nordglass-staging.sql` (4.6 MB)
- **Lærdom:** PDF-formatet var kolonne-basert med `pdftotext -layout` ga dårlige resultater. `pdfplumber` + `find_tables()` var løsningen.
- **Familiekoder i denne PDF-en:** WS (windscreen), RW (rear window), BO (all body glass), GU (moulding)
- **Bug funnet/fikset:** Årstall var YY/MM (ikke MM/YY). 90/01 → 1990-01.
- **Neste:** REVIEW-postene trenger manuell gjennomgang (hovedsakelig BO uten side/posisjon).

### 2026-05-23 13:44 (Kimi CLI — KIMI + MemPalace modernisering)
- **MemPalace isolert fra Klarpakke:** Kopiert MCP-server v3.4.0 til `~/bilglass/.kimi/mempalace/mcp-server.mjs` med autoglass-spesifikk config.
- **KG bootstrappet:** 12 entiteter, 53 fakta (architecture, matching, svv-api, bovsoft, ktype_matches, api-contract, catalog, secrets, deploy, glass_variants, worker, loadcatalog-bug).
- **Agent-modernisering:** Alle 5 eksisterende agenter oppgradert til YAML v2 med metadata, triggers, capabilities. Ny agent: `glass-ktype` (Bovsoft/SVV/kType).
- **MemPalace-protokoll:** Lagt til i alle agent-prompts + KIMI-MASTER-SYSTEM.md — ALLTID søk i MemPalace før >3 filer endres, ALLTID skriv diary etter signifikante oppgaver.
- **Prosjekt-config:** `.kimi/config.toml` med prosjekt-spesifikke loop_control + hooks.
- **Hooks:** `session-start.sh` leser blockers fra PROJECT_STATE.md. `session-end.sh` kjører git-diff for bilglass (ikke klarpakke) + genererer session-summary.
- **MCP-config:** `.kimi/mcp.json` peker til lokal MemPalace-instans.
- **Ingen Klarpakke-lekkasje:** Verifisert at alle paths, hooks, og prompts peker til `~/bilglass`.

### 2026-05-19 22:00 (Perplexity Computer session)
- Verifiserte Kimis arbeid lokalt via `pc bash`
- Identifiserte tre kritiske mangler: SVV 401-handling, GDPR i ktype_matches, Bovsoft-feillogging
- Slettet `src/index.ts.bak`, la `*.bak` i `.gitignore`
- Planlagt branch: `fix/ktype-hardening`
- Etablert denne `PROJECT_STATE.md` som single source of truth for cross-AI kontekst

---

## Completed (arkivert)

- v2.2 hardening: SVV 401→503, GDPR ktype_matches, Bovsoft logging, KTYPE_CONFIDENCE_THRESHOLD=3
- v2.1: Bovsoft-integrasjon, kType-parsing, utvidet VIN-dekoding
- KIMI+MemPalace modernisering (YAML v2 agenter, hooks, KG)
- **v2.4:** TecDoc fallback Layer 0.5, collision gating, remote D1 data sync, git cleanup

---

## How AI assistants should use this file

### Kimi CLI
- Les denne filen før du gjør kode-endringer
- Oppdater "Recent activity" når du fullfører noe vesentlig
- Skriv ADR-er i `docs/adr/` for større arkitektur-valg, lenk dem her

### Claude (Opus/Sonnet)
- Les "Current blockers" + "Active patch plan" for å forstå hvor vi er
- Foreslå endringer som diff mot eksisterende filer, ikke som ny kode

### Perplexity Computer
- Bruker denne filen som primær kontekst i stedet for å lese 1449 linjer Worker-kode
- Oppdater "Recent activity" ved sesjon-slutt
- Lagrer kun høy-nivå fakta i Perplexity memory; detaljer hører hjemme her

---

## File map (kritiske filer)

```
api/cf-worker/
├── src/index.ts                          # Worker v2.4 (deployet)
├── src/handlers/search.ts                # Layer 0.5 TecDoc fallback
├── src/lib/db.ts                         # D1 queries (incl. TecDoc)
├── src/lib/tecdoc-resolver.ts            # TecDoc kType collision gating
├── src/lib/ktype-family-matcher.ts       # kType Family Jaccard-matching
├── src/handlers/ordremottaker.ts         # Ordremottaker LLM-endepunkt
├── src/lib/ordremottaker-dialog.ts       # Equipment-dialog engine
├── src/providers/svv.ts                  # Ekstrahert SVV-klient (discriminated union)
├── schema.sql                            # D1 base schema
├── migrations/
│   ├── 0002_add_ktype.sql                # Kimi's migration
│   ├── 0003_fix_ktype_matches.sql        # GDPR-fiks (regnr fjernet)
│   ├── 0009_glass_variant_features.sql   # Sensor/fitment + evidence-tabell
│   └── 0015_ktype_registry_optimizations.sql  # Performance indexes
├── wrangler.toml                         # Cloudflare config
└── package.json

scripts/
├── import-glass-variants-to-d1.mjs       # Idempotent import med MAX-merge
├── batch-bootstrap-ktype.mjs             # Bovsoft REGNUM → kType batch
├── scrape-finn-no-regnr.mjs              # Playwright finn.no scraper
├── build-regnr-candidates.mjs            # Samler regnr fra alle kilder
├── validate-regnr-svv.mjs                # SVV-validering av regnr
├── prioritize-regnr-for-bovsoft.mjs      # Rangerer regnr for Bovsoft
├── test-bovsoft.mjs                      # Test Bovsoft endpoint manuelt
├── apply-d1-migration.mjs                # Kjør D1-migreringer via wrangler
├── build-tecdoc-index.mjs                # Bygg TecDoc inverted index
├── build-tecdoc-ktype-registry.mjs       # Bygg kType registry fra TecDoc CSV
├── parse-tecdoc-v2.mjs                   # Parse TecDoc 1Q2019 dump
└── match-v16-final.mjs                   # Ultimate matcher (fuzzy brand+model+year)

docs/adr/
├── 2026-05-19-ktype-statistical-learning.md
├── 2026-05-22-glass-variant-features.md   # Sensor/fitment-schema ADR
└── 2026-05-29-tecdoc-integration-analysis.md  # TecDoc 1Q2019 integration

.kimi/
└── PROJECT_STATE.md                      # DENNE FILEN
```
