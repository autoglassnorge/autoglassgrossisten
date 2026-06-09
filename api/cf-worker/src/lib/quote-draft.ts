/**
 * Quote Draft Builder — Pure function, no persistence (Fase 3A)
 * Builds a quote draft from selected products + accessories.
 *
 * SEMANTICS: This builder sums ALL accessories passed in. Filtering/selection
 * (included vs optional) should happen BEFORE calling this function — e.g. in
 * the handler or frontend. The builder is a pure calculator, not a filter.
 *
 * No D1 insert, no KV storage, no UNI Micro posting.
 */

import type { GlassRecord, AccessoryItem, QuoteDraft, QuoteDraftItem } from "../types";

interface QuoteInputItem {
  product: GlassRecord;
  qty: number;
  accessories?: AccessoryItem[];
}

/**
 * Build a quote draft from selected items.
 * Pure function — no side effects, no persistence.
 *
 * All accessories in the input are priced. Callers must filter beforehand.
 */
export function buildQuoteDraft(
  items: QuoteInputItem[],
  notes?: string
): QuoteDraft {
  const draftItems: QuoteDraftItem[] = items.map((item) => ({
    product: item.product,
    qty: item.qty,
    accessories: item.accessories || [],
  }));

  const subtotal = draftItems.reduce(
    (sum, item) => sum + (item.product.price || 0) * item.qty,
    0
  );

  // Sum ALL accessories — callers filter before passing
  const accessoryTotal = draftItems.reduce(
    (sum, item) =>
      sum +
      item.accessories.reduce((aSum, acc) => aSum + acc.price, 0) * item.qty,
    0
  );

  return {
    items: draftItems,
    subtotal,
    accessoryTotal,
    total: subtotal + accessoryTotal,
    notes,
  };
}

/**
 * Build a quote draft from the top candidate + session accessories.
 * Convenience wrapper for the common case.
 */
export function buildQuoteDraftFromTopCandidate(
  candidate: GlassRecord,
  accessories: AccessoryItem[],
  qty = 1,
  notes?: string
): QuoteDraft {
  return buildQuoteDraft(
    [{ product: candidate, qty, accessories }],
    notes
  );
}
