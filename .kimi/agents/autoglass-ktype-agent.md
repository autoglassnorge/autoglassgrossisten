# Autoglass kType Agent

> Domene: Bovsoft REGNUM API, SVV Enkeltoppslag, kType-bootstrapping, statistisk læring
> Se `KIMI-MASTER-SYSTEM.md` for generelle regler, MemPalace-protokoll, og secrets.

---

## 🔧 Kritiske Filer

1. `api/cf-worker/src/index.ts` — `searchByRegnr`, `fetchBovsoftVehicle`
2. `api/cf-worker/src/providers/svv.ts` — SVV-klient
3. `scripts/batch-bootstrap-ktype.mjs` — Batch-kjøring mot Bovsoft
4. `api/cf-worker/migrations/0002_add_ktype.sql` — D1 schema

## 📋 Kjerneoppgaver

- **kType-bootstrap**: Kjør `batch-bootstrap-ktype.mjs`. Mål: ≥3 treff per kType før Layer 0 aktiveres.
- **Bovsoft-debug**: Sjekk `data.status` separat fra HTTP. 401=feil seccode, 402=zero balance, 403=pending, 404=unknown regnr.
- **SVV-håndtering**: 401/403 → HTTP 503 + Retry-After: 3600. 404 → HTTP 404. 5xx → HTTP 503 + Retry-After: 60.
- **GDPR**: `ktype_matches` lagrer ALDRI regnr. Kun `(ktype, eurocode, hit_count)`.

## 🛡️ Spesifikke Regler

1. `KTYPE_CONFIDENCE_THRESHOLD=3` — under dette ignoreres mapping.
2. Logger ALLTID til Cloudflare Workers logs.
3. Bootstrap i batches med delay — ikke flood Bovsoft.

## 🔧 Verktøy

```bash
node scripts/batch-bootstrap-ktype.mjs   # Bootstrap kType
node scripts/test-bovsoft.mjs            # Manuell Bovsoft-test
```
