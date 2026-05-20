# Epost til TecDoc-services.com / CPS Gmb

**Dato:** 2026-05-20
**Til:** admin@bovsoft.com
**Emne:** Forespørsel om TecDoc TAF-data for bilglass-katalog (Autoglass AS)

---

Hei,

Jeg representerer Autoglass AS, en norsk B2B-grossist innen bilglass. Vi bygger for tiden et digitalt søkeverktøy der kunder kan finne eksakt riktig glass til sin bil ved å søke på registreringsnummer.

Vi har analysert deres nettside (tec-doc-services.com) og ser at dere tilbyr konvertering av TecDoc TAF-data til CSV/MySQL-format, samt tilgang til data for over 1000 leverandører. Dette er nøyaktig det vi trenger for å ta vår løsning til neste nivå.

## HVA VI HAR I DAG

Vi har i dag:
• En database med 37 500+ glass-produkter fra Pilkington, Glavista, Euroglass og andre
• Bovsoft-integrasjon for oppslag: registreringsnummer → kType (TecDoc kjøretøy-ID)
• Cloudflare-basert infrastruktur (Worker + D1 database + KV cache)

Det vi mangler er koblingen mellom kType og spesifikt glass — altså:
  "Kjøretøy kType 32787 (Skoda Superb) → hvilke eurocode(r) passer?"

## HVA VI TRENGER FRA DERE

Vi trenger TecDoc TAF-data for BILGLASS-LEVERANDØRER konvertert til CSV eller SQL:

### 1. PRODUKTTABELLER (Tabell 200 + 211)
- Artikler fra glass-leverandører:
  * PILKINGTON
  * GLAVISTA
  * SEKURIT / SAINT-GOBAIN
  * NORDGLASS
  * AGC AUTOMOTIVE
  * FUYAO
  * XYB / XYG
- Med feltene: ArtNo, BrandNo, GenArtNo, eurocode/equivalent

### 2. GENERISKE ARTIKLER (Tabell 320)
- For å identifisere glass-kategorier:
  * Front windshield / Windscreen
  * Rear window / Back window
  * Side window / Door glass
  * Quarter window
  * Vent window
- GenArtNo og beskrivelser på norsk/engelsk

### 3. LINKING/APPLICABILITY (Tabell 400 — DET VIKTIGSTE)
- Mapping: kType (LnkTargetNo) → ArtNo (produkt)
- Kun for LnkTargetType = 2 (Passenger Car)
- Med SeqNo for å håndtere flere varianter per kType

### 4. KJØRETØYDATA (Tabell 120)
- KTYPNR, BJVON (år fra), BJBIS (år til)
- Kun de kTypene som finnes i applicability-data over

## FORMAT VI ØNSKER

**Alternativ A: CSV-filer (foretrukket)**
- En fil per tabell
- UTF-8 encoding
- Kommaseparert med headers

**Alternativ B: MySQL SQL dump**
- CREATE TABLE + INSERT statements
- Kan importeres direkte til SQLite (D1)

**Alternativ C: JSON**
- Array of objects per tabell
- En fil per leverandør eller per tabell

## HVORDAN VI VIL BRUKE DATAEN

Vår søkeflyt blir:

1. Kunde taster regnr (f.eks. BS12345)
2. Bovsoft slår opp: regnr → kType 32787
3. Vår database spør TecDoc-linking:
   "Hvilke glass-artikler (Tabell 400) er linket til kType 32787?"
4. Systemet kobler til vår prisliste for å vise:
   - Riktig eurocode
   - Lagerstatus
   - Pris
   - Bilder/PDF

## SPØRSMÅL

1. Tilbyr dere data kun for spesifikke leverandører (glass), eller må vi kjøpe full pakke?
2. Hva er prisen for data-abonnement (kvartalsvis/årlig)?
3. Kan dere levere i CSV-format direkte, eller må vi konvertere selv med TAFConvertor?
4. Har dere allerede konverterte datasett for glass-leverandører klare?
5. Inkluderer dataen "terms of use" (monteringstid, herdet glass, ADAS-kalibrering, etc.)?
6. Kan dere hjelpe med å identifisere riktig GenArtNo for glass-kategorier?

## OM OSS

**Autoglass AS**
Tomar Jensen
tomarnejensen@gmail.com

Vi er en norsk B2B-grossist for bilglass med fokus på:
• Presis matching: regnr → riktig glass
• Logistikk: Lagerstatus og leveringstid
• Teknisk støtte: ADAS, varme, regnsensor, etc.

Vi ser frem til å høre fra dere og diskutere hvordan vi kan samarbeide.

Med vennlig hilsen,
Tomar Jensen
Autoglass AS
