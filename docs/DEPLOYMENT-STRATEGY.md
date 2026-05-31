# Deployment Strategy: Vanilla → React

## Fase 1: Canary Testing (NÅ)

### Setup:
1. CNAME `app.auto-glass.no` → `autoglass-frontend.pages.dev`
2. Behold `auto-glass.no` på vanilla
3. Intern testing av `app.auto-glass.no`

### Suksesskriterier:
- [ ] Ingen 500-feil i 48 timer
- [ ] Lighthouse score ≥ 75
- [ ] API-responstid < 500ms p95
- [ ] Mobil testing OK (iOS/Android)

## Fase 2: Gradvis Overgang

### Cloudflare Load Balancing:
```
auto-glass.no
├── 90% → Vanilla (46.62.128.105)
└── 10% → React (autoglass-frontend.pages.dev)
```

### Øke gradvis:
- Dag 3: 25%
- Dag 7: 50%  
- Dag 14: 100%

## Fase 3: Full Cutover

Når:
- 0 kritiske bugs i 7 dager
- Lighthouse ≥ 85
- Konverteringsrate ≥ vanilla

## Rollback Plan

Hvis problemer:
1. **DNS-endring**: A-record tilbake til 46.62.128.105
2. **TTL**: 300 sekunder (5 min rollback)
3. **Monitoring**: Alert på error rate > 1%

## Monitoring

```bash
# Sjekk React helse
curl -s https://app.auto-glass.no/api/health | jq .

# Sjekk error rates
curl -s https://app.auto-glass.no/api/metrics | jq '.requests.errorRate'
```
