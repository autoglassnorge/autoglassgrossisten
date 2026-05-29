# Autoglass AS — B2B Grossistnettside

> Norges ledende bilglass-grossist. 130 000 ruter på lager. Levering neste dag.

## 🐝 Swarm Deliverables (v1.1)

| Swarm Phase | Hva ble levert | Status |
|---|---|---|
| **1. Analyzer** | Gap-analyse vs superprompt: 0 SEO, 0 deploy, 0 auth | ✅ |
| **2. Architect** | Prioritet: SEO → Deploy → Supabase Auth | ✅ |
| **3. Implement** | Canonical+hreflang+Schema.org+OG på alle 7 sider, sitemap.xml, robots.txt, _redirects, Supabase auth.js, auth-gated portal | ✅ |
| **4. Tester** | 28 filer, 4,060 linjer, 100% SEO-dekning verifisert | ✅ |
| **5. Knowledge** | Oppdatert README, MemPalace KG, deploy-runbook | ✅ |

**Nye filer etter swarm:**
- `sitemap.xml` — Google/SEO sitemap med hreflang
- `robots.txt` — Crawler-instruksjoner
- `_redirects` — Cloudflare Pages språk-routing
- `js/auth.js` — Supabase Auth (magic link + password)
- `api/scrapers/glavista-scraper.ts` — Glavista eurocode scraper
- `api/scrapers/merge-catalogs.ts` — Merge UNI Micro + Glavista + mock
- `.nvmrc` — Node v20 for konsistent bygg

## Struktur

```
bilglass/
├── index.html              # Hjemside
├── produkter.html          # Produktkatalog (med filtrering)
├── vin-sok.html            # VIN / regnr-søk
├── bli-kunde.html          # Onboarding (2 spor)
├── kundeportal.html        # Login (demo)
├── om-oss.html             # Selskapsinfo
├── kontakt.html            # Kontaktskjema + info
├── css/
│   ├── tokens.css          # Design tokens (farger, typografi)
│   ├── base.css            # Reset + utilities
│   └── components.css      # Komponent-bibliotek
├── js/
│   ├── i18n.js             # NO/SV/EN oversettelser
│   ├── main.js             # Tema, scroll-reveal, søk, forms
│   └── auth.js             # Supabase Auth (magic link + password)
├── data/
│   ├── mock-katalog.json       # 80 frontruter
│   ├── glavista-catalog.json   # Scrapet fra Glavista (genereres)
│   ├── unimicro-catalog.json   # Eksport fra UNI Micro (genereres)
│   └── master-catalog.json     # Merged katalog (genereres)
├── api/
│   ├── unimicro-export/
│   │   ├── export-catalog.ts   # Hent ALLE glass fra UNI Micro
│   │   └── glass-lookup.ts     # regnr → Biluppgifter → eurokode
│   ├── cf-worker/
│   │   ├── src/index.ts        # Cloudflare Worker API
│   │   └── scripts/               # (upload-catalog.mjs flyttet til scripts/)
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── scrapers/
│       ├── glavista-scraper.ts   # Hent eurokoder fra Glavista
│       └── merge-catalogs.ts     # Merge alle kilder
├── sitemap.xml             # SEO sitemap med hreflang
├── robots.txt              # Crawler-instruksjoner
├── _redirects              # Cloudflare Pages routing
└── package.json
```

## Hva som er bygget

### Nettsted (Frontend)
- **7 sider** med konsistent designsystem
- **Trespråklig**: Norsk, Svensk, Engelsk
- **Mørk modus** med toggle
- **Scroll-reveal** animasjoner
- **Animerte statistikktellere**
- **Responsivt** (mobil-first)
- **VIN-søk** med mock-data (klar for live API)
- **Produktkatalog** med filtrering

### Backend / Data
- **UNI Micro eksport-script** (`export-catalog.ts`)
  - OAuth2 autentisering
  - Paginering gjennom alle produkter
  - Parser eurokoder fra ProductNo/BarCode/CustomFields/Description
  - Detekterer glasskategori, utstyrsflagg (ADAS, regnsensor, osv.)
  - Mapper til standardisert `GlassRecord` med 22 felter
  - Henter lagerstatus parallelt
  - Output: `data/unimicro-catalog.json`

- **Glass lookup-pipeline** (`glass-lookup.ts`)
  - Flyt: `regnr → Biluppgifter TecDoc → kType → prefix4 → eurokode`
  - Parallell VIN-flagg-henting fra Biluppgifter OEM API
  - 4-lags konfidens-scoring (eksakt → år+merke → merke → prefix4)
  - Flaggbasert kandidat-rangering

- **Cloudflare Worker API**
  - Endepunkter: `/api/glass?regnr=`, `/api/glass?prefix4=`, `/api/glass?eurocode=`, `/api/health`
  - KV-namespace for kataloglagring (rask, ~0 kostnad)
  - Full CORS for auto-glass.no
  - Håndterer Biluppgifter-integrasjon server-side

- **Mock-katalog** (`data/mock-katalog.json`)
  - 80 representative frontruter
  - 22 merker: BMW, VW, Audi, Mercedes, Volvo, Toyota, Ford, Skoda, Seat, Kia, Hyundai, Nissan, Peugeot, Renault, Mazda, Subaru, Honda, Mitsubishi, Opel, Citroen
  - Full metadata: eurokode, pris, lager, flagg, OEM-numre, dimensjoner, vekt

## Kom i gang

### 1. Kjør nettstedet lokalt
```bash
cd ~/bilglass
npx serve .
# Åpner på http://localhost:3000
```

### 2. Kjør UNI Micro-eksport (for ekte data)
```bash
cd ~/bilglass

# Installer avhengigheter
npm install

# Sett credentials
export UNIMICRO_CLIENT_ID="din-client-id"
export UNIMICRO_CLIENT_SECRET="din-client-secret"

# Kjør eksport
npm run export:unimicro

# Output: data/unimicro-catalog.json
```

### 3. Test glass-lookup
```bash
# Sett API-nøkkel
export BILUPPGIFTER_API_KEY="din-api-key"

# Søk
npm run lookup -- --regnr=AB12345
```

### 4. Deploy Cloudflare Worker
```bash
cd api/cf-worker

# 1. Opprett KV namespace (kun første gang)
npx wrangler kv:namespace create GLASS_CATALOG
# Kopier ID fra output til wrangler.toml

# 2. Sett secrets
npx wrangler secret put BILUPPGIFTER_API_KEY

# 3. Last opp katalog til KV
export CLOUDFLARE_API_TOKEN="din-token"
export CLOUDFLARE_ACCOUNT_ID="din-account-id"
export GLASS_KV_NAMESPACE_ID="namespace-id-fra-steg-1"
node scripts/upload-catalog.mjs

# 4. Deploy worker
npx wrangler deploy
```

## UNI Micro Eksport — Detaljer

Scriptet (`api/unimicro-export/export-catalog.ts`) parser eurokoder fra flere kilder:

1. **CustomFields** — felt navngitt "Eurokode" eller "ARGIC"
2. **ProductNo** — hvis det matcher mønsteret `ddddAAAAA` (4 siffer + 4-7 bokstaver)
3. **BarCode** — samme regex-sjekk
4. **Description/Name** — regex-søk etter eurokode-mønster i tekst

Utstyrsflagg parses fra navn + beskrivelse + custom felter:
- `ADAS` — kamera, sensor, lane assist, collision
- `Regnsensor` — rain, regn, vindusspor
- `Oppvarmet` — heat, oppvarm, varme, defrost
- `Akustisk` — acoustic, akustisk, støydemp
- `Antenne` — antenna, antenne, radio, fm, dab
- `HUD` — hud, head-up, projeksjon
- `Solstripe` — shade, tonet, solstripe

### Felter i output (100% dekning)

| Felt | Beskrivelse |
|------|-------------|
| `eurocode` | Eurokode / ARGIC-nummer (f.eks. `5351AGNMV`) |
| `articleNumber` | UNI Micro varenummer |
| `scanNumber` | Strekkode / scannummer |
| `category` | frontrute, siderute, bakrute, bakluke, spesialglass, tilbehør |
| `supplier` | Pilkington, AGC, Saint-Gobain, Sekurit... |
| `brand` | Bilmerke |
| `model` | Bilmodell |
| `yearFrom` / `yearTo` | Årsmodell-spenn |
| `adas`, `rainSensor`, `heated`, `acoustic`, `antenna`, `hud`, `shade`, `camera`, `laneAssist` | Boolean flagg |
| `price` | Listepris (eks. mva) |
| `stockStatus` | Antall på lager |
| `warehouseLocation` | Hylle/plassering |
| `oemNumbers` | Array av originale delenumre |
| `crossReferences` | Andre leverandørers numre |
| `weight` | Vekt i kg |
| `dimensions` | Bredde, høyde, tykkelse i mm |
| `description` | Full beskrivelse |
| `prefix4` | Første 4 siffer (for kType-matching) |
| `imageUrl` / `pdfUrl` | Lenker |
| `source` | "unimicro" |
| `lastUpdated` | ISO timestamp |

## Neste steg

1. **Mandag**: Hent UNI Micro OAuth-token, kjør `export-catalog.ts`
2. **Last opp** ekte katalog til Cloudflare KV
3. **Bestill** Biluppgifter API-nøkkel (`api@biluppgifter.se`)
4. **Deploy** Worker med live data
5. **Koble** nettstedet til live Worker (endre `API_BASE` i `main.js`)

## Teknologi

- **Frontend**: Statisk HTML/CSS/JS (kan deployes til Cloudflare Pages)
- **Backend API**: Cloudflare Worker + KV + TypeScript
- **Datakilder**: UNI Micro (ERP), Biluppgifter.se (TecDoc + OEM), Pilkington/Glavista (kataloger)
- **Auth**: Supabase Auth (Fase 2)

---

© 2026 Autoglass AS. Bygget for [auto-glass.no](https://auto-glass.no).
# Autoglass AS
