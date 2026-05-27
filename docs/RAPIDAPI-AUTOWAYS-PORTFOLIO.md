# RapidAPI Autoways Portfolio — DEPRECATED

> ⚠️ **STATUS: FJERNET FRA RAPIDAPI** (2026-05-21)
>
> Alle Autoways APIer returnerer HTTP 404. De har flyttet til egen plattform:
> https://auto-ways.net/

---

## Historikk

**Autoways** (https://rapidapi.com/user/Autoways) tilbydde tidligere **6 API-er** på RapidAPI — alle med samme abonnement:

| # | API | Status | HTTP |
|---|-----|--------|------|
| 1 | **K-Type Finder** | ❌ Fjernet | 404 |
| 2 | **VIN Decoder** | ❌ Fjernet | 404 |
| 3 | **VIN Decoder TECDOC** | ❌ Fjernet | 404 |
| 4 | **Car Selector** | ❌ Fjernet | 404 |
| 5 | **UK Vehicle Reg** | ❌ Fjernet | 404 |
| 6 | **French Vehicle Reg** | ❌ Fjernet | 404 |

---

## Alternativer

| Kilde | KType? | Kostnad | Link |
|-------|--------|---------|------|
| **glass_rules (D1)** | ✅ | $0 | Allerede integrert |
| **Vincario** | ✅ | $0.22/VIN | vincario.com |
| **Autoways direkte** | ✅ | 49€/mnd | auto-ways.net/demo |
| **Biluppgifter** | ❓ | Ukjent | api@biluppgifter.se |

---

## Hva vi gjorde

1. **2026-05-18**: Implementerte 6-lags resolver med RapidAPI-støtte
2. **2026-05-21**: Oppdaget at alle Autoways APIer var fjernet (HTTP 404)
3. **2026-05-21**: Avskrev RapidAPI-kode i `vin-glass-resolver.ts` og `index.ts`
4. **2026-05-21**: `glass_rules` (D1) ble primær kType-kilde

---

## Kode-referanse (arkivert)

Se git-historikk for original RapidAPI-integrasjon:
```bash
git log --oneline -- api/cf-worker/src/vin-glass-resolver.ts
```
