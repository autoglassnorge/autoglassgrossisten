# TecDoc 1Q2019 kType Enrichment — Deploy Runbook

> **Status:** ✅ Klar for produksjon  
> **Dekning:** 11,294 / 18,737 records (60.3%)  
> **Fil:** `data/tecdoc-import/remote-deploy-v5.sql` (13,412 linjer)

---

## Forutsetninger

- `CLOUDFLARE_API_TOKEN` må være satt i miljøet
- Wrangler CLI må være logget inn: `npx wrangler login`
- Database: `glass-catalog-db` (Cloudflare D1)

---

## Steg 1: Backup (valgfritt men anbefalt)

```bash
cd api/cf-worker
npx wrangler d1 export glass-catalog-db --remote --output=backup-pre-tecdoc.sql
```

---

## Steg 2: Deploy

```bash
cd api/cf-worker
npx wrangler d1 execute glass-catalog-db --remote \
  --file=../../data/tecdoc-import/remote-deploy-v5.sql
```

> ⚠️ Denne kommandoen kjører 13,412 SQL-statements mot produksjons-D1.  
> Forvent kjøretid: 2–5 minutter.

---

## Steg 3: Verifisering

```bash
npx wrangler d1 execute glass-catalog-db --remote --command="
SELECT 'glass_catalog with ktype' as metric, COUNT(*) as value FROM glass_catalog WHERE ktype IS NOT NULL
UNION ALL
SELECT 'ktype_registry', COUNT(*) FROM ktype_registry WHERE source = 'tecdoc_1q2019'
UNION ALL
SELECT 'glass_rules (tecdoc)', COUNT(*) FROM glass_rules WHERE notes = 'tecdoc_1q2019'
"
```

**Forventet resultat:**
| metric | value |
|--------|-------|
| glass_catalog with ktype | 11294 |
| ktype_registry | 907 |
| glass_rules (tecdoc) | 1182 |

---

## Steg 4: Smoke-test

```bash
curl "https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=BR77770"
```

Sjekk at responsen inkluderer `ktypeInfo` og `layer: 0` for matchede kjøretøy.

---

## Rollback

Hvis noe går galt:

```bash
npx wrangler d1 execute glass-catalog-db --remote --command="
DELETE FROM ktype_registry WHERE source = 'tecdoc_1q2019';
DELETE FROM glass_rules WHERE notes = 'tecdoc_1q2019';
UPDATE glass_catalog SET ktype = NULL WHERE ktype IS NOT NULL;
"
```

---

## Post-deploy

- [ ] Verifiser smoke-test OK
- [ ] Sjekk Worker logs (`wrangler tail`)
- [ ] Overvåk `ktype_matches` de neste 24t
- [ ] Oppdater `AGENTS.md` med ny dekningstall
