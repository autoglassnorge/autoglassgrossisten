# Sekurit Service API - Utforskningsguide

## Hvordan finne API-endepunkter

### Metode 1: DevTools (enklest)

1. **Logg inn** på https://www.sekurit-service.com/nb-no
   - Bruker: `post@alfa-glass.no`
   - Passord: `Surpomp(24)`

2. **Åpne DevTools**
   - Windows/Linux: `F12` eller `Ctrl+Shift+I`
   - Mac: `Cmd+Option+I`

3. **Gå til Network-tab**
   - Klikk på "Network" eller "Nettverk"
   - Kryss av for "Preserve log" eller "Behold logg"

4. **Utfør handlinger**
   - Søk etter et bilmerke (f.eks. "Volkswagen")
   - Velg en modell
   - Velg et år
   - Se etter glass

5. **Se etter API-kall**
   - Se etter rader med Type "xhr" eller "fetch"
   - Se etter URL-er som inneholder `/api/`, `/rest/`, `/services/`
   - Klikk på et kall for å se detaljer

6. **Kopier viktig info**
   - Request URL (full URL)
   - Request Headers (spesielt Cookie, Authorization)
   - Response (JSON-struktur)

### Metode 2: cURL (avansert)

Etter å ha funnet API-kall i DevTools:

1. Høyreklikk på nettverkskallet
2. Velg "Copy" → "Copy as cURL"
3. Lim inn i terminalen
4. Test med forskjellige parametere

### Vanlige API-patterns

Sekurit (Saint-Gobain) bruker ofte:

```
/rest/v2/products/search
/api/products?vin=XXX
/api/vehicles/{id}/glasses
/api/catalog/brands
/api/catalog/models?brand=XXX
```

## Hva vi leter etter

### 1. Produktsøk
```json
{
  "products": [
    {
      "code": "EU-12345",
      "description": "Frontrute VW Golf",
      "price": 2490.00,
      "currency": "NOK",
      "inStock": true
    }
  ]
}
```

### 2. Katalog-struktur
```json
{
  "brands": ["VW", "BMW", "Audi"],
  "models": {
    "VW": ["Golf", "Polo", "Passat"]
  },
  "years": {
    "Golf": [2019, 2020, 2021]
  }
}
```

### 3. VIN-oppslag
```json
{
  "vehicle": {
    "vin": "WVWZZZ...",
    "make": "Volkswagen",
    "model": "Golf",
    "year": 2020
  },
  "compatibleGlasses": [...]
}
```

## Sikkerhet

⚠️ **VIKTIG:**
- Del ALDRI passord eller session cookies offentlig
- Auth-tokens utløper etter en stund (normalt)
- Lagre tokens sikkert (f.eks. i miljøvariabler)

## Neste steg

Når du har funnet API-endepunkter:

1. Kopier eksempel-respons (JSON)
2. Noter URL-pattern
3. Se etter autentisering (token/cookie)
4. Gi meg infoen så bygger jeg integrasjonen
