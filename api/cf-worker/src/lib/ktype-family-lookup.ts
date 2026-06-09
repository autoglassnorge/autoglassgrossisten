/**
 * kType Family Lookup for Ordremottaker
 * ======================================
 * Når NER finner make+model+year, slår vi opp i ktype_families for å finne
 * exact kType. Deretter query glass_catalog med kType-exact match først.
 *
 * Duplicates model cleaning logic from build-ktype-families.mjs to ensure
 * the same normalization produces the same family keys.
 */

import type { Env } from "../types";

// ── Brand normalization (sync with build-ktype-families.mjs) ──
const BRAND_MAP: Record<string, string> = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER",
  CITROËN: "CITROEN",
  DS: "CITROEN",
  ALFA: "ALFA ROMEO",
  ABARTH: "FIAT",
  "LAMBORGH.": "LAMBORGHINI",
  "MITS.": "MITSUBISHI",
  MITS: "MITSUBISHI",
  NISS: "NISSAN",
  NISSA: "NISSAN",
  HON: "HONDA",
  TOY: "TOYOTA",
  TOYOT: "TOYOTA",
  REN: "RENAULT",
  "REN.": "RENAULT",
  RENAU: "RENAULT",
  HYUNADI: "HYUNDAI",
  "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT",
  PEUGE: "PEUGEOT",
  CHEV: "CHEVROLET",
  CHEVR: "CHEVROLET",
  "CHEVR.": "CHEVROLET",
  DAEWOO: "DAEWOO (CHEVROLET)",
  SUZ: "SUZUKI",
  FOR: "FORD",
  "FORD,": "FORD",
  FORDA: "FORD",
  "KIA.": "KIA",
  "SUB.": "SUBARU",
  "MAZ.": "MAZDA",
  "MAZDA.": "MAZDA",
  "LEX.": "LEXUS",
  JAG: "JAGUAR",
};

export function normalizeBrand(brand: string): string {
  const b = (brand || "").toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

// ── Model cleaning (sync with build-ktype-families.mjs) ────────
const NOISE_TOKENS = new Set([
  "COUPE", "SALOON", "ESTATE", "HATCHBACK", "CONVERTIBLE", "CABRIOLET",
  "ROADSTER", "SPIDER", "TARGA", "FASTBACK", "SPORTBACK", "SHOOTING",
  "BRAKE", "SW", "WAGON", "VAN", "KASSEVOGN", "VAREBIL", "MINIVAN", "MPV",
  "SUV", "CROSSOVER", "OFFROAD", "OFF-ROAD", "PICKUP", "PICK-UP",
  "CHASSIS", "FLATBED", "TIPP", "TIPPER", "DUMP", "PLATFORM", "BOX",
  "PANEL", "COMBI", "KOMBI", "STASJONSVOGN", "LASTEVOGN", "LASTEBIL",
  "BUSS", "VOGN", "SOFTTOP", "SOFT/TOP", "HARDTOP", "HARD/TOP", "ST",
  "3D", "4D", "5D", "2D", "3DR", "4DR", "5DR", "2DR", "3-DOOR", "4-DOOR",
  "5-DOOR", "2-DOOR", "DOOR", "DOORS",
  "AUTOMATIC", "AUTO", "MANUAL", "MAN", "TIPTRONIC", "DSG", "CVT",
  "STEPTRONIC", "X-DRIVE", "XDRIVE",
  "QUATTRO", "4MATIC", "4-MATIC", "4X4", "4WD", "AWD", "RWD", "FWD",
  "AUTOMOBILES", "CARS", "VANS", "HBK", "SED", "CAB", "WAG", "AFMKT",
  "NO", "RAM", "CLASS", "SERIES",
]);

// Model synonyms: Norwegian/English variants that should be normalized
const MODEL_SYNONYMS: Record<string, string> = {
  "KLASSE": "CLASS",
  "KASSEVOGN": "VAN",
  "VAREBIL": "VAN",
  "STASJONSVOGN": "WAGON",
  "KOMBI": "COMBI",
  // VW T-family: Caravelle, Multivan, California share Transporter chassis
  "CARAVELLE": "TRANSPORTER",
  "MULTIVAN": "TRANSPORTER",
  "CALIFORNIA": "TRANSPORTER",
};

function isEngineToken(token: string): boolean {
  if (/^\d+\.\d+$/.test(token)) return true;
  // Only treat as engine code if it's clearly an engine designation
  // Skip common model names like I4 (BMW i4), V8 (model names)
  if (/^[VL]\d{1,2}$/i.test(token)) return true;
  if (/^(TDI|TSI|FSI|CDI|HDI|DCI|TCE|GDI|MPI|TFSI|TWINAIR|MULTIJET|JTDM|JTD|HPI|SPI|VVTI|VVT-I|D-4D|D4D|D-CAT|DCAT|I-DTEC|IDTEC|CDTI|TDCI|SDI|XDI|E-TEC|ETEC|ECOTEC|ECOBOOST|SKYACTIV|MIVEC|VTEC|I-VTEC|IVTEC)$/i.test(token)) return true;
  if (/^(D|TD|T)$/i.test(token)) return true;
  return false;
}

function cleanModel(model: string, brand: string): string {
  let text = (model || "").toUpperCase().trim();

  const brandPrefix = (brand || "").toUpperCase().trim();
  if (brandPrefix && text.startsWith(brandPrefix + " ")) {
    text = text.slice(brandPrefix.length + 1).trim();
  }
  const normBrand = normalizeBrand(brand);
  if (normBrand && normBrand !== brandPrefix && text.startsWith(normBrand + " ")) {
    text = text.slice(normBrand.length + 1).trim();
  }
  if (text.startsWith("FORD USA ")) text = text.slice(9).trim();
  if (text.startsWith("FORD ")) text = text.slice(5).trim();
  if (text.startsWith("CHEVROLET ")) text = text.slice(11).trim();

  text = text.replace(/\s*\([^)]*\)\s*/g, " ");
  // Split on both whitespace and hyphens for better tokenization
  text = text.replace(/-/g, " ");

  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const kept: string[] = [];
  for (const token of tokens) {
    // Apply synonyms
    const normalizedToken = MODEL_SYNONYMS[token] || token;
    if (NOISE_TOKENS.has(normalizedToken)) continue;
    if (isEngineToken(normalizedToken)) continue;
    kept.push(normalizedToken);
  }
  return kept.join(" ").trim();
}

/** Token-based Jaccard similarity — normalizes hyphens to spaces */
function jaccard(a: string, b: string): number {
  const normalize = (s: string) => s.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  const sa = new Set(normalize(a));
  const sb = new Set(normalize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  const intersection = new Set([...sa].filter((x) => sb.has(x)));
  const union = new Set([...sa, ...sb]);
  return intersection.size / union.size;
}

// ── Result type ────────────────────────────────────────────────
export interface KtypeLookupResult {
  ktypes: number[];
  familyId: number | null;
  canonicalModel: string | null;
  confidence: number;
}

// ── Main lookup ────────────────────────────────────────────────
/**
 * Find kType(s) for a vehicle by make+model+year using ktype_families.
 *
 * Strategy:
 * 1. Normalize brand, clean model (same logic as family builder)
 * 2. Query ktype_families by canonical_brand + year overlap
 * 3. Score each family by token Jaccard similarity on canonical_model
 * 4. If best score >= 0.3, fetch members from ktype_family_members
 * 5. Return all ktypes in the matched family
 *
 * Falls back to empty result if no match — caller should use brand+year.
 */
export async function findKtypeByVehicle(
  db: D1Database,
  make: string,
  model: string,
  year: number
): Promise<KtypeLookupResult> {
  const normBrand = normalizeBrand(make);
  const cleanedModel = cleanModel(model, make);

  if (!normBrand || !cleanedModel) {
    return { ktypes: [], familyId: null, canonicalModel: null, confidence: 0 };
  }

  try {
    // Query families with year overlap and matching brand
    const { results: families } = await db
      .prepare(
        `SELECT id, canonical_model, year_from, year_to, ktype_count
         FROM ktype_families
         WHERE canonical_brand = ?
           AND year_from <= ?
           AND year_to >= ?
         ORDER BY ktype_count DESC`
      )
      .bind(normBrand, year, year)
      .all<{ id: number; canonical_model: string; year_from: number; year_to: number; ktype_count: number }>();

    if (!families || families.length === 0) {
      return { ktypes: [], familyId: null, canonicalModel: null, confidence: 0 };
    }

    // Score each family by Jaccard similarity on canonical_model
    let bestFamily: typeof families[0] | null = null;
    let bestScore = 0;

    for (const family of families) {
      const score = jaccard(cleanedModel, family.canonical_model);
      if (score > bestScore) {
        bestScore = score;
        bestFamily = family;
      }
    }

    // Threshold: require at least 20% token overlap (lowered for better coverage)
    if (!bestFamily || bestScore < 0.2) {
      return { ktypes: [], familyId: null, canonicalModel: null, confidence: bestScore };
    }

    // Fetch all ktypes in the matched family
    const { results: members } = await db
      .prepare(`SELECT ktype FROM ktype_family_members WHERE family_id = ?`)
      .bind(bestFamily.id)
      .all<{ ktype: number }>();

    const ktypes = (members || []).map((m) => m.ktype);

    return {
      ktypes,
      familyId: bestFamily.id,
      canonicalModel: bestFamily.canonical_model,
      confidence: bestScore,
    };
  } catch (e) {
    console.error(
      `[kTypeFamilyLookup] Error for ${make} ${model} ${year}:`,
      e instanceof Error ? e.message : String(e)
    );
    return { ktypes: [], familyId: null, canonicalModel: null, confidence: 0 };
  }
}

/**
 * Query glass_catalog by kType exact match.
 * Returns candidates filtered by position if provided.
 */
export async function queryByKtype(
  db: D1Database,
  ktypes: number[],
  position?: string | null
): Promise<Array<Record<string, unknown>>> {
  if (!ktypes.length) return [];

  // Build IN clause with placeholders
  const placeholders = ktypes.map(() => "?").join(",");
  const params = [...ktypes];

  let sql = `SELECT * FROM glass_catalog WHERE ktype IN (${placeholders})`;

  if (position) {
    const pos = position.toLowerCase();
    if (pos === "frontrute") {
      sql += ` AND (LOWER(category) LIKE '%front%' OR LOWER(description) LIKE '%front%')`;
    } else if (pos === "bakrute") {
      sql += ` AND (LOWER(category) LIKE '%bak%' OR LOWER(description) LIKE '%bak%') AND LOWER(category) NOT LIKE '%dør%' AND LOWER(category) NOT LIKE '%dor%'`;
    } else if (pos.startsWith("dørrute") || pos === "dørrute" || pos === "dør") {
      sql += ` AND (LOWER(category) LIKE '%dør%' OR LOWER(category) LIKE '%dor%')`;
    } else if (pos.startsWith("sideglass") || pos === "siderute" || pos === "sideglass" || pos === "ventilrute") {
      sql += ` AND (LOWER(category) LIKE '%side%' OR LOWER(category) LIKE '%ventil%')`;
    }
  }

  sql += ` LIMIT 50`;

  try {
    const { results } = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
    return results || [];
  } catch (e) {
    console.error(`[queryByKtype] Error:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}
