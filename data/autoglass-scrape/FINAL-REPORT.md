# Auto-Glass.no — Komplett Catalog Scraping Report

**Date:** 2026-05-20
**Source:** https://auto-glass.no (WooCommerce, ALFA GLASS AS login)

## Summary

| Metric | Value |
|--------|-------|
| Total entries (brand/model/year) | **2,564** |
| Total individual products | **27,184** |
| Unique SKUs | **20,735** |
| Brands with products | **87 / 100** |
| Brands with 0 products | 13 |

## 13 Brands with 0 Products

These brands exist in the category tree but have no products on the site:
- ACURA, AIWAYS, AUSTIN, AUTOBIANCHI, BUCATTI
- DS, EXLANTIX, HINO TRUCKS (404), JC INDIGO
- LYNK & CO, MORGAN, ORA, VERKTØY/TOOLS (404)

## Price Statistics

- **Min:** kr 0
- **Max:** kr 149,565
- **Average:** kr 6,030

## Top 10 Brands

| Brand | Products |
|-------|----------|
| USA CARS | 1,980 |
| VW | 1,879 |
| MERCEDES | 1,588 |
| BMW | 1,547 |
| FORD | 1,386 |
| AUDI | 1,248 |
| VOLVO | 1,224 |
| OPEL | 1,146 |
| TOYOTA | 1,003 |
| PEUGEOT | 949 |

## Glass Position Mapping (Type Codes)

| Code | Description | Count |
|------|-------------|-------|
| F | Frontrute | 6,945 |
| B | Bakrute | 3,913 |
| DFF | Dørrute fremre førerside | 2,438 |
| DFB | Dørrute bakre førerside | 2,319 |
| DPF | Dørrute fremre passasjerside | 2,200 |
| SFB1 | Siderute bakre 1 førerside | 2,099 |
| DPB | Dørrute bakre passasjerside | 2,090 |
| SPB1 | Siderute bakre 1 passasjerside | 1,888 |

## Data Files

- `products-complete.ndjson` — Full dataset (2,564 entries, 27,184 products)
- `autoglass-category-tree.json` — 100 brands, 1,218 models, 3,027 year-URLs
- `cookies.json` — Session cookies for authenticated access

## Scraping Method

1. **Phase 1:** Parse category tree from sidebar (logged-in WooCommerce)
2. **Phase 2:** Scrape model-level pages via `fetch()` with cookies (5 concurrent, 150ms delay)
3. **Phase 3:** Scrape brand-level pages for models with 404/empty URLs
4. **Tools:** Playwright (login) + `node-html-parser` + `fetch()`

## Data Schema

```json
{
  "brand": "VW",
  "model": "GOLF",
  "submodel": null,
  "yearRange": "1984-1990",
  "url": "https://auto-glass.no/...",
  "products": [
    {
      "title": "VW GOLF II 3/5D CC 84-90 FRONTRUTE",
      "sku": "1299C",
      "typeCode": "Frontrute",
      "typeCodeRel": "F",
      "price": 4620
    }
  ],
  "scrapedAt": "2026-05-20T..."
}
```
