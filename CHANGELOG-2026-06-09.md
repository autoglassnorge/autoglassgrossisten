# Changelog — 2026-06-09

## [3.2.0] — Normaliserings-audit v2

### Added
- **`api/cf-worker/src/lib/scoring.test.ts`** — 52 unit tests for `modelMatches()` and `yearCompatible()` covering VW T-family, Volvo XC/S/V/C/700/900, Mercedes W-series/class mapping, general fuzzy matching, negative cases, and edge cases.
- **`api/cf-worker/src/lib/brand.test.ts`** — 16 unit tests for `normalizeBrand()` and `getBrandAliases()` covering VW, Mercedes, Land Rover, Mini↔BMW, TRUCKS aliases, and USA CARS cross-search.
- `search.ts`: `hintVariants()` function generates 6 model-name variants (original, no-spaces, no-hyphens, spaces→hyphens, hyphens→spaces, strip-all) for every SQL `LIKE` query, improving Layer 1-3 coverage for ~1000+ products with space/hyphen mismatches.

### Fixed

#### `api/cf-worker/src/lib/scoring.ts`
- **VW T-family generation gate** — Explicit `return false` when T4/T5/T6 generations differ, preventing false matches (e.g. T5 Caravelle matching T6 Transporter record).
- **Volvo 700/900 series** — Added range parser for D1 combined model names like `740_760-80 SERIE`, matching SVV inputs `740`, `760`, `780`, `940`, `960`.
- **Mercedes GLE** — Added `"gle"` key to `mercedesSeries` map (previously only `"gle-klasse"`), fixing `GLE` ↔ `W166/W167` matching.
- **Mercedes G-Klasse vs GELANDEWAGEN** — Added special-case handler for German model name `GELANDEWAGEN` in D1 vs `G-Klasse` from SVV.
- **Mercedes CLK/CLS/SL/SLK W-codes** — Expanded mapping to include W-codes that D1 actually uses:
  - CLK: added `W208`, `W209` (D1 uses W-codes, not C-codes)
  - CLS: added `W219`
  - SL: added `W230`
  - SLK: added `W170`
- **Substring guard** — Added digit-continuation guard in top-level substring match to prevent short-code traps (`A3` matching `A30`, `CX5` matching `CX50`).

#### `api/cf-worker/src/lib/brand.ts`
- **TRUCKS aliases** — Added 5 missing TRUCKS→base-brand mappings:
  - `NISSAN TRUCKS` → `NISSAN`
  - `FIAT TRUCKS` → `FIAT`
  - `RENAULT TRUCKS` → `RENAULT`
  - `MITSUBISHI TRUCKS` → `MITSUBISHI`
  - `MAZDA TRUCKS` → `MAZDA`
- **USA CARS cross-search** — `getBrandAliases()` now cross-searches between `USA CARS` and American brands (`CHEVROLET`, `FORD`, `JEEP`, `CHRYSLER`, `DODGE`, `CADILLAC`, `GMC`, `HUMMER`). Fixes false negatives where SVV sends `Chevrolet` but D1 stores under `USA CARS`.

#### `api/cf-worker/src/handlers/search.ts`
- **Generic modelHint variant generation** — All model hints now automatically generate 6 variants for SQL `LIKE` pre-filtering, covering space/hyphen/concatenation differences across all brands (not just Volvo/Mercedes/VW).

### Documentation
- Updated `AGENTS.md` with complete audit findings, fix matrix, and lessons learned.

### Deploy
- **Version ID:** `04abe77e-602d-486e-89f1-2724d1e0a16d`
- **Tests:** 68/68 passing
- **Regression:** Verified on SU18018, BR77770, HB82058, BS78335
