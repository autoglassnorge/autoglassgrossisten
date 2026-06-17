/**
 * Learning engine — search history, equipment learning, SHA-256 hashing.
 */

import type { SearchHistoryRecord } from "../types";

/** Simple SHA-256 hash for GDPR-safe regnr storage */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Log a single feedback/event for a search. GDPR-safe: only regnr_hash is stored.
 */
export async function upsertSearchFeedback(
  db: D1Database,
  record: {
    regnr_hash: string;
    ktype?: number;
    eurocode: string;
    layer: number;
    score?: number;
    action: string;
  }
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO search_feedback (regnr_hash, ktype, eurocode, layer, score, action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      record.regnr_hash,
      record.ktype ?? null,
      record.eurocode,
      record.layer,
      record.score ?? null,
      record.action
    ).run();
  } catch {
    // Silently fail if table does not exist yet
  }
}

/**
 * Save search result to D1 for learning.
 * GDPR-safe: only SHA-256 hash of regnr is stored.
 */
export async function saveSearchResult(db: D1Database, record: SearchHistoryRecord): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO search_history (
        regnr_hash, make, model, year, generation, body, chosen_eurocode,
        equipment_adas, equipment_rain_sensor, equipment_heated, equipment_acoustic,
        equipment_antenna, equipment_hud, equipment_camera, equipment_shade,
        layer, confidence, source, vin_prefix, search_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(regnr_hash) DO UPDATE SET
         chosen_eurocode = excluded.chosen_eurocode,
         equipment_adas = excluded.equipment_adas,
         equipment_rain_sensor = excluded.equipment_rain_sensor,
         equipment_heated = excluded.equipment_heated,
         equipment_acoustic = excluded.equipment_acoustic,
         equipment_antenna = excluded.equipment_antenna,
         equipment_hud = excluded.equipment_hud,
         equipment_camera = excluded.equipment_camera,
         equipment_shade = excluded.equipment_shade,
         layer = excluded.layer,
         confidence = excluded.confidence,
         source = excluded.source,
         search_count = search_count + 1,
         updated_at = datetime('now')`
    ).bind(
      record.regnr_hash,
      record.make,
      record.model,
      record.year,
      record.generation || null,
      record.body || null,
      record.chosen_eurocode || null,
      record.equipment.adas ? 1 : 0,
      record.equipment.rainSensor ? 1 : 0,
      record.equipment.heated ? 1 : 0,
      record.equipment.acoustic ? 1 : 0,
      record.equipment.antenna ? 1 : 0,
      record.equipment.hud ? 1 : 0,
      record.equipment.camera ? 1 : 0,
      record.equipment.shade ? 1 : 0,
      record.layer,
      record.confidence,
      record.source,
      record.vin_prefix || null
    ).run();
  } catch {
    // Silently fail if migration 0005 not run yet
  }
}

/**
 * Get learned equipment from search history for a specific regnr.
 */
export async function getLearnedEquipment(db: D1Database, regnr: string): Promise<{
  equipment: SearchHistoryRecord["equipment"];
  chosen_eurocode?: string;
  search_count: number;
} | null> {
  try {
    const hash = await sha256(regnr);
    const row = await db.prepare(
      `SELECT equipment_adas, equipment_rain_sensor, equipment_heated, equipment_acoustic,
              equipment_antenna, equipment_hud, equipment_camera, equipment_shade,
              chosen_eurocode, search_count
       FROM search_history WHERE regnr_hash = ?`
    ).bind(hash).first();
    if (!row) return null;
    return {
      equipment: {
        adas: !!(row as any).equipment_adas,
        rainSensor: !!(row as any).equipment_rain_sensor,
        heated: !!(row as any).equipment_heated,
        acoustic: !!(row as any).equipment_acoustic,
        antenna: !!(row as any).equipment_antenna,
        hud: !!(row as any).equipment_hud,
        camera: !!(row as any).equipment_camera,
        shade: !!(row as any).equipment_shade,
      },
      chosen_eurocode: (row as any).chosen_eurocode || undefined,
      search_count: (row as any).search_count || 1,
    };
  } catch {
    return null;
  }
}

/**
 * Get learned equipment by VIN prefix (first 6 chars).
 */
export async function getLearnedByVinPrefix(db: D1Database, vin: string): Promise<{
  equipment: SearchHistoryRecord["equipment"];
  count: number;
} | null> {
  if (!vin || vin.length < 6) return null;
  try {
    const prefix = vin.slice(0, 6).toUpperCase();
    const row = await db.prepare(
      `SELECT
        AVG(equipment_adas) as adas_prob,
        AVG(equipment_rain_sensor) as rain_prob,
        AVG(equipment_heated) as heated_prob,
        AVG(equipment_acoustic) as acoustic_prob,
        AVG(equipment_antenna) as antenna_prob,
        AVG(equipment_hud) as hud_prob,
        AVG(equipment_camera) as camera_prob,
        AVG(equipment_shade) as shade_prob,
        COUNT(*) as cnt
       FROM search_history WHERE vin_prefix = ? AND search_count >= 1`
    ).bind(prefix).first();
    if (!row || (row as any).cnt < 3) return null;
    return {
      equipment: {
        adas: ((row as any).adas_prob || 0) >= 0.5,
        rainSensor: ((row as any).rain_prob || 0) >= 0.5,
        heated: ((row as any).heated_prob || 0) >= 0.5,
        acoustic: ((row as any).acoustic_prob || 0) >= 0.5,
        antenna: ((row as any).antenna_prob || 0) >= 0.5,
        hud: ((row as any).hud_prob || 0) >= 0.5,
        camera: ((row as any).camera_prob || 0) >= 0.5,
        shade: ((row as any).shade_prob || 0) >= 0.5,
      },
      count: (row as any).cnt,
    };
  } catch {
    return null;
  }
}
