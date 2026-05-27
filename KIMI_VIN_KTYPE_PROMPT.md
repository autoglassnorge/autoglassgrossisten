# KIMI 2.6 — Full optimalisering: VIN → KType mapping for bilglass.no

---

Du er senior arkitekt og tech lead for bilglass.no, en norsk B2B-grossistplattform for bilglass. Prosjektet er bygget i TypeScript/JavaScript med Cloudflare Workers (D1 SQLite), Supabase (PostgreSQL), og Node.js scripts i `/Users/taj/bilglass`. Kodebasen har 39 458 glassprodukter i D1-databasen, men under 1 % av disse har kType-tilknytning. Målet ditt er å bygge og optimalisere en fullstendig, selvlærende VIN → KType-motor som fungerer i produksjon uten å være avhengig av én enkelt ekstern datakilde.

---

## Kontekst: Eksisterende arkitektur

Prosjektet har allerede følgende komponenter:

- `scripts/bootstrap-ktype.mjs` — bootstrapper kType via Bovsoft REGNUM (norske regnr → kType), men Bovsoft er blokkert i Cloudflare Workers fordi den bruker port 150.
- `scripts/bootstrap-ktype-rapidapi.mjs` og `bootstrap-ktype-rapidapi.README.md` — multi-layer hybrid som koordinerer SVV, vPIC, RapidAPI K-Type Finder, RapidAPI VIN Decoder TECDOC, MACS VIS og AutoGlassMatch.
- `scripts/ebay-ktype-scraper.mjs` — scraper som henter kType-data fra eBay-oppføringer.
- `scripts/import-tecdoc-ktype.mjs` — importer TecDoc kType-data til lokal database.
- `scripts/lib/vin-glass-resolver.mjs` — hybrid VIN → glass resolver med tre lag: gratis vPIC, intern cache/regelmotor, betalt fallback.
- `scripts/migrations/0010_vin_glass_hybrid.sql` — SQL-migrasjoner for tabellene `vin_decode_cache`, `glass_resolution_requests`, `glass_match_candidates`, `glass_rules`, `provider_calls`, `manual_review_queue`.
- `data/autoglass-mapping.json`, `data/autoglass-nags-lookup.json`, `data/catalog-prod.json`, `data/equipment-signatures.json` — eksisterende kataloger og mappinger.
- `api/cf-worker/` — Cloudflare Worker med D1 og KV-cache.

Kjente problemer:
1. Bovsoft er blokkert på port 150 i Cloudflare Workers.
2. Under 1 % kType-dekning i D1 (39 458 records, <400 med kType).
3. KV-cache har bare 6 regnr cached.
4. glass_rules-tabellen er definert men ikke populert.
5. Ingen automatisk læringsloop mellom brukers søk og glass_rules.

---

## Oppgave 1: Full analyse og diagnose

Les og analyser følgende filer i detalj:

- `scripts/lib/vin-glass-resolver.mjs` — full gjennomgang av alle tre lag, identifiser gaps og dead code.
- `scripts/bootstrap-ktype-rapidapi.mjs` — kartlegg alle provider-lag og hvilke som faktisk fungerer i dag.
- `scripts/migrations/0010_vin_glass_hybrid.sql` — verifiser at alle tabeller og indekser er optimale for D1 SQLite og Supabase PostgreSQL.
- `api/cf-worker/` — finn Worker-routen for VIN/regnr-søk og kartlegg flyten fra HTTP-request til D1-query.
- `data/catalog-prod.json` — tell antall records med kType vs uten, identifiser hvilke bilmerker som mangler.

Gi rapporten din som en nummerert liste med rotårsak og impact per problem.

---

## Oppgave 2: Optimalisert VIN → KType motor

Bygg en fullstendig, optimalisert VIN → KType-motor som:

**Lag 0 — Ground truth cache (SQLite/D1)**
Slå opp i `glass_rules`-tabellen på nøkkelen `brand:model:year`. Dette er det raskeste og billigste laget. Returner direkte hvis confidence >= 0.90. Tabellen populeres automatisk av alle lag under.

**Lag 1 — SVV (Statens vegvesen, norske regnr)**
For norske registreringsnummer, kall SVV sitt åpne API (`https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=XX00000`) for å hente VIN, merke, modell og årsmodell. SVV er gratis og krever ingen autentisering. Lagre resultatet i `vin_decode_cache`.

**Lag 2 — NHTSA vPIC (gratis, global VIN-dekoding)**
Kall `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json` for å hente make, model, year, body class, doors, fuel type, drive type og plant country. Lagre i `vin_decode_cache` med 60 dagers TTL. Dette er gratis og krever ingen nøkkel.

**Lag 3 — RapidAPI K-Type Finder (freemium, 100M+ vehicles)**
Kall RapidAPI-endepunktet `https://ktype-finder-tecdoc.p.rapidapi.com/` med regnr eller VIN. Dette returnerer kType direkte fra TecDoc-data for over 100 millioner kjøretøy globalt. Gratis tier gir tilstrekkelig volum for bootstrapping. Bruk API-nøkkel fra miljøvariabelen `RAPIDAPI_KEY`.

**Lag 4 — RapidAPI VIN Decoder TECDOC (freemium, EU-fokus)**
Kall `https://vindecoder-tecdoc.p.rapidapi.com/` med VIN. Returnerer kType pluss full kjøretøyspesifikasjon for europeiske kjøretøy (DE, AT, BE, ES, FR, IT, PT, NO). Bruk API-nøkkel fra `RAPIDAPI_KEY`.

**Lag 5 — Bovsoft REGNUM (norsk regnr → kType, kun fra Node.js)**
Kall `http://54.38.179.43:150/bovsoft.regnum.run?id=461&seccode=726443558cec51db0e2d5ae5286d32df&nameservice=getktypefornorway&regnum={REGNR}&contenttype=JSON`. Dette er kun tilgjengelig fra Node.js scripts, ikke fra Cloudflare Workers. Bruk for batch-bootstrapping fra terminal.

**Lag 6 — MACS VIS (EU/KType, betalt)**
Kall `MACS_VIS_API_URL` med VIN for å hente KType/KBA med sannsynligheter. Bruk `MACS_VIS_API_KEY`. Faktureres per måned, ikke per kall.

**Lag 7 — AutoGlassMatch (US/NAGS, betalt per lookup)**
Kall `AGM_API_URL` med VIN og opening for å hente NAGS-delenummer. Koster $1 per vellykket oppslag. Bruk kun for US-marked eller der kType ikke er tilstrekkelig.

**Selvlæringsloop**
Etter hvert vellykket kType-treff fra lag 3–7: upsert resultatet i `glass_rules` med nøkkelen `brand:model:year`, oppdater `evidence_count`, og lagre konfidensscoren. Neste gang samme kjøretøy søkes, besvares det gratis fra lag 0.

**Kandidatscoring**
Når flere kType-kandidater returneres, ranger dem med denne scoring-modellen:
- make match: 0.20
- model match: 0.25
- year i range: 0.15
- body/construction match: 0.10
- engine/fuel match: 0.10
- drive system match: 0.05
- trim/generation match: 0.05
- glass feature compatibility: 0.10

Auto-accept hvis score >= 0.90. Send til `needs_confirmation` hvis 0.80–0.89. Send til `manual_review_queue` hvis under 0.80.

---

## Oppgave 3: Cloudflare Worker route

Opprett eller oppdater Worker-routen `POST /api/vin-lookup` i `api/cf-worker/` slik at den:

1. Aksepterer `{ regnr?: string, vin?: string, opening?: string, features?: object }` i request body.
2. Detekterer om input er norsk regnr (pattern `/^[A-Z]{2}[0-9]{4,5}$/`) eller VIN (17 tegn).
3. For norsk regnr: kall SVV først for å hente VIN, deretter videre til VIN-flyten.
4. Kjører lag 0 (glass_rules i D1) synkront.
5. Returnerer umiddelbart hvis cache-treff med confidence >= 0.90.
6. For cache-miss: returner `{ status: "pending", requestId }` og trigger asynkron enrichment via en Cloudflare Queue eller scheduled Worker.
7. Lagrer alle provider-kall i `provider_calls`-tabellen.
8. Returnerer `{ ktype, confidence, source, resolutionPath, match }` i response.

Husk at Cloudflare Workers ikke kan nå Bovsoft på port 150. Bovsoft er kun tilgjengelig fra Node.js scripts.

---

## Oppgave 4: Batch bootstrap script

Bygg et script `scripts/batch-bootstrap-ktype.mjs` som:

1. Leser `data/catalog-prod.json` og finner alle unike `brand + model + year`-kombinasjoner uten kType.
2. Prioriterer etter volum (hyppigst forekommende kombinasjoner først) etter Pareto-prinsippet — 20 % av modellene dekker 80 % av søkene.
3. For hver kombinasjon: prøv lag 3 (RapidAPI K-Type Finder) → lag 4 (RapidAPI VIN Decoder TECDOC) i tur og orden.
4. Lagre alle treff i `glass_rules` via Supabase.
5. Logger fremgang, kostnad og treffrate underveis.
6. Respekterer rate limits med konfigurerbar delay mellom kall (standard: 200ms).

---

## Oppgave 5: Observability og kostkontroll

Opprett et script `scripts/provider-stats.mjs` som:

1. Leser fra `provider_calls`-tabellen i Supabase.
2. Rapporterer: total kall per provider, suksessrate, median latency, total kostnad, cache hit rate, paid fallback rate.
3. Viser de topp 20 bilmodellene med flest cache-miss for å prioritere bootstrapping.
4. Eksporterer rapport til `data/provider-stats-{dato}.json`.

---

## Oppgave 6: glass_rules læringsloop i Worker

I Cloudflare Worker, etter hvert vellykket VIN → kType-oppslag fra en ekstern provider:

1. Upsert i D1 `glass_rules` med nøkkelen `brand:model:year`, oppdater `evidence_count` og `confidence`.
2. Sett KV-cache for `ktype:{brand}:{model}:{year}` med 24 timers TTL for lynrask fremtidig lookup.
3. Trigger ingen ekstra API-kall — skriv kun til D1 og KV.

---

## Tekniske krav

- All kode i ESM-format (`.mjs`) eller TypeScript.
- Miljøvariabler: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MACS_VIS_API_KEY`, `AGM_API_KEY`, `RAPIDAPI_KEY`, `SVV_API_KEY`.
- Alle DB-kall skal ha try/catch og logge til `provider_calls`.
- Ingen hardkodede API-nøkler i kode.
- D1-tabeller bruker SQLite-kompatibel SQL. Supabase bruker PostgreSQL.
- Cloudflare Worker er i `api/cf-worker/src/index.ts`.
- Node.js scripts er i `scripts/`.

---

## Leveranse

Etter analyse og kodeskriving, gi meg en rapport med:

1. **Rotårsaker** — hva er de tre viktigste problemene i dagens oppsett?
2. **Endringer gjort** — liste over alle filer opprettet eller modifisert.
3. **Dekning etter bootstrap** — estimert % kType-dekning etter batch-kjøring.
4. **Kost per lookup** — estimert gjennomsnittskostnad per VIN-søk med og uten cache.
5. **Neste steg** — prioritert backlog for launch readiness.

---

*Generert: 2026-05-21 | Prosjekt: bilglass.no | Workspace: /Users/taj/bilglass*
