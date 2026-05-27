# KIMI 2.6 — kType bootstrap: Fyll 2 882 manglende mappings for bilglass.no

---

Du er senior arkitekt og tech lead for bilglass.no. Prosjektet er bygget med Cloudflare Workers, D1 SQLite og TypeScript i `/Users/taj/bilglass`. Det kritiske problemet akkurat nå er at `glass_rules`-tabellen (D1) har 0 verifiserte kType-mappings av 2 882 unike `brand:model:year`-kombinasjoner i katalogen. Vincario-integrasjonen er klar i kode men mangler API-nøkkel. Batch-bootstrap-scriptet (`scripts/batch-bootstrap-ktype.mjs`) genererer kun SQL og gap-rapport — det gjør ikke faktiske API-kall mot en live kType-kilde ennå. Du skal løse dette nå.

---

## Kontekst: Hva som allerede er bygget

Arkitekturen etter siste runde (v2.3):

- `api/cf-worker/src/vin-glass-resolver.ts` — hybrid resolver med 7 lag. Lag 0 (`glass_rules` D1) er hoved-cache. Lag 3a er Vincario (EU VIN-decode, ~€0.22/VIN). Lag 3b er MACS VIS (kType, månedlig). Lag 3c er AutoGlassMatch (US/NAGS, $1/lookup). RapidAPI Autoways er fjernet (HTTP 404).
- `api/cf-worker/src/providers/vincario.ts` — Vincario-klient med SHA1-auth. Returnerer kjøretøyspesifikasjoner (make, model, year, engine, body, drive), men IKKE kType direkte.
- `api/cf-worker/src/vin-lookup-api.ts` — Worker-route `POST /api/vin-lookup`. SVV-integrasjon for norske regnr. Synkront lag 0-oppslag, asynkron enrichment for cache-miss.
- `scripts/batch-bootstrap-ktype.mjs` — genererer gap-rapport og SQL, men gjør IKKE live API-kall.
- `scripts/data/batch-bootstrap-report.json` — bekrefter 2 882 unike combos, 0 % kType-dekning, Toyota 156, VW 155, Ford 154, Mercedes 153, BMW 148, Hyundai 130, Audi 127, KIA 127 som topp 8.
- `scripts/data/glass-rules-batch-seed.sql` — SQL-fil generert, men tom for kType-verdier.
- `api/cf-worker/wrangler.toml` — dokumenterer secrets: `VINCARIO_API_KEY`, `VINCARIO_SECRET_KEY`, `MACS_VIS_API_KEY`, `AGM_API_KEY`, `RAPIDAPI_KEY` (deprecated), `BILUPPGIFTER_API_KEY`.

Nøkkelproblem: Vincario returnerer ikke kType. Den gir kjøretøyspesifikasjoner som brukes til fuzzy matching, men vi trenger en kilde som returnerer TecDoc kType-nummer direkte fra VIN eller `brand:model:year`.

---

## Oppgave 1: Finn riktig kType-kilde

Les disse filene og analyser hvilken eksisterende datakilde som faktisk kan returnere TecDoc kType fra norske regnr eller VIN:

- `api/cf-worker/src/vin-glass-resolver.ts` — se nøye på hvert lag og hva de faktisk returnerer.
- `api/cf-worker/src/providers/vincario.ts` — bekreft hva Vincario returnerer (specs vs kType).
- `scripts/bootstrap-ktype.mjs` — Bovsoft REGNUM returnerer kType direkte fra norsk regnr. Legg merke til URL og parametere.
- `scripts/_archived/bootstrap-ktype-rapidapi.mjs` — se om det finnes andre APIer nevnt.
- `docs/KTYPES-DATA-SOURCES.md` og `docs/VINCARIO-INTEGRATION.md` — les begge for oversikt.

Svar med: (1) Hvilke datakilder returnerer faktisk kType-nummer (ikke bare kjøretøyspesifikasjoner)? (2) Hvilken er raskest å aktivere uten kostnad eller med lav kostnad?

---

## Oppgave 2: Bovsoft REGNUM bootstrap fra Node.js

Bovsoft REGNUM (`http://54.38.179.43:150/bovsoft.regnum.run`) returnerer kType direkte fra norsk regnr. Den er blokkert i Cloudflare Workers (port 150), men fungerer fra Node.js scripts. Vi har 333 gjenværende søk på kontoen (Client ID: 461, seccode: 726443558cec51db0e2d5ae5286d32df).

Oppdater `scripts/batch-bootstrap-ktype.mjs` slik at den:

1. Leser `data/catalog-prod.json` og henter alle unike `brand:model:year`-kombinasjoner uten kType (2 882 stk).
2. For hver kombinasjon: generer et representativt norsk regnr fra Statens vegvesen sin åpne statistikk eller bruk en hardkodet seed-liste (se `data/autoglass-mapping.json` for eksempler). Målet er å ha minst ett regnr per populær modell.
3. Kall Bovsoft for de 333 prioriterte regnr-ene (bruk topp-20-listen fra `batch-bootstrap-report.json` som prioritering: Toyota, VW, Ford, Mercedes, BMW, Hyundai, Audi, KIA).
4. For hvert suksessfullt Bovsoft-svar: upsert i Supabase-tabellen `glass_rules` med `brand:model:year` som nøkkel, kType-verdi og confidence 0.92.
5. Generer oppdatert gap-rapport etter kjøring.
6. Logg alle kall til en lokal fil `scripts/data/bovsoft-bootstrap-log-{dato}.json`.

Husk: 333 søk er nok til å dekke de ~200 viktigste modellkombinasjonene etter Pareto-prinsippet.

---

## Oppgave 3: Fuzzy kType-matching fra eksisterende TecDoc-data

Vi har trolig TecDoc-data lokalt fra tidligere import. Sjekk:

- `data/` — finnes det noen JSON-filer med kType-verdier (utenom `batch-bootstrap-report.json` og `glass-rules-batch-seed.sql`)?
- `scripts/import-tecdoc-ktype.mjs` — hva importerer dette scriptet, og fra hvilken kildefil?
- `data/catalog-prod.json` — har noen records faktisk kType-felt satt?

Hvis TecDoc-data finnes lokalt:
1. Les den og ekstraher alle `brand:model:year → kType`-mappings.
2. Bygg en lokal lookup-tabell i minnet.
3. Kjør fuzzy matching mot de 2 882 ukjente kombinasjonene (normalisert brand + model + year ± 1 år).
4. Upsert alle treff med confidence basert på match-kvalitet (eksakt år = 0.88, ±1 år = 0.75).

---

## Oppgave 4: Vincario kType-gap

Vincario returnerer ikke kType direkte, men returnerer TecDoc-kompatible felter. Undersøk om Vincario-responsen inneholder noen av disse feltene:
- `vehicleTypeId`, `typeId`, `tecDocTypeId`, `kType`, `tecdoc_ktypnr`, `ktypnr`

Les `api/cf-worker/src/providers/vincario.ts` og Vincario API-dokumentasjonen i `docs/VINCARIO-INTEGRATION.md`. Dersom Vincario faktisk returnerer kType under et annet feltnavn, oppdater `vin-glass-resolver.ts` til å ekstrahere det.

Hvis Vincario ikke returnerer kType i det hele tatt, legg til et kommentert TODO i `vincario.ts` som forklarer hva vi trenger fra Vincario og hva vi trenger en annen kilde til.

---

## Oppgave 5: MACS VIS mock/test-modus

Med MACS VIS på månedlig abonnement dekker vi ubegrenset EU kType fra VIN. Vi har ikke nøkkelen ennå, men vi kan forberede:

1. Legg til en `MACS_VIS_MOCK_MODE`-flag i `vin-glass-resolver.ts` som returnerer mock-data for testing.
2. Opprett `scripts/test-macs-vis.mjs` som tar én VIN som argument og kaller MACS VIS hvis `MACS_VIS_API_KEY` er satt, ellers printer mock-responsen.
3. Skriv en detaljert onboarding-guide i `docs/MACS-VIS-SETUP.md`:
   - URL til prisside
   - Hvilke miljøvariabler som trengs
   - Hvordan teste at integrasjonen fungerer
   - Estimert kostnad for 1 000 og 10 000 lookups/mnd

---

## Oppgave 6: Reell kType-dekning fra `ktype_matches`-tabellen

D1-tabellen `ktype_matches` lagrer historiske treff (ktype, eurocode, hit_count). Sjekk:

1. Kjør `wrangler d1 execute GLASS_CATALOG_D1 --command "SELECT COUNT(*) FROM ktype_matches WHERE ktype IS NOT NULL"` (eller les via D1-binding i Worker) for å se faktisk antall kType-verdier vi allerede har.
2. Hvis `ktype_matches` har  ekstraher alle unike kType-verdier og kryss-referanser mot `glass_catalog` for å berike `glass_rules`.
3. Legg til en funksjon `seedGlassRulesFromKtypeMatches(db: D1Database)` i `vin-glass-resolver.ts` som kjøres ved Worker-oppstart (én gang per dag via Cron Trigger).

---

## Tekniske krav

- All ny kode i TypeScript (Worker) eller ESM `.mjs` (Node.js scripts).
- Ingen hardkodede API-nøkler — bruk miljøvariabler.
- D1-kall bruker Workers D1 binding. Supabase-kall bruker `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- Alle eksterne kall logges i `provider_calls`-tabellen med provider-navn, latency, success, kostnad.
- Feilhåndtering med try/catch overalt. Aldri kast uhåndterte exceptions fra Worker.
- TypeScript skal kompilere rent: `npx tsc --noEmit`.

---

## Leveranse

Gi rapport med:

1. **Hvilke kType-kilder fungerer i dag** — liste med kilde, tilgjengelighet, kType-dekning og kost.
2. **Endringer gjort** — alle filer opprettet eller modifisert.
3. **Dekning etter kjøring** — estimert % kType-dekning etter Bovsoft-bootstrap og fuzzy TecDoc-matching.
4. **Blokkere** — hva krever manuell handling eller ekstern nøkkel fra deg?
5. **Neste steg** — konkret prioritert liste for å nå 80 % kType-dekning.

---

*Generert: 2026-05-22 | Prosjekt: bilglass.no | Workspace: /Users/taj/bilglass*
