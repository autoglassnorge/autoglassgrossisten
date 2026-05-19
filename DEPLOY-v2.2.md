# 🚀 Deploy Autoglass Worker v2.2 (Hacker Mode)

## Hva er nytt i v2.2

- ✅ **Smart Equipment Guesser** — AI-basert equipment-gjetting fra catalog-statistikk
- ✅ **Learning Engine** — Selvlærende D1-tabell som husker hvert søk
- ✅ **Equipment-prioritet:** Biluppgifter → Learned → VIN-prefix → Catalog Guess → None
- ✅ **602 equipment-signaturer** embedded i Worker
- ✅ **Category correction** — 3 833 poster korrigert fra "annet"
- ✅ **VIN-dekoding** for 11 merker + modellår fra pos 10

---

## Alternativ 1: GitHub Actions (ANBEFALT) ⭐

GitHub Actions har allerede `CLOUDFLARE_API_TOKEN` satt som secret.

### Steg 1: Push til main

```bash
cd /Users/taj/bilglass
git add -A
git commit -m "feat: Worker v2.2 — Smart Equipment Guesser + Learning Engine

- Smart Equipment Guesser med 602 catalog-signaturer
- Learning Engine med D1 search_history tabell
- Equipment-prioritet: Biluppgifter > Learned > VIN-prefix > Catalog Guess
- Category detection fra Pilkington-koder (WS/FD/LRQ/RR)
- VIN-dekoding for 11 merker + modellår
- GDPR-safe: SHA-256 hash av regnr i learning"
git push origin main
```

### Steg 2: Kjør GitHub Actions

1. Gå til [GitHub → Actions → Deploy to Cloudflare](https://github.com/taj/bilglass/actions)
2. Klikk "Run workflow" på `main`
3. Vent 2-3 minutter

### Steg 3: Kjør D1-migrering (EN GANG)

Etter Worker er deployet, kjør migrering 0005:

```bash
# Last ned SQL-filen
curl -sL https://raw.githubusercontent.com/taj/bilglass/main/api/cf-worker/migrations/0005_search_history.sql > /tmp/0005.sql

# Kjør migrering
npx wrangler d1 execute glass-catalog-db --remote --file=/tmp/0005.sql
```

> **Merk:** Hvis du ikke har wrangler auth lokalt, bruk Cloudflare Dashboard → D1 → glass-catalog-db → Query → paste SQL.

---

## Alternativ 2: Lokal Wrangler (krever API-token)

### Steg 1: Autentiser Wrangler

```bash
# Hent API-token fra Cloudflare Dashboard:
# https://dash.cloudflare.com/profile/api-tokens
# Lag en token med: Cloudflare Workers + D1 + KV edit permissions

export CLOUDFLARE_API_TOKEN="din_token_her"
npx wrangler login
```

### Steg 2: Kjør D1-migrering

```bash
cd /Users/taj/bilglass/api/cf-worker
npx wrangler d1 execute glass-catalog-db --remote --file=migrations/0005_search_history.sql
```

### Steg 3: Deploy Worker

```bash
npx wrangler deploy
```

### Steg 4: Set secrets

```bash
npx wrangler secret put SVV_API_KEY
npx wrangler secret put BILUPPGIFTER_API_KEY
npx wrangler secret put BOVSOFT_CLIENT_ID
npx wrangler secret put BOVSOFT_SECCODE
```

---

## Etter deploy: Test med curl

```bash
# Health check
curl https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health

# Søk på regnr (bytt ut med et ekte regnr)
curl "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=AB12345"
```

---

## 📋 Pre-deploy sjekkliste

- [ ] `api/cf-worker/src/index.ts` kompilerer (`npx tsc --noEmit`) ✅
- [ ] `api/cf-worker/migrations/0005_search_history.sql` er committed
- [ ] `data/catalog-prod.json` er beriket (kjør `node scripts/enrich-catalog.mjs`)
- [ ] Git er clean (`git status`)
- [ ] GitHub secrets har `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

---

## 🔧 Feilsøking

### "Authentication error [code: 10000]"
→ Wrangler er ikke autentisert. Kjør `npx wrangler login` eller bruk GitHub Actions.

### "Table search_history does not exist"
→ Migrering 0005 er ikke kjørt. Kjør SQL via Dashboard eller wrangler.

### "No candidates found"
→ D1-tabellen `glass_catalog` er tom. Kjør migrering 0001-0004 + `migrate-to-d1.mjs`.

---

*Deploy-guide generert av Autoglass Data Agent — 2026-05-19*
