# Design: Forbedre bilnummer-søk uten kType-space-kollisjoner

**Dato:** 2026-06-17  
**Status:** Godkjent for implementeringsplan  
**Tema:** Øke treffsikkerheten for VIN/regnr-søk i Autoglass-katalogen etter at TecDoc 1Q2019-kType-enrichment ble rullet tilbake pga kType-space mismatch.

---

## Bakgrunn

- `vin_ktype_map` dekker 99,6 % av norske VIN-er i **Bovsoft/SVV-kType-space**.
- `glass_catalog.ktype` er bare 4 % populert, og alle eksisterende produkt→kType-mappinger ligger i **TecDoc 1Q2019-space**.
- Samme kType-nummer betyr forskjellige kjøretøy i de to space-ene (f.eks. 17370 = VW Transporter vs Renault Master).
- Dagens søk faller derfor tilbake på brand/model/year, som gir mange kandidater og høyere feilrate.

Målet med dette designet er å forbedre treffsikkerheten **raskt, gratis/internt og uten å introdusere nye feil**.

---

## Mål og ikke-mål

### Mål
- Redusere antall kandidater brukeren må velge mellom.
- Øke andelen søk der riktig glass ligger øverst.
- Etablere en trygg vei mot høyere kType-dekning via verifisert kryss-mapping.

### Ikke-mål
- Bytte resolver-space uten verifisering.
- Massere `glass_catalog.ktype` med usikre data.
- Introdusere manuelle prosesser som selgere/mekanikere ikke vil bruke.

---

## Overordnet arkitektur

Vi endrer ikke resolver-space eller `glass_catalog.ktype` i produksjon. Vi legger til to nye lag **foran** dagens kType-søk, og ett separat pilotprosjekt på siden:

```
Søk med regnr/VIN
        │
        ▼
┌─────────────────────┐
│ Layer -2: Ground    │  ← auto-generert fra høykonfidens-resolusjon
│ truth (per kjøretøy,│    med kategori-spesifikke eurocode-kolonner)
└─────────────────────┘
        │ (hvis treff → eksakt, score +1000)
        ▼
┌─────────────────────┐
│ Layer 0: kType      │  ← eksisterende, fortsatt bare ~4 % dekning
│ (uendret)           │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ Layer 1.5: Utstyr + │  ← nytt: brand/model/year + utstyr + karosseri
│ karosseri-filter    │     før vi faller til ren brand/model/year
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ Layer 1–3: Eksisterende fallback  │
└─────────────────────┘
```

**På siden:** En kontrollert Bovsoft↔TecDoc-pilot som bygger en `ktype_crosswalk`-tabell, men som **ikke** påvirker produksjon før den er verifisert.

---

## Layer -2: Auto-ground truth

### Hva
`ground_truth`-rader genereres automatisk når resolveren er svært sikker og katalogen har et entydig match.

### Kriterier for auto-generering
1. VIN/resolver gir kType fra minst to uavhengige kilder (f.eks. Bovsoft + MACS VIS).
2. `queryByKtype` eller brand/model/year + utstyr returnerer **ett eneste** produkt som passer kjøretøyets år, karosseri og utstyrsprofil.
3. Konfidens ≥ 0.95.

### Data som lagres
| Felt | Beskrivelse |
|---|---|
| `regnr_hash` | SHA-256 av regnr (GDPR-safe) |
| `vin_prefix` | Første 8 tegn av VIN |
| `k_type` | kType hvis kjent |
| `make`, `model`, `year` | Normaliserte kjøretøydata |
| `category` | frontrute, bakrute, sideglass-fv, etc. |
| `eurocode` | Foreslått/verifisert glass |
| `confidence` | 0.0–1.0 |
| `source` | `auto_high_confidence` |
| `created_at` | Timestamp |

### Sikkerhetsventil
- Brukes bare hvis ingen menneskelig-verifisert ground truth finnes.
- Krever hit count ≥ 3 før den får `layer = -2` for å unngå cache poisoning.

### Forventet effekt
Begrenset i starten, men bygger seg opp over tid som en sikkerhetsventil for de vanligste kjøretøyene.

---

## Layer 1.5: Utstyrs- og karosseridrevet fallback

### Hva
Et nytt lag mellom kType-søk og ren brand/model/year-fallback. Bruker utstyr og karosseri for å redusere kandidatlisten.

### Trigger
Layer 1.5 kjøres når:
- `vehicle.k_type` ikke er løst, **eller**
- `queryByKtype` returnerer 0 treff, **eller**
- `queryByKtype`-treffene er inkompatible med kjøretøyet.

### Inputdata
Fra kjøretøyet:
- `make`, `model`, `year`
- `body` / karosseri
- Utstyr: `adas`, `rain_sensor`, `heated`, `acoustic`, `antenna`, `hud`, `camera`, `lane_assist`, `shade`

Fra produktet:
- Samme utstyrsflagg
- `category`, `position`
- `year_from`, `year_to`
- `prefix4`

### Ny funksjon: `queryByVehicleEquipment(db, vehicle, category)`
1. Hent alle produkter for `make` + `year`-range.
2. Filtrer bort produkter der `body` ikke er kompatibel (hvis kjent).
3. Ranger etter utstyrsoverlapp:
   - **Hard match:** Kjøretøyet har ADAS → produkt må ha ADAS (straffes kraftig ved mismatch).
   - **Soft match:** Kjøretøyet har regnsensor → produkt med regnsensor premieres.
   - **Mismatches** straffes, men ikke like hardt som i `scoreCandidate`.
4. Returnerer kandidater med `layer = 1.5`.

### Endring i søkeflyt
I `searchByRegnr`, etter Layer 0.5/1:

```ts
const layer15Candidates = await queryByVehicleEquipment(db, vehicle, categoryFilter);
if (layer15Candidates.length > 0) {
  candidates.push(...layer15Candidates);
  layer = 1.5;
}
```

### Feilhåndtering
- Usikker utstyr brukes ikke som hard filter.
- Ukjent body ignoreres.
- Ingen treff logges og faller videre til Layer 1–3.

### Forventet effekt
- Redusere antall kandidater fra 8–12 til 2–4 for mange populære modeller.
- Lavere feilrate uten å introdusere nye feil.

---

## B-pilot: Bovsoft↔TecDoc-kryss-mapping

### Mål
Finne ut om vi kan oversette TecDoc-kType-nummer til Bovsoft/SVV-kType-nummer for samme kjøretøy, slik at de 20 061 eksisterende produktmappingene kan brukes trygt.

### Ny tabell: `ktype_crosswalk`
```sql
CREATE TABLE IF NOT EXISTS ktype_crosswalk (
  bovsoft_ktype INTEGER NOT NULL,
  tecdoc_ktype INTEGER NOT NULL,
  vehicle_signature TEXT NOT NULL,
  match_evidence TEXT,
  confidence REAL NOT NULL,
  verified INTEGER DEFAULT 0,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bovsoft_ktype, tecdoc_ktype)
);
CREATE INDEX IF NOT EXISTS idx_ktype_crosswalk_tecdoc ON ktype_crosswalk(tecdoc_ktype);
CREATE INDEX IF NOT EXISTS idx_ktype_crosswalk_signature ON ktype_crosswalk(vehicle_signature);
```

### Fremgangsmåte
1. For hver unike Bovsoft-kType i `vin_ktype_map`/`glass_rules`, hent kjøretøyattributter fra `ktype_registry`.
2. Søk i TecDoc 1Q2019 etter kjøretøy med samme brand, model og overlappende år.
3. Ved ett eneste perfekt match på brand + model + body + år → lagre med høy confidence.
4. Ved flere matcher → marker som `collision`, lagre med lav confidence.
5. Ved ingen matcher → marker som `no_match`.

### Verifisering før produksjon
- Minst 100 mappings med `confidence >= 0.95`.
- Sample 50 og verifiser manuelt mot uavhengig kilde.
- Ingen kollisjoner blant de 50.
- Først da deployes mappingen til `glass_catalog.ktype` i Bovsoft-space.

### Isolasjon
Mappingen lever i sin egen tabell og påvirker **ikke** produksjonssøk før den er godkjent.

---

## Feilhåndtering og logging

- `search_history` logger hvilket lag treffet kom fra.
- `search_feedback` fylles når det finnes data (fremtidig).
- `ktype_matches` kan fylles fra vellykkede Layer 1.5-treff for statistisk læring.
- Alle nye lag må ha fallback til dagens oppførsel ved usikkerhet.

---

## Testing og suksesskriterier

### Teststrategi
- Enhetstester for `queryByVehicleEquipment`, `bodyCompatibility` og utstyrsmatching.
- Integrasjonstester med eksisterende søke-fixtures.
- A/B-måling mot produksjonslogger.

### Suksesskriterier
| Mål | Verdi | Målemetode |
|---|---|---|
| Færre kandidater i fallback | -30 % gjennomsnittlig antall treff | `search_history.layer` |
| Høyere andel Layer 1.5-treff | ≥ 20 % av søk | `search_history.layer = 1.5` |
| Ingen økning i feilrate | 0 nye feilrapporter | Manuell sampling |
| B-pilot presisjon | ≥ 98 % blant top 100 mappings | Manuell verifisering |

---

## Avhengigheter og risikoer

### Avhengigheter
- `glass_catalog` må ha korrekte utstyrsflagg.
- SVV/Bovsoft/VIN-decode må kunne levere utstyr og karosseri for relevante kjøretøy.

### Risikoer
- Utstyrssignaturer i katalogen kan være ufullstendige → mitigeres ved soft matching.
- Body-mapping mellom kilder kan være inkonsistent → mitigeres ved normaliserings-mapping.
- B-pilot kan vise at kryss-mapping er for usikker → akseptert outcome; Layer 1.5 står på egne ben.

---

## Neste steg

1. Invokere `writing-plans`-skillen for å lage detaljert implementeringsplan.
2. Starte med Layer 1.5 (størst umiddelbar effekt).
3. Kjøre B-pilot parallelt.
4. Implementere auto-ground-truth som langsiktig bonus.
