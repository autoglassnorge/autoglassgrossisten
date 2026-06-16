# Guide til eurokode-prefix i Autoglass-katalogen

> **Sist oppdatert:** 2026-06-16  
> **Basert på:** 27 184 produkter i `data/catalog-prod.json`, ARGIC-dokumentasjon, bransjeblogger og leverandørkataloger.

---

## 1. Hva er en ARGIC Eurocode?

**ARGIC** = *Automotive Replacement Glass Identification Center*. Det er en bransjestandard for identifisering av bilglass og tilbehør i Europa, etablert i 1993 av blant andre Saint-Gobain, Pilkington og Belron.

En eurokode er en unik kode som forteller hvilket glass som passer til hvilket kjøretøy — inkludert kategori (frontrute, bakrute, dørglass, etc.), farge, og utstyr som regnsensor, ADAS, oppvarming, osv.

> **Format-oppdatering 2025:** Nye eurokoder kan være opptil **17 tegn** (tidligere 15). Eldre koder forblir gyldige.

---

## 2. Oppbygning av en eurokode

| Del | Posisjon | Betydning | Eksempel |
|-----|----------|-----------|----------|
| **Prefix4** | 1–4 | Kjøretøygruppe / plattform (koblet til TecDoc kType) | `5351` = BMW 3-Serie (ca. 2019) |
| **Kategori-bokstav** | 5 | Hovedkategori etter ARGIC Matrix | `A` / `C` / `G` = frontrute |
| **Underkategori** | 6 | Variant / undergruppe | `G` = glass, `K` = laminated, `S` = tilbehør |
| **Modifikasjoner** | 7+ | Farge, utstyr, posisjon, mm. | `N` = grønt, `YP` = tonet, `CM` = ADAS/kamera |

---

## 3. De 4 første sifrene — kjøretøygruppe (prefix4)

Prefix4 identifiserer **en gruppe kjøretøy** (ofte en plattform eller modellrekke), ikke nødvendigvis ett enkelt kjøretøy. Dette er begrunnelsen for kType-oppslaget i `api/unimicro-export/glass-lookup.ts`.

Eksempler fra katalogen og `data/ktype-prefix4-cache.json`:

| Prefix4 | Typisk kjøretøy | Antall i katalog |
|---------|-----------------|------------------|
| `5351` | BMW 3-Serie (2019+) | 54 |
| `8650` | VW Golf (2020+) | 49 |
| `5509` | Mercedes W206 C-Klasse | 56 |
| `8644` | Audi A6 | 52 |
| `3190` | VW Golf | 52 |

> **Merk:** Samme prefix4 kan dekke flere merker/modeller dersom de deler plattform. For eksempel kan `6573` brukes på både Opel Combo og Peugeot Partner.

---

## 4. Posisjon 5 — kategori-bokstav

Basert på `scripts/parse-eurocodes-final.mjs` og faktisk data fra katalogen:

| Bokstav | Hovedkategori | Eksempler fra katalog |
|---------|---------------|------------------------|
| **A** | Frontrute | `A` = 1 054 av 1 115 frontrute |
| **C** | Frontrute (alternativ/variant) | `C` = 829 frontrute, ofte med regnsensor |
| **G** | Frontrute | `G` = 3 960 av 4 611 frontrute; ofte grønt glass |
| **B** | Bakrute | `B` = 826 av 1 501; ofte oppvarmet |
| **L** | Dørglass / sideglass, venstre? | `L` = 821 sideglass, 488 dørglass-bak, 388 dørglass-frem |
| **R** | Dørglass / sideglass, høyre? | `R` = 814 sideglass, 485 dørglass-bak, 385 dørglass-frem |
| **0–9** | Dørglass / sideglass / bakrute (korte koder) | Tallene 0–9 dekker mest dørglass og sideglass |
| **Z, N, Y, P** | Sjeldne frontrute-varianter | Mindre enn 30 hver |
| **F, S, O, U** | Svært sjeldne / spesial | Få forekomster |
| **.** | Ugyldig/sjelden format | `BO.9...` for bobiler/campingvogner |

### Hvorfor både A, C og G for frontrute?

`scripts/parse-eurocodes-final.mjs` bruker ARGICs kategorimap:

```js
CATEGORIES_SIMPLE = {
  1: ['A', 'C', 'D'],   // Windscreens (frontrute)
  2: ['B', 'E'],        // Backlights (bakrute)
  3: ['F', 'H', 'L', 'M', 'R', 'T'],  // Bodyglasses
  4: ['G'],             // Glass Roofs
};
```

I praksis ser vi at `G` også brukes mye til frontrute, ikke bare takglass. Dette kan skyldes:
- Ulik praksis mellom leverandører
- Eldre koder før ARGIC-standardisering
- At `G` også kan bety "green" (grønt glass) i noen kilder

> **Usikkerhet:** Tolkningen av `G` er ikke entydig. Dataene viser at `G` i posisjon 5 nesten alltid er frontrute.

---

## 5. Posisjon 6 — underkategori / variant

Fra `scripts/parse-eurocodes-final.mjs`:

| Kode | Betydning |
|------|-----------|
| **G** | Glass (standard) |
| **K** | Laminated / laminert |
| **S** | Accessory / tilbehør |
| **X** | Accessory / tilbehør |

Eksempler fra PMA Tools-katalog:
- `2031AS**MH**` — Hyundai Matrix I, WS-Moulding (tilbehør)
- `4153AS**MR**L` — Hyundai Santa Fe III, WS-Trim, left
- `4153AS**MR**R` — Hyundai Santa Fe III, WS-Trim, right

Her ser vi at `AS` = accessory, og `L` / `R` suffix = venstre / høyre.

---

## 6. Suffix-bokstaver — farge og utstyr

Dette er der det blir mest interessant. Analysen av 27 184 produkter viser klare korrelasjoner mellom suffix-bokstaver og egenskaper.

### 6.1 Fargekoder

| Suffix | Betydning | Bevis fra data | Eksempel |
|--------|-----------|----------------|----------|
| **GN** | **Green** (grønt glass) | `green: true` på 6 791 av 8 952 GN-produkter | `27560GN` |
| **N** | **Green** (kortversjon) | `green: true` på 609 av 1 093 | `3190CSN` |
| **BL** | **Blue** (blått glass) | `blue: true` på 425 av 867 | `28040BL` |
| **L** | **Blue** / Clear? | `blue: true` på 122 av 627 | — |
| **YP** | **Tinted** / Yellow-Privacy? | `tinted: true` på 1 977 av 2 178 | `DQ10044YP` |
| **Y** | **Tinted** / gulaktig | `tinted: true` er vanlig, men også `encapsulated` | `3190CSY` |
| **GD** | **Green** + **D**? | `green: true` på 369 av 481 | `27000GD` |
| **GP** | **Green** + **Privacy**? | `green: true` på 292, `tinted: true` på 278 | — |
| **YD** | **Tinted** + **D**? | `tinted: true` på 91 av 102 | — |

> **Kilder:** Fargekodene GN, BL, Y, etc. er også kjente IEC/DIN fargekoder (f.eks. GN = Green, BL = Blue, YE/Y = Yellow).

### 6.2 Utstyrskoder

| Suffix | Betydning | Bevis fra data | Kommentar |
|--------|-----------|----------------|-----------|
| **CM** | **Camera / ADAS** | `adas: true` på 202 av 214 `NCM`, `laneAssist: true` på 198 | Sterk korrelasjon |
| **ACM** | **ADAS + Camera** | `adas: true` på 81 av 92 `GACMVZ` | Ofte HUD også |
| **M** | **Rain sensor** / modifikasjon | `rainSensor: true` på 272 av 371 `NM`, 220 av 309 `YM` | M = "multi-sensor"? |
| **EL** | **Electrically heated** | `heated: true` på 117 av 169 `NEL`, 138 av 179 `NELM` | EL = elektrisk |
| **ELM** | **Heated + Rain sensor** | `heated: true` på 138, `rainSensor: true` på 116 | Kombinasjon |
| **H** | **Heated** | `heated: true` på mange `...H...` | H = heat |
| **SM** | **Sensor + Acoustic** | `rainSensor: true` på 90 av 119, `acoustic: true` på 24 | — |
| **BM** | **Blue + Sensor** | `rainSensor: true` på 56 av 68 | — |
| **SL** | **Sensor + ...?** | `rainSensor: true` på 35 av 56 `SELM` | — |
| **VZ** | **ADAS / Vision Zone?** | Sterkt korrelert med `adas` og `laneAssist` | Ofte sammen med CM |
| **UVZ** | **ADAS + Lane Assist** | `adas: true` på 109 av 117 `NCELM`, `laneAssist: true` på 109 | — |
| **R5FD** / **R5RD** | Posisjon / side | `dørglass-frem` / `dørglass-bak` | Tall-bokstav-kombinasjoner for posisjon |

### 6.3 Posisjonskoder

| Suffix | Betydning | Eksempel |
|--------|-----------|----------|
| **L** (siste tegn) | **Left** / venstre | `4153ASMRL` |
| **R** (siste tegn) | **Right** / høyre | `4153ASMRR` |
| **FD** / **RD** | **Front Door** / **Rear Door** | `GSR5FD` = dørglass-frem |
| **FF** / **FB** | **Front Fixed** / **Front Back**? | `DFF` / `DFB` i typeCode-systemet |

---

## 7. Vanlige eurokode-mønstre (fra katalogen)

| Mønster | Antall | Tolkning |
|---------|--------|----------|
| `####GN` | 8 952 | Grønt standardglass |
| `####YP` | 2 178 | Tonet/privacy-glass |
| `####N` | 1 093 | Grønt glass (eldre/kort kode) |
| `####BL` | 867 | Blått glass |
| `####CL` | 555 | Klar/klart glass med varme |
| `####NM` | 371 | Grønt + regnsensor |
| `####NCM` | 214 | Grønt + ADAS/kamera + filskifteassistent |
| `####GACMVZ` | 92 | Grønt + ADAS + HUD + filskifteassistent |

> `#` = siffer, bokstav = literal.

---

## 8. Outliers og spesialtilfeller

| Eurokode | Tolkning |
|----------|----------|
| `BO.9...` | Bobiler / campingvogner (Motorhomes). Inneholder punktum, ikke standardformat. |
| `DD11...` | USA-biler (Dodge, Cadillac, Chevrolet). Bruker bokstaver i prefix4. |
| `DQ10...` | USA-biler. |
| `DB10...` / `DB11...` | USA-biler. |

---

## 9. Hvordan bruke dette i koden

### 9.1 Eksisterende parser
`scripts/parse-eurocodes-final.mjs` parser allerede long codes (≥10 tegn) og kategoriserer etter ARGIC-kartet. Den infererer også `typeCode` og `position` fra beskrivelsen.

### 9.2 Mulige forbedringer
Basert på denne analysen kan parseren utvides til å:
1. Gjenkjenne farge fra suffix: `GN`/`N` = grønt, `BL` = blått, `YP` = tonet.
2. Gjenkjenne utstyr fra suffix: `NCM`/`ACM`/`UVZ` = ADAS, `EL`/`ELM` = oppvarmet, `SM`/`NM` = regnsensor.
3. Håndtere USA-koder (`DD##`, `DQ##`, `DB##`) som egne grupper.
4. Håndtere `BO.9` (bobiler) som spesialgruppe.

---

## 10. Kilder

- [ARGIC offisiell nettside](https://www.argic.org/)
- [ARGIC Eurocode Explained — Autoglass Portal](https://autoglassportal.com/en/blog/argic-eurocode-explained)
- [AGC ARG — Eurocode evolution 2025](https://www.agc-arg.com/en/node/1761)
- [Carglass — Automotive glass marking](https://carglass.ee/en/carglass/automotive-glass-marking-2/)
- [PMA Tools katalog](http://epvs.ru/images/katalogi/PMA-TOOLS-2016.pdf)
- [JDM Junkies — 240Z ARGIC Eurocodes](https://www.jdmjunkies.ch/wordpress/2017-08-12/240z-windows-argic-eurocodes/)
- Autoglass intern data: `data/catalog-prod.json`, `data/ktype-prefix4-cache.json`, `scripts/parse-eurocodes-final.mjs`

---

## 11. Usikkerheter

- **Posisjon 5 `G`:** ARGICs Matrix sier `G` = takglass, men i katalogen er det nesten alltid frontrute. Kan være leverandørspesifikk praksis.
- **Tall i posisjon 5 (0–9):** Disse følger ikke ARGICs bokstav-standard. De kan være eldre koder eller leverandørspesifikke.
- **Suffix-betydninger:** Mange tolkninger er basert på statistisk korrelasjon, ikke offisiell dokumentasjon. ARGICs fulle Matrix er ikke offentlig tilgjengelig.
- **Prefix4 → kjøretøy:** Mappingen er statistisk og kan være upresis for facelift/modellendringer.

---

## 12. Neste steg (forslag)

1. Validere suffix-tolkningene mot et større utvalg produktbeskrivelser.
2. Kontakte ARGIC eller en leverandør (Pilkington/AGC/Saint-Gobain) for offisiell Matrix.
3. Utvide `scripts/parse-eurocodes-final.mjs` med farge- og utstyrsregler.
4. Legge til prefix4 → kjøretøy-oppslag i søket.
