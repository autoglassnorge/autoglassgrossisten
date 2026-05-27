# Plan: Automatisk eksakt frontrute-match

**Oppdatert basert på faktisk gap-analyse av `/Users/taj/bilglass`**

---

## Du har allerede 90% av infrastrukturen

| Komponent | Status | Lokasjon |
|---|---|---|
| Katalog (39 458 records) | ✅ Klar | `data/catalog-prod.json` (38 MB) |
| Prefix4-cache (22 000 entries) | ✅ Klar | `data/ktype-prefix4-cache.json` |
| Equipment-signatures (11 158 m/utstyr) | ✅ Klar | `data/equipment-signatures.json` |
| Regnr→kType→eurocode pipeline | ✅ Kodet | `api/unimicro-export/glass-lookup.ts` |
| Cloudflare Worker API | ✅ Kodet | `api/cf-worker/` |
| Scrapers (17 stk) | ✅ Kodet | `api/scrapers/` |
| Biluppgifter TecDoc integrasjon | ✅ Kodet | I `glass-lookup.ts` |
| Bovsoft-batcher | ✅ Importert | `data/bovsoft-batches/` |
| Nordglass SQL-batcher | ✅ Importert | `nordglass-batch-*.sql` |

## Det faktiske gapet: fra "kandidatliste" til "eksakt match"

Dagens pipeline gir 4-lags konfidens (eksakt → år+merke → merke → prefix4), men ender ofte med **2-15 kandidater per bil**. Det vi mangler er **automatisk disambiguering** ned til ÉN rute.

### Konkret problem (din egen VW T5 2005)
- kType-oppslag gir én bil
- Prefix4 `8579` peker mot flere ruter
- 7 utstyrs-flagg multipliserer mulighetene: 2⁷ = potensielt 128 varianter
- Resultat i autodoc-test: 34 frontruter for samme bil

---

## Plan i 5 konkrete steg

### Steg 1: Utstyrs-deteksjon fra VIN (kjernen i problemet)
**Mål:** Konverter VIN → spesifikk utstyrsignatur uten å spørre bruker.

**Tre parallelle kilder:**

1. **Biluppgifter OEM2 API** – allerede integrert, men `fetchOemFlags()` returnerer ofte tom liste for eldre biler. Logge faktisk treffrate på 1000 VIN-er for å se hvor brukbar denne er.

2. **PR-kode-dekoder for VAG-biler** (VW, Audi, Škoda, Seat – din egen testcase er VW T5)
   - PR-koder finnes på klistremerker i bagasjerom + servicehefte
   - Gratis kilde: `pr-codes.com`, `vw-codes.com` har åpne mappinger
   - Bygg `data/vag-pr-codes.json` (ny fil) med relevante glass-koder:
     - `4GF` / `4GG` = akustisk glass
     - `8Q1` / `8Q2` = varmereflekterende
     - `8N6` = regnsensor
     - `4KF` = oppvarmet frontrute
   - Implementering: `api/decoders/vag-pr-decoder.ts`

3. **Equipment-signatures (statistisk fallback)**
   - Du har allerede 11 158 records med sannsynligheter
   - Hvis `BMW:5 SERIES F10:2010` har `shade: 1.0` → 100% sikkert solstripe
   - Bruk som **prior**, ikke som hard match
   - Hvis kun én utstyrs-variant finnes i `catalog-prod` for kType + år: returner direkte

### Steg 2: Multikriterie-rangering med deterministisk score
**Mål:** Når flere kandidater gjenstår, gi hver en score 0–100.

```ts
score = (
  kType_eksakt_match     × 35 +   // hard krav
  alle_kjente_flagg_match × 25 +   // VIN + PR + statistisk
  prefix4_match          × 15 +
  OEM_nummer_overlap     × 10 +
  leverandør_OEM_eller_OE × 5 +
  lager_tilgjengelig     × 5 +
  årsmodell_match        × 5
)
```

**Returrespons:**
```json
{
  "exact_match": false,
  "best_candidate": { "eurocode": "8579AGSMVZ1B", "score": 87, ... },
  "needs_user_input": ["rainSensor", "antenna"],
  "alternatives": [...]
}
```

### Steg 3: Bilde-disambiguering som fallback (NY)
**Mål:** Når utstyr ikke kan dedukseres, la bruker laste opp ETT bilde av gammel rute.

- Endpoint: `POST /api/glass/identify-from-image`
- GPT-4o-mini med structured output (~$0.0005 per analyse)
- Identifiserer i ett kall: regnsensor (svart firkant), kamera (rektangel), antenne (svart silketrykk-mønster), VIN-vindu, akustisk-stempel
- Reduserer 34 kandidater → 1–2 i 95% av tilfellene

### Steg 4: Verksted-feedback-loop (selvlæring)
**Mål:** Når et verksted bekrefter "denne ruta passet" → skriv tilbake til `equipment-signatures.json`.

- Ny endpoint `POST /api/glass/confirm-fit` 
- Lagrer `kType + faktisk_eurocode` i Supabase eller en `confirmed-fits.json`
- Etter 100+ bekreftelser per kType: hopp over hele utstyrs-deteksjon, bruk bekreftelse direkte
- Dette er **det viktigste konkurransefortrinnet** – ingen åpen kilde har dette

### Steg 5: Stress-test og monitoring
- Test-suite: 100 norske regnr fra `bovsoft-discovered-regnr.json` (du har 52 KB med ekte regnr allerede)
- Mål: ≥85% **exact_match: true** ved første kall
- Logg alle treff under 85% til `logs/disambiguation-misses.jsonl` for manuell gjennomgang

---

## Hva som IKKE bør bygges (avgjørende for tid)

| Avvist forslag | Hvorfor |
|---|---|
| Ny Next.js-app | Du har Cloudflare Worker + statisk HTML – holder |
| TecDoc-lisens (€500/mnd) | Du har gratis Biluppgifter-tilgang som dekker behovet |
| Egen DB av kType-mapping | `ktype-prefix4-cache.json` med 22 000 entries dekker dette |
| Re-scrape Autodoc/Pilkington | Du har allerede `autoglass-by-eurocode.json` (13 MB) + Pilkington-scraper kodet |
| Egen scraper for Glavista | `data/glavista-catalog.json` (621 KB) allerede generert |

---

## Konkrete første actions (4 timer)

1. **Test pipelinen end-to-end** med din egen VIN (`WV1ZZZ7HZ5H060934`):
   ```bash
   cd ~/bilglass
   BILUPPGIFTER_API_KEY=$KEY CATALOG_PATH=data/catalog-prod.json \
     npx ts-node api/unimicro-export/glass-lookup.ts --vin=WV1ZZZ7HZ5H060934
   ```
2. **Mål treffrate på 50 regnr** fra `bovsoft-discovered-regnr.json` og logg hvor mange som returnerer ÉN kandidat
3. **Implementer `vag-pr-decoder.ts`** – minste mulig kode for PR-koder 4GF, 8Q1/8Q2, 8N6, 4KF
4. **Bygg bilde-identifisering POC** – Node endpoint som tar URL og returnerer flagg-array

---

## Endelig flyt (mål-tilstand)

```
INPUT: VIN eller regnr
  ↓
[1] Biluppgifter TecDoc → kType + VIN + merke/modell/år
  ↓
[2] Biluppgifter OEM2 → utstyrsliste (hvis tilgjengelig)
  ↓
[3] PR-kode-dekoder (VAG) ELLER statistisk signatur (annet)
  ↓
[4] Filtrer catalog-prod.json på kType + prefix4 + flagg
  ↓
[5] Hvis 1 kandidat: EXACT MATCH ✓
    Hvis 2-5: vis topp 3 med "scroll og bekreft"
    Hvis >5: be om bilde-upload eller utstyrsspørsmål
  ↓
OUTPUT: eurocode + OEM-nummer + pris + lager + leverandør
```
