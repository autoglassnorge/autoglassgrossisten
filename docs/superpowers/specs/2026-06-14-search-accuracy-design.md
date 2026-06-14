# Design: Search Accuracy Sub-Agent + Logic Fixes

**Date:** 2026-06-14  
**Scope:** Norwegian license-plate (regnr) and VIN → correct car-glass matching in `api/cf-worker` + frontend result rendering.  
**Goal:** Top-1 accuracy > 95 %, top-3 accuracy > 99 % on a representative Norwegian vehicle test set, with sub-second p95 response time.  
**Non-goal:** Map/visual polish.

---

## 1. Background

The Autoglass worker already has a sophisticated multi-layer matcher:

- **Regnr path:** SVV/Biluppgifter/Bovsoft → kType rules / TecDoc / brand-model-year fuzzy → scoring → result.
- **VIN path:** vPIC decode → D1 `glass_rules` → TecDoc D1 → paid fallbacks (Vincario, MACS VIS, AGM).

Despite many heuristics (model normalization, equipment scoring, kType family matching, ground-truth lookup), the system still returns wrong or missing glass for some vehicles. The root cause is usually one of:

1. **A wrong kType is trusted too early** (Layer 0.5 SVV→TecDoc cache, Bovsoft, or glass_rules) and the binary ±1000 kType scoring gate buries the correct candidate.
2. **Model/brand normalization still misses aliases**, especially for body variants (Variant, Sportsvan, Alltrack, Avant, Tourer, Gran Coupe, etc.).
3. **Year/generation gating is too strict** when the catalog record has no generation or a different generation label.
4. **VIN decoding is US-centric** (vPIC) and often wrong for EU cars; the 0.75 confidence cache lives for 60 days.
5. **Equipment guessing is brittle** and can push the wrong variant to the top.
6. **Performance:** too many sequential D1 queries and external calls per request.

---

## 2. Proposed Approach

### Option A — Agent-led, data-driven improvement loop (Recommended)

1. Create a new **logic sub-agent** `glass-search-logic` (`.kimi/agents/autoglass-search-logic-agent.yaml` + `.md`).
2. Build a **reproducible accuracy test harness** in `api/cf-worker/test/search-accuracy/` that can run against a local D1 snapshot or `wrangler dev`.
3. Seed the harness with a **golden dataset** built from:
   - `ground_truth` table entries,
   - Bovsoft-verified regnr → kType → eurocode mappings,
   - a small hand-verified set of problematic Norwegian regnr/VINs.
4. Run the harness to get baseline top-1 / top-3 accuracy per category (windshield, back, side, door) and identify failure patterns.
5. Fix the highest-impact root causes (one at a time, with tests).
6. Re-run harness after each fix until accuracy targets are met.
7. Optimize performance (caching, batching, fewer external calls, memoization).
8. Add CI gate so accuracy cannot regress silently.

### Option B — Manual heuristic fixes only

Skip the agent/harness and patch the known weak spots directly. Faster but impossible to measure, easy to regress, and hard to justify "best in Europe".

### Option C — Rewrite the matcher

Build a new ML/re-ranking model. Out of scope for one session; the existing layered pipeline is correct in principle, it just needs measurement and tuning.

**Recommendation:** Option A.

---

## 3. Components

### 3.1 Logic sub-agent: `glass-search-logic`

- **Role:** Specialist for search correctness and test-driven tuning.
- **Files owned:**
  - `.kimi/agents/autoglass-search-logic-agent.yaml`
  - `.kimi/agents/autoglass-search-logic-agent.md`
  - `api/cf-worker/test/search-accuracy/*`
  - `api/cf-worker/src/lib/scoring.ts`, `search.ts`, `vin-glass-resolver.ts`, `tecdoc-resolver.ts`, `brand.ts`, `equipment.ts`, `db.ts`
- **Workflow:**
  1. Read golden dataset and current pipeline code.
  2. Run harness, collect per-query results (predicted top-1/top-3 vs expected).
  3. Cluster failures by root cause (kType, model alias, year/generation, equipment, VIN decode).
  4. Propose a ranked fix list with expected impact.
  5. Implement the highest-impact fix with a failing test, verify, and re-run harness.
  6. Repeat until targets are hit.

### 3.2 Accuracy test harness

- **Entry:** `npm run test:search-accuracy` (in `api/cf-worker`).
- **Inputs:**
  - `test/search-accuracy/fixtures/golden-regnr.json`
  - `test/search-accuracy/fixtures/golden-vin.json`
  - Each entry: `{ regnr?, vin?, make, model, year, expected: { windshield?, back?, side?, door?, ... } }`.
- **Runner:**
  - Local `wrangler dev` or Miniflare environment with a D1 snapshot.
  - Calls `/api/glass?regnr=...` and `/api/glass?vin=...`.
  - Records top-1, top-3, top-5 per category, and the layer/confidence reached.
- **Metrics:**
  - Overall top-1, top-3, top-5 accuracy.
  - Per-category accuracy.
  - Failure buckets: `wrong_ktype`, `model_alias_miss`, `year/generation_gate`, `equipment_mismatch`, `vin_decode_error`, `missing_candidate`, `other`.
- **Outputs:**
  - `test/search-accuracy/reports/YYYY-MM-DD-HHMMSS-report.json`
  - Console summary + per-failure diff.

### 3.3 Fix areas (to be validated/ordered by harness)

Tentative list based on current code review:

1. **kType scoring gate:** replace binary ±1000 with a graded boost (e.g., +200 exact kType, -100 different kType) so a wrong kType does not automatically bury all correct candidates.
2. **Layer 0.5 cache safety:** always include ground_truth candidates even when Layer 0.5 fires; let scoring decide.
3. **Model alias expansion:** add body-variant aliases (Variant → Variant/Combi/Avant/Tourer/Estate, Sportsvan → Sportsvan, etc.) and use them in both SQL hints and `modelMatches()`.
4. **Year/generation gate:** soften generation rejection when the catalog record lacks generation data; prefer description year range.
5. **VIN decode:** prefer authoritative EU sources and lower cache TTL for low-confidence vPIC results; allow user-provided make/model/year to override.
6. **Equipment inference:** treat `camera`/`adas` as linked but distinguish front-camera-in-windshield from reversing camera; use catalog signatures only as tie-breakers, not hard filters.
7. **Performance:** batch `queryByBrandAndYear` + extra-hint queries; cache Bovsoft/SVV lookups longer; avoid calling `resolveGlass` when a kType is already known.

### 3.4 Performance optimization

After correctness targets are met:

- Cache SVV/Bovsoft vehicle lookups for 24 h.
- Batch multi-hint SQL queries into single `UNION` or `IN` queries.
- Limit `queryByBrandOnly` fallback result size.
- Skip paid VIN fallbacks when regnr already resolved a high-confidence kType.
- Add request-level memoization for repeated D1 lookups.

---

## 4. Data Flow

```
Golden dataset  →  harness runner  →  local worker / D1 snapshot  →  predicted results
                                                         ↓
                                              logic sub-agent analysis
                                                         ↓
                                          ranked fix list  →  TDD fix  →  re-run
```

---

## 5. Success Criteria

- [ ] New `glass-search-logic` agent exists and can be invoked with `kimi glass-search-logic`.
- [ ] `npm run test:search-accuracy` runs locally and produces a report.
- [ ] Baseline accuracy measured (whatever it is today).
- [ ] Top-1 accuracy ≥ 95 % and top-3 accuracy ≥ 99 % on the golden set.
- [ ] At least three root-cause fixes merged with tests.
- [ ] Worker tests + typecheck pass; no regression on existing smoke tests.
- [ ] p95 latency for regnr/VIN search ≤ 1000 ms locally.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Golden dataset is too small | Seed from ground_truth + Bovsoft + known problem cases; keep it versioned |
| Fix improves test set but hurts real traffic | Use hold-out validation split; run smoke tests against prod-like data |
| External API changes break VIN path | Keep mock modes and cache fallbacks; log provider failures |
| Over-tuning to test set | Prioritize general fixes (aliases, gates) over dataset-specific hacks |

---

## 7. Next Step

If this design is approved, the implementation plan will be written to `docs/superpowers/plans/2026-06-14-search-accuracy-plan.md` and execution will start immediately with the logic sub-agent and harness build.
