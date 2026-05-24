# Position Audit Pipeline

Pipeline for å kategorisere glassposisjoner (FR, RR, FD, RD, etc.) for alle produkter i `glass_catalog`.

## Pipeline-steg

| Steg | Script | Beskrivelse |
|------|--------|-------------|
| 1 | `01-extract-autoglass.mjs` | Ekstraher posisjoner fra auto-glass.no scrape |
| 2 | `02-match-catalog.mjs` | Match auto-glass posisjoner mot katalog (exact + prefix4) |
| 2b | `02b-prefix4-bulk-match.mjs` | Bygg prefix4 konsensus-mapping fra auto-glass.no |
| 3 | `03-categorize-all.mjs` | Kategoriser ALLE produkter (auto-glass + description + category) |
| 4 | `04-report-and-writeback.mjs` | Generer rapport + forbered D1 writeback |
| 5 | `05-review-tool.mjs` | Manuell review av REVIEW-rader |
| 6 | `06-apply-to-d1.mjs` | Skriv godkjente posisjoner til D1 |

## Status (siste kjøring)

| Status | Antall | Prosent |
|--------|--------|---------|
| ✅ OK (auto-glass exact) | 5,739 | 14.5% |
| ⚠️ OK (auto-glass prefix4) | 706 | 1.8% |
| 🔍 OK (prefix4 bulk consensus) | 5,829 | 14.8% |
| 📝 OK (description parsed) | 6,874 | 17.4% |
| 📁 OK (category known) | 3,109 | 7.9% |
| 🔴 HOLD (ukjent) | 17,201 | 43.6% |
| **Totalt** | **39,458** | **100%** |

Med auto-accepted decisions: **19,735 OK (50.0%)**, **0 REVIEW**, **19,723 HOLD (50.0%)**

## HOLD-analyse

| Kategori | Antall | Kommentar |
|----------|--------|-----------|
| annet | 13,740 | Mange med trunkerte beskrivelser |
| dørglass | 2,522 | Ukjent front/back |
| undefined | 3,461 | euroglass.ru (russiske) |

## Manuell Review

```bash
# Review 20 items (default)
node scripts/position-audit/05-review-tool.mjs

# Review 50 items
node scripts/position-audit/05-review-tool.mjs --batch-size 50
```

Kommandoer under review: `y` = godta, `n` = avvis (HOLD), `s` = hopp over, `FR/RR/FD/etc` = annen posisjon.

## D1 Migration

```bash
# Kjør migration (krever wrangler login)
npx wrangler d1 execute glass-catalog-db --remote \
  --file=scripts/position-audit/migrations/001-add-position-columns.sql
```

## D1 Writeback

```bash
# Dry run
node scripts/position-audit/06-apply-to-d1.mjs --dry-run

# Apply (krever wrangler login)
node scripts/position-audit/06-apply-to-d1.mjs
```

## Kjente begrensninger

- **SVV API**: Nøkkel utløpt (401), må roteres på vegvesen.no
- **Wrangler auth**: Utløpt, kjør `wrangler login`
- **Trunkerte beskrivelser**: ~13,740 produkter har ufullstendige beskrivelser fra Pilkington
- **euroglass.ru**: 3,461 russiske produkter, sannsynligvis ikke relevante for Norge
