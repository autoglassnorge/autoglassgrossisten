/**
 * Normalize D1 GlassRecord to frontend camelCase shape.
 * Uses an LRU cache for title/description generation.
 */

import type { GlassRecord } from "../types";
import { generateTitle, generateDescription } from "./title-generator";
import { inferRecordEquipment } from "./equipment";

// Simple LRU cache for title/description generation (max 1000 entries)
const CACHE_MAX = 1000;
const titleCache = new Map<number, string>();
const descCache = new Map<number, string>();

function getCached<T>(cache: Map<number, T>, id: number, factory: () => T): T {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const value = factory();
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(id, value);
  return value;
}

/** Convert D1 snake_case record to frontend camelCase */
export function normalizeRecord(r: GlassRecord): any {
  const title = getCached(titleCache, r.id, () => generateTitle(r));
  const standardDescription = getCached(descCache, r.id, () => generateDescription(r));
  const eq = inferRecordEquipment(r);

  return {
    id: r.id,
    eurocode: r.eurocode,
    title,
    articleNumber: r.article_number,
    scanNumber: r.scan_number,
    category: r.category,
    supplier: r.supplier,
    brand: r.brand,
    model: r.model,
    yearFrom: r.year_from,
    yearTo: r.year_to,
    prefix4: r.prefix4,
    properties: {
      adas: !!r.adas,
      rainSensor: !!r.rain_sensor,
      heated: !!r.heated,
      acoustic: !!r.acoustic,
      antenna: !!r.antenna,
      hud: !!r.hud,
      shade: !!r.shade,
      camera: !!r.camera,
      color: r.color || null,
      solar: !!r.solar,
      tinted: !!r.tinted,
      hasList: eq.hasList,
      listRequired: eq.listRequired,
      listIncluded: eq.listIncluded,
      listType: eq.listType,
      hasKlips: eq.hasKlips,
      klipsRequired: eq.klipsRequired,
      klipsType: eq.klipsType,
    },
    standardDescription,
    adasFeatures: r.adas_features ? JSON.parse(r.adas_features) : [],
    price: r.price,
    stockStatus: r.stock_status,
    warehouseLocation: r.warehouse_location,
    oemNumbers: r.oem_numbers,
    crossReferences: r.cross_references,
    weight: r.weight,
    dimensions: r.dimensions,
    description: r.description,
    rawDescription: r.description,
    imageUrl: r.image_url,
    pdfUrl: r.pdf_url,
    source: r.source,
    nagsCodes: r.nags_codes,
    brandOriginal: r.brand_original,
    ktype: r.ktype,
    createdAt: r.created_at,
    typeCode: r.typeCode,
    typeCodeDesc: r.typeCodeDesc,
    position: r.position,
  };
}
