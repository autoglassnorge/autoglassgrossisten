# ADR: kType-space mismatch mellom TecDoc 1Q2019 og Bovsoft/SVV-resolver

**Dato:** 2026-06-17  
**Status:** Avslått / Rollback fullført  
**Beslutning:** Ikke bruk TecDoc 1Q2019-dumpen (`data/tecdoc-import/`) til å berike `glass_catalog.ktype` for produkter som skal matches mot kjøretøy fra `vin_ktype_map` / `glass_rules` / Bovsoft.

## Bakgrunn

- `vin_ktype_map` dekker 20 556 av 20 630 unike VIN-er (99,64 %).
- `glass_catalog.ktype` var bare ~4 % populert.
- Hypotesen var: bruk eksisterende TecDoc 1Q2019-dump (`tecdoc-ktype-mapping.json`, 69 871 kjøretøy) til å matche produkter mot kType og dermed øke dekningen.

## Hva ble gjort

1. Kjørte `scripts/match-v16-final.mjs` mot gjeldende `catalog-prod.json` (27 184 produkter).
2. Filtrerte resultater: behold score ≥ 0,7, eller score 0,4–0,7 og kType bekreftet i `vin_ktype_map`.
3. Genererte validated SQL:
   - `glass-catalog-updates-v16-validated.sql` (20 061 UPDATEs)
   - `ktype-registry-inserts-v16-validated.sql` (1 075 INSERTs)
4. Deployet til produksjon D1.
   - `glass_catalog` gikk fra 1 099 til 20 564 produkter med `ktype` (75,8 %).
5. Oppdaget kollisjon under verifisering og rullet tilbake.

## Kritisk funn: kType-nummer er IKKE universelle

Ved verifisering viste det seg at samme kType-nummer betyr forskjellige kjøretøy i TecDoc 1Q2019 og i dataene fra Bovsoft/SVV-TecDoc:

| kType | `vin_ktype_map` (Bovsoft/SVV) | TecDoc 1Q2019 |
|---|---|---|
| 17370 | VW Transporter 2005 | Renault Master I Platform/Chassis 1989–1993 |
| 31321 | Audi A5 2009 | Nissan Armada (TA60) 2006–2015 |
| 37838 | VW ID.4 / ID.3 2021 | VW Amarok 2010– |
| 29352 | Kia EV6 2026 | Kia Bongo Bus 2003– |
| 43077 | Audi Q4 Sportback 2025 | Audi A3 (8V1, 8VK) 2016– |

Noen få kType-nummer matcher tilfeldigvis (f.eks. Peugeot 3008, Porsche Panamera), men systemet er ikke konsistent.

## Konsekvens

- Produkter beriket med TecDoc-kType ville **aldri** treffes av `queryByKtype()` for kjøretøy som resolves via `vin_ktype_map` / `glass_rules` / Bovsoft, fordi disse kjøretøyene har **andre kType-nummer**.
- Resultatet ville vært en falsk følelse av dekning: 76 % av produktene har kType, men kundene får fortsatt brand/model/year-fallback.
- I verste fall kunne vi fått feil produkt-treff hvis samme kType-nummer pekte på et helt annet kjøretøy.

## Handlinger tatt

- Rullet tilbake `glass_catalog.ktype` til original tilstand (1 099 produkter).
- Fjernet `ktype_registry`-entries fra V16-validated.
- Gjenopprettet `catalog-prod.json` og `catalog-prod.min.json` fra sikkerhetskopi.
- API og frontend fungerer som før rollback.

## Implikasjoner for prosjektet

1. **TecDoc 1Q2019-dumpen kan ikke brukes til produkt→kType-mapping** så lenge kjøretøy-resolusjonen baserer seg på Bovsoft/SVV-kType-space.
2. **For å få produktmatching på kType trenger vi enten:**
   - En kType-mapping som er i **samme space** som Bovsoft/SVV-resolveren, eller
   - Å migrere kjøretøy-resolusjonen til TecDoc-space (svært usikkert, store datamengder), eller
   - Å bruke article-level data fra leverandøren (eurocode/SKU → kType) i samme space som Bovsoft.
3. **Bovsoft / TecAlliance bør vurderes** som kilde for produkt→kType-mapping, ikke bare kjøretøy→kType.

## Anbefaling

Prioriter en av følgende:

1. **Article-level mapping fra Bovsoft / betalt TecDoc API**: Spør Bovsoft om det finnes en datafil med article_number/eurocode → kType i deres kType-space.
2. **Statistisk læring fra klikk/ordre**: Når kunder velger riktig produkt for et regnr, lagre `ktype → eurocode` i `ktype_matches` og bygg opp mapping over tid.
3. **Akseptere brand/model/year-matching**: Fortsett med dagens løsning, men forbedre scoring/normalisering for å redusere feilvalg.

## Vedlegg

- Backup: `data/d1-glass-catalog-backup-pre-ktype.sql`
- Rollback-SQL: `data/tecdoc-import/glass-catalog-rollback-to-original.sql`
- V16-matching-rapport: `data/tecdoc-import/matching-report-v16.json`
- Valideringsrapport: `data/tecdoc-import/validation-report-v16.json`
