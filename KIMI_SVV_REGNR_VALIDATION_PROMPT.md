# KIMI 2.6 — Bygg pipeline for 1000 validerte norske regnr via SVV API

Du er senior arkitekt og tech lead for bilglass.no. Prosjektet ligger i `/Users/taj/bilglass` og bruker Cloudflare Workers, D1 SQLite, TypeScript og Node.js scripts. Vi trenger nå en reell og validert liste med 1000 norske registreringsnummer for testing og bootstrap av kType-mapping. Tidligere ble det brukt placeholder-regnr som `BS12345` og `AB12345`, men disse gir ikke ekte dekning. Nå skal du bygge en komplett pipeline som finner, validerer, dedupliserer og prioriterer ekte norske regnr ved å bruke Statens vegvesen sitt API for kjøretøyopplysninger.

Målet er å produsere disse filene:
- `data/regnr-candidates.txt` — rå kandidatliste
- `data/regnr-validated.json` — validerte treff fra SVV
- `data/regnr-liste.txt` — ferdig liste med 1000 gyldige norske regnr
- `data/regnr-validation-report.json` — statistikk, feilrate, duplikater, topp-merker

---

## Kontekst

Eksisterende kodebase har allerede:
- `api/cf-worker/src/vin-lookup-api.ts` med SVV-integrasjon for regnr → VIN
- `scripts/bootstrap-ktype.mjs` for Bovsoft-oppslag på regnr
- `scripts/batch-bootstrap-ktype.mjs` som analyserer 2 882 unike `brand:model:year`-kombinasjoner uten kType
- `data/batch-bootstrap-report.json` med topp-merker uten dekning: Toyota, VW, Ford, Mercedes, BMW, Hyundai, Audi, Kia, Renault, Mazda, Nissan, Peugeot, Honda, Volvo, Lexus, Citroen, Skoda, Vauxhall, Porsche, Fiat
- `data/populaere-regnr.txt` som i dag inneholder placeholder-regnr og må erstattes

Vi trenger ekte regnr for å kunne bruke Bovsoft REGNUM effektivt. Vi har 333 Bovsoft-søk tilgjengelig, så vi trenger i første omgang minst 1000 validerte regnr slik at vi kan velge ut de mest relevante 333.

---

## Oppgave 1: Analyser eksisterende SVV-integrasjon

Les og analyser disse filene:
- `api/cf-worker/src/vin-lookup-api.ts`
- `api/cf-worker/src/index.ts`
- eventuelle hjelpefunksjoner som brukes for SVV-oppslag

Finn ut:
1. Hvilket eksakt SVV-endepunkt som brukes for regnr → kjøretøydata.
2. Hvilke headers, auth-krav eller query-parametere som trengs.
3. Hvordan responsen ser ut: VIN, merke, modell, årsmodell, drivstoff, etc.
4. Om API-et har rate limits eller spesielle begrensninger.

Hvis dagens integrasjon er ufullstendig eller svak, forbedre den og gjenbruk samme logikk i et Node.js-script.

---

## Oppgave 2: Bygg Node.js-script for SVV-validering

Opprett et nytt script:

`scripts/validate-regnr-svv.mjs`

Dette scriptet skal:

1. Lese kandidater fra `data/regnr-candidates.txt` (ett regnr per linje).
2. Normalisere input til store bokstaver og trimme whitespace.
3. Filtrere på norsk regnr-pattern: `^[A-Z]{2}[0-9]{4,5}$`
4. Kalle SVV API for hvert regnr og validere om det finnes et ekte kjøretøy.
5. Ekstrahere minst disse feltene fra responsen:
   - `regnr`
   - `vin`
   - `brand`
   - `model`
   - `year`
   - `fuel`
   - `bodyStyle`
   - `validatedAt`
6. Skrive alle gyldige treff til `data/regnr-validated.json`
7. Skrive bare regnr-feltene til `data/regnr-liste.txt`
8. Skrive en rapport til `data/regnr-validation-report.json` med:
   - totalt antall kandidater
   - antall gyldige
   - antall ugyldige
   - antall duplikater
   - topp 20 merker
   - topp 20 modeller
   - feilrater per type

Tekniske krav:
- Bruk `fetch` i Node.js 20+ eller `undici`
- Konfigurerbar concurrency (default 5)
- Retry 3 ganger ved 429/5xx
- Delay mellom retries
- Progress logging til stdout
- Tåler avbrutt kjøring og kan gjenoppta ved å lese eksisterende `regnr-validated.json`

---

## Oppgave 3: Skaff kandidater lovlig og praktisk

Vi har ikke 1000 ekte regnr i dag. Du skal derfor bygge en pipeline for å lage kandidatliste på lovlig og praktisk måte.

Lag et script:

`scripts/build-regnr-candidates.mjs`

Dette scriptet skal generere `data/regnr-candidates.txt` ved å kombinere flere kilder:

1. **Eksisterende interne kilder i prosjektet**
   - søk gjennom `data/` etter filer som kan inneholde regnr
   - søk gjennom logger, gamle bootstrap-resultater, JSON-filer, cache-filer og ordre-mappinger
   - spesielt: `data/bovsoft-bootstrap-results.json`, `data/ground-truth-report.json`, `data/orders-eurocode-mapping.json`

2. **Manuell seed-liste i repoet**
   - bruk ekte treff fra `bovsoft-bootstrap-results.json`
   - bruk alt gyldig fra tidligere kjøringer

3. **Ekstern brukerinput-fil**
   - hvis filen `data/regnr-manual-seed.txt` finnes, les den også inn

4. **Prioritering etter gap-rapport**
   - forsøk å merke kandidater som sannsynligvis tilhører topp-merker: Toyota, VW, Ford, Mercedes, BMW, Hyundai, Audi, Kia

Scriptet skal deduplisere alt og skrive en samlet rå kandidatliste til `data/regnr-candidates.txt`.

Viktig: Ikke finn på regnr. Ikke generer syntetiske nummerskilt. Kun faktiske regnr fra eksisterende data eller eksplisitt manuell seed-fil.

---

## Oppgave 4: Prioriteringsalgoritme for de 333 viktigste

Når vi har 1000 validerte regnr, trenger vi en prioritering for hvilke 333 som skal brukes mot Bovsoft først.

Lag et script:

`scripts/prioritize-regnr-for-bovsoft.mjs`

Dette scriptet skal:
1. Lese `data/regnr-validated.json`
2. Score hvert regnr basert på:
   - om merke er i topp 20 gap-listen
   - om merke er i topp 8 gap-listen
   - om modell/år ser ut som vanlige biler i Norge
   - om kjøretøyet sannsynligvis matcher mange kataloglinjer
3. Lage disse filene:
   - `data/regnr-top-333.txt`
   - `data/regnr-top-1000-ranked.json`
4. Hver ranked entry skal ha:
   - `regnr`
   - `brand`
   - `model`
   - `year`
   - `score`
   - `reason`

Scoring-regler:
- Topp 8 gap-merke: +40
- Topp 20 gap-merke: +20
- Personbil/stasjonsvogn/SUV: +10
- Varebil/lette nyttekjøretøy: +5
- Eksotisk/lavvolum-merke: -20
- Årsmodell 2005–2022: +10
- Eldgammelt eller svært nytt kjøretøy: -5

---

## Oppgave 5: Gjenbruk i Worker og fremtidig drift

Refaktorer om nødvendig slik at SVV-oppslagslogikken kan gjenbrukes både i Worker og i Node.js-script.

Hvis det er hensiktsmessig:
- flytt SVV-klienten til `api/cf-worker/src/providers/svv.ts`
- gjenbruk samme parsing-logikk i `vin-lookup-api.ts` og `scripts/validate-regnr-svv.mjs`

Målet er én sannhet for hvordan SVV-respons parses.

---

## Oppgave 6: Leveranse og verifisering

Kjør hele pipelinen i denne rekkefølgen:
1. bygg kandidater
2. valider kandidater mot SVV
3. ranger topp 333

Gi meg så en rapport med:
1. Hvor mange rå kandidater ble funnet
2. Hvor mange ble validert mot SVV
3. Hvor mange unike merker/modeller fikk vi
4. Hvor mange av topp 20 gap-merkene er dekket
5. Hvor mange regnr er klare for Bovsoft nå
6. Hvilke filer ble opprettet eller modifisert
7. Eventuelle blokkere for å nå 1000 gyldige regnr

---

## Viktige regler

- Ikke bruk syntetiske regnr.
- Ikke bruk placeholders.
- Ikke anta at et regnr er gyldig før SVV har bekreftet det.
- Ikke stopp ved første feil — bygg robust retry/logging.
- All output skal skrives til filer i `data/` eller `scripts/`.
- TypeScript/ESM må være ren og kjørbar kode.
- Hvis du ikke kommer til 1000 med interne data, skal du fortsatt levere full pipeline og si eksakt hvor mange gyldige du fikk.

---

## Suksesskriterium

Suksess er ikke bare kode. Suksess er at repoet etter kjøring inneholder en reell, validert og prioritert regnr-liste klar for Bovsoft-bootstrap, slik at vi kan bruke de 333 tilgjengelige oppslagene på biler som faktisk flytter kType-dekningen mest.

*Generert: 2026-05-22 | Prosjekt: bilglass.no | Workspace: /Users/taj/bilglass*
