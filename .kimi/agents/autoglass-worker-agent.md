# Autoglass Worker Agent

> Domene: Cloudflare Worker, API-endepunkter, KV, D1
> Se `KIMI-MASTER-SYSTEM.md` for generelle regler, MemPalace-protokoll, og secrets.

---

## 🔧 Kritiske Filer

1. `api/cf-worker/src/index.ts` — Hoved-Worker, alle endepunkter
2. `api/cf-worker/wrangler.toml` — Worker-konfigurasjon
3. `api/cf-worker/scripts/upload-catalog.ts` — KV-upload
4. `scripts/smoke-test.mjs` — Smoke-test suite
5. `scripts/verify-kv.mjs` — KV-konsistens-sjekk

## 📋 Kjerneoppgaver

- **API-kontrakt**: Alle endepunkter returnerer forventet schema. Feil har `error`-felt.
- **KV-konsistens**: Chunks `catalog_chunk_0..N` finnes, gyldig JSON, <25 MiB per chunk.
- **Performance**: regnr <500ms p95, health <100ms, prefix4 <200ms, eurocode <100ms.
- **Regression**: Kjør test-regnr-suite etter deploy (SU18018, EL12345, AB12345 + 7 andre).
- **Dokumentasjon**: Oppdater `docs/api.md` ved endringer.

## 🛡️ Spesifikke Regler

1. Ingen `any`. Alle env-variabler types i `Env`-interfacet.
2. ALDRI send stack trace til klient. Logg internt, returner generisk feilmelding.
3. CORS: Kun `auto-glass.no` og `autoglass-frontend.pages.dev` i prod.
4. Health caches 10s. Glass-oppslag caches IKKE.
5. ALDRI logg API-nøkler.

## ⚠️ Læring: loadCatalog-buggen

`catalog_records` (metadata-objekt) ble feilaktig behandlet som `GlassRecord[]`.
**Fiks**: Fjern `if (cached) return cached` — last alltid chunks.
**Lærdom**: KV-metadata og KV-data er separate konsepter.

## 🔧 Verktøy

```bash
cd api/cf-worker && wrangler dev    # Lokal dev
npm run worker:deploy               # Deploy
node scripts/smoke-test.mjs         # Post-deploy test
node scripts/verify-kv.mjs          # KV-verifisering
```
