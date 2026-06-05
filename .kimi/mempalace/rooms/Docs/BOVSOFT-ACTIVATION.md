# Bovsoft REGNUM API — Aktivering

**Status:** Konto venter på bekreftelse (HTTP 403)
**Kontakt:** bovsoft@gmail.com
**Client ID:** 461 (ref. ADR-010)

---

## Hva er Bovsoft?

Bovsoft REGNUM API gir kType-oppslag fra norsk registreringsnummer:
- **Input:** Reg.nr (f.eks. "SU18018")
- **Output:** kType (TecDoc type ID), VIN, merke, modell, år-fra/år-til, karosseri
- **Pris:** Pay-per-request (ikke abonnement)
- **URL:** `http://54.38.179.43:150/bovsoft.regnum.run`

## Hvorfor aktivere?

kType er nøkkelen til **100% eksakt frontrute-matching**:
- Dagens system: brand + model + year + equipment-gjetting (~70–80% nøyaktig)
- Med kType: direkte TecDoc-type-ID → eksakt delenummer (~95%+ nøyaktig)

## Nåværende dekning

- 132 unike ktyper oppdaget fra 153 norske regnr
- 67 ktyper med 1 537 mappings i D1 `ktype_matches`
- Kun 498 produkter (1.26%) har direkte kType i `glass_catalog`

## Hvordan aktivere

1. Send e-post til **bovsoft@gmail.com** med:
   - Client ID: `461`
   - Be om konto-bekreftelse / fjerning av 403-status
   - Nevn at det gjelder Autoglass AS (Norge)

2. Når konto er aktivert:
   - `fetchBovsoftVehicle()` i Worker vil returnere 200 i stedet for 403
   - kType-data lagres automatisk i KV (30 dager cache)
   - `ktype_matches`-tabell bygges opp over tid via statistisk læring

3. Verifiser i `/api/health`:
   ```json
   {
     "bovsoftConfigured": true
   }
   ```

## Secrets (allerede konfigurert)

- `BOVSOFT_CLIENT_ID` — satt i GitHub secrets + Wrangler
- `BOVSOFT_SECCODE` — satt i GitHub secrets + Wrangler

---

**Opprettet:** 2026-05-27
**Sist oppdatert:** 2026-05-27
