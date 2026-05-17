# Autoglass AS — Arkitekturplan
> Versjon: 1.0 | Opprettet: 2026-05-17 | Fase 1 implementert

---

## Sammendrag

Denne planen beskriver overgangen fra MVP (Cloudflare Worker + KV for alt) til en produksjonsklar B2B-plattform. Planen er delt i tre faser med økende kompleksitet.

**Status i dag:**
- Worker live på `autoglass-glass-sok.autoglassnorge.workers.dev`
- 33 215 glass-records i KV
- SVV API fungerer (regnr-oppslag)
- Statiske filer serveres fra KV via Worker
- GitHub Actions: 1/3 jobs grønne (deploy-worker ✅, upload-static ❌, upload-kv ❌)

---

## Fase 1: Stabilisering (Uke 1) — IMPLEMENTERT ✅

### 1.1 Fix GitHub Actions-pipeline

| Endring | Status |
|---------|--------|
| `SVV_API_KEY` flyttet fra hardkodet workflow til `secrets.SVV_API_KEY` | ✅ |
| Verifiseringsjobb (`verify-deploy`) lagt til etter upload | ✅ |
| Health check + static check + API smoke test i CI | ✅ |

**Handling fra deg:**
1. Roter SVV API-nøkkelen i [SVV-portalen](https://www.vegvesen.no/fag/teknologi/apne-data/) — den gamle (`a578e3c7-f27b-4b73-8938-af26edd89d68`) ligger eksponert i git-historikken.
2. Legg til `SVV_API_KEY=<ny_nøkkel>` i GitHub Secrets.
3. Legg til `GLASS_KV_NAMESPACE_ID=15099e572e51423dafb723996c01c668` i GitHub Secrets.

### 1.2 Rydd opp i katalogfiler

| Endring | Status |
|---------|--------|
| `merge-catalogs.ts` skriver nå til én kanonisk fil: `data/catalog-prod.json` | ✅ |
| Meta inneholder `version` (ISO-timestamp) for sporing | ✅ |
| `.gitignore` ignorerer `data/master-catalog*.json` | ✅ |

**Gamle filer å slette fra repo (ikke fra lokal disk):**
```bash
git rm data/master-catalog.json
git rm data/master-catalog-cleaned.json
git rm data/master-catalog-enriched.json
git rm data/master-catalog-nags.json
git commit -m "refactor: slett legacy catalog-filer, bruk catalog-prod.json"
```

### 1.3 Robusthet i upload-scripts

| Endring | `upload-static.ts` | `upload-catalog.ts` |
|---------|-------------------|---------------------|
| Retry med exponential backoff (3 forsøk) | ✅ | ✅ |
| Timeout på fetch (30s via AbortController) | ✅ | ✅ |
| Parallell upload (`p-limit`, 5 concurrent) | ✅ | ✅ |
| Progress-logging | ✅ | ✅ |
| Fortsetter på chunk-feil, rapporterer til slutt | — | ✅ |

---

## Fase 2: Infrastruktur-migrering (Uke 2–3)

### 2.1 Flytt frontend til Cloudflare Pages

**Motivasjon:** KV er ikke designet for statisk fil-hosting. 15+ commits har gått med på å fikse KV-upload-problemer. Pages er gratis, raskt og har automatisk cache-invalidering.

**Implementering:**

```yaml
# .github/workflows/deploy.yml — ny jobb
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g wrangler
      - name: Deploy to Cloudflare Pages
        run: |
          wrangler pages deploy . \
            --project-name=autoglass-frontend \
            --exclude=api \
            --exclude=data \
            --exclude=node_modules \
            --exclude=.git
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Worker-endringer:**
- Fjern `serveStaticFile()` fra `src/index.ts`
- Worker håndterer kun `/api/*` og `/api/health`
- CORS-headers tilpasses for Pages-origin (`autoglass-frontend.pages.dev` og `www.autoglass.no`)

**Tidsestimat:** 2–3 timer (inkl. DNS/CNAME-endring)

**Risiko:** Lav. Pages kan deployes parallelt med eksisterende KV-løsning. Bytt DNS først når Pages er verifisert.

### 2.2 Vurder D1 for katalogen

**Motivasjon:** KV er key-value med 1 MB per key. Katalogen på 33k records krever chunking og full scan i minnet. D1 (SQLite) gir SQL-queries, indekser og JOINs.

**Schema:**

```sql
-- d1-schema.sql
CREATE TABLE IF NOT EXISTS glass_catalog (
  eurocode TEXT PRIMARY KEY,
  article_number TEXT,
  category TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  adas INTEGER DEFAULT 0,
  rain_sensor INTEGER DEFAULT 0,
  heated INTEGER DEFAULT 0,
  acoustic INTEGER DEFAULT 0,
  antenna INTEGER DEFAULT 0,
  hud INTEGER DEFAULT 0,
  shade INTEGER DEFAULT 0,
  camera INTEGER DEFAULT 0,
  lane_assist INTEGER DEFAULT 0,
  price REAL,
  stock_status INTEGER DEFAULT 0,
  oem_numbers TEXT,      -- JSON array
  nags_codes TEXT,       -- JSON array
  prefix4 TEXT,
  image_url TEXT,
  source TEXT,
  last_updated TEXT
);

CREATE INDEX IF NOT EXISTS idx_brand_model ON glass_catalog(brand, model);
CREATE INDEX IF NOT EXISTS idx_year ON glass_catalog(year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_prefix4 ON glass_catalog(prefix4);
CREATE INDEX IF NOT EXISTS idx_category ON glass_catalog(category);
```

**Migreringsscript (Worker-kode):**

```typescript
// api/cf-worker/scripts/migrate-to-d1.ts
import * as fs from "fs";

interface GlassRecord { /* ... */ }

async function migrateToD1(db: D1Database, catalogPath: string) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  const records: GlassRecord[] = catalog.records;

  // Batch insert (D1 støtter opptil 100 parametre per query)
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const values = batch.flatMap((r) => [
      r.eurocode, r.articleNumber, r.category, r.brand, r.model,
      r.yearFrom, r.yearTo,
      r.adas?1:0, r.rainSensor?1:0, r.heated?1:0, r.acoustic?1:0,
      r.antenna?1:0, r.hud?1:0, r.shade?1:0, r.camera?1:0, r.laneAssist?1:0,
      r.price, r.stockStatus,
      JSON.stringify(r.oemNumbers), JSON.stringify(r.nagsCodes),
      r.prefix4, r.imageUrl, r.source, r.lastUpdated
    ]);
    await db.prepare(`INSERT INTO glass_catalog VALUES ${placeholders}`).bind(...values).run();
  }
}
```

**Tidsestimat:** 4–6 timer (POC + testing)

**Risiko:** Middels. D1 er i beta. KV må beholdes som fallback til D1 er verifisert i produksjon. Anbefaling: Kjør D1 parallelt i 1 uke før du fjerner KV-katalogen.

**Kostnad:** $0 (D1 har 5 GB gratis lagring + 100k queries/dag på Workers Free)

### 2.3 Schedulert katalogoppdatering

**Motivasjon:** `scrape:pilkington:loop` er ikke produksjonsklart. Pilkington vil rate-limite eller blokkere IP-en.

**Implementering:**

```toml
# wrangler.toml
[triggers]
crons = ["0 2 * * *"]  # 02:00 UTC hver natt
```

```typescript
// src/index.ts — legg til scheduled handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> { /* ... */ },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("🌙 Nattlig katalog-oppdatering starter", event.scheduledTime);
    // 1. Kjør scraper-pipeline (krever at scraperne refaktoreres til Worker-kompatible fetch-kall)
    // 2. Merge → catalog-prod.json
    // 3. Last opp til KV (eller D1)
    // 4. Send alarm hvis feil
  }
};
```

**Tidsestimat:** 6–8 timer (scraper-refaktorering + cron + overvåking)

**Risiko:** Høy. Pilkington-scraperen bruker Node.js-spesifikke pakker (pdf-parse) som ikke kjører i Worker. Scraperen må enten:
- Kjøre i GitHub Actions (nattlig cron) og laste resultatet til KV/D1, ELLER
- Refaktoreres til å bruke en ekstern scraping-tjeneste (ScrapingBee, Apify)

**Anbefaling:** Behold scraperne som Node.js-scripts i GitHub Actions (`schedule: 0 2 * * *`), og la Actions pushe resultatet til KV/D1. Dette er enklere enn Worker Cron.

---

## Fase 3: B2B-funksjonalitet (Uke 4+)

### 3.1 Unimicro-integrasjon

| Funksjon | Teknisk løsning | Tidsestimat |
|----------|----------------|-------------|
| Kunde-spesifikke priser | `GET /api/glass?regnr=XX&customer_id=123` → query Unimicro pris-API per kunde | 4–6 timer |
| Bestilling | `POST /api/order` → valider input → proxy til Unimicro ordre-API | 6–10 timer |
| Sanntids lager | Cache Unimicro lager i KV med 5-min TTL. Worker sjekker cache først. | 3–4 timer |

**Risiko:** Middels. Avhenger av Unimicro API-dokumentasjon og rate limits. Krever API-nøkkel og avtale.

### 3.2 Autentisering

**Alternativ A: Cloudflare Access (anbefalt for rask B2B-lansering)**
- Gratis for < 50 brukere
- SSO med Google Workspace / Microsoft 365
- Worker mottar JWT i header (`CF-Access-Jwt-Assertion`)
- Ingen kodeendringer i frontend (Access håndterer login-siden)

**Alternativ B: Supabase Auth**
- Gratis tier: 50k MAU
- Støtter e-post + OAuth (Google, Microsoft)
- Krever egen login-side (`/login.html`)
- RLS på kunde-tabeller hvis du går for D1 + Supabase (mer komplekst)

**Anbefaling:** Start med Cloudflare Access. Bytt til Supabase Auth kun hvis du trenger kunde-spesifikk datamodell (ordrehistorikk, lagrede søk, etc.).

**Tidsestimat:**
- Cloudflare Access: 1–2 timer (kun DNS + policy-oppsett)
- Supabase Auth: 6–10 timer (login-side + session-håndtering + Worker-validering)

### 3.3 Cloudflare Images for glassfoto

**Motivasjon:** Pilkington-image-URLer (`pilkington.aws.aphix.software/...`) kan endres eller fjernes. Cloudflare Images gir permanente URLer + transformasjoner (resize, WebP).

**Implementering:**

```typescript
// Worker-kode ved scraper-upload
const imageRes = await fetch(record.imageUrl);
if (imageRes.ok) {
  const uploaded = await env.IMAGES.upload(imageRes.body!, {
    id: record.eurocode,
  });
  record.imageUrl = `https://imagedelivery.net/${env.CF_ACCOUNT_ID}/${uploaded.id}/public`;
}
```

**Kostnad:** ~$5/mnd for 100k bilder (Cloudflare Images)

**Tidsestimat:** 3–4 timer

**Risiko:** Lav. Kan implementeres inkrementelt — last opp bilder ved neste scraper-kjøring.

---

## Risikovurdering per fase

| Fase | Risiko | Tiltak |
|------|--------|--------|
| **Fase 1** | Lav | Ingen breaking changes. Kun pipeline-forbedringer. |
| **Fase 2 — Pages** | Lav | Deploy parallelt. Bytt DNS først etter verifisering. |
| **Fase 2 — D1** | Middels | Kjør KV og D1 parallelt i 1 uke. Fallback i Worker-kode. |
| **Fase 2 — Cron** | Høy | Scrapere er ikke Worker-kompatible. Bruk GitHub Actions i stedet. |
| **Fase 3 — Unimicro** | Middels | Avhenger av ekstern API. Bygg mock-responser først. |
| **Fase 3 — Auth** | Lav (Access) / Middels (Supabase) | Access er managed. Supabase krever mer kode. |

---

## Tidsestimat (total)

| Fase | Oppgave | Timer |
|------|---------|-------|
| **Fase 1** | Pipeline-fix + secret-rotasjon | 1 |
| | Merge-script + git-cleanup | 1 |
| | Robust upload (retry, p-limit) | 2 |
| **Fase 2** | Cloudflare Pages deploy | 3 |
| | D1 POC + migrering | 6 |
| | Nattlig GitHub Actions cron | 4 |
| **Fase 3** | Unimicro pris-API | 5 |
| | Unimicro bestilling | 8 |
| | Sanntids lager-cache | 3 |
| | Auth (Cloudflare Access) | 2 |
| | Cloudflare Images | 3 |
| **TOTAL** | | **38 timer** (~5 arbeidsdager) |

---

## Neste steg (umiddelbart)

1. [ ] Roter `SVV_API_KEY` i SVV-portalen
2. [ ] Legg til `SVV_API_KEY` og `GLASS_KV_NAMESPACE_ID` i GitHub Secrets
3. [ ] Kjør `npm run merge` lokalt → verifiser at `data/catalog-prod.json` genereres
4. [ ] Slett `data/master-catalog*.json` fra git (`git rm`)
5. [ ] Push til `main` og observer at alle 4 jobs blir grønne
6. [ ] Verifiser health check: `curl https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health`

---

## Arkitektur-mål (6-måneders horisont)

```
┌─────────────────────────────────────────────────────────────┐
│                        Bruker (verksted)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │  Cloudflare Pages      │  ← Statisk frontend (HTML/CSS/JS)
           │  autoglass-frontend    │
           └───────────┬────────────┘
                       │ fetch()
           ┌───────────▼────────────┐
           │  Cloudflare Worker     │  ← API-only (/api/*)
           │  autoglass-glass-sok   │
           └───────────┬────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐  ┌─────▼─────┐  ┌────▼────┐
   │  D1     │  │  KV       │  │  SVV    │
   │ SQLite  │  │  sessions │  │  API    │
   │catalog  │  │  cache    │  │regnr    │
   └─────────┘  └───────────┘  └─────────┘
        │                           │
        └──────────────┬────────────┘
                       │
              ┌────────▼────────┐
              │  Unimicro API   │  ← Priser, lager, bestilling
              └─────────────────┘
```

