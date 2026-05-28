# kType OSINT Playbook

**Mål:** Finne kType-mapping for merker/modeller som mangler i D1 (`ktype_registry`).
**Status:** Bovsoft-konto tom (402). Kun Audi har kType (75 rader). Mangler VW, BMW, Mercedes, Toyota, Ford, etc.

---

## Verktøy

| Script | Formål | Kommando |
|--------|--------|----------|
| `vpic-bridge.mjs` | Gratis VIN-dekoding via NHTSA vPIC | `node vpic-bridge.mjs <VIN>` |
| `google-dorks.mjs` | Genererer Google-søk for manuell recon | `node google-dorks.mjs --brand VW --model Transporter` |
| `osint-pipeline.mjs` | Finner prioriteringsliste over gaps | `node osint-pipeline.mjs --catalog data/catalog-prod.json` |
| `verify-finding.mjs` | Kryssjekker funn mot katalog | `node verify-finding.mjs --ktype 12345 --brand VW` |

---

## Arbeidsflyt

### 1. Finn gaps (hva mangler)

```bash
node scripts/ktype-recon/osint-pipeline.mjs \
  --catalog data/catalog-prod.json \
  --out data/ktype-recon-priority.ndjson
```

Output:
- `data/ktype-recon-priority.ndjson` — 2268 brand/model-grupper med missing kType
- `data/ktype-recon-priority-summary.md` — Topp 50 prioritert med Google-dorks

### 2. Få VINs for target-modeller

**Fra Finn.no-regnr (vi har 12,534 regnr):**
```bash
# Filter regnr for target brand
grep -i '"brand":"VW"' data/finn-no-regnr/regnr.ndjson > /tmp/vw-regnr.ndjson

# Hent VIN via SVV (rate limit: 1/min per regnr)
# TODO: Bruk workerens /api/glass?regnr= endpoint som cacher SVV
```

**Fra eksisterende kunder/ordrer:**
- Sjekk `data/orders-eurocode-mapping.json` for regnr med VIN

### 3. Dekod VIN via vPIC (gratis)

```bash
# Enkelt VIN
node scripts/ktype-recon/vpic-bridge.mjs WV1ZZZ7HZ5H060934

# Batch fra fil
node scripts/ktype-recon/vpic-bridge.mjs --file vins.txt

# Batch fra regnr-NDJSON (merger med eksisterende data)
node scripts/ktype-recon/vpic-bridge.mjs --batch data/finn-no-regnr/verified-bovsoft.ndjson
```

vPIC returnerer: make, model, year, body, engine, series, trim, plant.
Dette gir en "vehicle fingerprint" som kan brukes til TecDoc-oppslag.

### 4. Søk etter kType på åpne kilder

**For hver target-modell, generer dorks:**
```bash
node scripts/ktype-recon/google-dorks.mjs \
  --brand "VW" --model "Transporter" --year 2005 \
  --eurocode "2525CSGYA"
```

**Prioriterte søk:**
1. `"<eurocode>" ktype` — direkte eurocode→kType
2. `"<brand> <model>" TecDoc ktype` — TecDoc-relatert
3. `site:ebay.com "<eurocode>" TecDoc` — eBay-selgere oppgir ofte kType
4. `site:forum "<brand> <model>" glass ktype` — forumdiskusjoner
5. `site:autodoc.de "<brand> <model>" windshield` — delenummer

**TecDoc-spesifikke kilder:**
- https://www.tecdoc.de/ (offisiell, krever login)
- https://www.autodoc.de/ (offentlig, viser TecDoc-data)
- https://www.europarts.de/ (offentlig)
- https://www.oreillyauto.com/ (offentlig, noen ganger kType)

### 5. Verifiser funn

```bash
node scripts/ktype-recon/verify-finding.mjs \
  --ktype 17370 \
  --brand "VW" \
  --model "Transporter" \
  --year 2005 \
  --eurocode "2525CSGYA"
```

Scoring:
- **exact** (≥80): Brand + modell + år + eurocode matcher katalog
- **probable** (≥50): Brand + modell + år matcher
- **possible** (≥25): Brand eller modell matcher
- **weak** (<25): Ingen katalogtreff

### 6. Lagre verifiserte kType

```bash
# Generer SQL INSERTs
node scripts/generate-ktype-inserts.mjs \
  --in data/ktype-recon-verified.ndjson \
  --out data/ktype-verified-inserts.sql

# Kjør mot D1
wrangler d1 execute glass-catalog-db --file data/ktype-verified-inserts.sql
```

---

## Strategi: Svakest til sterkest signal

| Signal | Styrke | Bruk |
|--------|--------|------|
| Foruminnlegg | Svak | Ledetråd, ikke fasit |
| Markedsplass-listing | Medium | Part number, OE-nummer |
| vPIC VIN-dekoding | Medium | Verifiser make/model/year/body |
| TecDoc parts-søk | Sterk | kType → part number |
| Eurocode + kType + brand + model + year | Sterk | Eksakt match |

---

## Kjente kilder

### Gratis APIer
- **NHTSA vPIC**: https://vpic.nhtsa.dot.gov/api/ — VIN-dekoding, gratis, ~20 req/s
- **Biluppgifter**: https://api.biluppgifter.se/ — Equipment (vi har nøkkel), sjekk om kType finnes

### Markedsplasser med TecDoc-data
- eBay: Selgere oppgir ofte "TecDoc kType" i beskrivelsen
- Autodoc.de: Offentlig tilgjengelig TecDoc-visning
- Europarts.de: Offentlig tilgjengelig
- AliExpress/1688: Kinesiske selgere bruker kType for fitment

### Forum
- VWVortex (VW)
- Bimmerforums (BMW)
- MercedesForum (Mercedes)
- ToyotaNation (Toyota)

---

## Nåværende status (2026-05-27)

| Merke | kType-rader | Dekning | Prioritet |
|-------|-------------|---------|-----------|
| Audi | 75 | ✅ | Done |
| VW | 0 | ❌ | **Høy** |
| BMW | 0 | ❌ | **Høy** |
| Mercedes | 0 | ❌ | **Høy** |
| Toyota | 0 | ❌ | Medium |
| Ford | 0 | ❌ | Medium |
| Peugeot | 0 | ❌ | Medium |

Topp 5 gaps:
1. VW CADDY (2004-2015): 51 produkter uten kType
2. MERCEDES W211 (2002-2009): 49 produkter
3. MERCEDES W213 E-CLASS (2016+): 48 produkter
4. PEUGEOT 405 4-D (1987-1996): 46 produkter
5. FORD TRANSIT CONNECT (2014-2021): 46 produkter
