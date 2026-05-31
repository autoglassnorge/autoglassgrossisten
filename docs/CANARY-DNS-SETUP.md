# Canary DNS Setup: app.auto-glass.no

## Manuell Konfigurasjon (Må gjøres i Cloudflare Dashboard)

### Steg 1: Legg til Custom Domain i Pages

1. Gå til [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Velg "Pages" → "autoglass-frontend"
3. Klikk "Custom domains"
4. Klikk "Set up a custom domain"
5. Skriv inn: `app.auto-glass.no`
6. Velg zone: `auto-glass.no`
7. Klikk "Continue"

### Steg 2: DNS Validation

Cloudflare vil automatisk:
- Legge til CNAME record: `app.auto-glass.no` → `autoglass-frontend.pages.dev`
- Issue SSL/TLS sertifikat
- Aktivere HTTPS

### Steg 3: Verifisering

Etter ~2 minutter, test:

```bash
# Sjekk DNS
dig app.auto-glass.no CNAME
# Forventet: autoglass-frontend.pages.dev

# Sjekk HTTPS
curl -sI https://app.auto-glass.no/ | head -5
# Forventet: HTTP/2 200

# Sjekk React
curl -s https://app.auto-glass.no/ | grep '<div id="root">'
# Forventet: <div id="root"></div>
```

### Steg 4: Monitoring

```bash
# Health check
curl -s https://app.auto-glass.no/api/health | jq .

# Metrics
curl -s https://app.auto-glass.no/api/metrics | jq '.requests'
```

## Rollback (hvis problemer)

Slett CNAME-record i DNS:
```
app.auto-glass.no → (slett)
```

Eller endre til:
```
app.auto-glass.no → 46.62.128.105 (A-record til vanilla)
```

## Suksesskriterier før Fase 2

- [ ] Ingen 500-feil i 48 timer
- [ ] Lighthouse score ≥ 75
- [ ] API p95 < 500ms
- [ ] Mobil testing OK
- [ ] Interne brukere godkjenner

## Neste steg

Etter stabil canary:
1. Setup load balancing på `auto-glass.no`
2. 10% → React, 90% → Vanilla
3. Gradvis øke
