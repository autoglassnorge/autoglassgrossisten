# API-dokumentasjon — Autoglass Glass Søk

**Base URL:** `https://autoglass-glass-sok.autoglassnorge.workers.dev`

---

## Endepunkter

### `GET /api/health`

Health check + systemstatus.

**Respons:**
```json
{
  "status": "ok",
  "catalogSize": 37581,
  "d1Configured": false,
  "d1Size": 0,
  "svvConfigured": true,
  "biluppgifterConfigured": false,
  "timestamp": "2026-05-18T17:00:33.766Z"
}
```

---

### `GET /api/glass?regnr={regnr}`

Søk etter bilglass basert på registreringsnummer.

**Parametere:**
| Parameter | Type | Påkrevd | Beskrivelse |
|-----------|------|---------|-------------|
| `regnr` | string | ja | Norsk/Svensk regnr (f.eks. `SU18018`) |
| `type` | string | nei | Filtrer på kategori (`frontrute`, `siderute`, etc.) |
| `source` | string | nei | `auto` (default), `kv`, `d1` |

**Respons:**
```json
{
  "vehicle": {
    "regnr": "SU18018",
    "vin": "YV1...",
    "make": "VOLVO",
    "model": "V90",
    "year": 2020,
    "kType": "12345"
  },
  "candidates": [
    {
      "eurocode": "8579AGNMVZ",
      "category": "frontrute",
      "supplier": "Pilkington",
      "brand": "VOLVO",
      "model": "V90",
      "yearFrom": 2016,
      "yearTo": 2025,
      "adas": true,
      "rainSensor": false,
      "heated": true,
      "price": 4500,
      "stockStatus": 12,
      "prefix4": "8579",
      "description": "VOLVO V90 2016; WS GN ACO"
    }
  ],
  "confidence": "high",
  "layer": 1,
  "prefix4": "8579",
  "flags": { "adas": true, "rainSensor": false, "heated": true, ... },
  "sources": ["svv.enkeltoppslag"]
}
```

---

### `GET /api/glass?prefix4={prefix4}`

Direkte oppslag på prefix4 (første 4 siffer av eurocode).

**Respons:**
```json
{
  "query": { "prefix4": "5351", "eurocode": null },
  "count": 48,
  "results": [...]
}
```

---

### `GET /api/glass?eurocode={eurocode}`

Direkte oppslag på eurocode.

**Respons:** Samme som prefix4-oppslag.

---

## Feilresponser

| Status | Betydning |
|--------|-----------|
| `400` | Manglende parameter |
| `404` | Ukjent endepunkt |
| `500` | Intern feil |

```json
{ "error": "Kunne ikke slå opp registreringsnummer", "regnr": "AB12345" }
```

---

## CORS

API-et tillater forespørsler fra:
- `https://auto-glass.no`
- `https://autoglass-frontend.pages.dev`
- `http://localhost:*` (utvikling)
