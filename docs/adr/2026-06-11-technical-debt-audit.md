# ADR 2026-06-11: Teknisk Gjeld-Audit og Fase A Opprydding

## Status

Godkjent (Fase A utført, resterende faser planlagt)

## Kontekst

Autoglass AS B2B-plattform har vokst raskt. Kodebasen i `api/cf-worker/src/`, `api/scrapers/` og `frontend/` har akkumulert teknisk gjeld som nå begynner å hemme videre utvikling. En audit ble gjennomført for å kvantifisere og prioritere opprydding.

Auditkilder: `docs/TECHNICAL-DEBT-AUDIT-2026-06-11.md`, jscpd, wc, grep, manuell inspeksjon.

## Funn (sammendrag)

| Metrikk | Verdi | Terskel | Status |
|---------|-------|---------|--------|
| Duplikasjon | 2.65% (626 linjer, 48 clones) | < 5% | ✅ OK |
| Test-fil ratio | 9 / 56 = 16% | > 30% | ❌ Lav |
| Filer >500 linjer | 10 filer | 0 | ❌ For mange |
| `any`-bruk | 95 forekomster | 0 | ⚠️ Betydelig |
| `console.*` | 373 totalt | 0 | ⚠️ Ustrukturert |
| TODO/FIXME | 3 reelle markører | 0 | ⚠️ Få, men uferdig |
| Legacy-filer | 2+ | 0 | ⚠️ Eksisterer |
| Backup-filer i repo | 2 tracked | 0 | ⚠️ Skal ikke committes |

**Total vurdering:** 🟡 Moderat teknisk gjeld.

## Beslutninger

1. **Start med Fase A (rydding)** før strukturell refaktorering. Lav risiko, høy ryddeverdi.
2. **Ikke arkivere `vin-glass-resolver.ts` ennå** — den har fortsatt aktive avhengigheter i `search.ts` og `vin-lookup-api.ts`.
3. **Erstatte dupliserte fetch-implementasjoner** i scraperne med `api/scrapers/config.ts`.
4. **Fjerne tracked backup-filer** fra git og utvide `.gitignore` for å forhindre fremtidige.
5. **Dokumentere auditen som ADR** (denne filen) og planlegge resterende faser for Q3 2026.

## Gjennomført i Fase A

### Backup-filer
- `git rm --cached` på:
  - `.kimi/mempalace/kg.json.bak.20260611`
  - `data/catalog-prod.json.backup-20260604`
- `.gitignore` utvidet med:
  - `*.bak.*`
  - `*.backup-*`
  - `.src-backup-*`

### Fetch-refaktorering
- `api/scrapers/config.ts`: `fetchWithRetry` støtter nå custom `timeoutMs`.
- `api/scrapers/pilkington-scraper.ts`: bruker nå sentral `fetchWithRetry`.
- `api/scrapers/euroglass-ru-scraper.ts`: bruker nå sentral `fetchWithRetry`.
- `api/scrapers/autoglass-ru-scraper.ts`: bruker nå sentral `fetchWithRetry`.

### Verifisering
- TypeScript-sjekk (`npx tsc --noEmit`) for de 4 scraper-filene: **PASS**
- Kun `api/scrapers/config.ts` inneholder nå `fetchWithTimeout` / `fetchWithRetry`.

## Blokkeringer oppdaget

### `vin-glass-resolver.ts` kan ikke arkiveres
Tross auditens anbefaling er filen fortsatt aktivt importert:

- `api/cf-worker/src/handlers/search.ts` importerer `resolveGlass` og `upsertGlassRule`.
- `api/cf-worker/src/vin-lookup-api.ts` importerer `resolveGlass`, `upsertGlassRule` og `GlassMatch`.

**Konsekvens:** Arkivering før avhengighetene fjernes vil knekke Worker.

**Anbefalt løsning:** Egen oppgave i Fase B:
1. Erstatte `resolveGlass`-fallback i `search.ts` med D1 + kType Family-oppslag.
2. Erstatte `upsertGlassRule` med direkte D1-skriving eller fjerne læringslogikken.
3. Flytte `GlassMatch`-interface til felles modul.
4. Verifisere ingen importerer `vin-glass-resolver.ts`.
5. Arkivere/slette filen.

## TODO/FIXME

Reelle markører funnet under Fase A:

- `api/cf-worker/src/lib/scoring.test.ts:21` — `KNOWN BUG: currently falls through to token match on "transporter"`
- `api/cf-worker/src/lib/scoring.test.ts:147` — `KNOWN BUG: substring "A3" is inside "A30"`
- `api/scrapers/build-prefix4-cache.ts:196` — `TODO: Implement real validation using known test regnr`

Ingen er kritiske for produksjon, men bør adresseres i dedikerte tester/sessions.

## Resterende roadmap

### Fase B: Strukturere (2–3 dager)
1. Splitte `index.ts` til `router.ts` + `middleware.ts`.
2. Splitte `handlers/search.ts` i lag-spesifikke filer.
3. Splitte `handlers/ordremottaker.ts` i NER/dialog/tools.
4. Introduse `lib/logger.ts` og erstatte 159 `console.*` i Worker.
5. Løse `vin-glass-resolver.ts`-avhengighetene og arkivere filen.

### Fase C: Type-sikkerhet (1–2 dager)
1. Erstatte `any` med `unknown` + type guards (gradvis).
2. Definere API-response interfaces.
3. Aktivere `no-explicit-any` i tsconfig når mulig.

### Fase D: Test-dekning (3–5 dager)
1. Skrive tester for `handlers/search.ts`.
2. Skrive tester for `handlers/ordremottaker.ts`.
3. Skrive tester for `lib/db.ts`.
4. Sette opp Vitest for Worker.

**Total estimat:** 7–12 arbeidsdager (spredt over 4–6 uker).

## Konsekvenser

- **Positivt:** Færre dupliserte fetch-implementasjoner, renere git-historikk, bedre `.gitignore`.
- **Risiko:** `vin-glass-resolver.ts`-arkivering er utsatt til avhengighetene er løst.
- **Kostnad:** Fase A tok ~1 time. Resterende faser er betydelig større.

## Neste review

2026-07-11 (månedlig).
