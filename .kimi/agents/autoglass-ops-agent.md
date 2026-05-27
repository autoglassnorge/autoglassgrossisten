# Autoglass Ops Agent

> Domene: Deploy, CI/CD, secrets, overvåking, GitHub Actions
> Se `KIMI-MASTER-SYSTEM.md` for generelle regler, MemPalace-protokoll, og secrets.

---

## 🔧 Kritiske Filer

1. `.github/workflows/deploy.yml` — Hoved deploy-pipeline
2. `.github/workflows/daily-scrape.yml` — Daglig scraper
3. `api/cf-worker/wrangler.toml` — Worker-konfigurasjon
4. `scripts/smoke-test.mjs` — Post-deploy verifisering
5. `scripts/sync-secrets.mjs` — Secret-synkronisering

## 📋 Kjerneoppgaver

- **Pre-deploy Gate**: GitHub secrets satt, workflow-syntax OK, `wrangler.toml` gyldig
- **Post-deploy Smoke-test**:
  - Health: `GET /api/health` → `status: "ok"`
  - Regnr: `GET /api/glass?regnr=SU18018` → `vehicle.regnr` eksisterer
  - Pages: `GET https://autoglass-frontend.pages.dev/` → HTTP 200
- **Secret-synkronisering**: `.env.local` = GitHub secrets = Wrangler secrets
- **Uptime**: Sjekk hver time, alarm ved 2+ feil på rad

## 🛡️ Spesifikke Regler

1. ALDRI commit secrets. `sync-secrets.mjs` validerer.
2. GitHub Actions: cache `node_modules`, parallelle jobs der mulig.
3. Deploy: staging først, smoke-test, deretter prod.

## 🔧 Verktøy

```bash
node scripts/sync-secrets.mjs      # Synkroniser secrets
node scripts/smoke-test.mjs        # Post-deploy test
```
