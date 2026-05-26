# 🚀 Deploy til www.finnbilglass.no

> **Dato:** 2026-05-26
> **Domene:** www.finnbilglass.no
> **Hosting:** Cloudflare Pages (frontend) + Cloudflare Workers (API)

---

## Steg 1: Legg til Custom Domain i Cloudflare Pages

1. Gå til [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Velg prosjektet **`autoglass-frontend`**
3. Gå til **Custom domains** → **Set up a custom domain**
4. Skriv inn: `www.finnbilglass.no`
5. Klikk **Continue** → **Activate domain**

> Cloudflare vil automatisk legge til nødvendige DNS-records i din sone.

---

## Steg 2: DNS-konfigurasjon (hvis manuell)

Hvis du ikke bruker Cloudflare som DNS-leverandør, pek domenet med CNAME:

| Type | Navn | Mål |
|------|------|-----|
| CNAME | `www` | `autoglass-frontend.pages.dev` |

For apex-domain (`finnbilglass.no` uten www):

| Type | Navn | Mål |
|------|------|-----|
| A | `@` | `192.0.2.1` (bruk Cloudflare redirect rules) |
| CNAME | `www` | `autoglass-frontend.pages.dev` |

---

## Steg 3: API-konfigurasjon

### Alternativ A: Behold eksisterende Worker-URL (enklest)
Frontend kaller allerede `https://autoglass-glass-sok.autoglassnorge.workers.dev`. Ingen endring nødvendig.

### Alternativ B: Custom domain for API (valgfritt)
Hvis du vil ha `api.finnbilglass.no`:

1. Gå til Cloudflare Dashboard → Workers & Pages
2. Velg Worker **`autoglass-glass-sok`**
3. Gå til **Triggers** → **Custom Domains** → **Add Custom Domain**
4. Skriv inn: `api.finnbilglass.no`
5. Oppdater `.env.production`:
   ```
   VITE_API_URL=https://api.finnbilglass.no
   ```
6. Bygg og deploy frontend på nytt.

---

## Steg 4: Deploy frontend nå

### Manuell deploy (fra din Mac):
```bash
cd ~/bilglass/frontend
npm run build
npx wrangler pages deploy dist --project-name=autoglass-frontend
```

### Via GitHub Actions (anbefalt):
```bash
cd ~/bilglass
git add -A
git commit -m "deploy: finnbilglass.no frontend + browse data"
git push origin main
```

> GitHub Actions vil automatisk bygge og deploye til Pages.

---

## Steg 5: Verifiser

Sjekk at alt fungerer:

```bash
# Frontend
curl -s https://www.finnbilglass.no/ | head -20

# API (health check)
curl -s https://www.finnbilglass.no/api/health 2>/dev/null || \
curl -s https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health

# Browse data
curl -s https://www.finnbilglass.no/browse/brands.json | jq '.brands | length'
```

---

## 📋 Hva er deployet

| Komponent | Status |
|-----------|--------|
| **Frontend** (React/Vite) | ✅ Bygget, klar |
| **Browse data** (87 merker) | ✅ 4.7MB JSON i `dist/browse/` |
| **API-klient** | ✅ Standardisert til `VITE_API_URL` |
| **Footer** | ✅ Oppdatert med finnbilglass.no-lenke |
| **Worker** (API) | ✅ Eksisterende, ingen endring nødvendig |

---

## 🔧 Hvis noe ikke fungerer

| Problem | Løsning |
|---------|---------|
| "404 Not Found" på www.finnbilglass.no | Sjekk at DNS er propagated (`dig www.finnbilglass.no`) |
| CORS-feil fra API | Worker har `"Access-Control-Allow-Origin": "*"` — skal fungere |
| Browse-data laster ikke | Sjekk at `browse/` finnes i `dist/` etter build |
| Tom side / hvit skjerm | Sjekk browser console for JS-feil |

---

## 📞 Support

Cloudflare Pages docs: https://developers.cloudflare.com/pages/
Custom domains: https://developers.cloudflare.com/pages/configuration/custom-domains/
