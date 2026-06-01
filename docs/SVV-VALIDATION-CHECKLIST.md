# SVV Utvidet Parser - Validerings-sjekkliste

**Prosjekt:** Autoglass AS B2B  
**Komponent:** SVV API Integrasjon (Statens Vegvesen)  
**Versjon:** 1.0  
**Dato:** 2025-05-31

---

## ✅ Sjekkliste for Godkjenning

### Nye Felter - Parsing

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 1 | `color` parses korrekt fra `farge` | ⬜ | TC-P001 | |
| 2 | `fuelType` parses korrekt fra `drivstoff.drivstofftype` | ⬜ | TC-P001 | |
| 3 | `euroClass` parses korrekt fra `euKlasse.kode` | ⬜ | TC-P001 | |
| 4 | `nextEUDate` parses korrekt til ISO format (`YYYY-MM-DD`) | ⬜ | TC-P003 | |
| 5 | `registrationStatus` parses korrekt fra `registrering.registreringsstatus` | ⬜ | TC-P001 | |
| 6 | `vehicleClass` parses korrekt fra `kjoretoykategori` | ⬜ | TC-P001 | |
| 7 | `seatCount` parses korrekt fra `sitteplasser.totalt` eller fallback til `persontall.sitteplasserTotalt` | ⬜ | TC-P001 | |

### Robusthet - Manglende Data

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 8 | Manglende `color` returnerer `undefined` (ikke krasj) | ⬜ | TC-P002 | |
| 9 | Manglende `fuelType` returnerer `undefined` | ⬜ | TC-P002 | |
| 10 | Manglende `euroClass` returnerer `undefined` | ⬜ | TC-P002 | |
| 11 | Manglende `nextEUDate` returnerer `undefined` | ⬜ | TC-P002 | |
| 12 | Manglende `registrationStatus` returnerer `undefined` | ⬜ | TC-P002 | |
| 13 | Manglende `vehicleClass` returnerer `undefined` | ⬜ | TC-P002 | |
| 14 | Manglende `seatCount` returnerer `undefined` | ⬜ | TC-P002 | |

### Bakoverkompatibilitet

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 15 | `regno` returneres korrekt | ⬜ | TC-B001 | |
| 16 | `vin` returneres korrekt | ⬜ | TC-B001 | |
| 17 | `make` returneres i UPPERCASE | ⬜ | TC-B001 | |
| 18 | `model` returneres i UPPERCASE | ⬜ | TC-B001 | |
| 19 | `year` parses fra registreringsdato | ⬜ | TC-B001 | |
| 20 | `k_type` er 0 som default | ⬜ | TC-B001 | |
| 21 | `typeCode` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 22 | `length` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 23 | `fuelCode` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 24 | `engineCode` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 25 | `seats` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 26 | `gvwr` returneres hvis tilgjengelig | ⬜ | TC-B001 | |
| 27 | Eksisterende integrasjon brekker ikke | ⬜ | TC-B001 | |

### Feilhåndtering

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 28 | 404 (ukjent regnr) gir `status: "not_found"` | ⬜ | TC-E001 | |
| 29 | 503 (SVV nede) gir `status: "upstream_error"` | ⬜ | TC-E002 | |
| 30 | Ugyldig dato-format krasjer ikke parser | ⬜ | TC-E003 | |
| 31 | Ugyldig dato-format gir `year: 0` | ⬜ | TC-E003 | |
| 32 | Ugyldig dato-format gir `nextEUDate: undefined` | ⬜ | TC-E003 | |
| 33 | Timeout håndteres (15s max) | ⬜ | - | |
| 34 | Nettverksfeil håndteres gracefully | ⬜ | - | |

### Type-sikkerhet

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 35 | `color` er alltid `string` eller `undefined` | ⬜ | TC-P001 | |
| 36 | `euroClass` er alltid `number` eller `undefined` | ⬜ | TC-P001 | |
| 37 | `seatCount` er alltid `number` eller `undefined` | ⬜ | TC-P001 | |
| 38 | `nextEUDate` er alltid `string` (YYYY-MM-DD) eller `undefined` | ⬜ | TC-P003 | |

### Ytelse

| # | Krav | Status | Test ID | Notat |
|---|------|--------|---------|-------|
| 39 | Parser kjører < 50ms per kjøretøy | ⬜ | - | |
| 40 | Ingen memory leaks ved store batcher | ⬜ | - | |

---

## 📝 Godkjenningsprosess

### Utført av
**QA Engineer:** _________________________ **Dato:** ___________

**Tech Lead:** _________________________ **Dato:** ___________

### Testmiljø
- [ ] Lokalt (mock)
- [ ] Development
- [ ] Staging
- [ ] Produksjon

### Resultat
**Antall sjekket:** ____ / 40

**Status:** ⬜ Godkjent  ⬜ Godkjent med forbehold  ⬜ Ikke godkjent

### Forbehold / Notater
```

```

---

## 🔧 Hvordan Bruke Sjekklisten

1. **Forberedelse**
   - Kjør `node scripts/test-svv-parsing.mjs --mock`
   - Verifiser at alle tester passerer i mock-mode

2. **Validering mot API**
   - Kjør `node scripts/test-svv-parsing.mjs`
   - Verifiser at alle tester passerer mot live API

3. **Manuell verifisering**
   - Kryss av hvert punkt etterhvert som det valideres
   - Noter avvik i "Forbehold"-seksjonen

4. **Dokumentasjon**
   - Lagre test-rapport fra `test-reports/` mappen
   - Arkiver sjekklisten med signaturer

---

## 🚨 Blokkerende Issues

Hvis noen av følgende krav ikke er oppfylt, skal feature **ikke** deployes:

- [ ] E001: 404 håndtering fungerer ikke
- [ ] E002: 503 håndtering fungerer ikke
- [ ] B001: Eksisterende felter brekker
- [ ] P002: Parser krasjer ved manglende felter

---

## 📊 Test-Rapport Logg

| Dato | Versjon | Utført av | Resultat | Rapport-fil |
|------|---------|-----------|----------|-------------|
| | | | | |

---

**Siste endring:** 2025-05-31 - Initial version
