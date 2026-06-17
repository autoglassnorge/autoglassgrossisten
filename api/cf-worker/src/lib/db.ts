/**
 * D1 query helpers.
 */

import type {
  GlassRecord,
  GroundTruthRecord,
  CalibrationRequirement,
  KtypeRegistryInfo,
  VehicleFingerprint,
  VinKtypeMapEntry,
} from "../types";
import { normalizeBrand, getBrandAliases } from "./brand";
import { memoizeAsync } from "./memo";
import type { TecdocVehicle } from "../providers/svv";
import { inferRecordEquipment, computeEquipmentMatch } from "./equipment";
import { isBodyCompatible } from "./body-mapping";

// ---------------------------------------------------------------------------
// Environment-configurable constants
// ---------------------------------------------------------------------------

/**
 * Minimum hit_count required to trust a ktype→eurocode mapping.
 * Configurable via KTYPE_CONFIDENCE_THRESHOLD env var (Worker secret)
 * to allow tuning without code deploy.
 */
export const KTYPE_CONFIDENCE_THRESHOLD = 5;

/** KV TTL for popular ktype mappings (seconds) */
const KTYPE_KV_CACHE_TTL_SECONDS = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Basic catalog lookups
// ---------------------------------------------------------------------------

export async function queryByPrefix4(db: D1Database, prefix4: string, limit = 50): Promise<GlassRecord[]> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM glass_catalog WHERE prefix4 = ? LIMIT ?")
      .bind(prefix4, limit)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByPrefix4 failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function _queryByEurocode(db: D1Database, eurocode: string): Promise<GlassRecord | null> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM glass_catalog WHERE eurocode = ? LIMIT 1")
      .bind(eurocode)
      .all();
    return ((results || []) as unknown as GlassRecord[])[0] || null;
  } catch (e) {
    console.error(`queryByEurocode failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
export const queryByEurocode = memoizeAsync(_queryByEurocode, 1000, 60_000);

async function _queryByEurocodes(db: D1Database, eurocodes: string[]): Promise<GlassRecord[]> {
  if (!eurocodes.length) return [];
  const unique = [...new Set(eurocodes)];
  const placeholders = unique.map(() => "?").join(",");
  try {
    const { results } = await db
      .prepare(`SELECT * FROM glass_catalog WHERE eurocode IN (${placeholders}) LIMIT 50`)
      .bind(...unique)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByEurocodes failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
export const queryByEurocodes = memoizeAsync(_queryByEurocodes, 500, 60_000);

export async function queryBySupplierSku(db: D1Database, sku: string): Promise<GlassRecord | null> {
  try {
    const result = await db
      .prepare("SELECT * FROM glass_catalog WHERE supplier_sku = ? COLLATE NOCASE")
      .bind(sku)
      .first();
    return result as unknown as GlassRecord | null;
  } catch (e) {
    console.error(`queryBySupplierSku failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function queryByOemNumber(db: D1Database, oem: string): Promise<GlassRecord[]> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM glass_catalog WHERE oem_numbers LIKE ? COLLATE NOCASE LIMIT 10")
      .bind(`%${oem}%`)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByOemNumber failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function _queryByKtype(db: D1Database, ktype: number): Promise<GlassRecord[]> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM glass_catalog WHERE ktype = ? LIMIT 20")
      .bind(ktype)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByKtype failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
export const queryByKtype = memoizeAsync(_queryByKtype, 500, 60_000);

export async function queryByKtypes(db: D1Database, ktypes: number[]): Promise<GlassRecord[]> {
  if (!ktypes.length) return [];
  try {
    const placeholders = ktypes.map(() => "?").join(",");
    const { results } = await db
      .prepare(`SELECT * FROM glass_catalog WHERE ktype IN (${placeholders}) LIMIT 50`)
      .bind(...ktypes)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByKtypes failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Brand + year lookups
// ---------------------------------------------------------------------------

async function _queryByBrandAndYear(
  db: D1Database,
  brand: string,
  year: number,
  modelHint?: string,
  prefix4?: string,
  _bodyHint?: string
): Promise<GlassRecord[]> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => "?").join(",");
  let sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders}) AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)`;
  const params: (string | number)[] = [...brands, year, year];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  // Note: _bodyHint is used by scoreBodyCompatibility() for post-query scoring,
  // not for SQL filtering (D1 SQLite lacks expressive ORDER BY CASE).
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 10000";
  try {
    const { results } = await db.prepare(sql).bind(...params).all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByBrandAndYear failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
export const queryByBrandAndYear = memoizeAsync(_queryByBrandAndYear, 500, 60_000);

async function _queryByBrandOnly(
  db: D1Database,
  brand: string,
  modelHint?: string,
  prefix4?: string
): Promise<GlassRecord[]> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => "?").join(",");
  let sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders})`;
  const params: (string | number)[] = [...brands];
  if (modelHint) {
    sql += " AND (model LIKE ? OR description LIKE ?)";
    params.push(`%${modelHint}%`, `%${modelHint}%`);
  }
  if (prefix4) {
    sql += " AND prefix4 = ?";
    params.push(prefix4);
  }
  sql += " ORDER BY year_from DESC NULLS LAST LIMIT 500";
  try {
    const { results } = await db.prepare(sql).bind(...params).all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByBrandOnly failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
export const queryByBrandOnly = memoizeAsync(_queryByBrandOnly, 500, 60_000);

// ---------------------------------------------------------------------------
// Fuzzy brand+year search
// ---------------------------------------------------------------------------

function tokenizeModel(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = ((matches / len1) + (matches / len2) + ((matches - transpositions / 2) / matches)) / 3;
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return jaro + prefixLen * 0.1 * (1 - jaro);
}

function fuzzyModelScore(vehicleModel: string, recordModel: string | null): number {
  if (!recordModel) return 0;
  const vm = vehicleModel.toLowerCase().trim();
  const rm = recordModel.toLowerCase().trim();
  if (vm.includes(rm) || rm.includes(vm)) return 1.0;
  const vTokens = tokenizeModel(vm);
  const rTokens = tokenizeModel(rm);
  const common = rTokens.filter((t) => vTokens.includes(t));
  const overlapScore = common.length / Math.max(vTokens.length, rTokens.length);
  const jwScore = jaroWinkler(vm, rm);
  return overlapScore * 0.6 + jwScore * 0.4;
}

async function _queryFuzzyBrandYear(
  db: D1Database,
  brand: string,
  year: number,
  vehicleModel: string,
  limit = 50
): Promise<Array<{ record: GlassRecord; score: number }>> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => "?").join(",");
  const sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders}) AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?) ORDER BY year_from DESC NULLS LAST LIMIT 1000`;
  try {
    const { results } = await db.prepare(sql).bind(...brands, year, year).all();
    const records = (results || []) as unknown as GlassRecord[];
    const scored = records.map((r) => ({
      record: r,
      score: fuzzyModelScore(vehicleModel, r.model),
    }));
    return scored
      .filter((s) => s.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (e) {
    console.error(`queryFuzzyBrandYear failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
export const queryFuzzyBrandYear = memoizeAsync(_queryFuzzyBrandYear, 200, 60_000);

/**
 * Query accessory products by their SKUs.
 * Looks up glass_catalog records that are accessories (not the glass itself).
 */
export async function queryAccessories(
  db: D1Database,
  accessorySkus: string[]
): Promise<GlassRecord[]> {
  if (!accessorySkus.length) return [];
  const placeholders = accessorySkus.map(() => "?").join(",");
  try {
    const { results } = await db
      .prepare(`SELECT * FROM glass_catalog WHERE article_number IN (${placeholders}) LIMIT 50`)
      .bind(...accessorySkus)
      .all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryAccessories failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Layer 1.5: equipment + body driven fallback
// ---------------------------------------------------------------------------

export interface VehicleEquipmentFlags {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  hud: boolean;
}

/**
 * Fallback query used when no exact kType match exists.
 * Returns brand/year candidates filtered by category, body compatibility and
 * equipment overlap.  Mismatches are dropped; the rest are ordered by
 * equipment match quality (perfect > good > check).
 */
export async function queryByVehicleEquipment(
  db: D1Database,
  vehicle: TecdocVehicle,
  vehicleFlags: VehicleEquipmentFlags,
  category?: string,
  bodyHint?: string
): Promise<GlassRecord[]> {
  try {
    // Start from the same pool as the regular brand/year fallback.
    const records = await queryByBrandAndYear(db, vehicle.make, vehicle.year, vehicle.model);

    let candidates = records;

    // Optional category filter
    if (category) {
      const cat = category.toLowerCase();
      candidates = candidates.filter((r) => (r.category || "").toLowerCase() === cat);
    }

    // Optional body filter (only when we have a hint for both sides)
    if (bodyHint) {
      candidates = candidates.filter((r) =>
        isBodyCompatible(bodyHint, `${r.description || ""} ${r.model || ""}`)
      );
    }

    // Score equipment overlap and drop clear mismatches.
    const order = { perfect: 3, good: 2, check: 1, mismatch: 0 };
    const scored = candidates
      .map((r) => {
        const recordEquipment = inferRecordEquipment(r);
        const { match } = computeEquipmentMatch(recordEquipment, vehicleFlags);
        return { record: r, match };
      })
      .filter((s) => order[s.match] >= 1) // drop mismatch
      .sort((a, b) => order[b.match] - order[a.match]);

    return scored.map((s) => s.record);
  } catch (e) {
    console.error(`queryByVehicleEquipment failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Catalog metadata
// ---------------------------------------------------------------------------

export async function getCatalogStats(db: D1Database): Promise<{ total: number; brands: number; rulesCount: number }> {
  try {
    const [totalRow, brandRow, rulesRow] = await Promise.all([
      db.prepare("SELECT COUNT(*) as cnt FROM glass_catalog").first(),
      db.prepare("SELECT COUNT(DISTINCT brand) as cnt FROM glass_catalog").first(),
      db.prepare("SELECT COUNT(*) as cnt FROM glass_rules").first(),
    ]);
    return {
      total: (totalRow as any)?.cnt || 0,
      brands: (brandRow as any)?.cnt || 0,
      rulesCount: (rulesRow as any)?.cnt || 0,
    };
  } catch (e) {
    console.error(`getCatalogStats failed: ${e instanceof Error ? e.message : String(e)}`);
    return { total: 0, brands: 0, rulesCount: 0 };
  }
}

export async function getBrandsWithCount(db: D1Database): Promise<Array<{ brand: string; count: number }>> {
  try {
    const { results } = await db
      .prepare("SELECT brand, COUNT(*) as count FROM glass_catalog GROUP BY brand ORDER BY count DESC")
      .all();
    return (results || []) as unknown as Array<{ brand: string; count: number }>;
  } catch (e) {
    console.error(`getBrandsWithCount failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

export async function getCategoriesWithCount(db: D1Database): Promise<Array<{ category: string; count: number }>> {
  try {
    const { results } = await db
      .prepare("SELECT category, COUNT(*) as count FROM glass_catalog GROUP BY category ORDER BY count DESC")
      .all();
    return (results || []) as unknown as Array<{ category: string; count: number }>;
  } catch (e) {
    console.error(`getCategoriesWithCount failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

export async function searchCatalog(
  db: D1Database,
  q: string,
  filters: {
    brand?: string;
    category?: string;
    yearMin?: number;
    yearMax?: number;
    priceMin?: number;
    priceMax?: number;
    equipment?: string[];
    inStock?: boolean;
  },
  offset = 0,
  limit = 100
): Promise<GlassRecord[]> {
  // Tokenize query: split on spaces, remove empty/small tokens
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  
  // Synonym expansion for common glass terms
  // Each key maps to a group of synonyms — at least one must match
  const SYNONYMS: Record<string, string[]> = {
    "frontrute": ["frontrute", "frontruta", "windshield", "fr", "front"],
    "bakrute": ["bakrute", "bakruta", "rear", "bak", "b"],
    "dørrute": ["dørrute", "dørruta", "dør", "door"],
    "dorrute": ["dorrute", "dorruta", "dør", "door"],
    "sideglass": ["sideglass", "side", "siderute", "sideruta"],
    "siderute": ["siderute", "sideruta", "side", "sideglass"],
  };
  
  // Build concept groups: each original token becomes a group
  // If token has synonyms, group = [token] + synonyms
  // Otherwise group = [token]
  const conceptGroups: string[][] = [];
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (SYNONYMS[lowerToken]) {
      // Use synonyms (already includes the original term)
      conceptGroups.push(SYNONYMS[lowerToken]);
    } else {
      conceptGroups.push([token]);
    }
  }
  
  // Build tokenized WHERE clause: each concept group must have at least one match
  // (eurocode, article_number, scan_number, brand, model, description)
  const fieldConditions = [
    "eurocode LIKE ?",
    "article_number LIKE ?",
    "scan_number LIKE ?",
    "brand LIKE ?",
    "model LIKE ?",
    "description LIKE ?",
  ];
  
  let sql: string;
  const params: (string | number)[] = [];
  
  if (conceptGroups.length === 0) {
    // No valid tokens, return all (with filters)
    sql = "SELECT * FROM glass_catalog WHERE 1=1";
  } else {
    // Each concept group: at least one synonym must match at least one field
    const groupClauses: string[] = [];
    for (const group of conceptGroups) {
      const synonymClauses: string[] = [];
      for (const synonym of group) {
        const synonymParams = Array(6).fill(`%${synonym}%`);
        synonymClauses.push(`(${fieldConditions.join(" OR ")})`);
        params.push(...synonymParams);
      }
      groupClauses.push(`(${synonymClauses.join(" OR ")})`);
    }
    sql = `SELECT * FROM glass_catalog WHERE ${groupClauses.join(" AND ")}`;
  }

  if (filters.brand) {
    sql += " AND brand = ?";
    params.push(filters.brand);
  }
  if (filters.category) {
    sql += " AND category = ?";
    params.push(filters.category);
  }
  if (filters.yearMin !== undefined) {
    sql += " AND (year_to IS NULL OR year_to >= ?)";
    params.push(filters.yearMin);
  }
  if (filters.yearMax !== undefined) {
    sql += " AND (year_from IS NULL OR year_from <= ?)";
    params.push(filters.yearMax);
  }
  if (filters.priceMin !== undefined) {
    sql += " AND (price IS NULL OR price >= ?)";
    params.push(filters.priceMin);
  }
  if (filters.priceMax !== undefined) {
    sql += " AND (price IS NULL OR price <= ?)";
    params.push(filters.priceMax);
  }
  if (filters.equipment && filters.equipment.length > 0) {
    const EQUIPMENT_COL_MAP: Record<string, string> = {
      adas: "adas",
      heated: "heated",
      rainsensor: "rain_sensor",
      rain_sensor: "rain_sensor",
      acoustic: "acoustic",
      antenna: "antenna",
      hud: "hud",
      camera: "camera",
      solar: "solar",
      tinted: "tinted",
    };
    for (const eq of filters.equipment) {
      const col = EQUIPMENT_COL_MAP[eq.toLowerCase()];
      if (col) {
        sql += ` AND ${col} = 1`;
      }
    }
  }
  if (filters.inStock) {
    sql += " AND (stock_status IS NOT NULL AND stock_status > 0)";
  }
  sql += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  try {
    const { results } = await db.prepare(sql).bind(...params).all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`searchCatalog failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Ground truth
// ---------------------------------------------------------------------------

export async function queryGroundTruth(db: D1Database, regnr: string): Promise<GroundTruthRecord | null> {
  const hash = await sha256(regnr);
  try {
    const row = await db.prepare("SELECT * FROM ground_truth WHERE regnr_hash = ?").bind(hash).first();
    return row as unknown as GroundTruthRecord | null;
  } catch (e) {
    console.error(`queryGroundTruth failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function queryGroundTruthByVehicle(
  db: D1Database,
  make: string,
  model: string,
  year: number,
  equipment?: { adas?: boolean; rainSensor?: boolean; heated?: boolean; acoustic?: boolean; antenna?: boolean; hud?: boolean; camera?: boolean }
): Promise<GroundTruthRecord | null> {
  try {
    const normalizedMake = normalizeBrand(make);
    let sql = "SELECT * FROM ground_truth WHERE make = ? AND model = ? AND year = ?";
    const params: (string | number)[] = [normalizedMake, model, year];

    if (equipment) {
      if (equipment.adas !== undefined) { sql += " AND adas = ?"; params.push(equipment.adas ? 1 : 0); }
      if (equipment.rainSensor !== undefined) { sql += " AND rain_sensor = ?"; params.push(equipment.rainSensor ? 1 : 0); }
      if (equipment.heated !== undefined) { sql += " AND heated = ?"; params.push(equipment.heated ? 1 : 0); }
      if (equipment.acoustic !== undefined) { sql += " AND acoustic = ?"; params.push(equipment.acoustic ? 1 : 0); }
      if (equipment.antenna !== undefined) { sql += " AND antenna = ?"; params.push(equipment.antenna ? 1 : 0); }
      if (equipment.hud !== undefined) { sql += " AND hud = ?"; params.push(equipment.hud ? 1 : 0); }
      if (equipment.camera !== undefined) { sql += " AND camera = ?"; params.push(equipment.camera ? 1 : 0); }
    }

    sql += " ORDER BY confidence DESC LIMIT 1";
    const row = await db.prepare(sql).bind(...params).first();
    return row as unknown as GroundTruthRecord | null;
  } catch (e) {
    console.error(`queryGroundTruthByVehicle failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Map search category to ground_truth column name. */
function groundTruthColumnForCategory(category: string): string | null {
  const c = category.toLowerCase().trim();
  if (c === "frontrute") return "frontrute_eurocode";
  if (c === "bakrute") return "bakrute_eurocode";
  if (c === "sideglass-fv" || c === "siderute-fv") return "sideglass_fv_eurocode";
  if (c === "sideglass-fh" || c === "siderute-fh") return "sideglass_fh_eurocode";
  if (c === "sideglass-bv" || c === "siderute-bv") return "sideglass_bv_eurocode";
  if (c === "sideglass-bh" || c === "siderute-bh") return "sideglass_bh_eurocode";
  if (c === "dørrute-fv" || c === "dør-fv") return "dor_fv_eurocode";
  if (c === "dørrute-fh" || c === "dør-fh") return "dor_fh_eurocode";
  if (c === "dørrute-bv" || c === "dør-bv") return "dor_bv_eurocode";
  if (c === "dørrute-bh" || c === "dør-bh") return "dor_bh_eurocode";
  if (c === "sideglass" || c === "siderute" || c === "ventilrute") return "sideglass_fv_eurocode";
  if (c === "dørrute" || c === "dør") return "dor_fv_eurocode";
  return null;
}

/**
 * Promote an auto-suggested match to ground_truth once it has been seen
 * enough times.  Requires at least AUTO_GT_HIT_THRESHOLD independent
 * auto_suggestions for the same regnr_hash + eurocode.
 */
export async function promoteAutoGroundTruth(
  db: D1Database,
  regnrHash: string,
  vehicle: TecdocVehicle,
  category: string,
  eurocode: string,
  ktype: number,
  confidence = 0.85
): Promise<void> {
  const col = groundTruthColumnForCategory(category);
  if (!col) return;

  try {
    // Count auto-suggestions for this exact mapping.
    const countRow = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM search_feedback
         WHERE regnr_hash = ? AND eurocode = ? AND action = 'auto_suggested'`
      )
      .bind(regnrHash, eurocode)
      .first();
    const count = (countRow as any)?.cnt || 0;
    if (count < 3) return;

    // Do not overwrite a human-verified ground-truth row.
    const existing = await db
      .prepare("SELECT verified_by FROM ground_truth WHERE regnr_hash = ?")
      .bind(regnrHash)
      .first();
    if (existing && (existing as any).verified_by !== "auto_high_confidence") {
      return;
    }

    await db
      .prepare(
        `INSERT INTO ground_truth (
          regnr_hash, vin, vin_prefix, k_type, make, model, year, ${col},
          verified_by, confidence, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(regnr_hash) DO UPDATE SET
          vin = excluded.vin,
          vin_prefix = excluded.vin_prefix,
          k_type = excluded.k_type,
          make = excluded.make,
          model = excluded.model,
          year = excluded.year,
          ${col} = excluded.${col},
          verified_by = excluded.verified_by,
          confidence = excluded.confidence,
          verified_at = excluded.verified_at`
      )
      .bind(
        regnrHash,
        vehicle.vin || null,
        vehicle.vin ? vehicle.vin.slice(0, 6).toUpperCase() : null,
        ktype || null,
        vehicle.make,
        vehicle.model,
        vehicle.year,
        eurocode,
        "auto_high_confidence",
        confidence
      )
      .run();
  } catch (e) {
    console.error(`promoteAutoGroundTruth failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Vehicle fingerprint
// ---------------------------------------------------------------------------

export async function queryVehicleFingerprint(
  db: D1Database,
  make: string,
  typeCode: string,
  year: number
): Promise<VehicleFingerprint | null> {
  if (!typeCode || typeCode.trim() === "") return null;
  try {
    const result = await db
      .prepare(`
        SELECT * FROM vehicle_fingerprints
        WHERE make = ? AND type_code = ?
          AND (year_from IS NULL OR year_from <= ?)
          AND (year_to IS NULL OR year_to >= ?)
        ORDER BY sample_count DESC
        LIMIT 1
      `)
      .bind(make, typeCode, year, year)
      .first();
    return result as unknown as VehicleFingerprint | null;
  } catch (e) {
    console.error(`queryVehicleFingerprint failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Calibration requirements
// ---------------------------------------------------------------------------

export async function queryCalibrationRequirements(
  db: D1Database,
  make: string,
  model: string,
  year: number
): Promise<CalibrationRequirement[]> {
  try {
    const normalizedMake = normalizeBrand(make);
    const { results } = await db
      .prepare(
        `SELECT sensor_type, sensor_label, calibration_triggers, calibration_type,
                csc_tool_supported, target_plate, notes
         FROM adas_calibration_requirements
         WHERE brand = ? COLLATE NOCASE AND model LIKE ? COLLATE NOCASE AND year_from <= ? AND (year_to IS NULL OR year_to >= ?)
         ORDER BY sensor_type`
      )
      .bind(normalizedMake, model.split(/\s+/)[0] + "%", year, year)
      .all();

    return (results || []).map((r: any) => ({
      sensorType: r.sensor_type,
      sensorLabel: r.sensor_label,
      calibrationTriggers: r.calibration_triggers ? JSON.parse(r.calibration_triggers) : [],
      calibrationType: r.calibration_type || "unknown",
      cscToolSupported: !!r.csc_tool_supported,
      targetPlate: r.target_plate || null,
      notes: r.notes || null,
    }));
  } catch (e) {
    console.error(`queryCalibrationRequirements failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// VIN → kType cache
// ---------------------------------------------------------------------------

const VIN_KTYPE_CONFIDENCE_THRESHOLD = 0.85;

export async function lookupVinKtype(
  db: D1Database,
  vin: string
): Promise<VinKtypeMapEntry | null> {
  try {
    const row = await db
      .prepare(
        `SELECT vin, ktype, make, model, year, confidence, source, regnr_hash,
                created_at, updated_at, expires_at
         FROM vin_ktype_map
         WHERE vin = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .bind(vin)
      .first<Record<string, unknown>>();

    if (!row) return null;
    if (typeof row.confidence === "number" && row.confidence < VIN_KTYPE_CONFIDENCE_THRESHOLD) {
      return null;
    }

    return {
      vin: String(row.vin),
      ktype: Number(row.ktype),
      make: row.make ? String(row.make) : null,
      model: row.model ? String(row.model) : null,
      year: row.year ? Number(row.year) : null,
      confidence: Number(row.confidence),
      source: String(row.source),
      regnrHash: row.regnr_hash ? String(row.regnr_hash) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    };
  } catch (e) {
    console.error(`lookupVinKtype failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function upsertVinKtype(
  db: D1Database,
  entry: Omit<VinKtypeMapEntry, "createdAt" | "updatedAt"> & { expiresInDays?: number }
): Promise<void> {
  try {
    const expiresAt =
      entry.expiresInDays && entry.expiresInDays > 0
        ? new Date(Date.now() + entry.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    await db
      .prepare(
        `INSERT INTO vin_ktype_map
          (vin, ktype, make, model, year, confidence, source, regnr_hash, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(vin) DO UPDATE SET
           ktype = COALESCE(excluded.ktype, vin_ktype_map.ktype),
           make = COALESCE(excluded.make, vin_ktype_map.make),
           model = COALESCE(excluded.model, vin_ktype_map.model),
           year = COALESCE(excluded.year, vin_ktype_map.year),
           confidence = CASE
             WHEN excluded.confidence > vin_ktype_map.confidence THEN excluded.confidence
             ELSE vin_ktype_map.confidence
           END,
           source = CASE
             WHEN excluded.confidence > vin_ktype_map.confidence THEN excluded.source
             ELSE vin_ktype_map.source
           END,
           regnr_hash = COALESCE(excluded.regnr_hash, vin_ktype_map.regnr_hash),
           expires_at = COALESCE(excluded.expires_at, vin_ktype_map.expires_at),
           updated_at = datetime('now')`
      )
      .bind(
        entry.vin,
        entry.ktype,
        entry.make ?? null,
        entry.model ?? null,
        entry.year ?? null,
        entry.confidence,
        entry.source,
        entry.regnrHash ?? null,
        expiresAt
      )
      .run();
  } catch (e) {
    console.error(`upsertVinKtype failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// kType registry
// ---------------------------------------------------------------------------

async function _queryKtypeRegistry(db: D1Database, ktype: number): Promise<KtypeRegistryInfo | null> {
  try {
    const row = await db
      .prepare(
        `SELECT ktype, brand, model, year_from, year_to, body, source
         FROM ktype_registry
         WHERE ktype = ?`
      )
      .bind(ktype)
      .first();
    if (!row) return null;
    return {
      ktype: (row as any).ktype,
      brand: (row as any).brand,
      model: (row as any).model,
      yearFrom: (row as any).year_from,
      yearTo: (row as any).year_to,
      body: (row as any).body,
      source: (row as any).source,
    };
  } catch (e) {
    console.error(`queryKtypeRegistry failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
export const queryKtypeRegistry = memoizeAsync(_queryKtypeRegistry, 1000, 300_000);

// ---------------------------------------------------------------------------
// kType matches (statistical learning)
// ---------------------------------------------------------------------------

export async function queryKtypeMapping(
  db: D1Database,
  ktype: number
): Promise<{ eurocode: string; frequency: number }[]> {
  try {
    const { results } = await db
      .prepare(`
        SELECT eurocode, hit_count as frequency
        FROM ktype_matches
        WHERE ktype = ?
        ORDER BY hit_count DESC
        LIMIT 5
      `)
      .bind(ktype)
      .all();
    return (results || []) as unknown as { eurocode: string; frequency: number }[];
  } catch (e) {
    console.error(`queryKtypeMapping failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/**
 * KV-cached variant of queryKtypeMapping.
 * Caches popular ktype mappings for 1 hour to reduce D1 read load.
 * Falls back to D1 on cache miss.
 */
export async function queryKtypeMappingCached(
  db: D1Database,
  kv: KVNamespace,
  ktype: number
): Promise<{ eurocode: string; frequency: number }[]> {
  const cacheKey = `ktype:mapping:${ktype}`;
  try {
    const cached = await kv.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Validate cache shape
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`KV read failed for ${cacheKey}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Cache miss — query D1
  const results = await queryKtypeMapping(db, ktype);

  // Only cache if we got meaningful results (avoids caching empty arrays forever)
  if (results.length > 0) {
    try {
      await kv.put(cacheKey, JSON.stringify(results), {
        expirationTtl: KTYPE_KV_CACHE_TTL_SECONDS,
      });
    } catch (e) {
      console.warn(`KV write failed for ${cacheKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return results;
}

export async function insertKtypeMatch(db: D1Database, ktype: number, eurocode: string): Promise<void> {
  if (!ktype || !eurocode) return;
  try {
    await db.prepare(
      `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
       VALUES (?, ?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(ktype, eurocode) DO UPDATE SET
         hit_count = hit_count + 1,
         last_seen = datetime('now')`
    ).bind(ktype, eurocode.toUpperCase()).run();
  } catch (e) {
    console.error(`insertKtypeMatch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Batch insert / upsert multiple ktype_matches in a single D1 batch.
 * Uses db.batch() for atomic execution. Max 50–100 statements per call.
 */
export async function insertKtypeMatches(
  db: D1Database,
  matches: Array<{ ktype: number; eurocode: string; hit_count?: number }>
): Promise<void> {
  if (!matches.length) return;
  const statements = matches.map((m) =>
    db
      .prepare(
        `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(ktype, eurocode) DO UPDATE SET
           hit_count = MAX(hit_count, excluded.hit_count),
           last_seen = datetime('now')`
      )
      .bind(m.ktype, m.eurocode.toUpperCase(), m.hit_count ?? 1)
  );
  try {
    await db.batch(statements);
  } catch (e) {
    console.error(`insertKtypeMatches failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Return the configured confidence threshold (allows runtime tuning). */
export function getKtypeConfidenceThreshold(): number {
  return KTYPE_CONFIDENCE_THRESHOLD;
}

/** Alias for queryKtypeMappingCached to match naming used in index.ts. */
export const queryKtypeMappingWithCache = queryKtypeMappingCached;

/** Push brand+model+year filtering to SQL for better index utilization. */
export async function queryByBrandModelYear(
  db: D1Database,
  brand: string,
  model: string,
  year: number
): Promise<GlassRecord[]> {
  const brands = getBrandAliases(brand);
  const placeholders = brands.map(() => "?").join(",");
  const sql = `SELECT * FROM glass_catalog WHERE brand IN (${placeholders}) AND (model LIKE ? OR description LIKE ?) AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?) ORDER BY year_from DESC NULLS LAST LIMIT 200`;
  try {
    const { results } = await db.prepare(sql).bind(...brands, `%${model}%`, `%${model}%`, year, year).all();
    return (results || []) as unknown as GlassRecord[];
  } catch (e) {
    console.error(`queryByBrandModelYear failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// TecDoc kType Registry (Option C — Collision Gated Fallback)
// ---------------------------------------------------------------------------

export interface TecdocKtypeRegistryEntry {
  eurocode: string;
  ktype: number;
  tecdocBrand: string | null;
  tecdocModel: string | null;
  tecdocYearFrom: number | null;
  tecdocYearTo: number | null;
  collisionGroupSize: number;
  collisionRank: number;
  confidenceTag: string;
}

export interface KtypeCrosswalkEntry {
  bovsoft_ktype: number;
  tecdoc_ktype: number;
  confidence: number;
  verified: boolean;
  source: string;
}

/**
 * Look up a Bovsoft kType in the ktype_crosswalk table and return the mapped
 * TecDoc kType(s). Verified mappings are returned first, then by confidence.
 * Safe to call even when the table does not exist yet.
 */
export async function queryKtypeCrosswalk(
  db: D1Database,
  bovsoftKtype: number
): Promise<KtypeCrosswalkEntry[]> {
  try {
    const { results } = await db
      .prepare(`
        SELECT bovsoft_ktype, tecdoc_ktype, confidence, verified, source
        FROM ktype_crosswalk
        WHERE bovsoft_ktype = ?
        ORDER BY verified DESC, confidence DESC, tecdoc_ktype ASC
        LIMIT 5
      `)
      .bind(bovsoftKtype)
      .all();
    return ((results || []) as any[]).map((r) => ({
      bovsoft_ktype: r.bovsoft_ktype,
      tecdoc_ktype: r.tecdoc_ktype,
      confidence: r.confidence,
      verified: r.verified === 1,
      source: r.source,
    }));
  } catch (e) {
    // Table may not be migrated yet; treat as empty.
    return [];
  }
}

/**
 * Query TecDoc kType mappings with collision gating.
 * Only returns eurocodes for kTypes with collision_group_size <= maxCollisionSize.
 * Default maxCollisionSize = 5 (safe set: unique + low collision).
 */
export async function queryTecdocByKtype(
  db: D1Database,
  ktype: number,
  maxCollisionSize = 5
): Promise<TecdocKtypeRegistryEntry[]> {
  try {
    const { results } = await db
      .prepare(`
        SELECT eurocode, ktype, tecdoc_brand, tecdoc_model, tecdoc_year_from, tecdoc_year_to,
               collision_group_size, collision_rank, confidence_tag
        FROM tecdoc_ktype_registry
        WHERE ktype = ? AND collision_group_size <= ?
        ORDER BY collision_rank ASC
        LIMIT 10
      `)
      .bind(ktype, maxCollisionSize)
      .all();
    return ((results || []) as any[]).map((r) => ({
      eurocode: r.eurocode,
      ktype: r.ktype,
      tecdocBrand: r.tecdoc_brand,
      tecdocModel: r.tecdoc_model,
      tecdocYearFrom: r.tecdoc_year_from,
      tecdocYearTo: r.tecdoc_year_to,
      collisionGroupSize: r.collision_group_size,
      collisionRank: r.collision_rank,
      confidenceTag: r.confidence_tag,
    }));
  } catch (e) {
    console.error(`queryTecdocByKtype failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/**
 * Resolve kType from TecDoc registry using make+model+year.
 * Returns unique/low-collision kTypes only (collision_group_size <= maxCollisionSize).
 */
export async function queryTecdocKtypeByVehicle(
  db: D1Database,
  make: string,
  model: string,
  year: number,
  maxCollisionSize = 5
): Promise<Array<{ ktype: number; tecdocBrand: string | null; tecdocModel: string | null; confidenceTag: string; collisionGroupSize: number }>> {
  try {
    const { results } = await db
      .prepare(`
        SELECT DISTINCT ktype, tecdoc_brand, tecdoc_model, confidence_tag, collision_group_size
        FROM tecdoc_ktype_registry
        WHERE tecdoc_brand = ? COLLATE NOCASE
          AND (tecdoc_model LIKE ? COLLATE NOCASE OR tecdoc_model LIKE ? COLLATE NOCASE)
          AND (tecdoc_year_from IS NULL OR tecdoc_year_from <= ?)
          AND (tecdoc_year_to IS NULL OR tecdoc_year_to >= ?)
          AND collision_group_size <= ?
        ORDER BY collision_group_size ASC, collision_rank ASC
        LIMIT 5
      `)
      .bind(make, `%${model}%`, `%${model.split(/\s+/).slice(0, 2).join(" ")}%`, year, year, maxCollisionSize)
      .all();
    return ((results || []) as any[]).map((r) => ({
      ktype: r.ktype,
      tecdocBrand: r.tecdoc_brand,
      tecdocModel: r.tecdoc_model,
      confidenceTag: r.confidence_tag,
      collisionGroupSize: r.collision_group_size,
    }));
  } catch (e) {
    console.error(`queryTecdocKtypeByVehicle failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// SVV→TecDoc fuzzy match cache (Layer 0.5)
// ---------------------------------------------------------------------------

export interface SvvTecdocMatch {
  regnr: string;
  regnr_hash: string;
  make: string;
  model: string;
  year: number | null;
  normalized_make: string;
  normalized_model: string;
  ktype: number | null;
  tecdoc_brand: string | null;
  tecdoc_model: string | null;
  tecdoc_year_from: number | null;
  tecdoc_year_to: number | null;
  confidence_score: number | null;
  confidence_level: string;
  match_reasons: string | null;
  svv_status: string;
  svv_source: string;
  created_at: string;
}

/**
 * Query svv_tecdoc_matches by regnr_hash.
 * Returns the most recent match for the given regnr.
 */
async function _querySvvTecdocMatch(db: D1Database, regnr: string): Promise<SvvTecdocMatch | null> {
  const hash = await sha256(regnr);
  try {
    const row = await db
      .prepare(`
        SELECT regnr, regnr_hash, make, model, year, normalized_make, normalized_model,
               ktype, tecdoc_brand, tecdoc_model, tecdoc_year_from, tecdoc_year_to,
               confidence_score, confidence_level, match_reasons, svv_status, svv_source, created_at
        FROM svv_tecdoc_matches
        WHERE regnr_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(hash)
      .first();
    if (!row) return null;
    return {
      regnr: (row as any).regnr,
      regnr_hash: (row as any).regnr_hash,
      make: (row as any).make,
      model: (row as any).model,
      year: (row as any).year,
      normalized_make: (row as any).normalized_make,
      normalized_model: (row as any).normalized_model,
      ktype: (row as any).ktype,
      tecdoc_brand: (row as any).tecdoc_brand,
      tecdoc_model: (row as any).tecdoc_model,
      tecdoc_year_from: (row as any).tecdoc_year_from,
      tecdoc_year_to: (row as any).tecdoc_year_to,
      confidence_score: (row as any).confidence_score,
      confidence_level: (row as any).confidence_level,
      match_reasons: (row as any).match_reasons,
      svv_status: (row as any).svv_status,
      svv_source: (row as any).svv_source,
      created_at: (row as any).created_at,
    };
  } catch (e) {
    console.error(`querySvvTecdocMatch failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
export const querySvvTecdocMatch = memoizeAsync(_querySvvTecdocMatch, 5000, 300_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
