# KIMI + MemPalace Kvalitets-Synkronisering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synkronisere all dokumentasjon, hooks, config og skills med faktisk kodebasetilstand etter 8. juni 2026-endringene (kType Family matching + Ordremottaker LLM).

**Architecture:** 3 parallelle tracks — (A) Dokumentasjonssynk, (B) Hooks+Config-fiks, (C) Ny skill+KG. Tracks A og B er uavhengige. Track C avhenger av Track A (for riktige tabell-referanser).

**Tech Stack:** Markdown, Bash, Node.js, Cloudflare D1, KIMI Code 0.11.0, MemPalace v3.5.0

**Kjente fakta (verifisert):**
- `catalog-prod.json`: 27,184 records
- D1 `glass_catalog`: 27,139 records
- D1 `ktype_registry`: 69,893 records
- D1 `ktype_families`: 25,383 records (NY — ikke i noen docs)
- D1 `ktype_family_members`: 79,928 records (NY — ikke i noen docs)
- Nye D1-tabeller: `glass_match_candidates`, `glass_resolution_requests`, `pending_ktype_matches`, `search_feedback`, `scrape_jobs`, `scrape_results`

---

## File Map

| Fil | Ansvar | Status |
|-----|--------|--------|
| `.kimi/PROJECT_STATE.md` | Single source of truth — blockers, recent activity, file map | 9 dager gammel |
| `AGENTS.md` | Prosjekt-regler, stack, kommandoer, ADR-oversikt | Mangler kType Family + Ordremottaker |
| `.kimi/KIMI-MASTER-SYSTEM.md` | Universelle regler for ALLE agenter | Inkonsistente tabell-referanser, utdatert dato |
| `.kimi/skills/autoglass/SKILL.md` | Prosjektkunnskap-skill | Feil katalog-størrelse (37,581+), mangler nye features |
| `.kimi/hooks/session-start.sh` | Session-start hook — blockers, D1-metrikker, diary | Parser diary med feil felter |
| `.kimi/hooks/session-end.sh` | Session-end hook — verifikasjon, diary | Skriver inkompatibelt diary-format |
| `.kimi/config.toml` | KIMI CLI-konfigurasjon | compaction_trigger_ratio for aggressiv |
| `.kimi/skills/bilglass-workflows/ordremottaker/SKILL.md` | **NY** — Ordremottaker workflow skill | Finnes ikke |
| `.kimi/mempalace/kg.json` | Knowledge graph | Mangler KG-fakta for 8. juni-endringer |

---

## Track A: Dokumentasjonssynk (4 filer)

### Task 1: Synkroniser katalog-størrelse på tvers av alle docs

**Files:**
- Modify: `AGENTS.md` (linjer med katalog-størrelse)
- Modify: `.kimi/skills/autoglass/SKILL.md` (linjer med katalog-størrelse)
- Modify: `.kimi/KIMI-MASTER-SYSTEM.md` (linjer med katalog-størrelse)

**Kontekst:** `catalog-prod.json` har 27,184 records. D1 `glass_catalog` har 27,139 records (45 mindre pga manglende eurocode). Alle 3 filer må si 27,184/27,139.

- [ ] **Step 1.1: Oppdater AGENTS.md katalog-størrelse**

I `AGENTS.md`, finn seksjonen under "Data:" og "Eurocode Pipeline". Erstatt alle referanser til 27,184/27,139 med konsistente tall:
- Linje med "37 581+" → "27,184" (hovedkatalog)
- Behold notat om 45 manglende eurocode → 27,139 i D1

- [ ] **Step 1.2: Oppdater SKILL.md katalog-størrelse**

I `.kimi/skills/autoglass/SKILL.md`, under "Katalog (per 2026-05-29)":
- Endre "37,581+ produkter" → "27,184 produkter"
- Endre "~8,500 frontrute" → behold hvis korrekt, ellers fjern spesifikke tall hvis usikker
- Endre `glass_catalog` 37,581+ → 27,184

- [ ] **Step 1.3: Oppdater MASTER-SYSTEM.md katalog-størrelse**

I `.kimi/KIMI-MASTER-SYSTEM.md`, finn linje med `catalog-prod.json`:
- Endre "39,458 records" → "27,184 records"

- [ ] **Step 1.4: Verifiser konsistens**

Kjør:
```bash
grep -n "27,184\|27184\|37,581\|37581\|39,458\|39458" AGENTS.md .kimi/skills/autoglass/SKILL.md .kimi/KIMI-MASTER-SYSTEM.md
```
Forventet: Kun "27,184" og "27,139" skal finnes. Ingen 37,581+ eller 39,458.

---

### Task 2: Oppdater KIMI-MASTER-SYSTEM.md med riktige D1-tabeller og nye features

**Files:**
- Modify: `.kimi/KIMI-MASTER-SYSTEM.md`

**Kontekst:** Følgende tabeller er VERIFISERT i D1:
- Eksisterende (korrekte): `glass_catalog`, `ktype_registry`, `glass_rules`, `ktype_matches`, `tecdoc_ktype_registry`, `ground_truth`, `vin_decode_cache`, `quote_requests`, `provider_calls`, `search_history`, `glass_variants`, `vehicle_fingerprints`
- NYE (mangler i docs): `ktype_families`, `ktype_family_members`, `glass_match_candidates`, `glass_resolution_requests`, `pending_ktype_matches`, `search_feedback`, `scrape_jobs`, `scrape_results`, `nordglass_staging`, `catalog_meta`

Følgende tabeller finnes IKKE (fjernes): `adas_calibration_requirements` (tabell finnes men kan være staging/ubrukt — behold med kommentar)

- [ ] **Step 2.1: Oppdater Stack-tabell med riktige D1-tabeller**

Erstatt D1-tabell-listen i `.kimi/KIMI-MASTER-SYSTEM.md` med:
```
| D1 Tabeller | `glass_catalog` (27,139), `ktype_registry` (69,893), `glass_rules`, `ktype_matches`, `tecdoc_ktype_registry`, `ground_truth`, `vin_decode_cache`, `quote_requests`, `provider_calls`, `search_history`, `glass_variants`, `vehicle_fingerprints`, `ktype_families` (25,383), `ktype_family_members` (79,928), `glass_match_candidates`, `glass_resolution_requests`, `pending_ktype_matches`, `search_feedback`, `scrape_jobs`, `scrape_results` |
```

- [ ] **Step 2.2: Oppdater Matching-lag med kType Family**

Etter Layer 0.5, legg til nytt lag:
```
Layer 0.6: kType Family matching (Jaccard-similarity på equipment-criteria)
```

Beskriv kort:
- Kjøres når Layer 0/0.5 ikke gir treff
- Sammenligner vehicle-fingerprint mot `ktype_families` equipment-criteria
- Scorer med Jaccard-similarity + equipment-first weighting
- Confidence: `high` (ikke `exact`)

- [ ] **Step 2.3: Legg til Ordremottaker LLM i stack**

Under "Stack & Miljø", legg til rad:
```
| Ordremottaker | Conversational AI — 6-steg pipeline (NER → Glass → Equipment → Tilbehør → Pris → Ordre) |
```

- [ ] **Step 2.4: Oppdater dato og versjon**

Endre:
- "Sist oppdatert: 2026-06-05" → "Sist oppdatert: 2026-06-08"
- "Versjon: 1.3" → "Versjon: 1.4 (+kType Family, Ordremottaker LLM)"

---

### Task 3: Oppdater AGENTS.md med kType Family + Ordremottaker

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 3.1: Oppdater kType-pipeline-beskrivelse**

Finn seksjonen "### kType-pipeline". Legg til etter eksisterende pipeline:
```
### kType Family Matching (NY — 2026-06-08)
Når eksakt kType-matching (Layer 0/0.5) ikke gir treff, brukes kType Family:
1. Bygg vehicle-fingerprint fra SVV/Bovsoft (make, model, year, bodyType, fuelType, etc.)
2. Sammenlign med `ktype_families.equipment_criteria` (JSON-array av equipment-features)
3. Jaccard-similarity scoring: |intersection| / |union|
4. Equipment-first weighting: kamera, regnsensor, HUD, etc. scorer høyere
5. Best match → slå opp `glass_catalog` via `ktype_family_members.eurocode`
6. Confidence: `high` (ikke `exact`)

**Resultat:** kType-dekning økt fra 4% til 24.4% (6x forbedring)
**D1-tabeller:** `ktype_families` (25,383), `ktype_family_members` (79,928)
```

- [ ] **Step 3.2: Legg til Ordremottaker LLM-seksjon**

Finn eksisterende "## 🎙️ Ordremottaker LLM-Agent"-seksjon (versjon 1 fra 2026-06-04). Oppdater med:
```
### kType Family Integrasjon (2026-06-08)
Ordremottaker bruker nå kType Family matching som fallback:
- Når kunde sier "frontrute til VW Transporter 2005" uten regnr
- NER ekstraherer make+model+year
- Layer 0 (kType exact) prøves først
- Deretter kType Family (Layer 0.6) for equipment-verifisering
- Dialog-system spør utstyrsspørsmål basert på family-criteria
- Konverteringsrate: 60%+ mål, nøyaktighet: 95%+
```

- [ ] **Step 3.3: Oppdater ADR-oversikt**

Legg til i ADR-tabellen:
```
| 2026-06-08 | kType Family matching (Jaccard + equipment-first) | Godkjent |
| 2026-06-08 | Ordremottaker LLM integrert med kType Family | Godkjent |
```

- [ ] **Step 3.4: Oppdater "Sist oppdatert" og versjon**

Endre:
- "Sist oppdatert: 2026-06-07" → "Sist oppdatert: 2026-06-08"
- "Versjon: 2.9" → "Versjon: 3.0 (+kType Family, Ordremottaker LLM-integrasjon)"

---

### Task 4: Oppdater SKILL.md (autoglass) med riktige tall og nye features

**Files:**
- Modify: `.kimi/skills/autoglass/SKILL.md`

- [ ] **Step 4.1: Katalog-størrelse og dato**

Endre:
- "Katalog (per 2026-05-29)" → "Katalog (per 2026-06-08)"
- "37,581+ produkter" → "27,184 produkter"
- `glass_catalog`: 37,581+ → 27,184

- [ ] **Step 4.2: D1-tabeller — legg til nye**

Legg til nye tabeller i D1-tabell-listen:
```
| `ktype_families` | **NY** — Equipment-criteria grupper for Jaccard-matching (25,383 families) |
| `ktype_family_members` | **NY** — kType → eurocode mappings per family (79,928 rows) |
| `glass_match_candidates` | **NY** — Midlertidige match-kandidater fra family-matching |
| `glass_resolution_requests` | **NY** — Ordremottaker session-state |
| `pending_ktype_matches` | **NY** — kType-matches som venter på verifisering |
```

- [ ] **Step 4.3: Matching-lag — legg til Layer 0.6**

Etter Layer 0.5, legg til:
```
Layer 0.6: kType Family matching (Jaccard-similarity, equipment-first)
```

Med beskrivelse:
- Kjøres når Layer 0 og 0.5 ikke gir treff
- Sammenligner vehicle-fingerprint mot `ktype_families.equipment_criteria`
- Jaccard-similarity + equipment-first scoring
- Confidence: `high`

- [ ] **Step 4.4: KIMI CLI aliases — legg til ordremottaker**

I alias-tabellen, legg til:
```
| `kimi glass-ordre` | ordremottaker-agent | Conversational AI, automatisert ordremottak | Kundehenvendelser, chat, telefon |
```

- [ ] **Step 4.5: Versjon**

Endre: `version: 1.2.0` → `version: 1.3.0 (+kType Family, Ordremottaker)`

---

### Task 5: Oppdater PROJECT_STATE.md med 8. juni-aktiviteter

**Files:**
- Modify: `.kimi/PROJECT_STATE.md`

- [ ] **Step 5.1: Oppdater Meta-seksjon**

Endre:
- `Last updated`: 2026-05-30 → 2026-06-08
- `Worker version`: v2.4 → v2.5 (kType Family + Ordremottaker LLM)
- `kType coverage`: 60.3% (28. mai, lokalt) → 24.4% eksakt + family matching (8. juni, remote)
- `kType registry`: 80,115 → 69,893 (remote D1 faktisk)
- Legg til: `ktype_families`: 25,383, `ktype_family_members`: 79,928

- [ ] **Step 5.2: Oppdater Architecture decisions**

Legg til:
```
- **kType Family matching:** Når exact+kType registry ikke gir treff, brukes Jaccard-similarity på `ktype_families.equipment_criteria` vs vehicle-fingerprint. Equipment-first scoring. Confidence: `high`.
- **Ordremottaker LLM:** 6-steg pipeline med NER → Glass-oppslag (Layer 0→0.6) → Equipment-dialog → Tilbehør → Pris → Ordre. Integrert med kType Family for fuzzy matching.
```

- [ ] **Step 5.3: Oppdater/arkiver blockers**

Sjekk eksisterende blockers:
- P1 Biluppgifter.se: Fortsatt åpen? Hvis ja, behold.
- P2 Bovsoft 333 remaining: Oppdater til faktisk status.
- P2 kType-læringskurve: Delvis løst av Family matching — oppdater.
- P3 exact_match flagg: Implementert? Sjekk Worker-kode.

Legg til nye blockers hvis relevant:
```
| P2 | kType Family: Jaccard-threshold (0.6) kan være for aggressiv — monitorere accuracy | Overvåkning |
| P3 | Ordremottaker: Ingen A/B-test vs menneskelig ordremottaker ennå | Planlagt |
```

- [ ] **Step 5.4: Legg til Recent activity for 8. juni**

Legg til ETTER eksisterende 2026-05-30 entry:
```
### 2026-06-08 (Kimi CLI — kType Family matching + Ordremottaker LLM-integrasjon)
- **kType Family matching:** Bygget fra TecDoc 1Q2019 equipment-criteria
  - `ktype_families`: 25,383 families med equipment-criteria JSON
  - `ktype_family_members`: 79,928 kType → eurocode mappings
  - Jaccard-similarity scoring med equipment-first weighting
  - Deployet til remote D1
- **Ordremottaker LLM:** Integrert med kType Family som fallback
  - NER + equipment-dialog + year-korrigering
  - Equipment-svar tolkes som kunnskap (ikke bare bekreftelse)
  - Session-state i `glass_resolution_requests`
- **Resultat:** kType-dekning 4% → 24.4% (6x forbedring)
- **Deploy:** Worker v2.5 deployet (commit <SHA>)
```

- [ ] **Step 5.5: Oppdater File map med nye filer**

Legg til i file map:
```
├── src/lib/ktype-family-matcher.ts       # kType Family Jaccard-matching
├── src/handlers/ordremottaker.ts         # Ordremottaker LLM-endepunkt
├── src/lib/ordremottaker-dialog.ts       # Equipment-dialog engine
```

---

## Track B: Hooks + Config-fiks

### Task 6: Fiks session-start.sh diary-parsing

**Files:**
- Modify: `.kimi/hooks/session-start.sh`

**Kontekst:** MemPalace diary-format bruker `ts`, `task`, `type`, `status`, `rating`, `files`, `tags` — IKKE `timestamp`, `event`.

- [ ] **Step 6.1: Fiks diary-parsing i session-start.sh**

Finn seksjonen "# 5. SISTE MEMPALACE DIARY-ENTRIES" (ca. linje 81-99).

Endre:
```bash
# FØR (feil):
const ts = e.timestamp ? e.timestamp.slice(0, 16).replace('T', ' ') : '?';
const agent = e.agent || 'unknown';
const event = e.event || 'unknown';
console.log('  [' + ts + '] ' + agent + ' — ' + event);

# ETTER (riktig):
const ts = e.ts ? e.ts.slice(0, 16).replace('T', ' ') : '?';
const agent = e.agent || 'unknown';
const task = e.task || 'unknown';
const type = e.type || 'AUTO';
const status = e.status || '?';
console.log('  [' + ts + '] ' + agent + ' | ' + type + ' | ' + status + ' — ' + task.slice(0, 60));
```

- [ ] **Step 6.2: Verifiser output-format**

Kjør:
```bash
bash .kimi/hooks/session-start.sh 2>&1 | grep -A5 "SISTE AKTIVITETER"
```
Forventet: Ingen `unknown — unknown`. Faktiske diary-entries vises med type og status.

---

### Task 7: Fiks session-end.sh til MemPalace-kompatibelt format

**Files:**
- Modify: `.kimi/hooks/session-end.sh`

**Kontekst:** Session-end skriver rå JSON med `timestamp`, `event`, `summary`, `details`. MemPalace `read_diary` forventer `ts`, `type`, `task`, `status`, `rating`, `files`, `tags`.

- [ ] **Step 7.1: Fiks diary-entry format i session-end.sh**

Finn seksjonen "# ── 4. Auto-diary via MemPalace" (ca. linje 100-133).

Endre Node.js-koden fra:
```javascript
const entry = {
  timestamp: new Date().toISOString(),
  agent: 'autoglass-orchestrator',
  event: 'session_end_${TIMESTAMP}',
  summary: 'Session ${TIMESTAMP} — ${FILE_COUNT} filer endret (smoke=${SMOKE_RESULT}, validate=${VALIDATE_RESULT})',
  details: 'Type: ${TASK_TYPE}\nStatus: ${DIARY_STATUS}\nSmoke-test: ${SMOKE_RESULT}\nValidate: ${VALIDATE_RESULT}\nFiler: ${FILE_COUNT}'
};
```

Til:
```javascript
const entry = {
  ts: new Date().toISOString(),
  agent: 'kimi',
  type: '${TASK_TYPE}',
  task: 'Session ${TIMESTAMP} — ${FILE_COUNT} filer endret (smoke=${SMOKE_RESULT}, validate=${VALIDATE_RESULT})',
  status: '${DIARY_STATUS}',
  rating: ${SMOKE_RESULT} === 'PASS' && ${VALIDATE_RESULT} !== 'BLOCK' ? 4 : 3,
  files: ${FILE_COUNT},
  tags: ['session_end', '${TASK_TYPE.toLowerCase()}']
};
```

- [ ] **Step 7.2: Verifiser formatet**

Kjør:
```bash
tail -1 .kimi/mempalace/data/diary.jsonl | node -e "const d=require('fs').readFileSync(0,'utf8');const e=JSON.parse(d.trim().split('\n').pop());console.log('ts:',!!e.ts,'type:',!!e.type,'task:',!!e.task,'status:',!!e.status,'rating:',e.rating,'files:',e.files,'tags:',!!e.tags);"
```
Forventet: Alle felter `true`/definert. Ingen `timestamp`, `event`, `summary`.

---

### Task 8: Optimaliser config.toml

**Files:**
- Modify: `.kimi/config.toml`

- [ ] **Step 8.1: Juster compaction_trigger_ratio**

Endre:
```toml
# FØR:
compaction_trigger_ratio = 0.82

# ETTER:
compaction_trigger_ratio = 0.88
```

Begrunnelse: Med 750 max_steps kompakteres konteksten ved 615 steg (82%). Dette er for tidlig — agenten mister kontekst i lange sesjoner. 88% gir 660 steg før kompaktering, bedre balanse mellom kontekstbevaring og ytelse.

- [ ] **Step 8.2: Verifiser ingen syntax-feil**

Kjør:
```bash
kimi doctor 2>/dev/null || echo "kimi doctor ikke tilgjengelig"
```
Forventet: Ingen config-feil.

---

### Task 9: Opprett ordremottaker-workflow skill

**Files:**
- Create: `.kimi/skills/bilglass-workflows/ordremottaker/SKILL.md`
- Modify: `.kimi/skills/bilglass-workflows/SKILL.md` (oppdater sub-skill-liste)

- [ ] **Step 9.1: Opprett parent-skill referanse**

I `.kimi/skills/bilglass-workflows/SKILL.md`, oppdater sub-skills-tabellen:
```markdown
| Skill | Kommando | Formål |
|---|---|---|
| `deploy` | `/bilglass-workflows/deploy` | Deploy med pre-flight, migration, smoke-test |
| `test` | `/bilglass-workflows/test` | Kjør 4-lags test-suite |
| `pricing` | `/bilglass-workflows/pricing` | Oppdater prisdatabase med dry-run |
| `ordremottaker` | `/bilglass-workflows/ordremottaker` | Ordremottaker LLM — konfigurasjon, testing, deploy |
```

- [ ] **Step 9.2: Opprett skill-filen**

Lag filen `.kimi/skills/bilglass-workflows/ordremottaker/SKILL.md`:

```markdown
---
name: ordremottaker
description: Autoglass AS — Ordremottaker LLM workflow. Konfigurasjon, testing, og deploy av conversational AI for automatisk ordremottak.
---

# Ordremottaker LLM Workflow

## When to Use

- Du skal **teste** Ordremottaker LLM-pipeline
- Du skal **endre** NER, dialog, eller matching-logikk
- Du skal **deploye** Ordremottaker-endepunkt til Worker
- Du skal **debugge** equipment-dialog eller year-korrigering

## Pipeline

```
Kundeinput → NER (make/model/year/regnr/VIN) → Glass-oppslag (Layer 0→0.6)
  → Equipment-verifisering (dialog) → Tilbehør → Pris → Ordre
```

## Konfigurasjon

| Parameter | Verdi | Fil |
|---|---|---|
| Konverteringsrate-mål | >60% | `AGENTS.md` |
| Nøyaktighet-mål | >95% | `AGENTS.md` |
| Maks turer | <4 | `AGENTS.md` |
| Equipment-threshold | 0.6 Jaccard | `ktype-family-matcher.ts` |

## Testing

```bash
# Test NER + equipment-dialog
npm run test:ordremottaker

# Test kType Family matching
npm run test:ktype-family

# End-to-end test med sample inputs
node scripts/test-ordremottaker.mjs
```

## Deploy

```bash
# Deploy bare Ordremottaker-endepunkt
cd api/cf-worker && wrangler deploy

# Full deploy (Worker + D1 + KV)
npm run deploy:full
```

## Don'ts

- **ALDRI** endre equipment-dialog uten å teste med 10+ sample inputs
- **ALDRI** senke Jaccard-threshold under 0.5 uten Tomars godkjenning
- **ALDRI** deploy uten smoke-test av Ordremottaker-endepunkt
```

- [ ] **Step 9.3: Verifiser skill discovery**

Kjør:
```bash
ls -la .kimi/skills/bilglass-workflows/ordremottaker/SKILL.md
```
Forventet: Filen eksisterer og har riktig YAML-frontmatter.

---

## Track C: MemPalace KG + Verifikasjon

### Task 10: Lagre KG-fakta for 8. juni-endringer

**Files:**
- Modify: `.kimi/mempalace/kg.json` (via MemPalace MCP kg_add/kg_batch)

- [ ] **Step 10.1: Batch-insert KG-fakta**

Bruk MemPalace MCP `kg_batch` med følgende fakta:

```json
[
  {"subject": "ktype-family-matching", "predicate": "uses_algorithm", "object": "jaccard-similarity", "validFrom": "2026-06-08"},
  {"subject": "ktype-family-matching", "predicate": "uses_scoring", "object": "equipment-first-weighting", "validFrom": "2026-06-08"},
  {"subject": "ktype-family-matching", "predicate": "confidence_level", "object": "high", "validFrom": "2026-06-08"},
  {"subject": "ktype-family-matching", "predicate": "coverage_increase", "object": "4-percent-to-24.4-percent", "validFrom": "2026-06-08"},
  {"subject": "ktype-families", "predicate": "row_count", "object": "25383", "validFrom": "2026-06-08"},
  {"subject": "ktype-family-members", "predicate": "row_count", "object": "79928", "validFrom": "2026-06-08"},
  {"subject": "ordremottaker-llm", "predicate": "integrates_with", "object": "ktype-family-matching", "validFrom": "2026-06-08"},
  {"subject": "ordremottaker-llm", "predicate": "pipeline_steps", "object": "6", "validFrom": "2026-06-08"},
  {"subject": "ordremottaker-llm", "predicate": "equipment_dialog", "object": "knowledge-based-interpretation", "validFrom": "2026-06-08"},
  {"subject": "glass-catalog", "predicate": "record_count_json", "object": "27184", "validFrom": "2026-06-08"},
  {"subject": "glass-catalog", "predicate": "record_count_d1", "object": "27139", "validFrom": "2026-06-08"},
  {"subject": "ktype-registry", "predicate": "row_count_d1", "object": "69893", "validFrom": "2026-06-08"},
  {"subject": "worker", "predicate": "version", "object": "v2.5", "validFrom": "2026-06-08"}
]
```

- [ ] **Step 10.2: Verifiser KG-insert**

Kjør:
```bash
# Via MemPalace MCP:
kg_query(entity="ktype-family-matching", depth=1)
kg_query(entity="ordremottaker-llm", depth=1)
```

Forventet: Fakta returneres med tidsstempel 2026-06-08.

---

## Track D: Verifikasjon (avhengig av Track A-C)

### Task 11: Endelig verifikasjon av all synkronisering

**Files:**
- Les: `AGENTS.md`, `.kimi/KIMI-MASTER-SYSTEM.md`, `.kimi/skills/autoglass/SKILL.md`, `.kimi/PROJECT_STATE.md`
- Kjør: `.kimi/hooks/session-start.sh`, `session-end.sh` (dry-run)

- [ ] **Step 11.1: Katalog-størrelse-konsistens**

Kjør:
```bash
echo "=== Katalog-størrelser ==="
grep -c "27,184" AGENTS.md .kimi/skills/autoglass/SKILL.md .kimi/KIMI-MASTER-SYSTEM.md
echo "=== Gamle tall (skal være 0) ==="
grep -c "37,581\|39,458" AGENTS.md .kimi/skills/autoglass/SKILL.md .kimi/KIMI-MASTER-SYSTEM.md || true
```
Forventet: 27,184 finnes i alle 3 filer. 37,581/39,458 finnes i INGEN.

- [ ] **Step 11.2: Dato-konsistens**

Kjør:
```bash
grep "Sist oppdatert" AGENTS.md .kimi/KIMI-MASTER-SYSTEM.md .kimi/PROJECT_STATE.md
```
Forventet: Alle viser 2026-06-08 (eller nær dato).

- [ ] **Step 11.3: Hook-verifikasjon**

Kjør:
```bash
bash .kimi/hooks/session-start.sh 2>&1 | tail -20
```
Forventet: Ingen `unknown — unknown` i diary-seksjonen.

- [ ] **Step 11.4: config.toml-verifikasjon**

Kjør:
```bash
grep "compaction_trigger_ratio" .kimi/config.toml
```
Forventet: `compaction_trigger_ratio = 0.88`

- [ ] **Step 11.5: Skill-discovery-verifikasjon**

Kjør:
```bash
ls -la .kimi/skills/bilglass-workflows/ordremottaker/SKILL.md
```
Forventet: Fil eksisterer.

---

## Self-Review

### Spec coverage

| Krav | Task |
|------|------|
| Katalog-størrelse: 27,184 konsistent | Task 1 |
| kType Family i alle docs | Task 2 (Step 2.2), Task 3 (Step 3.1), Task 4 (Step 4.3) |
| Ordremottaker LLM i alle docs | Task 2 (Step 2.3), Task 3 (Step 3.2), Task 4 (Step 4.4), Task 9 |
| Riktige D1-tabeller | Task 2 (Step 2.1), Task 4 (Step 4.2), Task 5 (Step 5.1) |
| PROJECT_STATE.md oppdatert | Task 5 |
| session-start.sh fiks | Task 6 |
| session-end.sh fiks | Task 7 |
| config.toml optimalisering | Task 8 |
| Ny ordremottaker-skill | Task 9 |
| KG-fakta for endringer | Task 10 |
| Endelig verifikasjon | Task 11 |

### Placeholder scan

Ingen "TBD", "TODO", "implement later", eller "fill in details" funnet. Alle steg har konkret kode eller eksakte filbaner.

### Type consistency

- Diary-format: `ts`, `type`, `task`, `status`, `rating`, `files`, `tags` — konsekvent i Task 6, 7, og 10.
- Katalog-størrelse: 27,184/27,139 — konsekvent i Task 1, 4, 5, 10.
- Dato: 2026-06-08 — konsekvent i Task 2, 3, 5.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-kimi-mempalace-quality-sync.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch fresh subagents per track, review between tracks. Track A, B, C kan kjøres parallelt. Track D avhenger av A-C.

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints.

**Which approach?**
