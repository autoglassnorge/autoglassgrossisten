# KIMI CLI Handoff — Bilglass eksakt-match pipeline

**Status ved håndoff:** 59.2% konvergens (topp-treff har riktig kType), VW T5 testet end-to-end. Neste steg er klart definert nedenfor.

**Arbeidsmappe:** `/Users/taj/bilglass`

---

## Hva som er ferdig (ikke rør disse)

| Fil | Funksjon | Status |
|---|---|---|
| `api/decoders/vag-pr-decoder.ts` | VAG PR-kode → flagg-dekoder | ✅ Testet |
| `data/decoders/vag-pr-codes.json` | 89 VAG PR-koder | ✅ |
| `api/scoring/match-scorer.ts` | Multikriterie 0-100 scoring | ✅ Testet |
| `api/image-id/image-identifier.ts` | GPT-4o-mini bilde-deteksjon | ✅ Klar (krever OPENAI_API_KEY) |
| `api/glass-finder.ts` | Orkestrator | ✅ |
| `scripts/enrich-catalog-with-ktype.ts` | v1 multikilde-merge | ✅ |
| `scripts/enrich-v2-prefix4-propagation.ts` | v2 prefix4-propagering | ✅ |
| `data/catalog-prod-ktype-enriched-v2.json` | **Beriket katalog** (BRUK DENNE) | ✅ 6 116 records m/kType |
| `scripts/stress-test/run-stress-test-v2.ts` | Stress-test rammeverk | ✅ |

---

## Kjente metrikker (baseline før KIMI tar over)

- **Total konvergens:** 59.2% (87/147 regnr)
- **VW:** 76%, **AUDI:** 72%, **BMW:** 78%, **VOLVO:** 75%
- **Verstinger:** MERCEDES-BENZ 8%, NISSAN 0%, TESLA 0%

---

## Neste 5 oppgaver KIMI bør gjøre (i prioritert rekkefølge)

### TASK 1: Live Bovsoft for Mercedes/Nissan/Tesla (raskest gevinst)

**Mål:** Løft konvergens fra 59% → ~75% ved å fylle hull i 3 verstinger.

**Bovsoft API:**
- URL: `http://54.38.179.43:150/bovsoft.regnum.run`
- Params: `id=461&seccode=726443558cec51db0e2d5ae5286d32df&nameservice=getktypefornumplatenorway&regnum=<REGNR>&contenttype=JSON`
- Gratis kvote: 129 requests gjenstår (per `data/bovsoft-discovered-regnr.json` meta)
- Rate limit: 2 sek mellom kall (se `scripts/batch-bootstrap-ktype.mjs`)

**Konkret oppgave:**
```bash
# 1. Lag liste med 50 regnr (15 Mercedes + 15 Nissan + 15 Tesla + 5 spare)
#    Bruk Finn.no eller en kjent norsk regnr-database
# 2. Kjør:
node scripts/batch-bootstrap-ktype.mjs scripts/data/extra-regnr-mercedes-nissan-tesla.txt
# 3. Resultat lagres i scripts/data/bootstrap-results-*.json
# 4. Slå sammen med data/bovsoft-discovered-regnr.json:
node scripts/merge-bovsoft-discoveries.mjs  # TODO: KIMI lager denne hvis ikke finnes
# 5. Re-kjør berikelsen:
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/enrich-catalog-with-ktype.ts
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/enrich-v2-prefix4-propagation.ts
# 6. Verifiser løft:
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/stress-test/run-stress-test-v2.ts
```

**Forventet løft:** +15-20 prosentpoeng konvergens.

---

### TASK 2: Autodoc URL-mining for TecDoc vehicleId

**Mål:** Ekstra 1 000 kType-mappinger uten Bovsoft-kvote.

**Innsikt:** autodoc.co.no URL-struktur er `/.../<modell-slug>/<vehicleId>-<motor-slug>`. F.eks. `/transporter-v-kassevogn-7ha-7hh-7ea-7eh/17363-1-9-tdi` – `17363` er TecDoc vehicleId.

**Konkret oppgave:**
```bash
# Lag script som:
# 1. Henter de 100 mest populære biler i Norge (fra ssb.no eller bovsoft-discovered-regnr brands)
# 2. Bygger autodoc-URLer for hver brand:model:year
# 3. Følger redirect/lasting for å hente vehicleId fra URL
# 4. Lagrer brand:model:year → vehicleId-mapping i data/autodoc-vehicleid-map.json
# 5. Mapper inn i enrichment-pipeline som kilde med konfidens 0.85
```

Plassering: `scripts/scrape-autodoc-vehicleid.ts`
Rate limit: 1 req/sek for å unngå Cloudflare-blokk.

---

### TASK 3: Soft-filter for motsigende utstyrsinput

**Bug funnet** (i `KTYPE_BERIKELSE_RAPPORT.md`): Når brukeren oppgir flagg som motsier ALLE kandidater, faller scoreren tilbake til feil bil (POLO/TOUAREG istedenfor T5).

**Fiks i `api/scoring/match-scorer.ts`:**

I `matchGlass()`-funksjonen, etter hard-filteret på `flagsMismatched`:

```ts
// Hvis hard-filter eliminerer ALLE kType-matchende kandidater,
// fjern flaggene som forårsaker mismatch og varsel
if (scored.length === 0 && vehicle.kType) {
  const kTypeMatching = filtered.filter(r => r.kTypes?.includes(vehicle.kType!));
  if (kTypeMatching.length > 0) {
    // Re-score uten flagg-filter, men marker som "input-conflict"
    return {
      ...matchGlass({ ...params, knownFlags: {} }),
      diagnostics: { ...params, inputConflict: true,
        message: "Dine utstyrs-svar motsier alle kType-matchende ruter. Vurder å sjekke om noen flagg er feil oppgitt."
      }
    };
  }
}
```

---

### TASK 4: Verksted-feedback-loop

**Mål:** Selvlæring – etter at en rute er bekreftet montert, hopp over hele deteksjonen for samme kType+utstyrs-profil.

**Konkret:**
1. Lag tabell i Supabase/D1:
   ```sql
   CREATE TABLE confirmed_fits (
     id INTEGER PRIMARY KEY,
     regnr TEXT,
     vin TEXT,
     ktype INTEGER NOT NULL,
     eurocode TEXT NOT NULL,
     known_flags JSONB,
     confirmed_at TIMESTAMP,
     confirmed_by TEXT,
     INDEX (ktype, eurocode)
   );
   ```
2. Ny endpoint: `POST /api/glass/confirm-fit`
3. I `matchGlass`: før all annen scoring, sjekk om kType+flagg-profil har ≥3 bekreftede fits → returner direkte med `exact_match: true, confidence: "verified"`.

---

### TASK 5: Cloudflare Worker-integrasjon

**Mål:** Eksponere `findGlass()` som offentlig API.

```bash
# 1. Upload beriket katalog til KV
cd api/cf-worker
export GLASS_KV_NAMESPACE_ID="..."
npx ts-node scripts/upload-catalog-to-kv.ts ../../data/catalog-prod-ktype-enriched-v2.json

# 2. Legg til endpoint i src/index.ts:
# GET /api/glass-match?regnr=AB12345&prCodes=4GL,8N0&image=https://...
# Returnerer MatchResult fra match-scorer.ts

# 3. Deploy
npx wrangler deploy
```

---

## Filer som KIMI bør lese FØRST

1. `IMPLEMENTERINGSRAPPORT.md` (PR-dekoder + scorer-arkitektur)
2. `KTYPE_BERIKELSE_RAPPORT.md` (denne berikelses-pipelinen)
3. `api/scoring/match-scorer.ts` (kjerne-logikk)
4. `api/glass-finder.ts` (orkestrator)
5. `data/catalog-prod-ktype-enriched-v2.json` (beriket katalog – BRUK DENNE)

## Filer KIMI IKKE bør røre uten grunn

- `data/catalog-prod.json` (ubehandlet, holdes som backup)
- `data/ktype-prefix4-cache.json` (kritisk for prefix4-lookup)
- `data/bovsoft-discovered-regnr.json` (ground truth for stress-test)

---

## Hvordan KIMI verifiserer at endringer ikke ødelegger

Etter HVER endring:

```bash
# Skal alltid gi konvergens ≥ 59%:
npx ts-node --compiler-options '{"module":"CommonJS"}' \
  scripts/stress-test/run-stress-test-v2.ts | tail -10
```

Hvis konvergens faller under 55%, ROLLBACK endring.

---

## Sammenheng med KIMI prosjekt-konvensjoner

Du har KIMI-prompt-mal i `KIMI_PROMPT.md` og spesifikke prompts i:
- `KIMI_VIN_KTYPE_PROMPT.md`
- `KIMI_KTYPE_BOOTSTRAP_PROMPT.md`
- `KIMI_SVV_REGNR_VALIDATION_PROMPT.md`
- `KIMI_BOVSOFT_API_EXPLORATION_PROMPT.md`

Denne handoff-filen følger samme mønster. KIMI kan kjøre `kimi_read_file /Users/taj/bilglass/KIMI_HANDOFF.md` for å laste hele konteksten.

---

## Suksess-kriterium for håndoff

KIMI har lyktes når:
- ✅ Konvergens ≥ 75% (fra dagens 59%)
- ✅ Mercedes-Benz konvergens ≥ 60%
- ✅ Worker-endpoint live på `/api/glass-match`
- ✅ Confirmed-fits-tabell aktiv med minst 10 bekreftelser
