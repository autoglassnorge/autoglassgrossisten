# Autoglass AS: AI-first plan for Europas ledende bilglassplattform

Dato: 2026-06-09  
Status: Planforslag, klar for prioritering  
Kildegrunnlag: MemPalace, AGENTS.md, dagens repoanalyse, eksisterende ordremottaker/kType-arkitektur  
Ambisjon: Autoglass AS skal bli Europas mest presise, raskeste og mest AI-drevne B2B-leverandor av bilglass.

## 1. Executive Summary

Autoglass AS bor posisjoneres som en AI-drevet presisjonsplattform for bilglass, ikke som en vanlig nettbutikk. Kjerneopplevelsen skal vaere:

> Kunden oppgir reg.nr, VIN, OEM, eurocode eller en naturlig beskrivelse. Plattformen finner riktig glass, forklarer hvorfor, sjekker lager og foreslar tilbehor, kalibrering og ordreutkast.

Det viktigste grepet er aa flytte hele nettstedet fra katalog-forst til kjoretoy-forst:

1. Unified AI Search som primar inngang pa hele nettstedet.
2. Professor Autoglass som copilot gjennom sok, verifisering, tilbud og ordre.
3. Forklarbare resultater med confidence, matchlag, utstyr og kontrollsporsmal.
4. B2B-arbeidsflyt med hurtigordre, siste sok, kundepriser og "samme som sist".
5. Data-moat rundt ground truth, kType, TecDoc, SVV, lager og kundefeedback.

Tall som skal brukes konsekvent:

- 133 000 glass pa lager
- 27 000 forskjellige glassvarianter
- 30 ars domeneerfaring
- B2B-levering til verksteder i Norge, med europeisk ekspansjon som produktretning

## 2. MemPalace Context

Planen bygger pa disse etablerte faktaene fra MemPalace:

- `B2B-MODERN-FRONTEND-PLAN.md`: reg.nr forst, type-tabs, pris/lager direkte, B2B-kort, confidence og ground truth.
- `PROJECT_STATE.md`: locked matching strategy: ground_truth, kType exact, TecDoc fallback, brand/model/year/equipment scoring.
- `TASK-8-BOVSOFT-STRATEGIC.md`: 137 strategiske Bovsoft-treff, 54 prosent hit-rate, men moderne premium/EV-modeller har lav katalogdekning.
- `AGENTS.md`: kType Family matching er etablert som fallback, ordremottaker-LLM er definert med mal om under 4 dialogrunder, over 95 prosent noyaktighet og over 60 prosent konvertering.
- Repoanalyse 2026-06-09: frontend bygger, men Worker TypeScript feiler. Dette ma ryddes for AI-satsingen skaleres.

Konsekvens:

AI-opplevelsen ma bygges oppa deterministic matching. LLM skal ikke gjette riktig glass alene. Den skal tolke input, styre dialog, forklare treff og vite nar den ma be om kontrollsporsmal.

## 3. Produktposisjonering

### 3.1 Ny posisjon

Primar posisjon:

> Europas AI-drevne bilglassgrossist for verksteder.

Mer operasjonell versjon:

> Finn riktig bilglass pa sekunder med reg.nr, VIN, OEM, eurocode eller naturlig sprak.

### 3.2 Hero-copy

Anbefalt hero:

```text
Finn riktig bilglass med AI

Sok med reg.nr, VIN, OEM, eurocode eller beskriv bilen.
133 000 glass pa lager. 27 000 forskjellige varianter.
```

Primare CTA-er:

- Finn glass
- Sporr Professor Autoglass
- Bla i katalog

Sekundaere trust-signaler:

- 133 000 glass pa lager
- 27 000 varianter
- B2B support fra bilglasseksperter
- ADAS og utstyr verifiseres for bestilling

### 3.3 Hva nettstedet ikke skal vaere

- Ikke en generisk Shopify-aktig katalog.
- Ikke en chatbot med katalog ved siden av.
- Ikke markedsforing forst og arbeidsflyt senere.
- Ikke AI som overstyrer matchlogikken.

Nettstedet skal foles som et arbeidsverktøy for verksteder: raskt, presist, tett og forklarbart.

## 4. Strategiske Pilarer

### Pilar 1: Unified AI Search

En felles sokeboks skal forsta:

- Reg.nr: `AB12345`
- VIN: 17 tegn
- OEM-nummer
- Eurocode
- SKU/artikkelnummer
- Naturlig sprak: "frontrute til VW Transporter 2005 med regnsensor"
- Kundeintensjon: "jeg trenger samme som sist"

Input skal rutes deterministisk via `InputTypeDetector` og Worker-endepunkter. LLM brukes til NER og dialog nar input er ustrukturert.

### Pilar 2: Forklarbar Presisjon

Alle resultater skal vise hvorfor de er anbefalt:

- Matchlag: ground_truth, kType, TecDoc, kType Family, brand/model/year, fuzzy.
- Confidence: exact, high, medium, low.
- Vehicle: merke, modell, ar, karosseri, kType/VIN hvis tilgjengelig.
- Equipment: kamera, regnsensor, varme, HUD, akustisk, antenne, toning.
- Kontroll: "Sjekk om bilen har kamera i ruten" nar confidence ikke er exact.

Dette bygger tillit og reduserer feilbestillinger.

### Pilar 3: Professor Autoglass som Copilot

Professor Autoglass skal bli produktets AI-lag:

- Forklarer soket.
- Stiller neste beste sporsmal.
- Kan sammenligne to ruter.
- Foreslar lim, klips, list, kalibrering og tilbehor.
- Kan lage tilbudsutkast.
- Kan eskalere til menneske med ferdig sammendrag.

Professoren skal vaere synlig i hele flyten, men ikke blokkere raskt direkte sok.

### Pilar 4: B2B Kjopeflyt

Verkstedkunden skal kunne jobbe raskt:

- Siste kjoretoy.
- Lagrede kjoretoy.
- "Samme som sist".
- Hurtigordre fra resultatkort.
- Kundepris og listepris.
- Lagerstatus og leveringstid.
- Tilbud/ordreutkast.
- Flere leveringsadresser.
- Historikk per kunde.

### Pilar 5: Data-moat

Konkurransefortrinnet skal ikke bare vaere nettsiden, men datagrunnlaget:

- Ground truth for reg.nr/VIN/eurocode.
- kType og kType Family.
- TecDoc/TecAlliance langsiktig.
- SVV og Bovsoft som kjoretoyidentitet.
- Kundefeedback etter passform.
- Search history uten persondata, hash-basert.
- Lagerdata som prioriterer det som faktisk kan leveres.

### Pilar 6: Europeisk Skalerbarhet

Arkitekturen ma klargjores for:

- Flere sprak: norsk, svensk, dansk, engelsk, tysk.
- Flere markeder og lands-spesifikke reg.nr-oppslag.
- Valuta og MVA-regler.
- Lokale leveringslofter.
- Landspesifikke datasett og TecDoc-varianter.
- API for storverksteder og partnere.

## 5. Ny Informasjonsarkitektur

### 5.1 Startside

1. AI Search Hero
   - H1: "Finn riktig bilglass med AI"
   - Unified input
   - Tabs/auto-detection: reg.nr, VIN, OEM, eurocode, fritekst
   - Stats: 133 000 lagerglass, 27 000 varianter, B2B support
   - Professor-knapp som hjelp, ikke primar barriere

2. Trust Bar
   - Pilkington, Saint-Gobain Sekurit, AGC, PGW, Glavista, Fuyao, XYG, NordGlass, Euroglass

3. Hurtigvalg
   - Frontrute
   - Bakrute
   - Dorrute forer/passasjer
   - Sideglass
   - Takglass
   - ADAS/kamera

4. Hvordan AI-matchingen fungerer
   - 3 enkle steg: kjoretoy, utstyr, riktig glass
   - Ikke teknisk tungt, men forklarbart

5. Populaere merker og modeller
   - VW Transporter, BMW X5, Volvo XC60, Mercedes Vito, Ford Transit, Audi Q5
   - Bygges fra faktiske sok/data

6. B2B-fordeler
   - Lager, pris, rask levering, support, faktura, teknisk hjelp

7. ADAS og utstyr
   - Kamera, regnsensor, HUD, varme, akustisk

8. Avsluttende CTA
   - "Start sok"
   - "Kontakt ordre"
   - "Sok om B2B-konto"

### 5.2 Sok/resultatside

Resultatsiden bor bli kjerneproduktet:

- Vehicle summary sticky top.
- Confidence banner.
- Glass-type tabs med antall.
- Best match forst.
- Sammenligningsmodus.
- Equipment verifier ved medium/low confidence.
- Professor-panel til hoyre pa desktop, bottom sheet pa mobil.
- "Legg i tilbud" og "Legg i ordre".

### 5.3 Produktdetalj

Produktdetalj skal vise:

- Hvilke biler/glassposisjoner produktet passer til.
- Equipment-tags.
- Lager og levering.
- Alternativer.
- Tilbehor.
- Kalibreringsbehov.
- OEM/NAGS/eurocode.
- "Sporr Professoren om dette glasset".

### 5.4 Katalog/browse

Katalogen skal fortsatt finnes, men ikke vaere primar:

- Merke -> modell -> ar -> glasstype.
- Filter pa posisjon, utstyr, lager, produsent.
- Bra for SEO og manuell kontroll.

### 5.5 Kunnskap/SEO

Bygg autoritetssider:

- Hva er eurocode?
- OEM vs OEE bilglass.
- ADAS-kalibrering etter ruteskift.
- Frontrute med kamera.
- Regnsensor og lysensor.
- Merke/modell-sider: "Frontrute VW Transporter", "BMW X5 frontrute", "Volvo XC60 frontrute".

Disse sidene skal kobles til faktisk sok og katalog, ikke bare vaere artikler.

## 6. AI-Arkitektur

### 6.1 Prinsipp

LLM skal aldri vaere autoritativ kilde for passform. LLM skal:

- Tolke brukerinput.
- Kalle verifiserbare verktoy/API-er.
- Lage forklaringer.
- Stille kontrollsporsmal.
- Oppsummere ordre.

### 6.2 Foreslatt flyt

```text
User input
  -> Input classifier
  -> Structured extraction
  -> Vehicle resolver
  -> Matching engine
  -> Equipment verifier
  -> Confidence scorer
  -> Result renderer
  -> Professor explanation/order assistant
```

### 6.3 Tool contract for Professor Autoglass

Professoren bor fa eksplisitte tool calls:

- `resolveVehicle(input)`
- `searchGlass(vehicle, filters)`
- `getProduct(productId | eurocode)`
- `compareProducts(productIds)`
- `verifyEquipment(vehicle, candidates)`
- `getStock(productId)`
- `buildQuote(cart, customerContext)`
- `handoffToHuman(sessionSummary)`

Responsformat ma vaere strukturert JSON med:

- `message`
- `intent`
- `extracted`
- `requiredQuestions`
- `recommendedProducts`
- `confidence`
- `nextAction`
- `handoffRequired`

### 6.4 Guardrails

- Ved `medium` eller `low` confidence ma AI stille sporsmal for equipment eller posisjon.
- Ved manglende modell/ar skal AI aldri anbefale konkret glass direkte.
- Ved konflikt mellom AI og matchlogikk vinner matchlogikk.
- Ved manglende lager skal AI foresla alternativ eller bestillingsvare med tydelig levering.
- Hver anbefaling ma ha `reasonCodes`.

## 7. Data og Backend

### 7.1 Dagens styrker

- D1/KV/Worker-arkitektur er etablert.
- kType Family finnes.
- Ordremottaker finnes.
- Ground truth og matching-lag er dokumentert.
- auto-glass.no-data gir 27 000 forskjellige varianter.

### 7.2 Dagens risikoer som ma loses forst

- Worker TypeScript feiler.
- `GlassRecord.properties` mismatch mellom schema og type.
- Nullable `eurocode` brukes som non-null string.
- Testfiler i Worker inngar i produksjons-tsconfig.
- Hardkodet SVV-nokkel i script ma fjernes og roteres.
- Daily SVV workflow pusher direkte til `main`.

### 7.3 Nye tabeller eller schema-utvidelser

Forslag:

```sql
CREATE TABLE ai_search_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  customer_id TEXT,
  input_raw TEXT NOT NULL,
  input_type TEXT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  confidence TEXT,
  result_count INTEGER,
  converted INTEGER DEFAULT 0
);

CREATE TABLE ai_search_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE product_fitment_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  regnr_hash TEXT,
  vin_prefix TEXT,
  fitment_status TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE quote_drafts (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  cart_json TEXT NOT NULL,
  ai_summary TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.4 Data priorities

1. Rydd type/schema slik Worker kompilerer.
2. Fiks consistent product model mellom D1, Worker og frontend.
3. Utvid `properties` til en typet kontrakt.
4. Prioriter moderne premium/EV-modeller som MemPalace Task 8 avdekket:
   - BMW iX/i4/X1/X5
   - Mercedes GLC/GLE
   - Volvo XC60/XC90 II
   - Audi Q5/A6/A7
   - VW Transporter
   - Ford Transit/Custom
5. Bygg feedback-loop fra kundens valg og ordre.

## 8. Roadmap

### Fase 0: Stabilisering og hygiene

Tid: 2-4 dager  
Mal: Gjore repoet trygt aa bygge videre pa.

Leveranser:

- Worker `npx tsc --noEmit` gronn.
- Fjern hardkodet SVV-nokkel og roter secret.
- PR Verify inkluderer frontend build/test.
- Daily SVV workflow endres fra direct push til PR/artifact.
- Konsistente tall pa frontend: 133 000 lagerglass, 27 000 varianter.
- Feature flag for ny AI-startside.

Akseptanse:

- `api/cf-worker npx tsc --noEmit` passerer.
- `frontend npm run build` passerer.
- `frontend npm test -- --run` passerer.
- Ingen hardkodede API-nokler i `rg`.

### Fase 1: AI-first startside

Tid: 1 uke  
Mal: Forste skjerm skal kommunisere Europas mest moderne bilglassplattform.

Leveranser:

- Ny hero basert pa `HeroWithSearch`, ikke bilde-forst `HeroProfessor`.
- Unified input med auto-detection.
- Professor Autoglass som sekundar copilot.
- TrustBar og B2B-statistikk oppdatert.
- Quick categories med glassposisjon.
- Populaere merker/modeller fra data.
- Ny SEO-title/description med riktige tall.

Akseptanse:

- Bruker kan starte reg.nr-sok fra hero.
- Bruker kan starte fritekst/Professor-dialog fra hero.
- Mobilflyt er like rask som desktop.
- Ingen layout shift eller tekstoverlapp pa 375px/768px/1440px.

### Fase 2: Unified Search og forklarbare resultater

Tid: 2-3 uker  
Mal: Ett sok skal kunne forsta alle relevante inputtyper.

Leveranser:

- `InputTypeDetector` utvidet for reg.nr, VIN, OEM, eurocode, SKU, fritekst.
- Worker-endepunkt for unified search.
- Resultatrespons med `confidence`, `reasonCodes`, `matchLayer`.
- Vehicle summary.
- Glass-type tabs.
- Best match og alternativer.
- Equipment verifier for usikre treff.

Akseptanse:

- Reg.nr-sok viser matchlag og confidence.
- Fritekst som "VW Transporter 2005 frontrute med regnsensor" gir strukturert sok.
- Medium/low confidence krever kontrollsporsmal.
- Resultatkort viser lager, pris, typeCode, equipment og CTA.

### Fase 3: Professor Autoglass 2.0

Tid: 3-5 uker  
Mal: Professoren blir en ekte B2B ordremottaker-copilot.

Leveranser:

- Strukturert tool-calling-kontrakt.
- Session memory per samtale.
- RAG/FAQ fra `ordremottaker-knowledge`.
- Produktforklaring og sammenligning.
- Tilbehorsforslag.
- Quote draft.
- Human handoff med sammendrag.

Akseptanse:

- Minst 80 prosent av testdialoger kommer til korrekt neste handling.
- Gjennomsnitt under 4 dialogrunder for vanlige saker.
- AI anbefaler ikke konkret glass uten nok data.
- Handoff inkluderer reg.nr/VIN, vehicle, kandidater, usikkerhet og sporsmal.

### Fase 4: Accuracy engine og data-moat

Tid: 4-8 uker  
Mal: Oyke noyaktighet og bygge proprietaer datakapital.

Leveranser:

- Ground truth workflow.
- Fitment feedback etter ordre.
- Analytics for no-result, low-confidence og feil glass.
- Kataloggap-dashboard for moderne modeller.
- kType Family og TecDoc prioritering etter faktisk ettersporsel.
- Ukentlig quality gate.

Akseptanse:

- Dashboard viser exact/high/medium/low per merke/modell.
- Feil/glass-passform kan rapporteres og lagres.
- Topp 20 datagap har owner og tiltak.
- Matchforbedring kan males fra uke til uke.

### Fase 5: B2B portal og ordreautomatisering

Tid: 6-10 uker  
Mal: Gjore Autoglass til daglig arbeidsflate for verksteder.

Leveranser:

- Kundeinnlogging.
- Kundepriser.
- Lagrede kjoretoy.
- Siste sok.
- Reorder.
- Favoritter.
- Tilbud/ordreutkast.
- Flere leveringsadresser.
- Faktura/EHF-grunnlag.
- UNI Micro-forberedelse.

Akseptanse:

- Eksisterende kunde kan finne og legge glass i ordre pa under 60 sekunder.
- "Samme som sist" fungerer for tidligere kjoretoy/ordre.
- Ordreutkast kan sendes til intern ordrebehandling.

### Fase 6: Europeisk ekspansjonsklar plattform

Tid: 3-6 maneder  
Mal: Gjore plattformen klar for flere land og storre partnere.

Leveranser:

- Sprak: NO, SE, DK, EN, DE.
- Country-aware vehicle lookup abstraction.
- Valuta/MVA/fraktmodul.
- Europeiske SEO-landingssider.
- Partner/API-modul.
- TecAlliance/TecDoc langsiktig datalisens vurdert.

Akseptanse:

- Samme produktflyt kan kjore pa minst to sprak.
- Sokeflyten er klar for annet lands reg.nr-provider.
- Produktdata kan segmenteres per marked.

## 9. PR- og Leveranseplan

Anbefalt PR-rekkefolge:

1. `fix/worker-typecheck-and-secrets`
   - TypeScript, hardkodet secret, CI.

2. `feat/home-ai-first-hero`
   - Ny startside hero, riktige tall, feature flag.

3. `feat/unified-search-input`
   - Input detector, frontend routing, API-kontrakt.

4. `feat/explainable-search-results`
   - Confidence UI, reason codes, type tabs.

5. `feat/professor-tool-contract`
   - Professor 2.0 tool calling og session.

6. `feat/fitment-feedback-loop`
   - Feedback, analytics, ground truth hooks.

7. `feat/b2b-quote-drafts`
   - Handlekurv til tilbud/ordreutkast.

Hver PR skal ha:

- Lokal build/test.
- Screenshots for desktop og mobil hvis frontend.
- Smoke-test hvis Worker.
- Data quality gate hvis katalog/schema endres.
- Ingen store MemPalace/data-artefakter blandet med frontendkode.

## 10. KPI-er

North Star:

- Riktig glass funnet og lagt i tilbud/ordre pa under 60 sekunder.

Produkt-KPI-er:

- Search success rate.
- Exact/high confidence rate.
- No-result rate.
- Conversion fra sok til cart/quote.
- Gjennomsnittlige dialogrunder i Professor.
- Andel AI-dialoger som krever human handoff.
- Fitment error rate.
- Time to first result.
- Mobile conversion.

Data-KPI-er:

- kType coverage.
- kType Family hit rate.
- Ground truth count.
- Modern model coverage.
- Lagerdekningsgrad per toppmodell.
- Antall nye verifiserte mappings per uke.

Business-KPI-er:

- Nye B2B-kontoer.
- Gjentakende kunder.
- Ordreverdi.
- Andel ordre via selvbetjening.
- Supporttid spart.

## 11. Designretning

Visuelt uttrykk:

- Modern, presis, industriell B2B.
- Mork karbonbase med cyan/glasstoner som aksent.
- Mer hvit/lys flate i produkt/resultat for lesbarhet.
- Store tall, tydelige tabeller, kompakte kort.
- Ikke dekorative gradient-orbs eller markedsforingscards.

Komponenter:

- Command-search hero.
- Confidence badge.
- Match explanation panel.
- Vehicle card.
- Equipment chips.
- Type-code tabs.
- Product comparison rows.
- Professor side panel.
- Sticky cart/quote bar.

## 12. Risikoer og Kontroller

| Risiko | Kontroll |
|---|---|
| AI anbefaler feil glass | LLM far aldri overstyre deterministic confidence; medium/low krever sporsmal |
| Datagap for moderne biler | Gap-dashboard og prioriterte imports fra Task 8 |
| CI/deploy stopper | Fase 0 forst: Worker typecheck, frontend verify, secrets |
| Direkte data-push til main | Daily workflows skal lage PR/artifacts |
| Inkonsistente lager-/produkt-tall | En felles constants/config-kilde |
| Lav tillit til AI | Forklarbare reason codes og matchlag |
| SEO svekkes av app-fokus | Kunnskapssider og merke/modell landingssider |
| Europa-ambisjon blir for bred | Start med Norge, bygg country abstraction tidlig |

## 13. Beslutninger som trengs

1. Skal "Europas ledende" brukes som offentlig claim na, eller som intern ambisjon?
   - Anbefaling: bruk "bygget for aa bli Europas ledende AI-drevne bilglassplattform" inntil claim kan dokumenteres.

2. Skal Professor Autoglass bruke en personlig figur/bilde videre?
   - Anbefaling: ja, men ton ned maskot. Gjør ham til copilot-panel og ekspertstemme.

3. Skal kunder kunne bestille direkte eller bare sende foresporsel?
   - Anbefaling: start med tilbud/ordreutkast. Direkte ordre nar pris, lager og kundeavtaler er stabile.

4. Skal europeisk ekspansjon starte med sprak eller datakilder?
   - Anbefaling: sprak og struktur forst, deretter landspesifikk reg.nr-provider.

## 14. Neste 10 Arbeidsoppgaver

1. Fiks Worker typecheck.
2. Fjern og roter hardkodet SVV-nokkel.
3. Legg frontend build/test i PR Verify.
4. Lag felles `businessMetrics`/copy constants for 133 000 og 27 000.
5. Bytt startsiden til AI-first hero bak feature flag.
6. Utvid unified input detection.
7. Definer ny `SearchResult.confidence` kontrakt.
8. Bygg confidence UI og match explanation.
9. Gjør Professor Autoglass til side panel i sok/resultat.
10. Legg inn fitment feedback event etter cart/quote.

## 15. Definition of Done for Forste Lansering

Forste AI-first lansering er klar nar:

- Startside er AI-search-first.
- Tallene er korrekte: 133 000 lagerglass, 27 000 varianter.
- Reg.nr, VIN, OEM/eurocode og fritekst har tydelig inngang.
- Professor Autoglass kan hjelpe uten aa blokkere direkte sok.
- Resultater viser confidence og hvorfor.
- Frontend og Worker bygger rent.
- Smoke-test passerer.
- Ingen hardkodede secrets.

## 16. Kort Konklusjon

Autoglass AS har allerede det viktigste grunnlaget: domeneekspertise, lager, katalog, kType/TecDoc-arbeid og en begynnende ordremottaker-AI. Neste steg er aa samle dette i ett tydelig produkt:

> En AI-drevet B2B-plattform der verkstedet finner riktig bilglass raskere og tryggere enn hos noen tradisjonell leverandor.

Start med stabilisering og ny startside. Deretter bygg unified search, forklarbare resultater og Professor Autoglass som copilot. Den rekkefolgen gir raskest synlig effekt uten aa svekke noyaktighet eller produksjonsstabilitet.
