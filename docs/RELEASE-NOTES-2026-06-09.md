# Release Notes — 9. juni 2026
## Normaliserings-audit v2: 14 feil funnet og fikset

### Hva er nytt for kunden
- **Bedre treff på Volvo** (XC60, XC90, S80, V70, C30, 740/760/780): SVV sendte "XC60", D1 hadde "XC 60". Nå matches begge varianter.
- **Bedre treff på Mercedes** (C-Klasse, E-Klasse, S-Klasse, GLE, GLC, G-Klasse, CLK, CLS, SL, SLK): Klasse-navn fra SVV matches nå med W-koder og interne betegnelser i D1.
- **Bedre treff på VW varebiler** (Transporter/Multivan/Caravelle/California): T4/T5/T6 generasjonsfilteret er nå strengere — man får ikke lenger T5-glass for en T6-bil.
- **Bedre treff på amerikanske biler** (Chevrolet, Ford, Jeep, GMC, Dodge, Cadillac, Hummer): Disse lå under "USA CARS" i D1 og ble ikke funnet før.
- **Bedre treff på nyttekjøretøy** (Nissan, Fiat, Renault, Mitsubishi, Mazda varebiler/lastebiler): TRUCKS-aliaser manglet og ga null treff.
- **Bedre treff på modeller med bindestrek/mellomrom** (Mazda CX-5, Honda CR-V, Toyota Hi-Lux, Tesla Model 3, Ford F-150, osv.): SQL-søket prøver nå 6 varianter av hvert modellnavn.

### Tall
- **14 feil** identifisert og fikset
- **68 enhetstester** lagt til, alle grønne
- **~2 500+ produkter** får nå riktigere eller høyere-confidence treff
- **0 regression-feil** på eksisterende regnr

### Deploy
- **Versjon:** `04abe77e-602d-486e-89f1-2724d1e0a16d`
- **Dato:** 9. juni 2026, 02:20 UTC
- **Status:** Produksjon

### Neste steg (prioritert)
1. Konsolidere `MODEL_ALIASES` fra `tecdoc-resolver.ts` inn i hovedsøket (ikke isolert i TecDoc-resolver)
2. Videreføre audit-regimet: månedlig scan av nye merker/modeller i D1
3. Bruke denne normaliseringsjobben som grunnmur før nye datakilder (TecAlliance IDP, Bovsoft v2) kobles på
