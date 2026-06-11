/**
 * Single source of truth for public business metrics.
 * Used across frontend components, translations, and SEO metadata.
 *
 * Plan reference: docs/superpowers/plans/2026-06-09-ai-first-europe-leading-platform.md
 * Values:
 *   - 133 000 glass units in stock
 *   - 27 000 different glass variants/SKUs
 */

export const BUSINESS_METRICS = {
  GLASS_IN_STOCK: 133_000,
  VARIANTS: 27_000,
  BRANDS: 82,
  DELIVERY_HOURS: 24,
  YEARS_EXPERIENCE: 35,  // Founded 1991
} as const;

/** Format a large number as a compact string, e.g. 133000 → "133k" */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** Format a large number with spaces as thousand separators, e.g. 133000 → "133 000" */
export function formatFull(n: number): string {
  return n.toLocaleString('nb-NO').replace(/\./g, ' ');
}
