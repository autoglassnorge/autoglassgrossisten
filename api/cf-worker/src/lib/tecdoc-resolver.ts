/**
 * TecDoc kType resolver — pre-processed index lookup.
 * Fallback when Bovsoft API and glass_rules D1 cache are empty.
 */
import IDX from "../data/tecdoc-index.json";
import { normalizeBrand, getBrandAliases } from "./brand";

/* ── Types ────────────────────────────────────────────────── */
export interface TecDocCandidate {
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  score: number;
  reasons: string[];
}

export interface TecDocResult {
  status: "resolved" | "ambiguous" | "no_match";
  candidates: TecDocCandidate[];
}

/* ── Index unpacking ──────────────────────────────────────── */
interface IndexEntry {
  ktype: number;
  brandId: number;
  modelId: number;
  yearFrom: number;
  yearTo: number;
}

const brandNames: string[] = [];
for (const [name, id] of Object.entries(IDX.brands)) {
  brandNames[id] = name;
}

const modelNames: string[] = [];
for (const [name, id] of Object.entries(IDX.models)) {
  modelNames[id] = name;
}

const entries: IndexEntry[] = IDX.entries.map((e) => ({
  ktype: e[0],
  brandId: e[1],
  modelId: e[2],
  yearFrom: e[3],
  yearTo: e[4],
}));

/* ── Pre-compute canonical brands per entry ───────────────── */
const canonicalBrands: string[] = brandNames.map((b) => normalizeBrand(b));

/* ── Pre-group entries by canonical brand for fast filtering ─ */
const entriesByCanonicalBrand = new Map<string, IndexEntry[]>();
for (const entry of entries) {
  const cb = canonicalBrands[entry.brandId];
  const list = entriesByCanonicalBrand.get(cb);
  if (list) {
    list.push(entry);
  } else {
    entriesByCanonicalBrand.set(cb, [entry]);
  }
}

/* ── Model normalization helpers ──────────────────────────── */
const NOISE_WORDS = new Set([
  "HATCHBACK",
  "STATIONWAGON",
  "STASJONSVOGN",
  "ESTATE",
  "BREAK",
  "AVANT",
  "TOURING",
  "SEDAN",
  "SALOON",
  "SAL",
  "LIMOUSINE",
  "LIMO",
  "COUPE",
  "CPE",
  "CABRIOLET",
  "CONVERTIBLE",
  "ROADSTER",
  "SPIDER",
  "SPYDER",
  "TARGA",
  "FASTBACK",
  "SPORTBACK",
  "SHOOTING",
  "BRAKE",
  "SW",
  "WAGON",
  "VAN",
  "KASSEVOGN",
  "VAREBIL",
  "MINIVAN",
  "MPV",
  "SUV",
  "CROSSOVER",
  "OFFROAD",
  "OFF-ROAD",
  "PICKUP",
  "PICK-UP",
  "CHASSIS",
  "FLATBED",
  "TIPP",
  "TIPPER",
  "DUMP",
  "PLATFORM",
  "BOX",
  "PANEL",
  "COMBI",
  "KOMBI",
  "3D",
  "4D",
  "5D",
  "2D",
  "3DR",
  "4DR",
  "5DR",
  "2DR",
  "3-DOOR",
  "4-DOOR",
  "5-DOOR",
  "2-DOOR",
  "DOOR",
  "DOORS",
  "AUTOMATIC",
  "AUTO",
  "MANUAL",
  "MAN",
  "TIPTRONIC",
  "DSG",
  "CVT",
  "STEPTRONIC",
  "X-DRIVE",
  "XDRIVE",
  "QUATTRO",
  "4MATIC",
  "4-MATIC",
  "4X4",
  "4WD",
  "AWD",
  "RWD",
  "FWD",
  "TDI",
  "TSI",
  "FSI",
  "DCI",
  "HDI",
  "CDI",
  "TCE",
  "GDI",
  "MPI",
  "TFSI",
  "TWINAIR",
  "MULTIJET",
  "JTDM",
  "JTD",
  "HPI",
  "SPI",
  "VVTI",
  "VVT-I",
  "D-4D",
  "D4D",
  "D-CAT",
  "DCAT",
  "I-DTEC",
  "IDTEC",
  "CDTI",
  "TDCI",
  "SDI",
  "PDI",
  "XDI",
  "E-TEC",
  "ETEC",
  "ECOTEC",
  "ECOBOOST",
  "SKYACTIV",
  "MIVEC",
  "VTEC",
  "I-VTEC",
  "IVTEC",
  "LASTEVOGN",
  "LASTEBIL",
  "AUTOMOBILES",
  "CARS",
  "VANS",
  "HBK",
  "SED",
  "CAB",
  "WAG",
  "AFMKT",
  "NO",
  "RAM",
  "SOFTTOP",
  "SOFT/TOP",
  "HARDTOP",
  "HARD/TOP",
  "ST",
  "VOGN",
  "CLASS",
  "SERIES",
]);

const MODEL_ALIASES: Record<string, string> = {
  "3 SERIES": "3",
  "5 SERIES": "5",
  "7 SERIES": "7",
  "1 SERIES": "1",
  "2 SERIES": "2",
  "4 SERIES": "4",
  "6 SERIES": "6",
  "8 SERIES": "8",
  "C-CLASS": "C CLASS",
  "E-CLASS": "E CLASS",
  "S-CLASS": "S CLASS",
  "A-CLASS": "A CLASS",
  "B-CLASS": "B CLASS",
  "G-CLASS": "G CLASS",
  "M-CLASS": "M CLASS",
  "R-CLASS": "R CLASS",
  "X-CLASS": "X CLASS",
  "CL-CLASS": "CL CLASS",
  "CLK-CLASS": "CLK CLASS",
  "CLS-CLASS": "CLS CLASS",
  "SL-CLASS": "SL CLASS",
  "SLK-CLASS": "SLK CLASS",
  "GL-CLASS": "GL CLASS",
  "GLA-CLASS": "GLA CLASS",
  "GLB-CLASS": "GLB CLASS",
  "GLC-CLASS": "GLC CLASS",
  "GLE-CLASS": "GLE CLASS",
  "GLS-CLASS": "GLS CLASS",
  "CR-V": "CRV",
  "CX-3": "CX3",
  "CX-5": "CX5",
  "CX-7": "CX7",
  "CX-9": "CX9",
  "MX-5": "MX5",
  "MX-3": "MX3",
  "MX-6": "MX6",
  "RX-7": "RX7",
  "RX-8": "RX8",
  "HI-LUX": "HILUX",
  "LAND-CRUISER": "LAND CRUISER",
  "LANDCRUISER": "LAND CRUISER",
  "X-TRAIL": "XTRAIL",
  "CMAX": "C-MAX",
  "BMAX": "B-MAX",
  "SMAX": "S-MAX",
};

function applyAliases(text: string): string {
  // Whole-word or standalone replacements
  for (const [alias, replacement] of Object.entries(MODEL_ALIASES)) {
    const re = new RegExp(`\\b${alias.replace(/[-/]/g, "[-/]?")}\\b`, "g");
    text = text.replace(re, replacement);
  }
  return text;
}

function normalizeModelText(raw: string): string {
  let text = raw.toUpperCase().trim();

  // Apply aliases first (before stripping punctuation so hyphenated aliases match)
  text = applyAliases(text);

  text = text
    .replace(/[^A-Z0-9\s\(\)\-/]/g, " ")
    .replace(/[\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const noise of NOISE_WORDS) {
    const re = new RegExp(`\\b${noise.replace(/[-/]/g, "[-/]?")}\\b`, "g");
    text = text.replace(re, " ");
  }

  return text.replace(/\s+/g, " ").trim();
}

function extractTokens(text: string): string[] {
  const norm = normalizeModelText(text);
  return norm
    .split(/\s+/)
    .filter((t) => t.length >= 2 || /^\d$/.test(t));
}

function extractChassisCodes(text: string): string[] {
  const codes: string[] = [];
  // Standard: E90, W204, B8, F30, C6
  const m1 = text.match(/\b([A-Z]\d{1,3}[A-Z]?)\b/g);
  if (m1) codes.push(...m1);
  // VW-style: 5G1, 8K2, 1K1
  const m2 = text.match(/\b(\d[A-Z]\d{1,2})\b/g);
  if (m2) codes.push(...m2);
  // Roman numerals: VII, VIII, VI, IV
  const m3 = text.match(/\b(V?I{1,3}|IV|VI{1,3}|IX|X{1,3})\b/gi);
  if (m3) codes.push(...m3.map((r) => r.toUpperCase()));
  return codes;
}

/* ── Pre-compute model metadata ───────────────────────────── */
interface ModelMeta {
  normText: string;
  tokens: string[];
  tokenSet: Set<string>;
  chassis: string[];
  chassisSet: Set<string>;
}

const modelMeta: ModelMeta[] = new Array(modelNames.length);
for (let i = 0; i < modelNames.length; i++) {
  const normText = normalizeModelText(modelNames[i]);
  const tokens = extractTokens(modelNames[i]);
  const chassis = extractChassisCodes(modelNames[i]);
  modelMeta[i] = {
    normText,
    tokens,
    tokenSet: new Set(tokens),
    chassis,
    chassisSet: new Set(chassis),
  };
}

/* ── Year compatibility ───────────────────────────────────── */
function isYearCompatible(year: number, from: number, to: number): boolean {
  if (from === 0 && to === 0) return true;
  if (from > 0 && year < from - 1) return false;
  if (to > 0 && year > to + 1) return false;
  return true;
}

/* ── Scoring ──────────────────────────────────────────────── */
function scoreEntry(
  inputBrand: string,
  inputNorm: string,
  inputTokens: Set<string>,
  inputChassis: Set<string>,
  year: number | undefined,
  entry: IndexEntry
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const candidateBrand = canonicalBrands[entry.brandId];

  // Brand match
  if (inputBrand && candidateBrand) {
    if (inputBrand === candidateBrand) {
      score += 0.4;
      reasons.push("exact brand match");
    } else {
      const aliases = getBrandAliases(inputBrand);
      if (aliases.some((a) => a.toUpperCase() === brandNames[entry.brandId].toUpperCase())) {
        score += 0.3;
        reasons.push("partial brand match (alias)");
      }
    }
  }

  const meta = modelMeta[entry.modelId];

  // Chassis match
  if (inputChassis.size > 0 && meta.chassisSet.size > 0) {
    let common = 0;
    for (const c of inputChassis) {
      if (meta.chassisSet.has(c)) common++;
    }
    if (common > 0) {
      score += 0.35;
      reasons.push("exact chassis match");
    }
  }

  // Model token overlap
  if (inputTokens.size > 0 && meta.tokenSet.size > 0) {
    let common = 0;
    for (const t of inputTokens) {
      if (meta.tokenSet.has(t)) common++;
    }
    // Use precision for short queries, Jaccard for longer ones
    const overlap =
      inputTokens.size <= 2
        ? common / inputTokens.size
        : common / Math.max(inputTokens.size, meta.tokenSet.size);
    if (overlap >= 0.7) {
      score += 0.3;
      reasons.push("strong model match");
    } else if (overlap >= 0.4) {
      score += 0.15;
      reasons.push("moderate model match");
    }

    // Containment bonus for short normalized strings
    if (inputNorm.length >= 1 && meta.normText.includes(inputNorm)) {
      score += 0.1;
      reasons.push("model containment");
    } else if (meta.normText.length >= 2 && inputNorm.includes(meta.normText)) {
      score += 0.05;
      reasons.push("model containment");
    }
  }

  // Year compatibility
  if (year !== undefined && year !== null) {
    if (isYearCompatible(year, entry.yearFrom, entry.yearTo)) {
      score += 0.2;
      reasons.push("year compatible");
    } else {
      score -= 0.1;
      reasons.push("year mismatch");
    }
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

/* ── Public resolver ──────────────────────────────────────── */
export function resolveTecDocKType(
  make: string,
  model: string,
  year?: number
): TecDocResult {
  const normBrand = normalizeBrand(make);
  const inputNorm = normalizeModelText(model);
  const inputTokens = new Set(extractTokens(model));
  const inputChassis = new Set(extractChassisCodes(model));

  // Gather candidate pools: exact brand first, then aliases
  const pools: IndexEntry[][] = [];
  const exactPool = entriesByCanonicalBrand.get(normBrand);
  if (exactPool) pools.push(exactPool);

  const aliasSet = new Set<string>();
  for (const alias of getBrandAliases(make)) {
    const canon = normalizeBrand(alias);
    if (canon !== normBrand) aliasSet.add(canon);
  }
  for (const canon of aliasSet) {
    const pool = entriesByCanonicalBrand.get(canon);
    if (pool) pools.push(pool);
  }

  // If no brand pool found at all, scan everything (expensive but necessary for unknown brands)
  if (pools.length === 0) {
    pools.push(entries);
  }

  // Score and keep best per ktype
  const bestByKtype = new Map<number, { entry: IndexEntry; score: number; reasons: string[] }>();

  for (const pool of pools) {
    for (const entry of pool) {
      const { score, reasons } = scoreEntry(
        normBrand,
        inputNorm,
        inputTokens,
        inputChassis,
        year,
        entry
      );
      if (score < 0.15) continue; // early prune
      const existing = bestByKtype.get(entry.ktype);
      if (!existing || existing.score < score) {
        bestByKtype.set(entry.ktype, { entry, score, reasons });
      }
    }
  }

  // Convert to candidates, sort, slice top 5
  const candidates: TecDocCandidate[] = Array.from(bestByKtype.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => ({
      ktype: c.entry.ktype,
      brand: brandNames[c.entry.brandId],
      model: modelNames[c.entry.modelId],
      yearFrom: c.entry.yearFrom,
      yearTo: c.entry.yearTo,
      score: c.score,
      reasons: c.reasons,
    }));

  if (candidates.length === 0) {
    return { status: "no_match", candidates: [] };
  }

  const bestScore = candidates[0].score;
  const status: TecDocResult["status"] =
    bestScore >= 0.75 ? "resolved" : bestScore >= 0.4 ? "ambiguous" : "no_match";

  return { status, candidates };
}
