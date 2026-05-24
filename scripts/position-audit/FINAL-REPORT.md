# Endelig posisjonsaudit-rapport — auto-glass.no

**Generert:** 2026-05-24

## Oppsummering

| Metrikk | Verdi |
|---------|-------|
| auto-glass.no produkter | 27,184 |
| Med kjent posisjon | 27,050 (99.5%) |
| Uten posisjon | 134 (0.5%) |
| I katalogen (exact match) | 7,433 (27.3%) |
| **IKKE i katalogen** | **19,751 (72.7%)** |

## Posisjonsfordeling auto-glass.no

| Posisjon | Antall |
|----------|--------|
| FR (Frontrute) | 6,967 |
| RR (Bakrute) | 3,930 |
| FD (Dørrute fremme) | 4,638 |
| RD (Dørrute bak) | 4,409 |
| FV (Ventilrute fremme) | 1,249 |
| RQ (Siderute bakre) | 4,269 |
| RV (Ventilrute bak) | 1,588 |

## Katalogstatus

| Status | Antall | Prosent |
|--------|--------|---------|
| ✅ OK (posisjon funnet) | 19,735 | 50.0% |
| 🔴 HOLD (mangler posisjon) | 19,723 | 50.0% |

## Viktig funn: 19,751 produkter mangler i katalogen!

Av 27,184 auto-glass.no-produkter finnes bare **7,433** i `glass_catalog`. **19,751 produkter (72.7%) mangler**.

### Hva som mangler
- Amerikanske biler (Dodge, Chevy, Cadillac, etc.)
- Eldre europeiske modeller
- Campingvogn/busser (Hymer, Knaus, Rapido)
- Spesialprodukter (dekorlister, pakninger, etc.)

## Anbefalinger

1. **Legg til 19,751 auto-glass-produkter i katalogen** — Dette vil nesten doble katalogstørrelsen
2. **Kjør D1 migration** for posisjonskolonner
3. **Batch-oppdater 19,735 OK-produkter** til D1
4. **Re-scrape Pilkington** for å fikse 13,740 trunkerte beskrivelser
5. **Scrape flere dørglass-produkter** for å redusere HOLD-rate

Med auto-glass-import + re-scraping kan vi nå **~80-90% OK-rate**.
