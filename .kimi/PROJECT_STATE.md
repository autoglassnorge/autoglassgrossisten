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
| Last updated | 2026-05-19 22:10 CEST |
| Last updated by | perplexity-computer |
| Worker version | v2.2 (hardened, klar for commit) |

---

## Architecture decisions (locked)

- **Matching strategy:** Layer 0 = kType exact match → Layer 1-4 = brand/model/year/equipment scoring
- **kType source:** Bovsoft REGNUM API (`http://54.38.179.43:150/bovsoft.regnum.run`)
- **Vehicle lookup:** SVV Enkeltoppslag (primary) + Bovsoft (cross-validation + kType)
- **Statistical learning:** D1 table `ktype_matches` records every successful regnr→ktype→eurocode hit
- **Cache:** KV stores Bovsoft responses 30 days, keyed by `bovsoft:<regnr>`
- **Confidence levels:** `exact` | `high` | `medium` | `low` | `none`
- **Target SLA:** 100% eksakt frontrute-matching (samme glass som fabrikkoriginal)

---

## Current blockers

| Prio | Blocker | Owner action | Status |
|---|---|---|---|
| P0 | SVV API-nøkkel returnerer 401 — Worker svarer 500 på alle `/api/glass?regnr=*` | Logg inn på SVV-portalen, generer ny nøkkel, kjør `cd api/cf-worker && wrangler secret put SVV_API_KEY` | Åpen |
| P0 | Bovsoft client id=461 har status 403 ("temp status, need wait confirmation") | Send e-post til bovsoft@gmail.com med ref "Client id=461 — request account confirmation" | Åpen |
| ~~P1~~ | ~~Worker krasjer med 500 ved SVV 401~~ | Løst i v2.2 — returnerer nå 503 + Retry-After | ✅ Ferdig |
| ~~P1~~ | ~~`ktype_matches` lagrer regnr i klartekst~~ | Løst i v2.2 — ny tabell `(ktype, eurocode, hit_count)`, migration 0003 | ✅ Ferdig |
| ~~P1~~ | ~~Bovsoft 403/temp-status logges ikke~~ | Løst i v2.2 — alle Bovsoft-statuskoder (401/402/403/404) logges separat | ✅ Ferdig |
| P2 | `glass_catalog.ktype` er 0% populert — Layer 0 vil aldri trigge før bootstrap | Tre strategier vurdert: TecDoc-abonnement, Bovsoft-bootstrap, Pilkington/Glavista-parsing | Ikke startet |
| P2 | Ingen overvåkning av kType-læringskurven | Bygg `/api/admin/ktype-stats` endepunkt | Ikke startet |

---

## Open technical debt

- `fetchSvvEnkeltoppslag` returnerer `null` for alle feiltyper (401, 404, 503) — caller kan ikke skille reelle feil fra "ingen treff"
- `fetchBovsoftVehicle` har `if (!res.ok) return null` — kaster bort `data.status` (200/401/403/402/404) som er kritisk for diagnose
- `insertKtypeMatch` har `ON CONFLICT(regnr) DO UPDATE` — overskriver historikk, ingen frekvens
- Ingen rate limiting på Worker-endepunkter
- `vehicle.k_type = 0` som default — magisk verdi, bør være `null`
- Ingen Sentry/observability i Worker

---

## Recent activity

### 2026-05-19 (Kimi CLI session)
- Implementerte Alternativ C: Statistisk læring
- Worker v2.1: Bovsoft-integrasjon, kType-parsing, KV-cache, utvidet VIN-dekoding (BMW, MB, Audi, Ford, Hyundai/Kia, Toyota)
- D1: La til `glass_catalog.ktype` kolonne + `ktype_matches`-tabell
- Migration: `0002_add_ktype.sql`
- Test-script: `scripts/test-bovsoft.mjs` oppdatert
- ADR: `docs/adr/2026-05-19-ktype-statistical-learning.md`
- **Status:** TypeScript kompilerer rent (0 feil), 1449 linjer i `src/index.ts`
- **Commit:** Ikke commitet ennå — venter på hardening-patch

### 2026-05-19 22:10 (Perplexity Computer — v2.2 hardening LEVERT)
- **Worker v2.2:** `src/index.ts` 1449 → 1602 linjer, TypeScript kompilerer rent (exit 0)
- **Patch 1 — SVV taxonomy:** `fetchSvvEnkeltoppslag` returnerer discriminated union `SvvFetchResult`. 401/403 → HTTP 503 + Retry-After: 3600. 404 → HTTP 404. 5xx → HTTP 503 + Retry-After: 60.
- **Patch 2 — Bovsoft logging:** parser `data.status` separat fra HTTP-status. Logger 401 (feil seccode), 402 (zero balance), 403 (pending), 404 (regnr unknown). `countFREERequests < 50` gir advarsel.
- **Patch 3 — GDPR-fiks:** `insertKtypeMatch(db, ktype, eurocode)` — regnr fjernet fra parametere OG fra tabell. Migration `0003_fix_ktype_matches.sql` dropper gammel tabell og recreater med `(ktype, eurocode, hit_count, first_seen, last_seen)`.
- **Bonus 1 — KTYPE_CONFIDENCE_THRESHOLD=3:** Layer 0 trigger ikke før en mapping er sett 3+ ganger. Hindrer cache poisoning.
- **Bonus 2 — ingen feil-caching:** kun `httpStatus === 200` lagres i KV. Auth-feil og upstream-feil cachet aldri.
- **HTTP-kontrakt-endring:** `searchByRegnr` returnerer nå `{ httpStatus, retryAfter?, body }`. Handler i `/api/glass` bruker `result.httpStatus` for korrekt statuskode.
- **Deploy klar:** `scripts/apply-hardening.sh` kører git branch + commit + push i én kommando.

### 2026-05-19 22:00 (Perplexity Computer session)
- Verifiserte Kimis arbeid lokalt via `pc bash`
- Identifiserte tre kritiske mangler: SVV 401-handling, GDPR i ktype_matches, Bovsoft-feillogging
- Slettet `src/index.ts.bak`, la `*.bak` i `.gitignore`
- Planlagt branch: `fix/ktype-hardening`
- Etablert denne `PROJECT_STATE.md` som single source of truth for cross-AI kontekst

---

## ~~Active patch plan: `fix/ktype-hardening`~~ — LEVERT 22:10

**Status:** Alle 3 patcher ferdig + 2 bonus. TypeScript kompilerer rent. Klar for commit.
**Neste:** Kjør `bash scripts/apply-hardening.sh` for commit + push, deretter `wrangler deploy` når SVV-nøkkel er rotert.

### Historisk plan (lukket):

**Mål:** Gjør Worker v2.1 prod-klar uten å vente på SVV/Bovsoft-blokkere.

1. **Patch 1 — SVV 401-håndtering**
   - Endre `fetchSvvEnkeltoppslag` til å returnere `{ status: 'ok'|'auth_error'|'not_found'|'upstream_error', vehicle?: TecdocVehicle }`
   - Caller `searchByRegnr` returnerer HTTP 503 + `Retry-After: 3600` ved `auth_error`
   - Logger `console.error("SVV auth failed - rotate SVV_API_KEY")` så vi ser det i Cloudflare-loggene

2. **Patch 2 — GDPR-fiks for ktype_matches**
   - Drop nåværende tabell (ingen prod-data ennå), erstatt med:
     ```sql
     CREATE TABLE ktype_matches (
       ktype INTEGER NOT NULL,
       eurocode TEXT NOT NULL,
       hit_count INTEGER NOT NULL DEFAULT 1,
       first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
       last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (ktype, eurocode)
     );
     ```
   - `insertKtypeMatch(db, ktype, eurocode)` — ingen regnr-parameter, kjører UPSERT som inkrementerer `hit_count`
   - `queryKtypeMapping` returnerer top eurocode per ktype basert på hit_count
   - Confidence-threshold: kun bruk Layer 0 hvis `hit_count >= 3` (unngå cache poisoning fra én feil-mapping)

3. **Patch 3 — Bovsoft-feillogging**
   - `fetchBovsoftVehicle` returnerer `{ status: number, statusText?: string, vehicle?: BovsoftVehicle }`
   - Logger `console.warn("Bovsoft status=403 — account pending confirmation")` ved temp-status
   - Logger `console.error("Bovsoft balance=0 — top up account")` ved status 402
   - Gjør det mulig å se i Cloudflare Workers logs når kontoen aktiveres

4. **Migration 0003**
   - Drop og recreate `ktype_matches`
   - Trygt fordi tabellen er tom i prod (D1-migrering ikke kjørt ennå)

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
├── src/index.ts                          # Worker v2.1 (1449 linjer, klar for hardening)
├── schema.sql                            # D1 base schema (oppdatert med ktype)
├── migrations/
│   └── 0002_add_ktype.sql                # Kimi's migration (ikke kjørt ennå)
├── wrangler.toml                         # Cloudflare config
└── package.json

scripts/
├── test-bovsoft.mjs                      # Test Bovsoft endpoint manuelt
└── apply-d1-migration.mjs                # Kjør D1-migreringer via wrangler

docs/adr/
└── 2026-05-19-ktype-statistical-learning.md   # Arkitektur-beslutning

.kimi/
└── PROJECT_STATE.md                      # DENNE FILEN
```
