# SVV API Test-Cases

**Dokumentversjon:** 1.0  
**Sist oppdatert:** 2025-05-31  
**Gjelder:** Utvidet SVV parser med nye felter

---

## Oversikt

Dette dokumentet inneholder test-caser for validering av utvidet SVV (Statens Vegvesen) API integrasjon. Testene dekker parsing av nye felter, bakoverkompatibilitet, og feilhåndtering.

## Nye Felter (Utvidet Parser)

| Felt | Type | SVV Kilde | Beskrivelse |
|------|------|-----------|-------------|
| `color` | string | `farge` | Kjøretøyfarge |
| `fuelType` | string | `drivstoff.drivstofftype` | Drivstoff-type (lesbar) |
| `euroClass` | number | `euKlasse.kode` | EU-klasse (Euro 1-6) |
| `nextEUDate` | string (ISO) | `periodiskKjoretoyKontroll.nesteKontrollDato` | Neste EU-kontroll dato |
| `registrationStatus` | string | `registrering.registreringsstatus` | Registreringsstatus |
| `vehicleClass` | string | `kjoretoykategori` | Kjøretøykategori (M1, N1, etc) |
| `seatCount` | number | `sitteplasser.totalt` / `persontall.sitteplasserTotalt` | Antall seter |

## Eksisterende Felter (Bakoverkompatibilitet)

| Felt | Type | Påkrevd |
|------|------|---------|
| `regno` | string | Ja |
| `vin` | string | Ja |
| `make` | string | Ja |
| `model` | string | Ja |
| `year` | number | Ja |
| `k_type` | number | Ja |
| `typeCode` | string | Nei |
| `length` | number | Nei |
| `fuelCode` | string | Nei |
| `engineCode` | string | Nei |
| `seats` | number | Nei |
| `gvwr` | number | Nei |

---

## Test-Registreringsnummer

### Kjente Test-Regnr

| Regnr | Merke | Modell | År | Notat |
|-------|-------|--------|-----|-------|
| `EB21570` | Volkswagen | Golf | 2018 | Standard test-regnr |
| `SU18018` | VW | (varierer) | - | Eksisterende smoke-test regnr |

### Mock Test-Regnr (for automatisk testing)

| Regnr | Scenario | Bruk |
|-------|----------|------|
| `TEST001` | Komplett data | Validering av alle nye felter |
| `PARTIAL01` | Partiell data | Håndtering av manglende felter |
| `DATED01` | ISO dato-format | Dato-parsing validering |
| `NOTFOUND` | 404 respons | Feilhåndtering - ukjent regnr |
| `SVVDOWN` | 503 respons | Feilhåndtering - tjeneste nede |
| `BADDATE` | Ugyldig dato | Robust parsing av feilaktige data |

---

## Test-Scenarier

### 1. Parsing av Nye Felter

#### TC-P001: Komplett Kjøretøydata
**Mål:** Verifisere at alle nye felter parses korrekt

**Input (SVV respons):**
```json
{
  "kjoretoydataListe": [{
    "kjoretoyId": { "understellsnummer": "WVWZZZAAZJD123456" },
    "forstegangsregistrering": { "registrertForstegangNorgeDato": "2018-05-15" },
    "godkjenning": {
      "tekniskGodkjenning": {
        "tekniskeData": {
          "generelt": {
            "merke": [{ "merke": "Volkswagen" }],
            "handelsbetegnelse": ["Golf"],
            "typebetegnelse": "5-door hatchback"
          },
          "dimensjoner": { "lengde": 4586 },
          "motorOgDrivverk": {
            "motor": [{
              "drivstoff": [{ "drivstoffKode": { "kodeVerdi": "D" } }],
              "motorKode": "CRBC"
            }]
          },
          "persontall": { "sitteplasserTotalt": 5 },
          "vekter": { "tillattTotalvekt": 1950 }
        }
      }
    },
    "farge": "SVART",
    "drivstoff": { "drivstofftype": "Diesel" },
    "euKlasse": { "kode": 1 },
    "periodiskKjoretoyKontroll": { "nesteKontrollDato": "2025-05-15" },
    "registrering": { "registreringsstatus": "REGISTRERT" },
    "kjoretoykategori": "M1",
    "sitteplasser": { "totalt": 5 }
  }]
}
```

**Forventet Output:**
```json
{
  "color": "SVART",
  "fuelType": "Diesel",
  "euroClass": 1,
  "nextEUDate": "2025-05-15",
  "registrationStatus": "REGISTRERT",
  "vehicleClass": "M1",
  "seatCount": 5
}
```

**Validering:**
- [ ] `color` er string og ikke tom
- [ ] `fuelType` er string og ikke tom
- [ ] `euroClass` er number og > 0
- [ ] `nextEUDate` er i format `YYYY-MM-DD`
- [ ] `registrationStatus` er string og ikke tom
- [ ] `vehicleClass` er string og ikke tom
- [ ] `seatCount` er number og > 0

---

#### TC-P002: Manglende Felter
**Mål:** Verifisere at parser håndterer manglende felter gracefully

**Input (SVV respons med delvis data):**
```json
{
  "kjoretoydataListe": [{
    "kjoretoyId": { "understellsnummer": "TEST1234567890123" },
    "forstegangsregistrering": { "registrertForstegangNorgeDato": "2020-01-01" },
    "godkjenning": {
      "tekniskGodkjenning": {
        "tekniskeData": {
          "generelt": {
            "merke": [{ "merke": "Toyota" }],
            "handelsbetegnelse": ["Corolla"],
            "typebetegnelse": "Sedan"
          }
        }
      }
    }
    // Mangler: farge, drivstoff, euKlasse, etc.
  }]
}
```

**Forventet Output:**
```json
{
  "color": undefined,
  "fuelType": undefined,
  "euroClass": undefined,
  "nextEUDate": undefined,
  "registrationStatus": undefined,
  "vehicleClass": undefined,
  "seatCount": undefined
}
```

**Validering:**
- [ ] Ingen krasj ved manglende felter
- [ ] Manglende felter er `undefined` (ikke `null` med mindre spesifisert)
- [ ] Eksisterende felter parses korrekt

---

#### TC-P003: ISO Dato-Format
**Mål:** Verifisere at datoer parses til korrekt ISO format

**Input (varierende dato-formater):**
```json
{
  "periodiskKjoretoyKontroll": {
    "nesteKontrollDato": "2024-12-31T00:00:00.000Z"
  }
}
```

**Forventet Output:**
```json
{
  "nextEUDate": "2024-12-31"
}
```

**Validering:**
- [ ] ISO timestamp parses til `YYYY-MM-DD`
- [ ] Norsk dato-format parses korrekt (hvis aktuelt)
- [ ] Ugyldige datoer håndteres (se TC-E003)

---

### 2. Bakoverkompatibilitet

#### TC-B001: Eksisterende Integrasjon
**Mål:** Verifisere at gamle felter fortsatt fungerer

**Input:** Samme som før utvidelse

**Forventet Output:**
```json
{
  "regno": "...",
  "vin": "...",
  "make": "...",
  "model": "...",
  "year": 2020,
  "k_type": 0,
  "typeCode": "...",
  "length": 4500,
  "fuelCode": "D",
  "engineCode": "...",
  "seats": 5,
  "gvwr": 2000
}
```

**Validering:**
- [ ] `make` er uppercase
- [ ] `model` er uppercase
- [ ] `year` er number fra første del av dato
- [ ] `k_type` er 0 (hvis ikke tilgjengelig)
- [ ] Alle eksisterende felter returneres

---

### 3. Feilhåndtering

#### TC-E001: 404 - Ukjent Registreringsnummer
**Mål:** Verifisere håndtering av ukjent regnr

**Input:** `regnr = "NOTFOUND"`

**SVV Respons:** HTTP 404

**Forventet Output:**
```json
{
  "status": "not_found",
  "httpStatus": 404
}
```

**Validering:**
- [ ] Returnerer status `not_found`
- [ ] HTTP status er 404
- [ ] Ingen krasj

---

#### TC-E002: 503 - SVV Tjeneste Nede
**Mål:** Verifisere håndtering av tjeneste-utilgjengelighet

**Input:** `regnr = "SVVDOWN"` (simulert)

**SVV Respons:** HTTP 503

**Forventet Output:**
```json
{
  "status": "upstream_error",
  "httpStatus": 503
}
```

**Validering:**
- [ ] Returnerer status `upstream_error`
- [ ] HTTP status er 503
- [ ] Ingen uendelig venting (timeout håndtering)

---

#### TC-E003: Ugyldig Dato-Format
**Mål:** Verifisere robust parsing ved ugyldig data

**Input:**
```json
{
  "forstegangsregistrering": { "registrertForstegangNorgeDato": "invalid-date" },
  "periodiskKjoretoyKontroll": { "nesteKontrollDato": "not-a-date" }
}
```

**Forventet Output:**
```json
{
  "year": 0,
  "nextEUDate": undefined
}
```

**Validering:**
- [ ] Parser krasjer ikke
- [ ] `year` settes til 0 ved ugyldig dato
- [ ] `nextEUDate` er `undefined` ved ugyldig dato
- [ ] Andre felter parses korrekt

---

## Kjøring av Tester

### Lokalt (Mock Mode)
```bash
node scripts/test-svv-parsing.mjs --mock
```

### Mot Worker Endepunkt
```bash
# Standard (produksjon)
node scripts/test-svv-parsing.mjs

# Spesifikk base URL
node scripts/test-svv-parsing.mjs --base=https://autoglass-glass-sok.autoglassnorge.workers.dev

# Enkelt regnr
node scripts/test-svv-parsing.mjs --regnr=EB21570
```

---

## Rapport-Format

Test-scriptet genererer en JSON-rapport med følgende struktur:

```json
{
  "timestamp": "2025-05-31T12:00:00Z",
  "baseUrl": "https://...",
  "mode": "mock|live",
  "summary": {
    "total": 7,
    "passed": 7,
    "failed": 0,
    "skipped": 0
  },
  "categories": {
    "parsing": { "total": 3, "passed": 3, "failed": 0 },
    "backward-compat": { "total": 1, "passed": 1, "failed": 0 },
    "error-handling": { "total": 3, "passed": 3, "failed": 0 }
  },
  "tests": [...],
  "validation": {
    "color": "PASS",
    "fuelType": "PASS",
    "euroClass": "PASS",
    "nextEUDate": "PASS",
    "registrationStatus": "PASS",
    "vehicleClass": "PASS",
    "seatCount": "PASS",
    "backwardCompat": "PASS",
    "errorHandling": "PASS"
  }
}
```

---

## CI/CD Integrasjon

Legg til i GitHub Actions workflow:

```yaml
- name: Run SVV Parser Tests
  run: node scripts/test-svv-parsing.mjs --mock
  
- name: Upload Test Report
  uses: actions/upload-artifact@v3
  with:
    name: svv-test-report
    path: test-reports/svv-parser-test-*.json
```

---

## Vedlikehold

| Versjon | Dato | Endringer |
|---------|------|-----------|
| 1.0 | 2025-05-31 | Initial version |

---

**Merk:** Test-casene i dette dokumentet er basert på dokumentert SVV API struktur. Faktisk API-respons kan variere - juster mock-data ved behov.
