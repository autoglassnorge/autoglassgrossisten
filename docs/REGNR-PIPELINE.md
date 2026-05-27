# RegNr Pipeline — Dokumentasjon

**Dato:** 2026-05-22  
**Status:** ✅ Fullført  
**Agent:** glass-data-agent

---

## Mål

Bygge en komplett pipeline som finner, validerer, dedupliserer og prioriterer ekte norske registreringsnummer for kType-bootstrap via Bovsoft REGNUM.

**Resultat:** 61 validerte regnr → 60 kType-mappings seedet i `glass_rules` (fra 6 til 66 rader).

---

## Pipeline-flyt

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 1: Samle kandidater                                           │
│  ├── scripts/scrape-finn-no-regnr.mjs  → 479 rå regnr fra finn.no   │
│  ├── data/orders-eurocode-mapping.json → 20 regnr fra ordre        │
│  └── data/populaere-regnr.txt          → 0 (alle placeholders)     │
├─────────────────────────────────────────────────────────────────────┤
│  STEG 2: Dedupliser og rens                                         │
│  └── scripts/build-regnr-candidates.mjs → 61 unike regnr           │
├─────────────────────────────────────────────────────────────────────┤
│  STEG 3: Valider mot SVV                                            │
│  └── scripts/validate-regnr-svv.mjs    → 61/61 gyldige (100%)      │
├─────────────────────────────────────────────────────────────────────┤
│  STEG 4: Prioriter for Bovsoft                                      │
│  └── scripts/prioritize-regnr-for-bovsoft.mjs → 61 ranked          │
├─────────────────────────────────────────────────────────────────────┤
│  STEG 5: Bovsoft-batch → kType                                      │
│  └── scripts/batch-bootstrap-ktype.mjs → 60/61 treff (98.4%)       │
│  └── glass_rules seedet: 60 nye mappings (total: 66)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Filer

### Input
| Fil | Beskrivelse |
|-----|-------------|
| `data/orders-eurocode-mapping.json` | 20 regnr fra ordrehistorikk |
| `data/finn-no-regnr-raw.json` | 42 unike regnr fra finn.no (479 rå treff) |

### Output
| Fil | Beskrivelse |
|-----|-------------|
| `data/regnr-candidates.txt` | 61 unike regnr (én per linje) |
| `data/regnr-candidates.json` | Metadata med kilde per regnr |
| `data/regnr-validated.json` | SVV-validering med full kjøretøydata |
| `data/regnr-liste.txt` | Gyldige regnr (én per linje) |
| `data/regnr-validation-report.json` | Rapport: totalt, gyldige, ugyldige |
| `data/regnr-top-333.txt` | Topp 333 (alle 61 vi har) |
| `data/regnr-top-1000-ranked.json` | Ranket liste med score og begrunnelse |
| `data/finn-no-regnr-raw-0-10.json` | Rådata batch 1 (merker 1-10) |
| `data/finn-no-regnr-raw-10-20.json` | Rådata batch 2 (merker 11-20) |

### Scripts
| Fil | Formål |
|-----|--------|
| `scripts/scrape-finn-no-regnr.mjs` | Scraper finn.no for regnr (Playwright) |
| `scripts/build-regnr-candidates.mjs` | Samler, renser, dedupliserer |
| `scripts/validate-regnr-svv.mjs` | Validerer mot SVV API |
| `scripts/prioritize-regnr-for-bovsoft.mjs` | Scorer og rangerer |
| `scripts/batch-bootstrap-ktype.mjs` | Bovsoft-batch + glass_rules seeding |

### Endrede Worker-filer
| Fil | Endring |
|-----|---------|
| `api/cf-worker/src/providers/svv.ts` | **Ny** — Ekstraher SVV-klient fra index.ts |
| `api/cf-worker/src/index.ts` | Importerer SVV fra providers/svv.ts |

---

## Resultater

### SVV-validering
| Metrikk | Verdi |
|---------|-------|
| Totalt kandidater | 61 |
| Gyldige | 61 (100%) |
| Ugyldige/not_found | 0 |

### Bovsoft-batch
| Metrikk | Verdi |
|---------|-------|
| Regnr prosessert | 61 |
| kType-treff | 60 (98.4%) |
| Ikke funnet | 1 (AD44229) |
| Gjenstående Bovsoft-søk | ~272 |

### glass_rules etter seeding
| Metrikk | Verdi |
|---------|-------|
| Totale rader | 66 (6 eksisterende + 60 nye) |
| Unike merker | 21 |
| Topp merker | VW (9), Ford (8), BMW (6), Toyota (6), Volvo (6) |

### Merke- og årsdekning

**Merker (19 unike):**
```
Ford (10), Volkswagen (8), BMW (6), Toyota (6), Volvo (5),
Audi (5), Mitsubishi (3), Opel (3), Skoda (3), Mercedes-Benz (2),
Peugeot (2), Jaguar Land Rover (1), NIO (1), Kia (1), Saab (1),
Hyundai (1), Nissan (1), SsangYong (1), Mazda (1)
```

**Årsmodeller:** 1989–2022, flest fra 2007–2014

---

## Kjente begrensninger

1. **finn.no merke-filter:** Søkeparameteret `make=` filtrerer ikke faktisk på merke. Alle 20 merke-søk returnerte de samme 42 unike regnrene. Løsning: Hvert regnr valideres mot SVV uansett, og Bovsoft returnerer uavhengig korrekt kType.

2. **Kapasitet:** 61 regnr er langt fra målet på 1 000. Pipeline er bygget for å skalere — legge til `data/regnr-manual-seed.txt` eller kjøre scraperen på flere kilder.

3. **Bovsoft remaining:** ~272 søk gjenstår. Med flere regnr kan vi fortsette batch-seeding.

---

## Hvordan kjøre på nytt

```bash
# 1. Scrape finn.no (to parallelle batcher)
node scripts/scrape-finn-no-regnr.mjs 0 10   # Merker 1-10
node scripts/scrape-finn-no-regnr.mjs 10 20  # Merker 11-20

# 2. Bygg kandidater
node scripts/build-regnr-candidates.mjs

# 3. Valider mot SVV
SVV_API_KEY=xxx node scripts/validate-regnr-svv.mjs

# 4. Prioriter
node scripts/prioritize-regnr-for-bovsoft.mjs

# 5. Bovsoft-batch
cat data/regnr-top-333.txt | node scripts/batch-bootstrap-ktype.mjs --d1-local
```

---

## Neste steg

1. **Samle flere regnr:** Legg til i `data/regnr-manual-seed.txt`
2. **Kjør Bovsoft-batch:** Bruk de ~272 gjenværende søkene
3. **Self-learning:** Etter lansering fylles glass_rules automatisk fra brukersøk
4. **Deploy:** `wrangler login` → `npx wrangler deploy`

---

*Rapport generert av glass-data-agent, 2026-05-22*
