# Bilglass-pakking — Kunnskapsgap (opprettet 2026-06-11)

## Status
**Kunnskapsgap identifisert.** Ingen eksisterende dokumentasjon om pakking/emballasje i MemPalace.

## Hva som mangler

### 1. Glass-typer og sårbarhet
- Laminert glass (frontrute) — tykkelse, fleksibilitet, kant-sårbarhet
- Herdet glass (siderute, bakrute, takluke) — sprøhet, eksplosjonsrisiko ved skade
- ADAS-glass (kamera, regnsensor, HUD) — sensor-område må beskyttes ekstra

### 2. Emballasje-hierarki
```
Individuell beskyttelse (hjørner + film)
    ↓
Mellomlagring (skum/papp mellom glass)
    ↓
Kolli (eske/kasse med flere glass)
    ↓
Pall (stablet kolli)
    ↓
Container (sjøfrakt/import)
```

### 3. Beskyttelsesmaterialer
- Hjørnebeskyttere (trekantpapp / plast)
- Bobleplast / skumfolie
- Papp- eller tre-rammer
- Strekkfilm / krympeplast
- Skumlag mellom glass i stabel

### 4. Stabelregler
- Maks høyde per pall
- Trykkfordeling (ikke legg vekt på kantene)
- "IKKE STABLES"-merking for herdet glass
- Laminert glass tåler mer stabling enn herdet

### 5. Transportmodus
- **Lastebil (norsk):** Standard B2B-levering
- **Sjøfrakt (import):** Pilkington/Glavista/Euroglass fra utlandet
- **Henting (B2B):** Kunde henter selv — enklere emballasje OK

### 6. Skade-typer å unngå
- Kant-avskalling (mest vanlig)
- Stjernesprekk (punktlast)
- Riper (overflate-skade)
- Coating-skade (ADAS-film, varmeledende belegg)

### 7. Katalog-relevans
- 27,184 produkter i `glass_catalog`
- `eurocode` + `type_description` gir implisitt størrelse
- `properties` (ADAS) indikerer ekstra beskyttelsesbehov
- Ingen eksplisitte dimensjoner/vekter i D1 i dag

## Neste steg (avventer bruker)
1. Intervju Tomar om nåværende pakking-rutiner
2. Dokumentere per leverandør (Pilkington, Glavista, Euroglass, Autoglass)
3. Bygge `bilglass-pakking` skill
4. Berike katalog med vekt/dimensjoner der mulig

## Kilder som kan undersøkes
- Leverandøremballasje-spesifikasjoner (Pilkington, Glavista)
- Speditør-råd (sjøfrakt)
- Bransjestandarder (ISO/TS 16949-relatert)
- UNI Micro: pakkseddel-felter
