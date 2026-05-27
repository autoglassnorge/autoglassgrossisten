/**
 * Autoglass AS — Multikriterie Match Scorer
 * ==========================================
 * Tar en bil-spesifikasjon + utstyrsflagg + katalog-kandidater
 * og returnerer rangert liste med score 0-100 og exact_match-flagg.
 *
 * Score-formel:
 *   kType-eksakt:        35p  (hardt krav — kun hvis kType kjent og finnes i record)
 *   flagg-match (gitt):  25p  (kun flagg vi VET status på, ikke ukjente)
 *   prefix4-match:       15p
 *   OEM-overlap:         10p
 *   leverandør-OE/OEM:    5p
 *   lager > 0:            5p
 *   årsmodell-match:      5p
 *   ────────────────────────
 *   Total:              100p
 *
 * exact_match = true HVIS:
 *   - top1.score >= 85
 *   - top2 finnes ikke eller (top1.score - top2.score) >= 15
 *   - alle kjente utstyrsflagg matcher
 */

import type { GlassFlags } from "../decoders/vag-pr-decoder";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPER
// ============================================================================

export interface VehicleSpec {
  vin?: string;
  regnr?: string;
  kType?: number;
  brand?: string;
  model?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  bodyType?: string;
}

export interface KnownFlags {
  // Hvert felt: true | false | undefined (= ukjent)
  rainSensor?: boolean;
  acoustic?: boolean;
  heated?: boolean;
  shade?: boolean;
  camera?: boolean;
  laneAssist?: boolean;
  adas?: boolean;
  hud?: boolean;
  antenna?: boolean;
  heatReflective?: boolean;
}

export interface CatalogRecord {
  eurocode: string;
  articleNumber: string;
  category: string;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null;
  stockStatus: number;
  oemNumbers: string[];
  crossReferences: string[];
  description: string;
  prefix4: string;
  source: string;
  // valgfritt: kType-array hvis tilgjengelig (fra Pilkington/TecDoc-tilkobling)
  kTypes?: number[];
}

export interface ScoredCandidate {
  record: CatalogRecord;
  score: number;
  breakdown: {
    kTypeMatch: number;
    flagsMatch: number;
    prefix4Match: number;
    oemOverlap: number;
    supplierBonus: number;
    stockBonus: number;
    yearMatch: number;
  };
  flagsMatched: string[];
  flagsMismatched: string[];
  flagsUnknown: string[];
}

export interface MatchResult {
  exact_match: boolean;
  best_candidate: ScoredCandidate | null;
  alternatives: ScoredCandidate[];
  needs_user_input: string[];     // flagg vi bør spørre bruker om
  total_candidates: number;
  diagnostics: {
    vehicle: VehicleSpec;
    knownFlags: KnownFlags;
    margin?: number;              // top1 - top2 score-margin
  };
}

// ============================================================================
// SCORING
// ============================================================================

const KNOWN_OE_SUPPLIERS = new Set([
  "PILKINGTON", "SAINT-GOBAIN", "SEKURIT", "AGC", "FUYAO", "XINYI",
  "NORDGLASS", "GUARDIAN", "VITRO",
]);

const FLAG_KEYS: Array<keyof KnownFlags> = [
  "rainSensor", "acoustic", "heated", "shade", "camera",
  "laneAssist", "adas", "hud", "antenna", "heatReflective",
];

/**
 * Normaliser brand-navn slik at "VW" ≡ "VOLKSWAGEN", ø ≡ o, etc.
 * Håndterer mismatch mellom Biluppgifter, Pilkington og lokale formater.
 */
export function normalizeBrand(brand: string | null | undefined): string {
  if (!brand) return "";
  let b = brand.toUpperCase().trim()
    .replace(/Ø/g, "O").replace(/Å/g, "A").replace(/Æ/g, "AE")
    .replace(/Ë|É|È|Ê/g, "E")
    .replace(/Š/g, "S")
    .replace(/[^A-Z0-9 \-]/g, "");
  const aliases: Record<string, string> = {
    "VW": "VOLKSWAGEN",
    "VOLKSWAGEN AG": "VOLKSWAGEN",
    "MERCEDES": "MERCEDES-BENZ",
    "MB": "MERCEDES-BENZ",
    "MERCEDES BENZ": "MERCEDES-BENZ",
    "BMW MINI": "MINI",
    "NEW MINI": "MINI",
    "MG SAIC": "MG",
    "FORD USA": "FORD",
    "SKODA": "SKODA",
    "ŠKODA": "SKODA",
    "VAUXHALL": "OPEL",
  };
  return aliases[b] ?? b;
}

/**
 * Score én kandidat 0-100.
 */
export 
// ============================================================================
// MODEL ALIASES
// ============================================================================

let _modelAliases: Record<string, Record<string, string[]>> | null = null;

function loadModelAliases(): Record<string, Record<string, string[]>> {
  if (_modelAliases) return _modelAliases;
  try {
    const data = fs.readFileSync(path.join(__dirname, "../../data/model-aliases.json"), "utf-8");
    _modelAliases = JSON.parse(data);
  } catch {
    _modelAliases = {};
  }
  return _modelAliases ?? {};
}

function getModelAliases(brand: string, coreModel: string): string[] {
  const aliases = loadModelAliases();
  const brandAliases = aliases[brand] || aliases[brand.replace("-BENZ", "")];
  if (!brandAliases) return [];
  return brandAliases[coreModel] || [];
}

function scoreCandidate(
  record: CatalogRecord,
  vehicle: VehicleSpec,
  knownFlags: KnownFlags,
  prefix4Hint?: string
): ScoredCandidate {
  const breakdown = {
    kTypeMatch: 0,
    flagsMatch: 0,
    prefix4Match: 0,
    oemOverlap: 0,
    supplierBonus: 0,
    stockBonus: 0,
    yearMatch: 0,
  };

  const flagsMatched: string[] = [];
  const flagsMismatched: string[] = [];
  const flagsUnknown: string[] = [];

  // 1) kType-eksakt (35p) — fallback til modell-tekst-match hvis kType mangler
  if (vehicle.kType && record.kTypes && record.kTypes.length > 0) {
    if (record.kTypes.includes(vehicle.kType)) {
      breakdown.kTypeMatch = 35;
    }
  } else if (vehicle.model && record.model) {
    // Fuzzy modell-match: ekstraher kjernemodellnavn fra Biluppgifter-format
    // "X1 (E84)" → "X1", "FOCUS II (DA_, HCP, DP)" → "FOCUS"
    const coreVehicle = vehicle.model.toUpperCase().split(/[\s(]/)[0];
    const coreRecord = record.model.toUpperCase().split(/[\s(]/)[0];
    if (coreVehicle && coreRecord && coreVehicle === coreRecord) {
      breakdown.kTypeMatch = 25;
    } else if (coreVehicle && record.model.toUpperCase().includes(coreVehicle)) {
      breakdown.kTypeMatch = 15;
    } else {
      // Alias-matching for merker med modellnavn-mismatch
      // (f.eks. Bovsoft "S-KLASSE" vs katalog "S CLASS")
      const aliases = getModelAliases(normalizeBrand(vehicle.brand), coreVehicle);
      for (const alias of aliases) {
        if (coreRecord === alias || record.model.toUpperCase().includes(alias)) {
          breakdown.kTypeMatch = 20;
          break;
        }
      }
    }
  }

  // 2) Flagg-match (25p totalt, fordelt likt på ANTALL KJENTE flagg)
  const knownEntries = FLAG_KEYS
    .map(k => ({ k, v: knownFlags[k] }))
    .filter(e => e.v !== undefined);

  if (knownEntries.length > 0) {
    const perFlag = 25 / knownEntries.length;
    for (const { k, v } of knownEntries) {
      const recordHas = (record as any)[k] === true;
      if (recordHas === v) {
        breakdown.flagsMatch += perFlag;
        flagsMatched.push(k);
      } else {
        flagsMismatched.push(k);
      }
    }
  }

  // Spor ukjente flagg som potensielt skiller kandidater
  for (const k of FLAG_KEYS) {
    if (knownFlags[k] === undefined && (record as any)[k] === true) {
      flagsUnknown.push(k);
    }
  }

  // 3) Prefix4-match (15p)
  if (prefix4Hint && record.prefix4 === prefix4Hint) {
    breakdown.prefix4Match = 15;
  } else if (prefix4Hint && record.prefix4.substring(0, 3) === prefix4Hint.substring(0, 3)) {
    breakdown.prefix4Match = 8; // delvis (prefix3)
  }

  // 4) OEM-overlap (10p) — sjekker om bilens VIN inneholder OEM-hint
  // (Vi har sjelden direkte OEM fra VIN, så dette er primært for cross-references)
  if (vehicle.vin && record.oemNumbers.length > 0) {
    // Heuristikk: OEM-nummer for VAG starter ofte med chassis-prefix (7H0, 7E0, 5G0, 3C8...)
    const vinPrefix = vehicle.vin.substring(3, 6); // posisjon 4-6 = chassis code
    const oemConcat = record.oemNumbers.join(" ") + " " + record.crossReferences.join(" ");
    if (vinPrefix && oemConcat.includes(vinPrefix)) {
      breakdown.oemOverlap = 10;
    }
  }

  // 5) Leverandør-bonus (5p) — OEM/OE-leverandører rangeres høyere
  if (record.supplier && KNOWN_OE_SUPPLIERS.has(record.supplier.toUpperCase())) {
    breakdown.supplierBonus = 5;
  }

  // 6) Lager (5p)
  if (record.stockStatus > 0) {
    breakdown.stockBonus = 5;
  }

  // 7) Årsmodell (5p)
  if (vehicle.year && record.yearFrom !== null) {
    const from = record.yearFrom;
    const to = record.yearTo ?? from + 20;
    if (vehicle.year >= from && vehicle.year <= to) {
      breakdown.yearMatch = 5;
    }
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    record,
    score: Math.round(score * 100) / 100,
    breakdown,
    flagsMatched,
    flagsMismatched,
    flagsUnknown,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function matchGlass(params: {
  vehicle: VehicleSpec;
  knownFlags: KnownFlags;
  prefix4Hint?: string;
  candidates: CatalogRecord[];
  category?: string; // "frontrute" default
  topN?: number;
}): MatchResult {
  const category = params.category ?? "frontrute";
  const topN = params.topN ?? 5;

  // Filtrer på kategori + merke + årsmodell
  let filtered = params.candidates.filter(r => r.category === category);

  if (params.vehicle.brand) {
    const brand = normalizeBrand(params.vehicle.brand);
    filtered = filtered.filter(r => r.brand && normalizeBrand(r.brand) === brand);
  }

  // Filtrer på årsmodell (-2/+2 års slakk for å fange overgangsår)
  if (params.vehicle.year) {
    const y = params.vehicle.year;
    filtered = filtered.filter(r => {
      if (r.yearFrom === null) return true; // ukjent år beholdes
      const from = r.yearFrom - 2;
      const to = (r.yearTo ?? r.yearFrom + 20) + 2;
      return y >= from && y <= to;
    });
  }

  // Filtrer på prefix4-prefiks (3 første siffer) hvis vi har hint
  if (params.prefix4Hint) {
    const prefix3 = params.prefix4Hint.substring(0, 3);
    const matchingByPrefix = filtered.filter(r => r.prefix4.substring(0, 3) === prefix3);
    // Bare bruk prefix-filter hvis det gir oss treff (ellers behold alle)
    if (matchingByPrefix.length > 0) filtered = matchingByPrefix;
  }

  // Score alle kandidater
  const allScored = filtered
    .map(r => scoreCandidate(r, params.vehicle, params.knownFlags, params.prefix4Hint))
    .sort((a, b) => b.score - a.score);

  // Soft-filter fallback: prøv hard filter først, men fall tilbake til alle
  // hvis hard filter fjerner for mange (særlig kritisk når kType-match
  // er sterk men flagg-data er ufullstendige)
  const hardFiltered = allScored.filter(s => s.flagsMismatched.length === 0);
  const scored = hardFiltered.length >= 3 ? hardFiltered : allScored;

  const top1 = scored[0] ?? null;
  const top2 = scored[1] ?? null;

  // Beregn margin og exact_match
  let margin = top1 && top2 ? top1.score - top2.score : top1 ? 100 : 0;

  // Tie-breaker: hvis top1 og top2 har samme score, foretrekk lavest antall
  // "unknown flagg" (kandidat med MINST utstyr = mest sannsynlig basis-variant)
  if (top1 && top2 && margin === 0) {
    if (top1.flagsUnknown.length < top2.flagsUnknown.length) {
      margin = top2.flagsUnknown.length - top1.flagsUnknown.length;
      // Adjust score for differensiering
      (top1 as any).score += (margin * 0.5);
    }
  }
  // Justert terskel: 40p uten kType (modell+år+leverandør) + 15p margin
  // er en sterk indikasjon på unik match
  const exact_match =
    top1 !== null &&
    top1.score >= 40 &&
    (top2 === null || margin >= 15) &&
    (top1.flagsMismatched.length === 0 || top1.breakdown.kTypeMatch >= 30);

  // Hvilke flagg trenger bruker-input?
  // = flagg som varierer blant top-3 kandidater og som vi ikke vet
  const needs_user_input: string[] = [];
  if (!exact_match && scored.length > 1) {
    const top3 = scored.slice(0, 3);
    for (const flag of FLAG_KEYS) {
      if (params.knownFlags[flag] !== undefined) continue;
      const values = new Set(top3.map(s => (s.record as any)[flag]));
      if (values.size > 1) needs_user_input.push(flag);
    }
  }

  return {
    exact_match,
    best_candidate: top1,
    alternatives: scored.slice(0, topN),
    needs_user_input,
    total_candidates: filtered.length,
    diagnostics: {
      vehicle: params.vehicle,
      knownFlags: params.knownFlags,
      margin: top2 ? Math.round(margin * 100) / 100 : undefined,
    },
  };
}

/**
 * Slå opp prefix4 fra ktype-prefix4-cache basert på brand:model:year.
 * Prøver både normalisert og rå brand-form, og fuzzy modell-match.
 */
export function lookupPrefix4(
  cache: any,
  brand: string,
  model: string,
  year?: number
): string | undefined {
  if (!cache?.entries) return undefined;
  const brandVariants = new Set([
    brand.toUpperCase(),
    normalizeBrand(brand),
    normalizeBrand(brand) === "VOLKSWAGEN" ? "VW" : normalizeBrand(brand),
    normalizeBrand(brand) === "MERCEDES-BENZ" ? "MERCEDES" : normalizeBrand(brand),
  ]);
  const m = model.toUpperCase();
  const coreModel = m.split(/[\s(]/)[0];

  for (const b of brandVariants) {
    if (!b) continue;
    const keys = year
      ? [`${b}:${m}:${year}`, `${b}:${coreModel}:${year}`, `${b}:${m}`, `${b}:${coreModel}`, `${b}:${year}`]
      : [`${b}:${m}`, `${b}:${coreModel}`];
    for (const key of keys) {
      const entries = cache.entries[key];
      if (entries && entries.length > 0) {
        const sorted = [...entries].sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0));
        return sorted[0].prefix4;
      }
    }
  }
  return undefined;
}
