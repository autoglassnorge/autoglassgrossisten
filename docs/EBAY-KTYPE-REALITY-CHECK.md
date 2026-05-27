# eBay K-type: Reality Check 🔍

> Etter dyp analyse av eBay's API-dokumentasjon

---

## ❌ eBay er IKKE en direkte kType-kilde

**Kritisk funn fra eBay docs:**

> "A **GetItem** request does **not return compatibility information** for items listed with parts capability using a **K type vehicle number**."

Dette betyr at Trading API `GetItem` med `IncludeItemCompatibilityList=true` **ignorerer** K-type listings. K-type er "opaque" — eBay bruker det internt, men eksponerer det IKKE i API-responsene.

---

## ✅ Hva eBay API faktisk KAN gjøre

| API | Kostnad | KType? | Bruk |
|-----|---------|--------|------|
| **Finding API** | Gratis (5k/day) | ❌ Nei | Søk etter deler |
| **Shopping API** | Gratis (5k/day) | ❌ Nei | Hent listing details |
| **Trading API GetItem** | Gratis (1.5k/day) | ❌ Nei | ItemCompatibilityList ignorerer KType |
| **Product API** | Gratis (5k/day) | ❌ Nei | Finner produkter, ikke KType-mappings |
| **Taxonomy API** | OAuth | ❌ Nei | Henter Make/Model/Year verdier |
| **Browse API** | OAuth | ❌ Nei | Søk med compatibility_filter |

---

## 🔑 Innsikt: Hva eBay bekrefter

Selv om eBay API ikke gir KType, bekrefter dokumentasjonen:

1. **KType = TecDoc standard** — "K type is a vehicle specification numbering system provided by TecDoc Information Systems"
2. **eBay.de bruker KType** — Germany (site ID 77) støtter KType
3. **KType dekker hele EU** — UK, DE, FR, IT, ES, AU
4. **KType spesifiserer**: Make, Model, Platform, Type, Engine, Production Period

**Eksempel fra docs:**
```
KType 25456 = Audi A4, Platform 8k2, Type 1.8 TFSI
              Engine: 88KW/120PS/1798ccm
              Production: 2008/01-
```

---

## 🎯 Konklusjon: Hva vi faktisk trenger

eBay bekrefter at **TecDoc KType er THE standard** for EU-bildeler, men eBay's API gir ikke direkte tilgang til KType-mappings.

### De reelle kildene for KType (rangert etter enkelhet):

| # | Kilde | Kostnad | EU-dekning | Enkelhet |
|---|-------|---------|------------|----------|
| 1 | **RapidAPI K-Type Finder** | Freemium | ✅ Høy | ⭐⭐⭐ Enkel |
| 2 | **RapidAPI VIN Decoder TECDOC** | Freemium | ✅ Høy | ⭐⭐⭐ Enkel |
| 3 | **MACS VIS** | Månedlig | ✅ Høy | ⭐⭐ Medium |
| 4 | **TecDoc TAF data** | ~€500-2000/år | ✅ 100% | ⭐⭐ Medium |
| 5 | **eBay listings (HTML scrape)** | Gratis | ✅ Høy | ⭐ Kompleks |

---

## 🏗️ Anbefalt strategi (uendret)

Vår implementerte 6-lags resolver er fortsatt den beste tilnærmingen:

```
Layer 0: glass_rules (gratis, lærende) ← VIGTIGST
Layer 1: Bovsoft (hvis tilgjengelig)
Layer 2: RapidAPI K-Type Finder (freemium)
Layer 3: RapidAPI VIN Decoder TECDOC (freemium, EU)
Layer 4: vPIC (gratis, US-biler)
Layer 5: MACS VIS (hvis nøkkel)
```

### Hvorfor dette fungerer

1. **RapidAPI = enklest vei til KType** — Registrer deg, få nøkkel, start å slå opp
2. **glass_rules = gratis over tid** — Etter første treff er neste gratis
3. **EU-fokus** — RapidAPI-kildene dekker spesifikt Europa
4. **Ingen kompleks eBay OAuth** — Slipper Trading API auth tokens

---

## 🚀 Neste steg (samme som før)

1. Skaff RapidAPI-nøkkel: https://rapidapi.com/autowaysnet/api/ktype-finder-tecdoc
2. Sett secret: `npx wrangler secret put RAPIDAPI_KEY`
3. Deploy: `npx wrangler deploy`

> eBay var et genialt spor, men RapidAPI er den mest pragmatiske veien til KType.
