# KIMI 2.6 — Utforsk Bovsoft API-et for bilglass.no

Du er senior arkitekt og tech lead for bilglass.no. Prosjektet ligger i `/Users/taj/bilglass` og bruker Cloudflare Workers, D1 SQLite, TypeScript og Node.js scripts. Vi har en viktig ekstern avhengighet: Bovsoft REGNUM returnerer kType direkte fra norske registreringsnummer, og en nylig funnet URL peker på Bovsoft sitt shopintegrator/calculator-API på port 400 med PrestaShop-tilknytning. Nå skal du utforske Bovsoft API-et grundig og finne ut om det kan gi oss bedre bulk- eller kalkulatorstøtte enn dagens REGNUM-oppsett.

Målet er å dokumentere hva Bovsoft API-et faktisk gjør, hvilke endepunkter som finnes, hvilke autentiseringskrav som gjelder, hvilke felter som returneres, og om det kan brukes til å forbedre eller erstatte deler av vår nåværende kType- og glassmatch-pipeline.

---

## Kontekst: Hva vi allerede vet

- `scripts/bootstrap-ktype.mjs` bruker Bovsoft REGNUM direkte mot `http://54.38.179.43:150/bovsoft.regnum.run` og får kType fra norsk regnr.
- I tidligere kjøringer fikk vi 6 vellykkede treff med Bovsoft, og resultatene inneholdt `regnr`, `ktype`, `vin`, `brand`, `model`, `body`, `type`, `yearFrom`, `yearTo`, `fuel`, `engineCode`, `hp`, `kw` og `freeRequests`.
- `data/bovsoft-bootstrap-results.json` eksisterer og viser at Bovsoft er en faktisk fungerende kType-kilde.
- En ny URL ble oppdaget: `http://webservice.bovsoft.com:400/bovsoft.shopintegrator.calculator.prestashop#new_offer_rent_shop`.
- Vi mistenker at dette er en PrestaShop-basert shopintegrator eller kalkulator, og at den kan ha ekstra API-funksjoner relatert til kType, eurocode, glassprodukter, prisberegning eller bulkoppslag.

---

## Oppgave 1: Finn dokumentasjon og endepunkter

Utforsk tilgjengelig offentlig dokumentasjon om Bovsoft ShopIntegrator / calculator / PrestaShop-integrasjon. Søk etter:
- Bovsoft shopintegrator calculator prestashop
- bovsoft api regnum ktype
- bovsoft webservice prestashop
- bovsoft calculator new_offer_rent_shop
- bovsoft regnum documentation

Finn ut:
1. Om API-et har offisielt dokumenterte endepunkter.
2. Om `new_offer_rent_shop` er en opprettelse av ny butikk, et kalkyle-endepunkt, eller bare en produktside i dokumentasjonen.
3. Om API-et kan gi oss bulk-tilgang til regnr → kType eller kun enkeltoppslag.
4. Om det finnes API-nøkler, klient-ID, seccode, eller andre autentiseringsmekanismer.

---

## Oppgave 2: Analyser eksisterende Bovsoft-integrasjon i repoet

Les disse filene og trekk ut all Bovsoft-relatert logikk:
- `scripts/bootstrap-ktype.mjs`
- `data/bovsoft-bootstrap-results.json`
- `docs/KTYPES-DATA-SOURCES.md`
- `docs/RAPIDAPI-AUTOWAYS-PORTFOLIO.md`
- eventuelle filer som inneholder `bovsoft`, `regnum`, `shopintegrator` eller `calculator`

Svar konkret på:
1. Hvilke felter returneres i dag fra Bovsoft REGNUM.
2. Om det finnes tegn til at shopintegrator API-et kan returnere mer enn REGNUM.
3. Om vi kan gjenbruke samme auth-mønster for kalkulator-API-et.
4. Om det er tegn til rate limits eller gratis kvote.

---

## Oppgave 3: Identifiser praktisk bruk for bilglass.no

Bestem om Bovsoft ShopIntegrator kan brukes til en av disse rollene:
- Direkte kType-kilde for norske regnr.
- Kalkulator for glasspris per kType/eurocode.
- Bulk import-kilde for katalogberikelse.
- Sanity-check for eksisterende data i `glass_rules`.
- Fallback for mangel på MACS VIS eller Vincario.

Lag en tydelig anbefaling:
- hva vi bør bruke Bovsoft til nå,
- hva vi ikke bør bruke det til,
- og hva som eventuelt er verdt å spørre Bovsoft om direkte.

---

## Oppgave 4: Lag en teknisk integrasjonsplan

Hvis API-et virker nyttig, lag et konkret forslag til integrasjon i repoet:

1. Ny fil for dokumentasjon, for eksempel `docs/BOVSOFT-API.md`.
2. Eventuell ny klient, for eksempel `scripts/lib/bovsoft-client.mjs` eller `api/cf-worker/src/providers/bovsoft.ts`.
3. Hvordan vi bør håndtere secrets og konfigurasjon.
4. Hvordan feil, rate limits og timeouts skal logges.
5. Hvordan responsen bør mappes til våre interne typer:
   - `regnr`
   - `vin`
   - `ktype`
   - `brand`
   - `model`
   - `yearFrom`
   - `yearTo`
   - `fuel`
   - `engineCode`
   - `glassCategory`
   - `eurocode`
   - `price`

---

## Oppgave 5: Finn risikofaktorer

Vurder og dokumenter:
- Om API-et sannsynligvis er knyttet til en PrestaShop-installasjon og derfor ikke egner seg for høyfrekvent batchbruk.
- Om port 400-tilgangen er mer stabil enn port 150.
- Om dette kan være en intern admin- eller shopkalulator i stedet for et rent API.
- Om vi trenger manuell godkjenning eller kontrakt for produksjonsbruk.

---

## Oppgave 6: Leveranse

Gi meg en kort og presis rapport med:
1. Hva Bovsoft ShopIntegrator sannsynligvis er.
2. Hvilke funksjoner eller endepunkter vi realistisk kan bruke.
3. Om det kan forbedre vår kType-bootstrap eller glass-kalkulator.
4. Om det er verdt å investere tid i nå.
5. En anbefalt neste handling, prioritert etter impact og risiko.

---

## Viktige regler

- Ikke anta noe uten kilde eller tydelig kodebevis.
- Ikke skriv generelle markedsføringssetninger. Vær teknisk, konkret og kritisk.
- Prioriter det som faktisk øker dekning, stabilitet og launch readiness.
- Hvis API-et ikke kan verifiseres offentlig, si tydelig at det er usikkert.
- Hvis du finner dokumentasjon, oppsummer kun det som er relevant for implementasjon.

---

## Suksesskriterium

Jeg vil ha en faktabasert vurdering av om Bovsoft ShopIntegrator er en ekte teknisk mulighet for bilglass.no — ikke bare en webside. Hvis det kan brukes, skal du foreslå hvordan. Hvis det ikke kan brukes, skal du si det tydelig og forklare hvorfor.

*Generert: 2026-05-22 | Prosjekt: bilglass.no | Workspace: /Users/taj/bilglass*
