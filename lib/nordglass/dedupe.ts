/**
 * Nord Glass — Dedupe Engine
 * Funksjonell dedupe basert på dedupe_key + variant-håndtering.
 */

import { NordGlassParsedRecord, NordGlassDedupedRecord, NordGlassVariant } from './schema';

/**
 * Dedupe en liste med parsed records.
 *
 * Regler:
 * - Samme dedupe_key → samme glass
 * - Ulike nord_internal_code innen samme dedupe_key → varianter
 * - Ulike side (L/R) → aldri merges
 * - Ulike opening_type → aldri merges
 */
export function dedupe(records: NordGlassParsedRecord[]): NordGlassDedupedRecord[] {
  const groups = new Map<string, NordGlassParsedRecord[]>();

  for (const r of records) {
    const key = r.dedupe_key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const result: NordGlassDedupedRecord[] = [];

  for (const [key, group] of groups) {
    if (group.length === 0) continue;

    // Base record = first OK record, or first in group
    const base = group.find(r => r.parse_status === 'OK') || group[0];

    // Build variants from ALL records in group
    const variants: NordGlassVariant[] = group.map(r => ({
      nord_internal_code: r.nord_internal_code,
      feature_codes: r.feature_codes,
      tint_code: r.tint_code,
      has_sensor: r.has_sensor,
      has_heating: r.has_heating,
    }));

    // Merge warnings/errors
    const allWarnings = [...new Set(group.flatMap(r => r.parse_warnings))];
    const allErrors = [...new Set(group.flatMap(r => r.parse_errors))];

    // Status: if ANY is HOLD, group is HOLD. If any is REVIEW and none HOLD, REVIEW. Otherwise OK.
    let groupStatus = 'OK' as const;
    if (group.some(r => r.parse_status === 'HOLD')) {
      groupStatus = 'HOLD';
    } else if (group.some(r => r.parse_status === 'REVIEW')) {
      groupStatus = 'REVIEW';
    }

    result.push({
      ...base,
      parse_status: groupStatus,
      parse_warnings: allWarnings,
      parse_errors: allErrors,
      variants,
    });
  }

  return result;
}

/**
 * Sjekk om to records er ekte duplikater (samme nord_internal_code).
 */
export function isExactDuplicate(a: NordGlassParsedRecord, b: NordGlassParsedRecord): boolean {
  return a.nord_internal_code === b.nord_internal_code;
}

/**
 * Sjekk om to records er funksjonelt like (samme dedupe_key).
 */
export function isFunctionalDuplicate(a: NordGlassParsedRecord, b: NordGlassParsedRecord): boolean {
  return a.dedupe_key === b.dedupe_key;
}
