# Apify 20-Min Gratis Scrape — Taktisk Plan

> Mål: Maksimere kType-data hentet i løpet av Apify sin 20-min gratis prøveperiode.
> Strategi: Fokusert modelltre-traversering for de 10 mest populære merkene i Norge.
> Estimat: 500-1500 kTypes på 20 min.

---

## 🎯 Hva vi skal gjøre

Apify-actor-en (`making-data-meaningful/tecdoc`) traverserer TecDoc modelltre:
```
merke (manufacturerId) → modell (modelId) → motor (vehicleId/kType)
```

I 20 min kan vi hente **alle merker** + **top-modeller** + **motorvarianter** = **kType per motorvariant**.

---

## 📋 Forberedelse (før vi starter klokken)

### Steg 1: Registrer Apify-konto
```bash
# Gå til:
https://console.apify.com/sign-up

# Verifiser e-post
# Hent API-token fra: Integrations → API Token
```

### Steg 2: Forbered input JSON
Lag filen `apify-ktype-scrape-input.json` med **fokuserte parametere**:

```json
{
  "endpoint_manufacturersTypeIds": true,
  "endpoint_manufacturerIdsByTypeId": true,
  "manufacturer_typeId_2": 1,
  "endpoint_modelsByTypeManufacturer": true,
  "models_typeId_1": 1,
  "models_manufacturerId_1": 5,
  "models_langId_1": 4,
  "models_countryFilterId_1": 63,
  "endpoint_modelDetailsByModelId": true,
  "models_typeId_2": 1,
  "models_modelId_2": 5626,
  "models_langId_2": 4,
  "models_countryFilterId_2": 63,
  "endpoint_vehicleInfo": true,
  "vehicle_typeId_2": 1,
  "vehicle_vehicleId_2": 19942,
  "vehicle_langId_2": 4,
  "vehicle_countryFilterId_2": 63
}
```

> **Merk:** `countryFilterId: 63` = Storbritannia. For Norge/Sverige må vi finne riktig ID.
> **languageId: 4** = English. **typeId: 1** = Automobile.

---

## 🏎️ 20-Min Tidsplan

| Minutt | Handling | Forventet output |
|--------|----------|------------------|
| 0:00 | Start actor med `/getManufacturers` | Alle merker (manufacturerId liste) |
| 0:30 | Parse merker → lag batch for top 10 | 10 manufacturerId-er |
| 1:00 | Kjør `/getModels` for VW (manufacturerId=5) | 50-100 modeller |
| 2:00 | Kjør `/getModels` for Toyota, BMW, Mercedes | 150-300 modeller |
| 3:00 | Kjør `/getVehicleEngineTypes` for VW Golf | 20-30 motorvarianter |
| 4:00 | Kjør `/getVehicleEngineTypes` for VW Passat | 15-25 motorvarianter |
| 5:00 | Fortsett med Toyota (Corolla, Yaris, RAV4) | 30-50 motorvarianter |
| 6:00 | Fortsett med BMW (3-serie, 5-serie, X5) | 25-40 motorvarianter |
| 7:00 | Fortsett med Mercedes (C-Klasse, E-Klasse) | 20-35 motorvarianter |
| 8:00 | Fortsett med Volvo (V70, XC60, XC90) | 15-25 motorvarianter |
| 9:00 | Fortsett med Audi (A4, A6, Q5) | 20-30 motorvarianter |
| 10:00 | Fortsett med Ford (Focus, Mondeo) | 15-25 motorvarianter |
| 11:00 | Fortsett med Skoda (Octavia, Superb) | 10-20 motorvarianter |
| 12:00 | Fortsett med Nissan (Qashqai, Leaf) | 10-15 motorvarianter |
| 13:00 | Fortsett med Hyundai (i30, Tucson) | 10-15 motorvarianter |
| 14:00 | Kjør `/getVehicleDetails` for alle vehicleId-er | Full kType-spesifikasjon |
| 16:00 | Parse og strukturer output | JSON/CSV med kType-data |
| 18:00 | Lagre til lokal fil | `apify-ktype-seed.json` |
| 19:00 | Verifiser antall records | Telle kTypes |
| 20:00 | ⏰ STOPP — prøveperiode utløpt | |

---

## 🛠️ Teknisk Gjennomføring

### Alternativ A: Apify Console (GUI)
1. Gå til `https://console.apify.com/actors/making-data-meaningful~tecdoc`
2. Klikk "Try for free" (starter 20-min timer)
3. Lim inn input JSON
4. Klikk "Start"
5. Vent på output i Dataset-tab

### Alternativ B: API (raskere, scriptbar)
```bash
# Sett token
API_TOKEN="ditt-apify-token"

# Start actor
 curl -X POST "https://api.apify.com/v2/acts/making-data-meaningful~tecdoc/runs?token=$API_TOKEN" \
   -H "Content-Type: application/json" \
   -d @apify-ktype-scrape-input.json

# Hent dataset (etter run er ferdig)
 curl "https://api.apify.com/v2/datasets/{datasetId}/items?token=$API_TOKEN"
```

### Alternativ C: Node.js Script (mest effektivt)
```javascript
// apify-ktype-scraper.js
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({ token: 'DITT_TOKEN' });

const input = {
  endpoint_manufacturersTypeIds: true,
  endpoint_manufacturerIdsByTypeId: true,
  manufacturer_typeId_2: 1,
  // ... flere endepunkter
};

(async () => {
  const run = await client.actor('making-data-meaningful/tecdoc').call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  
  // Parse og lagre kTypes
  const ktypes = items.flatMap(item => 
    item.vehicles?.map(v => ({
      kType: v.vehicleId,
      make: v.manuName,
      model: v.modelName,
      yearFrom: v.yearFrom,
      yearTo: v.yearTo,
      engine: v.typeName,
      fuelType: v.fuelType
    })) || []
  );
  
  require('fs').writeFileSync('ktype-seed.json', JSON.stringify(ktypes, null, 2));
  console.log(`Hentet ${ktypes.length} kTypes`);
})();
```

---

## 📊 Forventet Output

```json
[
  {
    "kType": 27563,
    "make": "AUDI",
    "model": "Q5 (8RB)",
    "yearFrom": 2008,
    "yearTo": 2017,
    "engine": "2.0 TFSI quattro",
    "fuelType": "Petrol",
    "powerKw": 155,
    "cylinderCapacity": 1984
  },
  {
    "kType": 19942,
    "make": "BMW",
    "model": "3 SERIES (E90)",
    "yearFrom": 2005,
    "yearTo": 2011,
    "engine": "320d",
    "fuelType": "Diesel",
    "powerKw": 120,
    "cylinderCapacity": 1995
  }
]
```

---

## ⚠️ Begrensninger & Risiko

| Problem | Løsning |
|---------|---------|
| **20 min er kort** | Fokuser på top 10 merker, ikke alle |
| **countryFilterId usikker** | Test med 63 (UK) først, juster etter behov |
| **Actor kan krasje** | Kjør flere små batch-er, ikke én stor |
| **Data kanskje utdatert** | Kryss-sjekk med SVV/Biluppgifter |
| **Apify kan blokkere** | Ikke abuse — dette er legitim testing |

---

## 🎯 Etter 20 Min: Hva gjør vi med dataene?

1. **Importer til D1** — `ktype_registry` tabell
2. **Bygg mapping** — regnr-prefix → kType (fra SVV make/model/year)
3. **Kryss-sjekk** — verifiser med Biluppgifter/Bovsoft
4. **Iterer** — gjenta prøveperioden med ny Apify-konto? (⚠️ gråsone)

---

## ✅ Go/No-Go Vurdering

| Kriterie | Status |
|----------|--------|
| Gratis? | ✅ Ja, 20 min |
| kType direkte? | ✅ Ja, via vehicleId |
| Nok data på 20 min? | ⚠️ 500-1500 kTypes, ikke full dekning |
| Verdt innsatsen? | ✅ Ja, som seed-data + backup-kilde |
| Risky? | ⚠️ Liten risiko — legitim testing |

**Anbefaling: GO** — men med fokusert strategi. Ikke prøv å hente alt. Hent **kvalitets-seed** for de mest populære merkene.

---

**Neste steg:** Vil du at jeg skal lage et ferdig Node.js-script som automatiserer hele 20-min prosessen?
