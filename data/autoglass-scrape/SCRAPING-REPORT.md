# Auto-Glass.no Catalog Scraping Report

**Date:** 2026-05-20
**Scraper:** `scrape-autoglass-catalog-fast.mjs` + `scrape-autoglass-missing.mjs`
**Source:** https://auto-glass.no (WooCommerce, login required)

## Summary

| Metric | Value |
|--------|-------|
| Total brand/model/year entries | 2,548 |
| Total individual products | 27,003 |
| Unique SKUs | 20,638 |
| Brands covered | 77 / 100 |
| Empty URLs | 0 |
| Errors | 0 |

## Price Statistics

- **Min:** kr 0
- **Max:** kr 149,565
- **Average:** kr 6,015

## Top Glass Positions (Type Codes)

| Code | Description | Count |
|------|-------------|-------|
| F | Frontrute | 6,884 |
| B | Bakrute | 3,891 |
| DFF | Dørrute fremre førerside | 2,427 |
| DFB | Dørrute bakre førerside | 2,293 |
| DPF | Dørrute fremre passasjerside | 2,189 |
| SFB1 | Siderute bakre 1 førerside | 2,089 |
| DPB | Dørrute bakre passasjerside | 2,068 |
| SPB1 | Siderute bakre 1 passasjerside | 1,878 |

## Top 20 Brands by Product Count

| Brand | Products | Entries |
|-------|----------|---------|
| USA CARS | 1,980 | 269 |
| VW | 1,879 | 129 |
| MERCEDES | 1,588 | 109 |
| BMW | 1,547 | 102 |
| FORD | 1,386 | 86 |
| AUDI | 1,248 | 82 |
| VOLVO | 1,224 | 86 |
| OPEL | 1,146 | 92 |
| TOYOTA | 1,003 | 101 |
| PEUGEOT | 949 | 71 |
| RENAULT | 813 | 74 |
| HYUNDAI | 783 | 69 |
| NISSAN | 758 | 93 |
| CITROEN | 695 | 51 |
| KIA | 672 | 61 |
| MAZDA | 655 | 82 |
| MITSUBISHI | 650 | 71 |
| HONDA | 631 | 81 |
| SKODA | 605 | 40 |
| SUBARU | 466 | 51 |

## Data Files

- `data/autoglass-scrape/products-merged.ndjson` — Complete dataset
- `data/autoglass-scrape/autoglass-category-tree.json` — Category hierarchy
- `data/autoglass-scrape/products.ndjson` — First batch (S-Z)
- `data/autoglass-scrape/products-missing.ndjson` — Second batch (A-S)

## Data Schema (per entry)

```json
{
  "brand": "ALFA ROMEO",
  "model": "145",
  "submodel": null,
  "yearRange": "1995 - 2000",
  "url": "https://auto-glass.no/...",
  "products": [
    {
      "title": "ALFA ROMEO 145/146 3/5D CC 95- FRONTRUTE GY",
      "sku": "1936GB",
      "typeCode": "Frontrute",
      "typeCodeRel": "F",
      "price": 4620
    }
  ],
  "scrapedAt": "2026-05-20T14:24:59.847Z"
}
```

## Notes

- Login credentials: `post@alfadrift.no` / `Viking123` (ALFA GLASS AS)
- Scraped using Playwright for login + `fetch()` with cookies for speed
- Rate limited to ~5 concurrent requests with 150ms between batches
- Total scraping time: ~35 minutes
