# Deploy-runbook — Autoglass AS

## Arkitektur

```
GitHub → Actions → Cloudflare Worker + KV + Pages
```

| Komponent | URL | Verktøy |
|-----------|-----|---------|
| Worker API | `https://autoglass-glass-sok.autoglassnorge.workers.dev` | Wrangler |
| Pages Frontend | `https://autoglass-frontend.pages.dev` | Wrangler Pages |
| KV Katalog | `GLASS_CATALOG` namespace | Wrangler KV |

---

## Manuell Deploy

### 1. Worker
```bash
cd api/cf-worker
npx wrangler deploy
```

### 2. KV-upload
```bash
npm run worker:upload
```

### 3. Pages
```bash
npm run pages:deploy
```

---

## Automatisk Deploy (GitHub Actions)

Trigger: push til `main`

Workflow: `.github/workflows/deploy.yml`

Steg:
1. Deploy Worker
2. Sett secrets
3. Deploy Pages
4. Upload KV
5. Verifikasjon

---

## Smoke-test etter deploy

```bash
node scripts/smoke-test.mjs
```

Sjekker:
- Health
- Regnr-oppslag
- Prefix4-oppslag
- Eurocode-oppslag
- CORS-headers

---

## Rollback

### Worker
```bash
cd api/cf-worker
npx wrangler rollback
```

### Pages
Ingen innebygd rollback. Re-deploy forrige commit.

---

## Secrets

| Secret | Hvor | Kommando |
|--------|------|----------|
| SVV_API_KEY | Wrangler | `wrangler secret put SVV_API_KEY` |
| BILUPPGIFTER_API_KEY | Wrangler | `wrangler secret put BILUPPGIFTER_API_KEY` |
| CLOUDFLARE_API_TOKEN | GitHub | `gh secret set CLOUDFLARE_API_TOKEN` |
| CLOUDFLARE_ACCOUNT_ID | GitHub | `gh secret set CLOUDFLARE_ACCOUNT_ID` |
| GLASS_KV_NAMESPACE_ID | GitHub | `gh secret set GLASS_KV_NAMESPACE_ID` |

Synkronisering: `node scripts/sync-secrets.mjs`

---

## Troubleshooting

### Worker error 1101
**Årsak:** Runtime-feil i Worker (f.eks. loadCatalog-buggen)  
**Fix:** Sjekk `wrangler tail`, fiks kode, re-deploy

### KV 401
**Årsak:** Ugyldig API-token eller namespace ID  
**Fix:** Verifiser `CF_API_TOKEN` og `KV_NAMESPACE_ID`

### Pages 404
**Årsak:** `dist/` mangler filer  
**Fix:** Sjekk at `mkdir -p dist && cp ...` kopierer alt

---

**Sist oppdatert:** 2026-05-18
