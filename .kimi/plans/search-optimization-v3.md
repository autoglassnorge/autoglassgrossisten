# Plan: Glass-søk Optimalisering V3 — Hacker/Senior Dev Perspektiv

**Dato:** 2026-05-28
**Kontekst:** Bruker får 0 frontruter for PEUGEOT 307 (UX71699). Systemet returnerer 6 kandidater (bakruter, sideruter, dørrute-frem) men ingen frontruter.

---

## 🔍 Rotårsak-Analyse

### Hva skjer nå:
1. **SVV oppslag** → `make=PEUGEOT, model=307, year=2004, typeCode=3*NFU*`
2. **Biluppgifter** → `kType=18550`
3. **Modell-matching** → Søker D1 etter `brand=PEUGEOT AND model LIKE '%307%'`
4. **Resultat** → 6 treff: `307 3-D.C.C` (sideruter), `307 -SW 4D STV` (bakruter)
5. **Ingen frontruter** → Fordi frontruter i DB har andre modell-strenger enn de 6 treffene

### Den skjulte juvelen:
**typeCode = `3*NFU*`** — dette er en Norsk veivesen-standardkode som faktisk inneholder:
- `3` = karosseritype (3-dørs, 5-dørs, stasjonsvogn, etc.)
- `NFU` = motorkode
- `*` = wildcards for ytterligere varianter

**Vi bruker IKKE typeCode til matching i dag.** Dette er den største uutnyttede datakilden.

### Hvorfor kType ikke hjelper her:
- kType=18550 finnes i `ktype_registry` (75 rader)
- Men kun 1.26% av produkter i `glass_catalog` har kType-kobling
- PEUGEOT 307 har INGEN kType-mappede produkter

---

## 🎯 Tre Optimaliseringslag (Prioritert)

### LAG 1: Bruk typeCode som sekundær nøkkel (Quick Win — 2-3 timer)

**Problem:** SVV gir oss typeCode som vi kaster.
**Løsning:** Bygg en reverse-mapping fra typeCode → modell-varianter.

**Implementasjon:**
```typescript
// I searchByRegnr, etter SVV-oppslag:
const svvVehicle = await fetchSVV(regnr);
// svvVehicle.typeCode = "3*NFU*"

// 1. Normaliser typeCode (fjern wildcards)
const typeCodeBase = svvVehicle.typeCode.replace(/\*/g, '').replace(/\?/g, '');
// => "3NFU"

// 2. Søk D1 med typeCode-pattern
const typeCodeMatches = await db.prepare(`
  SELECT * FROM glass_catalog 
  WHERE brand = ? 
  AND (model LIKE ? OR model LIKE ? OR type_code LIKE ?)
`).bind(brand, `%${model}%`, `%${typeCodeBase}%`, `%${typeCodeBase}%`).all();
```

**Men vent** — D1 har ingen `type_code` kolonne! Vi må:
1. Parse typeCode fra produkt-beskrivelser (de inneholder ofte karosseri/motor-info)
2. Eller: bygge en lookup-tabell: `typeCode → [modell-varianter]`

**Smartere tilnærming — Bygg typeCode→model mapping fra SVV-data:**
```typescript
// Fase 1: Samle typeCode→model mappings fra alle SVV-oppslag vi gjør
// Lagre i D1: type_code_registry (typeCode, brand, model_variant, frequency)

// Fase 2: Ved søk, slå opp typeCode for å få modell-varianter
const variants = await getTypeCodeVariants(typeCodeBase);
// Returns: ["307 3-D.C.C", "307 -SW 4D STV", "307 5D", ...]

// Fase 3: Søk med alle varianter
const candidates = await searchWithVariants(brand, variants, year);
```

**Status:** Medium innsats, høy avkastning for populære biler.

---

### LAG 2: Fuzzy Modell-Matching + Score-Ranking (1-2 dager)

**Problem:** Eksakt/LIKE matching på modell-streng er for skjør.
**Løsning:** Token-basert fuzzy matching med TF-IDF-scoring.

**Implementasjon:**
```typescript
// Nåværende (for strengt):
// model LIKE '%307%'

// Ny (fuzzy):
function fuzzyModelScore(queryModel: string, dbModel: string): number {
  const qTokens = tokenize(queryModel);  // ["307"]
  const dTokens = tokenize(dbModel);     // ["307", "3", "D.C.C"]
  
  // Token overlap score
  const overlap = qTokens.filter(t => dTokens.includes(t)).length;
  const score = overlap / Math.max(qTokens.length, dTokens.length);
  
  // Jaro-Winkler for string similarity
  const jwScore = jaroWinkler(queryModel, dbModel);
  
  return score * 0.6 + jwScore * 0.4;
}

// Søk bredere, rank smartere
const allPeugeot = await db.prepare(`
  SELECT * FROM glass_catalog WHERE brand = ? AND year_from <= ? AND year_to >= ?
`).bind(brand, year, year).all();

// Score og rank
const scored = allPeugeot.map(p => ({
  ...p,
  modelScore: fuzzyModelScore("307", p.model),
  yearScore: yearOverlapScore(year, p.year_from, p.year_to),
}));

// Returner topp 50, uavhengig av modell-match
return scored.filter(s => s.modelScore > 0.3).sort((a, b) => b.modelScore - a.modelScore);
```

**Fordeler:**
- Finner frontruter selv om modell-strengen er "307 BREAK" eller "307 SW"
- Gir brukeren "mulige treff" med confidence-score

**Ulemper:**
- Krever bredere D1-søk (kan være tregt uten indeks)
- Krever pagination/limit

**Status:** Høy innsats, høy avkastning. Løser PEUGEOT-problemet direkte.

---

### LAG 3: VIN-Dekoding + Utstyrskjema-Matching (3-5 dager)

**Problem:** Vi har VIN (VF33BNFUC83502899) men dekoder den kun delvis.
**Løsning:** Full VIN-dekoding → fabrikkutstyr → eksakt glass-spesifikasjon.

**Implementasjon:**
```typescript
// Steg 1: Dekod VIN med vPIC (gratis, offisiell NHTSA)
const vinData = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
// Returns: BodyClass, Doors, EngineModel, Plant, etc.

// Steg 2: Map VIN-attributter til glass-egenskaper
const glassSpec = {
  bodyType: vinData.Results.find(r => r.Variable === "Body Class")?.Value,     // "4 Door Wagon"
  doors: vinData.Results.find(r => r.Variable === "Doors")?.Value,              // "5"
  windshield: vinData.Results.find(r => r.Variable === "Windshield")?.Value,   // eksisterer kanskje
};

// Steg 3: Bruk Biluppgifter TecDoc for å hente OEM-glass-numre
const oemGlass = await biluppgifter.getGlassParts(kType);
// Returns: ["OEM-12345", "OEM-67890", ...]

// Steg 4: Match OEM-numre mot D1
const matches = await db.prepare(`
  SELECT * FROM glass_catalog 
  WHERE oemNumbers LIKE ? OR crossReferences LIKE ?
`).bind(`%${oemNum}%`, `%${oemNum}%`).all();
```

**Viktig innsikt:** vPIC er GRATIS og har INGEN rate limit for enkelt-VIN-dekoding. Vi brukte det tidligere men ga opp pga 403-errors ved bulk. For enkelt-VIN (regnr-søk) fungerer det perfekt.

**Status:** Høyeste presisjon, men avhengig av at Biluppgifter har OEM-glass-data.

---

## 🏗️ Anbefalt Implementasjons-Rekkefølge

### Fase 1: Fuzzy Matching (2-3 timer — løser problemet NÅ)
1. Endre `searchByRegnr` til å søke bredere: `brand + year` i stedet for `brand + model + year`
2. Bruk fuzzy scoring (token overlap + Jaro-Winkler) for å rankere modell-match
3. Returner topp 50 resultater, gruppert etter category
4. Frontend: Vis "Mulige treff" med confidence-indikator

### Fase 2: typeCode Registry (1-2 dager — langvarig verdi)
1. Opprett D1-tabell: `type_code_registry`
2. Populer med mappings fra alle SVV-oppslag (crowd-source fra trafikk)
3. Bruk registry ved søk for å finne modell-varianter

### Fase 3: VIN-Dekoding + OEM-Matching (3-5 dager — ultimat presisjon)
1. Implementer vPIC VIN-dekoding
2. Integrer Biluppgifter OEM-glass-oppslag
3. Match OEM-numre mot D1

---

## 📊 Forventet Effekt

| Problem | Nå | Etter Fase 1 | Etter Fase 3 |
|---|---|---|---|
| PEUGEOT 307 frontruter | 0 treff | 3-5 treff | Eksakt match |
| Modell-matching | Streng LIKE | Fuzzy scoring | VIN-presis |
| Brukeropplevelse | "Ingen frontruter" | "Mulige treff (85%)" | "Riktig glass funnet" |

---

## 🔧 Tekniske Notater

### Nåværende D1-skjema (relevante kolonner):
```sql
glass_catalog (
  id, eurocode, title, category, brand, model,
  year_from, year_to, prefix4, oem_numbers,
  cross_references, description, properties
)
```

### Mangel: Ingen typeCode-kolonne
**Løsning:** Parse typeCode fra `description` eller bygg lookup-tabell.

### Mangel: Ingen kType-kolonne i glass_catalog
**Løsning:** Utvid `ktype_registry` med eurocode-mappings.

---

*Plan skrevet av Claude Code (senior dev mode) — 2026-05-28*
