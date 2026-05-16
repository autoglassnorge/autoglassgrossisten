# Autoglass AS — API Prosjekt Status
## 16. Mai 2026

---

## 📦 Data

| Komponent | Status | Verdi |
|---|---|---|
| Pilkington scrapet | ✅ Ferdig | **33 344** produkter |
| Master katalog | ✅ Ferdig | **33 215** unike eurokoder |
| Unike bilmerker | ✅ Ferdig | **5 454** merker |
| Prefix4 cache | ✅ Ferdig | **22 000** nøkler |
| Cloudflare KV | ✅ Lastet opp | **12 chunks** + meta |

---

## 🔧 API Endepunkter (klar til deploy)

```
GET /api/glass?regnr=AB12345        → Søk på registreringsnummer
GET /api/glass?prefix4=5351         → Søk på prefix4
GET /api/glass?eurocode=5351AGNMV   → Direkte oppslag
GET /api/glass?type=frontrute       → Filtrer på type
GET /api/health                     → Statussjekk
```

---

## 🚀 Deploy Status

| Komponent | Verdi | Status |
|---|---|---|
| KV Namespace ID | `15099e572e51423dafb723996c01c668` | ✅ Opprettet |
| Cloudflare Account | `autoglassnorge@gmail.com` | ✅ Verifisert |
| Worker kode | `api/cf-worker/src/index.ts` | ✅ Klar |
| **workers.dev subdomain** | — | ⏳ **MANGLER** |

### For å fullføre deploy:
1. Gå til https://dash.cloudflare.com/2266e975a1d0ff5356bba1af884a2773/workers/onboarding
2. Registrer et subdomain (f.eks. `autoglass-glass-sok`)
3. Gi beskjed til KIMI — så kjøres `npm run worker:deploy`

---

## 🔴 Blokkert Av

1. **Cloudflare subdomain** → Krever handling fra Tomar
2. **Biluppgifter API-key** → Krever kontakt med Biluppgifter
3. **UNI Micro data** → Krever CSV-eksport eller API-tilgang

---

## 📁 Viktige Filer

```
~/bilglass/
├── api/cf-worker/src/index.ts       # Worker-kode
├── data/master-catalog.json         # 33 215 produkter
├── data/ktype-prefix4-cache.json    # 22 000 nøkler
├── data/autoglass-katalog.csv       # Excel-kompatibel export
├── data/eurokoder-liste.txt         # Alle eurokoder (4 MB)
└── PROSEKT-API-16-MAI-2026.md       # Denne filen
```

---

## 📊 Top 20 Prefix4

| Prefix4 | Antall produkter |
|---|---|
| DW01 | 616 |
| FW02 | 400 |
| DW00 | 301 |
| FW03 | 273 |
| DD11 | 260 |
| DD09 | 237 |
| DQ11 | 191 |
| DD10 | 187 |
| FD23 | 174 |
| DW02 | 172 |
| 5439 | 169 |
| DQ10 | 153 |
| DQ09 | 151 |
| FD22 | 151 |
| FD21 | 150 |
| DD08 | 145 |
| FD25 | 144 |
| DD12 | 136 |
| 5381 | 129 |
| FD24 | 129 |

---

## 📝 Neste Steg (Prioritert)

| # | Oppgave | Est. Tid | Blokkert Av |
|---|---|---|---|
| 1 | Registrer workers.dev subdomain | 5 min | **Tomar** |
| 2 | Deploy Worker til Cloudflare | 2 min | Steg 1 |
| 3 | Koble frontend (vin-sok.html) til API | 1 time | Ingenting |
| 4 | Skaff Biluppgifter API-key | Uker | **Tomar** |
| 5 | Bygg validert kType-cache | 2–3 timer | Steg 4 |
| 6 | UNI Micro integrasjon | 2–3 timer | CSV eller API |

---

*Generert: 16.05.2026 20:30*
*Agent: KIMI*
*Prosjekt: Autoglass AS B2B Wholesale*
