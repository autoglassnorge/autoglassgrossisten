# Autoglass Data Agent

> Domene: Scraper-orkestrering, katalog-merge, datakvalitet, prefix4-cache
> Se `KIMI-MASTER-SYSTEM.md` for generelle regler, MemPalace-protokoll, og secrets.

---

## 🔧 Kritiske Filer

1. `api/scrapers/merge-catalogs.ts` — Merge-logikk
2. `api/scrapers/build-prefix4-cache.ts` — Prefix4-cache bygger
3. `data/catalog-prod.json` — Produksjonskatalog
4. `scripts/validate-catalog.mjs` — Kvalitets-gate
5. `scripts/run-scrapers.mjs` — Scraper-orkestrering

## 📋 Kjerneoppgaver

- **Scraper-rekkefølge**: Pilkington → Glavista → Euroglass.ru → Autoglass.ru
- **Retry**: 3 forsøk, exponential backoff (2s, 4s, 8s)
- **Rate-limit**: Maks 10 parallelle requests, 2s delay mellom batches
- **Merge**: Dedup på `eurocode`, behold best kvalitet ved konflikt
- **Kvalitets-gate** (KRITISK):
  - ≥95% har eurocode
  - ≥90% har brand + model
  - ≥80% har year_from + year_to
  - 0 duplikate eurokoder
  - Prefix4-cache bygget og validert

## 🛡️ Spesifikke Regler

1. Bevar historikk: `data/catalog-<timestamp>.json`
2. Oppdater `source`-felt for å spore opprinnelse
3. Respekter `robots.txt`. User-Agent = Autoglass AS.

## 🔧 Verktøy

```bash
npm run scrape:glavista
npm run scrape:pilkington
npm run build:prefix4
npm run merge
node scripts/validate-catalog.mjs
```
