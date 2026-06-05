---
name: bilglass-deploy
description: Deploy Bilglass-plattformen til Cloudflare (Pages + D1 + KV). Kjør migrations, bygg frontend, deploy worker, og verifiser med smoke-test.
---

# Bilglass Deploy

## When to Use

- Første deploy av ny funksjonalitet
- Hotfix i produksjon
- Schema-migration på D1
- KV-katalog må oppdateres
- Frontend-bygg må pushes til Pages

## The Deploy Gate

```
NO DEPLOY WITHOUT SMOKE-TEST EVIDENCE
```

## Process

### 1. Pre-flight Check
- Sjekk `git status` — ingen uncommitted changes som ikke skal med
- Les `AGENTS.md` for aktive blockers
- Sjekk `PROJECT_STATE.md` for kjente feil
- Bekreft at du er på riktig branch (main for prod)

### 2. D1 Migration (hvis schema endret)
```bash
# Sjekk om schema.sql er endret
# Hvis ja: generer migration og kjør mot D1
cd api/cf-worker && wrangler d1 migrations apply glass-catalog
```

### 3. KV Catalog Upload (hvis data endret)
```bash
# Last opp beriket catalog til KV
node scripts/upload-catalog-wrangler.mjs
```

### 4. Worker Deploy
```bash
# Deploy API/cf-worker
cd api/cf-worker && wrangler deploy
# ELLER
npm run worker:deploy
```

### 5. Frontend Build + Pages Deploy
```bash
# Bygg frontend
cd frontend && npm run build
# Deploy til Pages
wrangler pages deploy dist
```

### 6. Smoke Test (ALLTID)
```bash
# Kjør smoke-test suite
node scripts/smoke-test.mjs
```

### 7. Verifikasjon
- Sjekk at deploy var vellykket (wrangler output)
- Bekreft at smoke-test passerte
- Test ett regnr-søk i produksjon
- Bekreft at frontend loader korrekt

## Don'ts

- **ALDRI** deploy uten smoke-test
- **ALDRI** deploy på fredag ettermiddag
- **ALDRI** deploy med uncommitted secrets
- **ALDRI** overskriv produksjons-D1 uten backup
