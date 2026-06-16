# KIMI-WORK.md — Dynamisk Status for Autoglass AS

> **Hva:** Denne filen inneholder gjeldende status, blockers, og neste steg. Oppdateres ofte (daglig/ukentlig).  
> **Hvorfor:** Skill-en `autoglass-kimi-work` har all statisk kunnskap. Denne filen har alt som endrer seg.  
> **Token-sparing:** ~2K tokens vs. ~25-40K for å lese AGENTS.md + KIMI_PROMPT.md + KIMI-MASTER-SYSTEM.md.

---

## 🚦 Gjeldende Status

| Indikator | Verdi | Notat |
|-----------|-------|-------|
| **Worker-deploy** | ✅ LIVE | `04abe77e-602d-486e-89f1-2724d1e0a16d` (2026-06-09) |
| **D1-schema** | ✅ OK | Alle migrasjoner applied, 18 tabeller |
| **Katalog** | ✅ OK | 27,139 records, 99.83% eurocode, 1,099 med kType |
| **kType-dekning** | ⚠️ 4.05% | Mål: 30%+ (TecAlliance IDP API eller Bovsoft credit-reset) |
| **kType Family** | ✅ OK | 24.4% effektiv dekning via Jaccard-matching |
| **Normalisering** | ✅ OK | 14 SVV↔D1 mismatch-fiks deployet, 68/68 tester passert |
| **Pris-synk** | ✅ OK | Siste: 2026-06-09, daglig sample + ukentlig full |
| **Frontend-bygg** | ✅ OK | TypeScript-feil fikset, `npm run build` grønt |
| **Ordremottaker** | 🚧 MVP | 6-steg pipeline klar, ikke i produksjon |
| **Smoke-test** | ✅ 6/6 | /api/health, regnr, prefix4, statiske filer |

---

## 🚨 Åpne Blockers

| # | Blocker | Alvorlighet | Eier | Neste steg |
|---|---------|-------------|------|------------|
| 1 | **Bovsoft credits tømt** | 🔴 Høy | Tomar | Avvent credit-reset ELLER kontakt TecAlliance for IDP API |
| 2 | **kType-dekning 4%** | 🟡 Medium | — | Avhengig av blocker #1. Finn.no broad scraper som backup. |
| 3 | **Ordremottaker i prod** | 🟡 Medium | Tomar | Frontend-integrasjon + test med reelle kundehenvendelser |
| 4 | **TecDoc v16 full sync** | 🟢 Lav | — | Fase 2 fullført (27,139 records i D1). V16-SQL parkert pga. lav treffrate. |

---

## 📋 Neste Steg (Prioritet)

### Denne uken (2026-06-09 → 2026-06-16)
1. [ ] **Kontakt TecAlliance** — be om IDP Data Receiver API pristilbud
2. [ ] **Finn.no broad scraper** — kjør `scrape:finn-broad` for å samle regnr→kType data
3. [ ] **Ordremottaker frontend** — integrer 6-steg pipeline i React-appen
4. [ ] **Daglig pris-sjekk** — verifiser at `daily-price-check.yml` kjører OK

### Neste måned (juni)
5. [ ] **kType-dekning 15%+** — via TecAlliance eller Bovsoft credit-reset
6. [ ] **Ordremottaker beta** — test med 10+ reelle kundehenvendelser
7. [ ] **Performance audit** — Worker responstid <800ms for SVV-oppslag

---

## 📝 Siste Endringer (Siste 7 dager)

| Dato | Hva | Filer | Status |
|------|-----|-------|--------|
| 2026-06-12 | Frontend TypeScript-feil fikset — bygg grønt | `SupportSection.tsx`, `SearchPage.tsx`, `glass.ts` | ✅ Pushet, venter PR/merge |
| 2026-06-09 | Normaliserings-audit v2 — 14 feil funnet og fikset | `scoring.ts`, `search.ts`, `brand.ts`, `ktype-family-lookup.ts` | ✅ Deployet |
| 2026-06-08 | kType Family matching — Jaccard + equipment-first | `ktype-family-lookup.ts`, D1 schema | ✅ Deployet |
| 2026-06-08 | Ordremottaker integrert med kType Family | `ordremottaker-agent.md` | 🚧 Dokumentert |
| 2026-06-07 | TecDoc v16 full D1 synkronisering | `sync-catalog-to-d1.mjs`, D1 | ✅ Deployet |
| 2026-06-07 | Bovsoft v2 — 68 nye kTypes deployet | `ktype_registry` (80,183 rader) | ✅ Deployet |
| 2026-06-05 | Wrangler/GitHub optimalisering | `.github/workflows/`, `wrangler.toml` | ✅ Deployet |
| 2026-06-04 | Eurocode pipeline — 99.83% dekning | `merge-eurocode-enrichment.mjs` | ✅ Deployet |

---

## 🔧 Temporære Notater

> **Tomar:** Husk å oppdatere denne filen etter hver signifikante endring.  
> **AI:** Les ALLTID denne filen før du starter en oppgave i bilglass-prosjektet.

- **SVV API-nøkkel:** Sist rotert: 2026-06-05. Neste rotasjon: 2026-09-05.
- **Biluppgifter API-nøkkel:** Utløpt (`Invalid token`). Krever fornyelse hvis vi skal bruke den igjen.
- **UNI Micro:** Fremtidig integrasjon (ordremottaker B2B). OAuth-token ikke hentet ennå.
- **Cloudflare Pages:** Frontend deployet. `auto-glass.no` peker til Pages.
- **R2:** Bilde-assets lastet opp. 27,139 produktbilder (placeholder + noen ekte).

---

## 🔄 Oppdateringsmal

Når du oppdaterer denne filen, behold strukturen:

```markdown
## 🚦 Gjeldende Status
[oppdater indikatorer]

## 🚨 Åpne Blockers
[legg til/fjern blockers]

## 📋 Neste Steg
[oppdater prioritet]

## 📝 Siste Endringer
[legg til ny rad øverst]

## 🔧 Temporære Notater
[legg til notater]
```

---

**Sist oppdatert:** 2026-06-12  
**Oppdatert av:** Kimi Work (skill `autoglass-kimi-work` aktivert)  
**Neste review:** 2026-06-16
