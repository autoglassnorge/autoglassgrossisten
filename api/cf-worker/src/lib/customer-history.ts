/**
 * Customer order history lookup for proactive suggestions.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { ProactiveSuggestion, GlassRecord } from "../types";
import { normalizeRecord } from "./normalize";

interface OrderRow {
  id: number;
  customer_id: number;
  regnr: string | null;
  vin: string | null;
  glass_sku: string;
  quantity: number;
  price_per_unit: number;
  total: number;
  accessories: string | null;
  status: string;
  created_at: string;
}

interface CustomerRow {
  name: string;
}

function tryParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function daysAgoLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "i dag";
  if (diffDays === 1) return "i går";
  if (diffDays < 7) return `for ${diffDays} dager siden`;
  if (diffDays < 30) return `for ${Math.floor(diffDays / 7)} uker siden`;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "long" });
}

/** Fetch the last 5 orders for a customer, joined with glass_catalog. */
async function fetchRecentOrders(
  db: D1Database,
  customerId: number
): Promise<(OrderRow & { product: GlassRecord | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT
        oh.id,
        oh.customer_id,
        oh.regnr,
        oh.vin,
        oh.glass_sku,
        oh.quantity,
        oh.price_per_unit,
        oh.total,
        oh.accessories,
        oh.status,
        oh.created_at,
        gc.id as gc_id,
        gc.supplier_sku,
        gc.eurocode,
        gc.article_number,
        gc.scan_number,
        gc.category,
        gc.supplier,
        gc.brand,
        gc.model,
        gc.submodel,
        gc.year_from,
        gc.year_to,
        gc.prefix4,
        gc.adas,
        gc.rain_sensor,
        gc.heated,
        gc.acoustic,
        gc.antenna,
        gc.hud,
        gc.shade,
        gc.camera,
        gc.lane_assist,
        gc.adas_features,
        gc.price,
        gc.stock_status,
        gc.warehouse_location,
        gc.oem_numbers,
        gc.cross_references,
        gc.weight,
        gc.dimensions,
        gc.color,
        gc.solar,
        gc.tinted,
        gc.description,
        gc.image_url,
        gc.pdf_url,
        gc.source,
        gc.source_url,
        gc.nags_codes,
        gc.brand_original,
        gc.ktype,
        gc.created_at as gc_created_at,
        gc.typeCode,
        gc.typeCodeDesc,
        gc.position
      FROM order_history oh
      LEFT JOIN glass_catalog gc ON (
        oh.glass_sku = gc.supplier_sku
        OR oh.glass_sku = gc.article_number
        OR oh.glass_sku = gc.eurocode
        OR oh.glass_sku = gc.scan_number
      )
      WHERE oh.customer_id = ?
      ORDER BY oh.created_at DESC
      LIMIT 5`
    )
    .bind(customerId)
    .all();

  const rows = (results || []) as any[];
  return rows.map((r) => {
    const product: GlassRecord | null = r.gc_id
      ? ({
          id: r.gc_id,
          supplier_sku: r.supplier_sku,
          eurocode: r.eurocode,
          article_number: r.article_number,
          scan_number: r.scan_number,
          category: r.category,
          supplier: r.supplier,
          brand: r.brand,
          model: r.model,
          submodel: r.submodel,
          year_from: r.year_from,
          year_to: r.year_to,
          prefix4: r.prefix4,
          adas: r.adas,
          rain_sensor: r.rain_sensor,
          heated: r.heated,
          acoustic: r.acoustic,
          antenna: r.antenna,
          hud: r.hud,
          shade: r.shade,
          camera: r.camera,
          lane_assist: r.lane_assist,
          adas_features: r.adas_features,
          price: r.price,
          stock_status: r.stock_status,
          warehouse_location: r.warehouse_location,
          oem_numbers: r.oem_numbers,
          cross_references: r.cross_references,
          weight: r.weight,
          dimensions: r.dimensions,
          color: r.color,
          solar: r.solar,
          tinted: r.tinted,
          description: r.description,
          image_url: r.image_url,
          pdf_url: r.pdf_url,
          source: r.source,
          source_url: r.source_url,
          nags_codes: r.nags_codes,
          brand_original: r.brand_original,
          ktype: r.ktype,
          created_at: r.gc_created_at,
          typeCode: r.typeCode,
          typeCodeDesc: r.typeCodeDesc,
          position: r.position,
        } as GlassRecord)
      : null;

    return {
      id: r.id,
      customer_id: r.customer_id,
      regnr: r.regnr,
      vin: r.vin,
      glass_sku: r.glass_sku,
      quantity: r.quantity,
      price_per_unit: r.price_per_unit,
      total: r.total,
      accessories: r.accessories,
      status: r.status,
      created_at: r.created_at,
      product,
    };
  });
}

/** Get frequently ordered SKUs for a customer. */
async function fetchFrequentSkus(
  db: D1Database,
  customerId: number,
  limit = 3
): Promise<{ glass_sku: string; order_count: number; total_qty: number; last_ordered: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT
        glass_sku,
        COUNT(*) as order_count,
        SUM(quantity) as total_qty,
        MAX(created_at) as last_ordered
      FROM order_history
      WHERE customer_id = ?
      GROUP BY glass_sku
      ORDER BY order_count DESC, total_qty DESC
      LIMIT ?`
    )
    .bind(customerId, limit)
    .all();

  return (results || []) as any[];
}

/** Fetch customer name from b2b_customers. */
async function fetchCustomerName(db: D1Database, customerId: number): Promise<string | null> {
  const { results } = await db
    .prepare("SELECT name FROM b2b_customers WHERE id = ?")
    .bind(customerId)
    .all();

  if (!results || results.length === 0) return null;
  return (results[0] as CustomerRow).name;
}

/**
 * Build proactive suggestions for a known B2B customer.
 * Returns null if customer has no order history.
 */
export async function getCustomerHistory(
  db: D1Database,
  customerId: number
): Promise<ProactiveSuggestion[] | null> {
  const [customerName, recentOrders, frequentSkus] = await Promise.all([
    fetchCustomerName(db, customerId),
    fetchRecentOrders(db, customerId),
    fetchFrequentSkus(db, customerId, 3),
  ]);

  if (recentOrders.length === 0 && frequentSkus.length === 0) {
    return null;
  }

  const suggestions: ProactiveSuggestion[] = [];

  // Build reorder prompt from the most recent order
  if (recentOrders.length > 0) {
    const latest = recentOrders[0];
    const brandHint = latest.product?.brand || "";
    const daysLabel = daysAgoLabel(latest.created_at);

    let greeting: string;
    if (customerName) {
      greeting = `Hei ${customerName}! Forrige gang bestilte dere ${latest.quantity} ${latest.glass_sku}${brandHint ? ` til ${brandHint}` : ""} (${daysLabel}). Trenger dere flere?`;
    } else {
      greeting = `Hei! Forrige gang bestilte du ${latest.quantity} ${latest.glass_sku}${brandHint ? ` til ${brandHint}` : ""} (${daysLabel}). Trenger du flere?`;
    }

    const items = recentOrders.slice(0, 3).map((o) => ({
      sku: o.glass_sku,
      name: o.product?.description || o.glass_sku,
      lastOrdered: daysAgoLabel(o.created_at),
      qty: o.quantity,
      product: o.product ? normalizeRecord(o.product) : undefined,
    }));

    suggestions.push({
      type: "reorder_prompt",
      message: greeting,
      items,
    });
  }

  // Build frequent items suggestion if we have enough data
  if (frequentSkus.length > 0) {
    const freqItems = frequentSkus.map((f) => ({
      sku: f.glass_sku,
      name: f.glass_sku,
      lastOrdered: daysAgoLabel(f.last_ordered),
      qty: f.total_qty,
    }));

    suggestions.push({
      type: "frequent_item",
      message: "Dere bestiller ofte:",
      items: freqItems,
    });
  }

  return suggestions;
}
