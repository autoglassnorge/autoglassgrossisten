# Autoglass AS — Moderne B2B Grossist-Frontend Plan
## Basert på auto-glass.no (The Bible) + 100% Regnr-Nøyaktighet

**Dato:** 2026-05-21  
**Status:** Plan / Godkjent for implementering  
**Mål:** Bygge Norges beste B2B bilglass-grossistinterface  

---

## 1. Dybdeanalyse: auto-glass.no — "Bibelen"

### 1.1 Datastruktur (27 185 produkter)

| Felt | Beskrivelse | Eksempel |
|------|-------------|----------|
| `sku` | Artikkelnummer / Eurocode | `10025C` |
| `title` | Full beskrivende tittel | `FIAT PANDA 30 CC 80- BAKRUTE EL+KLAR (SVERIGE)` |
| `brand` | Bilmerke | `FIAT`, `MERCEDES`, `USA CARS` |
| `model` | Modell | `PANDA`, `E-KLASSE`, `FORD MUSTANG` |
| `submodel` | Undermodell / variant | `SEDAN`, `COUPE`, `STV` |
| `year_start` | Fra-år | `1983` |
| `year_end` | Til-år | `2003` |
| `year_range` | Formatert range | `1983-2003 (I)` |
| `type_code` | Kort kode for plassering | `F`, `B`, `DFF`, `SFB1` |
| `type_code_desc` | Menneskelig lesbar plassering | `Frontrute`, `Dørrute fremre førerside` |
| `price` | Pris i NOK | `4510` |
| `source_url` | Direktelenke til produkt | `https://auto-glass.no/varer/...` |

### 1.2 Typekode-Legend (Plassering + Egenskaper)

**Glass-Plassering (16 unike koder):**

| Kode | Beskrivelse | Antall | Ikon |
|------|-------------|--------|------|
| `F` | **Frontrute** (Windscreen) | 6 849 | 🪟 |
| `B` | **Bakrute** (Back glass) | 3 819 | 🔲 |
| `DFF` | Dørrute fremre **førerside** | 2 379 | 🚪⬅️ |
| `DFB` | Dørrute bakre **førerside** | 2 269 | 🚪⬅️ |
| `DPF` | Dørrute fremre **passasjerside** | 2 151 | 🚪➡️ |
| `DPB` | Dørrute bakre **passasjerside** | 2 048 | 🚪➡️ |
| `SFB1` | Siderute bakre 1 **førerside** | 2 040 | 🪟⬅️ |
| `SPB1` | Siderute bakre 1 **passasjerside** | 1 825 | 🪟➡️ |
| `DFBV` | Ventil/siderute bakre **førerside** | 800 | 💨⬅️ |
| `DPBV` | Ventil/siderute bakre **passasjerside** | 733 | 💨➡️ |
| `DFFV` | Ventil/siderute fremre **førerside** | 680 | 💨⬅️ |
| `DPFV` | Ventil/siderute fremre **passasjerside** | 540 | 💨➡️ |
| `SFB2` | Siderute bakre 2 **førerside** | 99 | 🪟⬅️ |
| `SPB2` | Siderute 2 bakre **passasjerside** | 78 | 🪟➡️ |
| `SFB3` | Siderute bakre 3 **førerside** | 48 | 🪟⬅️ |
| `SPB3` | Siderute 3 bakre **passasjerside** | 35 | 🪟➡️ |

**Egenskaps-Koder (i tittel):**

| Kode | Betydning | Type |
|------|-----------|------|
| `GN` | Grønn rute | Farge |
| `BL` | Blå rute | Farge |
| `CS` | Coated rute | Behandling |
| `GG/GY/GB/BB` | 2-farget med skygge | Farge |
| `GNM/GYM/GBM` | Grønn/2-farget **m/sensor** | Sensor |
| `GNELM/GYELM` | Grønn/2-farget **m/sensor + elektrisk** | Sensor+EL |
| `GNAG/GYAG` | Grønn/2-farget **m/antenne** | Antenne |
| `CSBLMS` | Coated blå **m/sensor + kamera** | ADAS |
| `GNCELM` | Grønn coated **elektrisk m/sensor** | EL+Sensor |
| `HUD` | Head-Up Display | ADAS |
| `LDW` | Lane Departure Warning | ADAS |
| `CITY` | City Safety / Nødbrems | ADAS |
| `EL` | Elektrisk oppvarmet | Varme |
| `ANT` | Antenne | Antenne |
| `AKU` | Akustisk lydisolert | Komfort |
| `Solar` | UV/Sol-beskyttelse | Komfort |
| `Sotet/YP` | Sotet rute | Privat |
| `K` | Klips | Montering |
| `PY/PYT/PYB/PYK` | List / listsett | Montering |
| `EMS` | Emergency Messaging System | Sikkerhet |
| `DAB` | Digital antenne | Antenne |
| `Innk` | Innkapslet rute | Type |
| `GNL/YPL` | Laminert rute | Type |
| `GNAQ` | Agua Kontroll | Komfort |
| `GD` | Mørkere grønn | Farge |

### 1.3 Top 20 Merker (1 315 unike brand+model-kombinasjoner)

```
 1967  USA CARS      (Ford, Chevy, Dodge, etc.)
 1844  VW
 1585  MERCEDES
 1522  BMW
 1348  FORD
 1191  AUDI
 1186  VOLVO
 1087  OPEL
  990  TOYOTA
  920  PEUGEOT
  787  RENAULT
  777  HYUNDAI
  734  NISSAN
  672  CITROEN
  666  KIA
  628  MAZDA
  620  MITSUBISHI
  619  HONDA
  605  SKODA
  459  SUBARU
```

### 1.4 Hva gjør auto-glass.no til "Bibelen"?

1. **Korrekte numre:** Hvert produkt har unikt SKU (eurocode) som er industristandard
2. **Korrekte priser:** Norsk listepris i NOK, oppdatert
3. **Korrekt plassering:** 16 typekoder med førerside/passasjerside-distinksjon
4. **Egenskaper i tittel:** Alle varianter (GN, EL, HUD, etc.) er kodet i tittelen
5. **Årsmodell-presisjon:** Start- og sluttår for hver generasjon
6. **Undermodell:** `SEDAN`, `COUPE`, `STV`, `4WD` etc.
7. **Direkte URL:** Hvert produkt har permanent URL for deling

---

## 2. Smart B2B Grossist-Visning: UX-Strategi

### 2.1 Prinsipper for B2B Grossist-UI

| Prinsipp | Hvorfor | Implementasjon |
|----------|---------|----------------|
| **Regnr først** | 90% av brukerne starter med regnr | Hero-søk, sticky header-søk |
| **Type-tabs** | Mekaniker vet hva som er ødelagt | F, B, DFF, DFB, etc. som tabs |
| **Side-indikator** | Førerside vs passasjerside er kritisk | Fargekodet: blå=fører, rød=passasjer |
| **Pris umiddelbart** | B2B-kunde skal vite kostnad med en gang | Stor, tydelig pris på hvert kort |
| **Lagerstatus** | Bestillingsvare = forsinkelse | Grønn/gul/rød indikator |
| **Legg-til-hurtig** | Minst mulig friksjon | Én-klikk "+" på hvert kort |
| **Kompatibilitet** | Er dette RIKTIG glass for denne bilen? | "Passer til [X modeller]" + regnr-bekreftelse |
| **ADAS-advarsel** | Kalibrering kreves = ekstra kostnad | 🛡️-ikon med tooltip |
| **OEM vs ettermarked** | Noen kunder vil ha original | Tab-velger: OEM / Pilkington / alle |
| **Historikk** | Samme kunde kommer tilbake | "Dine siste søk" + lagrede biler |

### 2.2 Regnr-Søk: Steg-for-Steg Flyt (Den Gylne Sti)

```
┌─────────────────────────────────────────────────────────────┐
│  STEG 1: REGNR-INNTASTING                                   │
│  ┌────────────────────────────────────┐  ┌──────────────┐  │
│  │  AB 12345  (store bokstaver auto)  │  │  [Finn glass]│  │
│  └────────────────────────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STEG 2: KJØRETØY-KORT (1 sekund)                          │
│  ┌────────┐  BMW X5 2022  │  VIN: WBA••••••••••••••••12345 │
│  │  🚙    │  xDrive40i     │  kType: 12345                  │
│  └────────┘  Diesel        │  Treffsikkerhet: 98% ✅         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STEG 3: GLASS-TYPE TABS                                    │
│  ┌─────┐┌─────┐┌────────┐┌────────┐┌────────┐┌─────┐      │
│  │🪟 F  ││🔲 B ││🚪 DFF ││🚪 DFB ││🚪 DPF ││🚪…  │      │
│  │ 6.8k││ 3.8k││  2.4k  ││  2.3k  ││  2.2k  │      │      │
│  └─────┘└─────┘└────────┘└────────┘└────────┘└─────┘      │
│  ▲ Aktiv: Frontrute (F)                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STEG 4: PRODUKT-KORT (BEST MATCH ØVERST)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🥇 BESTE MATCH  98%                                  │  │
│  │ ┌────┐  2048AGNMV                                    │  │
│  │ │ 🪟 │  BMW X5 2018-2022 Frontrute                   │  │
│  │ │img │  🛡️ ADAS  🌧️ Regnsensor  🔥 Oppvarmet        │  │
│  │ └────┘                                               │  │
│  │                      kr 12 450    🟢 5+ på lager     │  │
│  │                      [+ Legg til bestilling]          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🥈 Alternativ  85%                                   │  │
│  │ ┌────┐  2048AGCCMV                                   │  │
│  │ │ 🪟 │  BMW X5 2018-2022 Frontrute (uten ADAS)       │  │
│  │ │img │                                               │  │
│  │ └────┘                                               │  │
│  │                      kr 10 200    🟡 1 på lager      │  │
│  │                      [+ Legg til bestilling]          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STEG 5: BESTILLING / TILBUD                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Handlekurv (3)                              [Vis →] │  │
│  │  • BMW X5 Frontrute    ×1    kr 12 450               │  │
│  │  • VW Golf Bakrute     ×2    kr  8 900               │  │
│  │                                                      │  │
│  │  [Send forespørsel]  —  Logg inn for din B2B-pris    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Produkt-Kort Design (B2B-Optimalisert)

```
┌─────────────────────────────────────────────────────────┐
│  🥇 98% MATCH                                    [ℹ️]   │
│  ┌────────┐  ┌───────────────────────────────────────┐  │
│  │        │  │ 2048AGNMVZ                            │  │
│  │  🪟    │  │ BMW X5 (G05) 2018–2022                │  │
│  │ [bilde]│  │ Frontrute — Grønn, ADAS, Regnsensor   │  │
│  │        │  │                                       │  │
│  └────────┘  │ 🛡️ ADAS  🌧️ Regn  🔥 Varme  📡 Ant   │  │
│              │ 🏷️  OEM: 51315A98765, 51315B12345     │  │
│              │ 🏷️  NAGS: DW01545, DW01546            │  │
│              └───────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Leverandør: Pilkington    │    🇬🇧 / 🇳🇱 / 🇩🇪      │  │
│  │  Vekt: 12.5 kg            │    Varenummer: 2048AGN  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  kr 12 450      │  │  🟢 8 på lager (Trondheim)   │  │
│  │  eks. mva       │  │  Levering: Neste dag         │  │
│  └─────────────────┘  └──────────────────────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [ − ]  [  2  ]  [ + ]    [+ Legg til bestilling]  │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.4 Liten Treffsikkerhet (Low Confidence): UX-Håndtering

Når vi IKKE er 100% sikre (layer 3-4 match), skal vi IKKE gjette. Vi skal:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Vi fant kjøretøyet, men trenger din hjelp          │
│                                                         │
│  ┌────────┐  BMW X5 2022                                │
│  │  🚙    │  xDrive40i                                  │
│  └────────┘                                             │
│                                                         │
│  Er dette riktig kjøretøy?                              │
│  [Ja, det er riktig]  [Nei, søk manuelt]                │
│                                                         │
│  ── Hvis JA ──                                          │
│  Velg glass-type:                                       │
│  [🪟 Frontrute]  [🔲 Bakrute]  [🚪 Dørglass]  [🪟 Side]│
│                                                         │
│  ── Hvis NEI ──                                         │
│  Søk manuelt:                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Merke ▾  │ Modell ▾  │ År ▾  │ Type ▾  │ [Søk] │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 100% Regnr-Nøyaktighet: Teknisk Strategi

### 3.1 Nåværende Tilstand

| Layer | Metode | Treffsikkerhet | Brukes nå |
|-------|--------|----------------|-----------|
| 1 | kType → D1 eksakt | ~60% | ✅ |
| 2 | Brand+Model+Year | ~25% | ✅ |
| 3 | Brand+Year | ~10% | ✅ |
| 4 | Brand only | ~5% | ✅ |
| — | **Total** | **~95%** (teoretisk) | |

**Problemer:**
- Bovsoft: 20% hit rate → mange regnr får ingen kType
- auto-glass.no har IKKE regnr-søk → ingen direkte regnr→eurocode mapping
- Feil modell-match = feil glass
- Lært data er sparsom

### 3.2 Mål: ≥99% Regnr→Riktig-Glass

**6-Lags Matching-Strategi (Ny):**

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 0: SVV + Biluppgifter + auto-glass.no Ground Truth   │
│  ─────────────────────────────────────────────────────────  │
│  regnr → SVV Enkeltoppslag → VIN + merke + modell + år     │
│       → Biluppgifter TecDoc → kType                        │
│       → auto-glass.no (merke+modell+år+type) → eurocode    │
│       → D1 validering → ✅ 99%+ nøyaktig                    │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1: kType Eksakt (D1)                                 │
│  regnr → SVV → VIN → Biluppgifter → kType → D1 eksakt      │
│  Treffsikkerhet: 95% (når kType finnes)                     │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2: VIN-Dekoding (TecDoc/VIN-API)                     │
│  regnr → SVV → VIN → VIN-dekoding → eksakt utstyr+modell   │
│  Treffsikkerhet: 98% (når VIN-dekoding lykkes)              │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3: auto-glass.no Mapping (Ny!)                       │
│  regnr → SVV → merke+modell+år → auto-glass.no SKU-lookup   │
│  → eurocode + type_code + egenskaper                        │
│  Treffsikkerhet: 95% (når mapping finnes)                   │
├──────────────────────────────────────────────────────────────┤
│  LAYER 4: Lært Regnr-Mapping (search_history)               │
│  regnr → SHA256 → D1 search_history → tidligere valgt      │
│  → eurocode direkte                                         │
│  Treffsikkerhet: 100% (når lært)                            │
├──────────────────────────────────────────────────────────────┤
│  LAYER 5: Lært VIN-Prefix                                   │
│  VIN-prefix → lært mapping → sannsynlige glass              │
│  Treffsikkerhet: 80%                                        │
├──────────────────────────────────────────────────────────────┤
│  LAYER 6: Katalog-Signatur + Fuzzy                          │
│  merke+modell+år → catalog signature → best guess           │
│  Treffsikkerhet: 70% (fallback)                             │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Ground Truth Database: Byggeplan

**Mål:** En database med "kjente sannheter" — regnr som er VERIFISERT å peke på riktig glass.

```sql
-- Ny tabell: ground_truth
CREATE TABLE ground_truth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr TEXT NOT NULL,
  regnr_hash TEXT NOT NULL,           -- SHA-256 for GDPR
  vin TEXT,
  vin_prefix TEXT,
  k_type INTEGER,
  
  -- Kjøretøy-info
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  submodel TEXT,
  
  -- Verifisert glass (per type)
  frontrute_eurocode TEXT,
  bakrute_eurocode TEXT,
  sideglass_fv_eurocode TEXT,         -- førerside ventil
  sideglass_fh_eurocode TEXT,         -- førerside hoved
  sideglass_bv_eurocode TEXT,         -- bak førerside
  sideglass_bh_eurocode TEXT,         -- bak høyre
  dor_fv_eurocode TEXT,               -- dør fremme venstre
  dor_fh_eurocode TEXT,               -- dør fremme høyre
  dor_bv_eurocode TEXT,               -- dør bak venstre
  dor_bh_eurocode TEXT,               -- dør bak høyre
  
  -- Metadata
  verified_by TEXT,                   -- 'auto-glass.no', 'tecdoc', 'manual'
  verified_at TEXT NOT NULL,
  source_url TEXT,                    -- auto-glass.no URL
  confidence REAL NOT NULL DEFAULT 1.0,
  
  UNIQUE(regnr_hash)
);
```

**Hvordan fylle ground_truth:**

1. **auto-glass.no Mapping (automatisk)**
   ```
   For hvert produkt i auto-glass.no:
     merke = product.brand
     modell = product.model  
     år = product.year_start–year_end
     type = product.type_code
     eurocode = product.sku
     
   → Bygg lookup: (merke, modell, år, type) → eurocode
   ```

2. **TecDoc kType Bridge (automatisk)**
   ```
   For hver kType i vår katalog:
     kType → Biluppgifter → kjøretøy-liste
     For hvert kjøretøy:
       regnr → SVV → verifiser merke/modell/år
       → Legg til i ground_truth
   ```

3. **Manuell Verifikasjon (ukentlig batch)**
   ```
   Hver uke:
     1. Velg 100 tilfeldige regnr fra search_history
     2. Sjekk SVV + auto-glass.no manuelt
     3. Verifiser at valgt glass = riktig glass
     4. Oppdater ground_truth + accuracy-metrics
   ```

4. **Customer Feedback Loop**
   ```
   Etter kjøp:
     "Passet glasset? [Ja] [Nei — feil glass]"
   → Hvis Nei: flagg for manuell review
   → Hvis Ja: boost confidence for regnr-mapping
   ```

### 3.4 Confidence Scoring (Nytt System)

```typescript
interface ConfidenceResult {
  score: number;        // 0.0 – 1.0
  label: 'exact' | 'high' | 'medium' | 'low' | 'guess';
  reasons: string[];    // Hvorfor vi er sikre/usikre
  layer: number;        // Hvilket lag som ga treff
  groundTruth: boolean; // Finnes i ground_truth?
}

function calculateConfidence(
  match: GlassMatch,
  layer: number,
  groundTruth: GroundTruthRecord | null
): ConfidenceResult {
  let score = 0.0;
  const reasons: string[] = [];

  // Ground truth = 100%
  if (groundTruth) {
    score = 1.0;
    reasons.push('Verifisert i ground truth database');
    return { score, label: 'exact', reasons, layer: 0, groundTruth: true };
  }

  // Layer-basert scoring
  switch (layer) {
    case 1: // kType eksakt
      score = 0.95;
      reasons.push('Eksakt match på kType fra TecDoc');
      break;
    case 2: // VIN-dekoding
      score = 0.90;
      reasons.push('Match basert på VIN-dekoding');
      break;
    case 3: // auto-glass.no mapping
      score = 0.88;
      reasons.push('Match basert på auto-glass.no katalog');
      break;
    case 4: // Lært regnr
      score = 0.85;
      reasons.push('Tidligere verifisert for lignende kjøretøy');
      break;
    case 5: // VIN-prefix
      score = 0.70;
      reasons.push('Basert på VIN-prefix mønster');
      break;
    case 6: // Katalog-signatur
      score = 0.55;
      reasons.push('Basert på merke, modell og årsmodell');
      reasons.push('⚠️ Verifiser at glasset passer før bestilling');
      break;
    default:
      score = 0.30;
      reasons.push('Begrenset data tilgjengelig');
  }

  // Bonus for equipment-match
  if (match.equipmentScore > 0.8) {
    score += 0.05;
    reasons.push('Utstyrsdetaljer stemmer overens');
  }

  // Cap at 1.0
  score = Math.min(score, 1.0);

  const label = score >= 0.95 ? 'exact' 
    : score >= 0.80 ? 'high'
    : score >= 0.60 ? 'medium'
    : score >= 0.40 ? 'low'
    : 'guess';

  return { score, label, reasons, layer, groundTruth: false };
}
```

### 3.5 auto-glass.no som Ground Truth: Integrasjonsplan

```
┌─────────────────────────────────────────────────────────────┐
│  auto-glass.no DATA-FLYT                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  auto-glass.no (27 185 produkter)                           │
│       │                                                     │
│       ▼ scrape                                              │
│  ┌─────────────────────────────┐                            │
│  │  products-autoglass-no.csv  │                            │
│  │  sku, title, brand, model,  │                            │
│  │  year_start, year_end,      │                            │
│  │  type_code, type_code_desc, │                            │
│  │  price, source_url          │                            │
│  └─────────────────────────────┘                            │
│       │                                                     │
│       ▼ transform                                           │
│  ┌─────────────────────────────┐                            │
│  │  auto-glass-mapping.json    │                            │
│  │  {                        │                            │
│  │    "BMW:X5:2018-2022:F": {│                            │
│  │      "eurocode": "2048AGNMVZ",│                          │
│  │      "price": 12450,      │                            │
│  │      "properties": [...]  │                            │
│  │    }                      │                            │
│  │  }                        │                            │
│  └─────────────────────────────┘                            │
│       │                                                     │
│       ▼ merge with Pilkington/Glavista catalog              │
│  ┌─────────────────────────────┐                            │
│  │  catalog-master.json        │                            │
│  │  (39 458 glass records)     │                            │
│  └─────────────────────────────┘                            │
│       │                                                     │
│       ▼ build ground_truth                                  │
│  ┌─────────────────────────────┐                            │
│  │  D1 ground_truth table      │                            │
│  │  regnr → verified eurocodes │                            │
│  └─────────────────────────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Nøkkel-mapping:**
- auto-glass.no `type_code` → vår `category` + `position` (førerside/passasjerside)
- auto-glass.no `title` properties → vår `equipment_flags`
- auto-glass.no `price` → vår `reference_price` (for B2B-prisutregning)
- auto-glass.no `source_url` → `external_reference` (for kundestøtte)

---

## 4. Komplett Implementeringsplan

### 4.1 Fase 1: Foundation (Uke 1–2) ✅ DELVIS FERDIG

| Oppgave | Status | Fil |
|---------|--------|-----|
| Vite + React + TS + Tailwind scaffold | ✅ Ferdig | `frontend/` |
| shadcn/ui primitives | ✅ Ferdig | `components/ui/` |
| Routing (Home, Catalog, Search) | ✅ Ferdig | `App.tsx` |
| API clients (catalog, glass) | ✅ Ferdig | `api/` |
| Cart store (Zustand) | ✅ Ferdig | `stores/cartStore.ts` |
| ProductCard + ProductGrid | ✅ Ferdig | `components/catalog/` |
| FilterPanel | ✅ Ferdig | `components/catalog/FilterPanel.tsx` |
| Header + mobil-meny | ✅ Ferdig | `components/layout/Header.tsx` |
| **Mangler:** type_code støtte, ground truth, confidence-UI | | |

### 4.2 Fase 2: auto-glass.no Integrasjon (Uke 2–3) 🎯 NESTE

**Backend (Cloudflare Worker):**

```typescript
// Ny endpoint: /api/glass?regnr=AB12345
// Forbedret med auto-glass.no ground truth

async function searchByRegnr_v3(regnr: string, env: Env): Promise<SearchResult> {
  // STEG 1: Sjekk ground_truth først
  const groundTruth = await queryGroundTruth(regnr, env.DB);
  if (groundTruth) {
    return buildResultFromGroundTruth(groundTruth, env);
  }

  // STEG 2: SVV + Biluppgifter (eksisterende)
  const vehicle = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
  const kType = await fetchBiluppgifterKtype(vehicle.vin, env);

  // STEG 3: auto-glass.no lookup (NY!)
  const agMatch = await lookupAutoglassMapping(
    vehicle.make, vehicle.model, vehicle.year, env
  );
  if (agMatch) {
    return buildResultFromAutoglass(agMatch, vehicle, env);
  }

  // STEG 4: Eksisterende 4-lags matching (fallback)
  return searchByRegnr_v2(regnr, env);
}
```

**Frontend:**
- Legg til `type_code` i Product-type
- Vis side-indikator (førerside vs passasjerside)
- Confidence-badge med detaljert tooltip
- "Verifiser dette glasset"-flyt for lav confidence

**Data-transform:**
```bash
# Script: scripts/build-autoglass-mapping.mjs
# Input:  data/autoglass-scrape/products-autoglass-no.csv
# Output: data/autoglass-mapping.json
#         { "brand:model:year:type": { eurocode, price, props } }
```

### 4.3 Fase 3: ground_truth Database (Uke 3–4)

**D1 Schema (ny migration):**
```sql
-- migrations/003_ground_truth.sql
CREATE TABLE IF NOT EXISTS ground_truth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regnr_hash TEXT NOT NULL UNIQUE,
  vin TEXT,
  vin_prefix TEXT,
  k_type INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  submodel TEXT,
  frontrute_eurocode TEXT,
  bakrute_eurocode TEXT,
  -- ... (alle 12 glass-typer)
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url TEXT,
  confidence REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_gt_make_model_year 
  ON ground_truth(make, model, year);
CREATE INDEX IF NOT EXISTS idx_gt_vin_prefix 
  ON ground_truth(vin_prefix);
```

**Populering:**
```bash
# Uke 1: auto-glass.no mapping → ground_truth (automatisk, ~10 000 entries)
node scripts/populate-ground-truth.mjs --source autoglass

# Uke 2: TecDoc kType bridge (automatisk, ~5 000 entries)
node scripts/populate-ground-truth.mjs --source tecdoc

# Uke 3+: Manuell verifikasjon (100 per uke)
node scripts/verify-ground-truth.mjs --batch 100
```

### 4.4 Fase 4: Confidence-UI + Bestillingsflyt (Uke 4–5)

**Søkeresultat med Confidence:**
```
┌──────────────────────────────────────────────────────────┐
│  🚙  BMW X5 2022 xDrive40i                               │
│                                                            │
│  🥇 Eksakt match (98%) — Verifisert i database          │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 2048AGNMVZ  Frontrute  kr 12 450  [+ Legg til]    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  🥈 Høy treffsikkerhet (85%) — Basert på kType          │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 2048AGCCMV  Frontrute (uten ADAS)  kr 10 200      │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Lav Confidence (≤60%):**
```
┌──────────────────────────────────────────────────────────┐
│  ⚠️  Begrenset treffsikkerhet (45%)                      │
│                                                            │
│  Vi fant: BMW X5 2020–2024                                │
│  Men er usikker på eksakt modellvariant.                  │
│                                                            │
│  [🪟 Se frontrute-alternativer]                          │
│                                                            │
│  💡 Tips: Sjekk om bilen har:                             │
│     • Head-Up Display (HUD)                              │
│     • Kamera for filskifteassistent                      │
│     • Regnsensor                                         │
│                                                            │
│  [Jeg vet hvilket glass jeg trenger — vis alle]          │
└──────────────────────────────────────────────────────────┘
```

### 4.5 Fase 5: B2B Bestillingsportal (Uke 5–6)

**Handlekurv → Tilbud/Ordre:**
```
┌──────────────────────────────────────────────────────────┐
│  Handlekurv                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  BMW X5 Frontrute     2048AGNMVZ    ×1  kr 12 450 │   │
│  │  VW Golf Bakrute      3030BGNMVZ    ×2  kr  8 200 │   │
│  │                                    ─────────────── │   │
│  │                                    SUM: kr 28 850  │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  [📋 Send forespørsel om tilbud]                          │
│                                                            │
│  Eller logg inn for din B2B-pris:                         │
│  ┌─────────────┐  ┌─────────────┐  [Logg inn]            │
│  │ E-post      │  │ Passord     │                         │
│  └─────────────┘  └─────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

### 4.6 Fase 6: Kontinuerlig Forbedring (Løpende)

```
Ukentlig Pipeline:
┌─────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐
│ Scrape  │→ │ Transform   │→ │ Validate    │→ │ Deploy   │
│ auto-   │  │ → mapping   │  │ (accuracy   │  │ to D1    │
│ glass.no│  │ → ground-   │  │  ≥ 95%)     │  │ + KV     │
│         │  │   truth     │  │             │  │          │
└─────────┘  └─────────────┘  └─────────────┘  └──────────┘

Månedlig Review:
- Accuracy-måling på 100 tilfeldige regnr
- Kundetilbakemeldinger (feil glass-rapporter)
- Ny bilmodell-oppdateringer (TecDoc)
- Pris-oppdateringer fra auto-glass.no
```

---

## 5. Data-Modell: Ny Unified Schema

### 5.1 Product (utvidet med auto-glass.no)

```typescript
interface Product {
  // Identitet
  eurocode: string;           // Primær nøkkel
  articleNumber: string;      // Leverandørens art.nr.
  
  // Klassifisering
  category: string;           // 'frontrute' | 'bakrute' | 'dor' | 'side' | 'tak'
  typeCode: string;           // 'F' | 'B' | 'DFF' | 'DFB' | ... (16 koder)
  typeCodeDesc: string;       // 'Frontrute' | 'Dørrute fremre førerside' | ...
  position: 'driver' | 'passenger' | 'center' | null;  // Førerside/Passasjerside
  
  // Kjøretøy
  brand: string;
  model: string;
  submodel: string | null;    // 'SEDAN', 'COUPE', 'STV'
  yearFrom: number | null;
  yearTo: number | null;
  yearRange: string | null;   // '2018-2022 (G05)'
  
  // Equipment (fra tittel-parsing + API)
  properties: {
    color: 'green' | 'blue' | 'coated' | 'tinted' | null;
    heated: boolean;
    rainSensor: boolean;
    adas: boolean;            // Kamera / LDW / City Safety
    hud: boolean;             // Head-Up Display
    acoustic: boolean;
    antenna: boolean;
    solar: boolean;
    encapsulated: boolean;
    laminated: boolean;
    clips: boolean;
    molding: 'none' | 'partial' | 'full' | null;
  };
  
  // Pris & Lager
  price: number;              // B2B-pris (eller referansepris)
  listPrice: number;          // auto-glass.no listepris
  stockStatus: number;        // Antall på lager
  stockLocation: string;      // 'Trondheim', 'Oslo'
  
  // Referanser
  oemNumbers: string[];       // Original Equipment Manufacturer
  nagsCodes: string[];        // US NAGS-koder
  supplier: string;           // 'Pilkington', 'Glavista', 'OEM'
  sourceUrl: string;          // auto-glass.no produktlenke
  
  // Media
  imageUrl: string | null;
  images: string[];           // Flere vinkler
  
  // Metadata
  description: string;
  weight: number | null;      // kg
  width: number | null;       // mm
  height: number | null;      // mm
  
  // Matching
  prefix4: string;            // For rask lookup
  kTypes: number[];           // TecDoc kType(s)
  
  // Sys
  createdAt: string;
  updatedAt: string;
  source: 'pilington' | 'glavista' | 'autoglass-no' | 'euroglass';
}
```

### 5.2 SearchResult (forbedret)

```typescript
interface SearchResult {
  vehicle: {
    make: string;
    model: string;
    year: number;
    vin: string;
    k_type: number;
    submodel?: string;
    fuel?: string;
    bodyType?: string;
  };
  
  confidence: ConfidenceResult;
  
  // Gruppert etter glass-type (for type-tabs)
  resultsByType: {
    F: Product[];     // Frontruter
    B: Product[];     // Bakruter
    DFF: Product[];   // Dør fremme fører
    DFB: Product[];   // Dør bak fører
    DPF: Product[];   // Dør fremme passasjer
    DPB: Product[];   // Dør bak passasjer
    // ... alle 16
  };
  
  // Flat liste (for bakoverkompatibilitet)
  candidates: Product[];
  
  // Equipment fra kjøretøy
  detectedEquipment: EquipmentFlags;
  
  // Ground truth info
  groundTruthMatch?: {
    verifiedBy: string;
    verifiedAt: string;
  };
}
```

---

## 6. Milepæler & Suksesskriterier

| Milepæl | Dato | Suksesskriterium |
|---------|------|------------------|
| Fase 1: Foundation | 2026-05-21 | ✅ Bygger, routes fungerer |
| Fase 2: auto-glass mapping | 2026-05-28 | 27k auto-glass produkter mappet til eurocode |
| Fase 3: ground_truth v1 | 2026-06-04 | 5 000 verifiserte regnr i D1 |
| Fase 4: Confidence-UI | 2026-06-11 | Bruker ser tydelig confidence på hvert resultat |
| Fase 5: Bestillingsflyt | 2026-06-18 | Handlekurv → tilbudforspørsel fungerer |
| Fase 6: 99% accuracy | 2026-07-02 | Ground truth test: ≥99% riktig på 100 tilfeldige regnr |

---

## 7. Oppsummering: "Bibelen" → Modern B2B

```
┌─────────────────────────────────────────────────────────────┐
│                    auto-glass.no                            │
│                  (The Bible)                                │
│                                                             │
│  ✓ Korrekte numre      →  eurocode + type_code            │
│  ✓ Korrekte priser     →  listPrice + B2B-pris            │
│  ✓ Korrekt plassering  →  16 typekoder + side             │
│  ✓ Egenskaper i tittel →  parsed properties               │
│  ✓ Årsmodell           →  yearFrom/yearTo                 │
│  ✓ Undermodell         →  submodel                        │
│  ✓ Direkte URL         →  sourceUrl                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │ scrape + transform
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Modern B2B Grossist-Frontend                   │
│                                                             │
│  🚙  Regnr-søk  →  Kjøretøy-kort  →  Glass-type-tabs       │
│                                                             │
│  🥇  Best match (confidence)  →  Produkt-kort              │
│       • Pris (B2B)                                          │
│       • Lagerstatus                                         │
│       • Plassering (førerside/passasjerside)                │
│       • Equipment (ADAS, regnsensor, etc.)                  │
│       • OEM-nummer                                          │
│       • Bilde                                               │
│                                                             │
│  🛒  Handlekurv  →  Tilbud/Ordre                           │
│                                                             │
│  🧠  Learning engine: hver søk gjør oss smartere           │
│                                                             │
│  ✅  Ground truth: ≥99% regnr-nøyaktighet                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Visjon:** Når en mekaniker taster `AB12345`, skal han på under 3 sekunder se:
1. ✅ Riktig bil (BMW X5 2022)
2. ✅ Riktig glass-type (Frontrute)
3. ✅ Riktig side (førerside hvis relevant)
4. ✅ Riktig utstyr (ADAS, regnsensor)
5. ✅ Pris og lagerstatus
6. [+] Legg til bestilling

Alt basert på auto-glass.no som ground truth.
