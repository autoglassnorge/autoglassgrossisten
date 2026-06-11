# Task 8: Bovsoft Strategic Batch — ✅ FULLFØRT

**Dato:** 2026-06-09  
**Utført av:** glass-orchestrator (Kimi CLI)  
**Credits brukt:** ~140 av ~182 tilgjengelige  

---

## Sammendrag

Bovsoft strategic batch ble kjørt på 253 strategiske kandidater fra datasettet.  
**137 treff** (54% hit-rate). **37** av disse oppgraderte confidence fra `high` → `exact`.

### D1-endelige tall etter strategic batch

| Confidence | Count | Endring |
|------------|-------|---------|
| exact | **1,753** | +37 |
| high | **488** | -37 |
| none | **13** | — |
| **exact+high** | **2,241** | **99.4%** |

---

## Fordeling etter familie (137 treff)

| Familie | Tier | Treff | Katalog-dekning |
|---------|------|-------|-----------------|
| BMW 5/X5 | 3 | 58 | ~2% |
| Volvo XC60/XC90 | 3 | 29 | ~3% |
| Mercedes E/GLE | 3 | 20 | ~5% |
| Audi A6/A7/Q5 | 3 | 11 | ~9% |
| Mercedes Vito/V-klasse | 1 | 8 | ~25% |
| VW Transporter | 1 | 4 | ~0% |
| Toyota HiAce/ProAce | 1 | 2 | ~50% |
| Ford Transit/Custom | 2 | 2 | ~0% |
| Citroën Jumpy | 2 | 2 | ~0% |
| Peugeot Expert | 2 | 1 | ~0% |

---

## Kritiske funn: Data-gap

**135 av 137** Bovsoft-strategic treff har **ktype som ikke finnes i glass_catalog**.

### Topp 10 data-gaps (etter volum)

| kType | Merke/Modell | Regnr-eksempel |
|-------|--------------|----------------|
| 136374 | BMW X1 (F48) | LS95041, LY87463 |
| 144687 | BMW iX (I20) | EE16336, EE76819 |
| 28229 | VOLVO XC60 (156) | SV18739 |
| 140891 | MERCEDES-BENZ GLC (X253) | CH14359, NH14106 |
| 136994 | VOLVO XC90 II (256) | BT96188 |
| 144689 | BMW i4 (G26) | EE21690, EF36386 |
| 133260 | BMW X5 (G05, F95) | DS11649 |
| 108622 | BMW X5 (F15, F85) | BT62631 |
| 801154 | BMW 5 Touring (G61, G99) | EN23464 |
| 27564 | AUDI Q5 (8RB) | UF46003, SU96368 |

---

## Konklusjon

### Hva fungerte
- Bovsoft API ga 137 kvalifiserte kType-treff på strategiske modeller
- Layer 0.5 i Worker bruker nå svv_tecdoc_matches for direkte lookup
- 37 regnr ble oppgradert fra `high` → `exact`

### Hva mangler
- **Katalogdekning for moderne/modell-spesifikke ktyper er kritisk lav**
- BMW iX, i4, X1 (F48), Mercedes GLC, Volvo XC90 II — alle mangler i glass_catalog
- Dette er primært **nyere kjøretøy (2020+)** og **elektriske modeller**

### Anbefaling
1. **Prioritet 1:** Importér TecDoc-data for ktype-familiene som mangler
2. **Prioritet 2:** Utvider glass_catalog med moderne premium-modeller
3. **Alternativ:** Implementér kType Family-matching (Layer 2) som fallback når exact ktype ikke finnes i katalogen

---

## Fil-output

- `.kimi/mempalace/bovsoft-strategic-updates.sql` — 137 UPDATEs (deployet til D1)
- `.kimi/mempalace/bovsoft-strategic-results.json` — 137 rå treff
- `.kimi/mempalace/bovsoft-strategic-candidates.json` — 253 kandidater
- `.kimi/mempalace/kg-append.jsonl` — KG-facts lagt til
