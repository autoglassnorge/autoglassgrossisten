# Datakilder — Autoglass AS

## Oversikt

| Kilde | Type | Poster | Kvalitet | Oppdatering |
|-------|------|--------|----------|-------------|
| Pilkington IRL | API/Scrape | ~15 000 | Høy | Daglig |
| Glavista | API/Scrape | ~10 000 | Høy | Daglig |
| Pilkington Finland 2017 | PDF | ~8 000 | Middels | Stasjonær |
| Euroglass.ru | Scrape | ~200 | Lav-Middels | Ukentlig |
| Autoglass.ru | Scrape | ~4 000 | Lav-Middels | Ukentlig |

---

## Pilkington IRL

- **URL:** `https://pilkington.aws.aphix.software/`
- **Metode:** API/Scrape
- **Data:** Eurocode, bilder, beskrivelser
- **Scraper:** `api/scrapers/pilkington-scraper.ts`

## Glavista

- **URL:** `https://www.glavista.com/`
- **Metode:** API/Scrape
- **Data:** Eurocode, priser, lagerstatus
- **Scraper:** `api/scrapers/glavista-scraper.ts`

## Euroglass.ru

- **URL:** `https://euroglass.ru/`
- **Metode:** HTML-scrape
- **Data:** Eurocode, merke, modell
- **Scraper:** `api/scrapers/euroglass-ru-scraper.ts`
- **Merk:** Russisk kilde — valideres nøye

## Autoglass.ru

- **URL:** `https://autoglass.ru/`
- **Metode:** HTML-scrape
- **Data:** Eurocode, merke, modell, glass-type
- **Scraper:** `api/scrapers/autoglass-ru-scraper.ts`
- **Merk:** Russisk kilde — valideres nøye

---

## Merge-prioritet

1. UNI Micro (høyest — faktisk lager)
2. Pilkington IRL
3. Glavista
4. Pilkington Finland 2017
5. Euroglass.ru / Autoglass.ru (lavest)

Ved konflikt: høyere prioritet vinner på pris/lager, lavere vinner på beskrivelse (lengst).

---

## Eurocode-format

```
XXXXYYYYYYY
^^^^^^^^^^^
|   |
|   +- Bokstaver (4-7): modell-spesifikk
+- Siffer (4): prefix4 — brukes til kType-matching
```

Eksempel: `5351AGNMV` → prefix4=`5351`

---

**Sist oppdatert:** 2026-05-18
