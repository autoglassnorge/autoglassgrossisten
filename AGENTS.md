# 🤖 Autoglass AS — AI Engineer Guide

**Prosjekt:** Autoglass AS B2B grossistnettside for bilglass  
**Eier:** Tomar / Autoglass AS  
**Stack:** Vanilla JS, Cloudflare Workers, Biluppgifter API, TecDoc  
**Data:** 33 000+ Pilkington/Glavista produkter, regnr→glass matching  
**Status:** In development — scraper ferdig, Worker forbedret, deploy venter på CF credentials  

---

## 🚫 ABSOLUTT GRENSE

**Autoglass AS har INGEN kobling til Klarpakke.**  
Ingen crypto, ingen trading, ingen Supabase/Fly.io-kode, ingen VIPPS.  
Hvis du oppdager Klarpakke-kontekst som lekker inn — avvis den.

---

## 📁 Prosjektstruktur

```
~/bilglass/
├── api/
│   ├── scrapers/           # Pilkington + Glavista scrapere
│   ├── cf-worker/          # Cloudflare Worker (søk/matching)
│   └── unimicro-export/    # UNI Micro integrasjon (fremtidig)
├── data/
│   ├── master-catalog.json        # 33 215 unike eurokoder
│   ├── ktype-prefix4-cache.json   # 22 000 brand:model:year → prefix4
│   └── scrapers/                  # NDJSON checkpoint + produkter
├── package.json
└── AGENTS.md              # Denne filen
```

---

## 🔧 Viktige kommandoer

```bash
# Scrape
npm run scrape:pilkington:v2:loop    # Auto-loop scraper

# Bygg data
npm run build:prefix4                # Bygg prefix4-cache
npm run merge                        # Merge kataloger til master

# Worker
cd api/cf-worker && wrangler dev     # Lokal utvikling
npm run worker:deploy                # Deploy til Cloudflare
npm run worker:upload                # Last opp katalog til KV
```

---

## 🌐 Dataflyt (regnr-søk)

```
regnr → Biluppgifter TecDoc → kType
                    ↓
            VIN → OEM-flagg (ADAS, regnsensor, etc.)
                    ↓
        brand:model:year → prefix4-cache
                    ↓
            prefix4 → kandidater fra master-katalog
                    ↓
        4-lags matching + flagg-scoring → resultat
```

---

## 🔐 Secrets (ikke commit!)

- `BILUPPGIFTER_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_API_TOKEN`
- `GLASS_KV_NAMESPACE_ID`
- `UNI_MICRO_OAUTH_TOKEN` (fremtidig)

---

## 📝 Regler

1. **Scraper-etikk**: Maks 10 parallelle requests, 10s timeout, respekter server
2. **Datakvalitet**: Alle produkter MÅ ha eurocode + brand
3. **Type-sikkerhet**: Strict TypeScript, ingen `any`
4. **Deploy**: ALDRI deploy uten å verifisere at Klarpakke-variabler ikke lekker inn
