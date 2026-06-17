import type { Product } from '@/types/api';
import type { EquipmentProfile, EquipmentCombination } from '@/types/equipment-profile';

export const PROFILE_FEATURES = [
  'adas',
  'rainSensor',
  'heated',
  'acoustic',
  'antenna',
  'camera',
  'hud',
  'solar',
  'tinted',
  'coated',
  'laneAssist',
  'shade',
] as const;

export type ProfileFeature = (typeof PROFILE_FEATURES)[number];

function hasFeature(product: Product, key: string): boolean {
  const value = product.properties[key as keyof typeof product.properties];
  return value === true || value === '1';
}

function productFeatureKeys(product: Product): string[] {
  const keys: string[] = [];
  for (const f of PROFILE_FEATURES) {
    if (hasFeature(product, f)) keys.push(f);
  }
  return keys.sort();
}

function findExactCombination(
  productFeatures: string[],
  combinations: EquipmentCombination[]
): EquipmentCombination | null {
  return (
    combinations.find(
      (c) =>
        c.f.length === productFeatures.length &&
        c.f.every((feature, i) => feature === productFeatures[i])
    ) || null
  );
}

export interface ProductMatchResult {
  confidence: number; // 0-100
  exactMatch: boolean;
  impossibleFeature?: string;
  explanation: string[];
}

/**
 * Compute how well a product's equipment matches the learned profile.
 * Returns confidence 0-100. 0 means impossible/very unlikely, 100 means exact match.
 */
export function scoreProductAgainstProfile(
  product: Product,
  profile: EquipmentProfile | null | undefined
): ProductMatchResult {
  if (!profile || profile.n === 0) {
    return { confidence: 50, exactMatch: false, explanation: ['no profile data'] };
  }

  const productFeatures = productFeatureKeys(product);

  // Hard mismatch: product has feature profile says is impossible
  for (const neg of profile.neg) {
    if (productFeatures.includes(neg)) {
      return {
        confidence: 0,
        exactMatch: false,
        impossibleFeature: neg,
        explanation: [`${neg} is not available for this vehicle`],
      };
    }
  }

  // Exact combination match
  const exactCombo = findExactCombination(productFeatures, profile.comb);
  if (exactCombo) {
    return {
      confidence: Math.round(exactCombo.p * 100),
      exactMatch: true,
      explanation: [
        productFeatures.length
          ? `matches ${productFeatures.join('+')} (${exactCombo.c}/${profile.n})`
          : `base variant (${exactCombo.c}/${profile.n})`,
      ],
    };
  }

  // Fallback: average per-feature likelihood
  let score = 0;
  for (const f of PROFILE_FEATURES) {
    const has = productFeatures.includes(f);
    const p = profile.p[f] ?? 0;
    score += has ? p : 1 - p;
  }
  const confidence = Math.round((score / PROFILE_FEATURES.length) * 100);

  const explanation: string[] = [];
  const missingLikely = PROFILE_FEATURES.filter(
    (f) => !productFeatures.includes(f) && (profile.p[f] ?? 0) > 0.3
  );
  const unexpected = PROFILE_FEATURES.filter(
    (f) => productFeatures.includes(f) && (profile.p[f] ?? 0) < 0.2
  );
  if (missingLikely.length) explanation.push(`missing likely: ${missingLikely.join(', ')}`);
  if (unexpected.length) explanation.push(`unexpected: ${unexpected.join(', ')}`);

  return { confidence, exactMatch: false, explanation };
}

/**
 * Pick the most specific category profile available for a product.
 */
export function selectProfileForProduct(
  profiles: Record<string, EquipmentProfile>,
  category?: string | null
): EquipmentProfile | null {
  if (!category) return profiles.all || null;
  const cat = category.toLowerCase();
  return profiles[cat] || profiles.all || null;
}

/**
 * Sort products by equipment match confidence (highest first).
 */
export function sortByEquipmentConfidence(
  products: Product[],
  profiles: Record<string, EquipmentProfile>,
  category?: string | null
): Product[] {
  const profile = selectProfileForProduct(profiles, category);
  return [...products].sort((a, b) => {
    const aMatch = scoreProductAgainstProfile(a, profile);
    const bMatch = scoreProductAgainstProfile(b, profile);
    if (bMatch.confidence !== aMatch.confidence) {
      return bMatch.confidence - aMatch.confidence;
    }
    return (b._score || 0) - (a._score || 0);
  });
}

/**
 * Build a UserEquipmentAnswers object from the most likely feature combination
 * for a given category. Returns null when no data.
 */
export function getLikelyEquipmentAnswers(
  profiles: Record<string, EquipmentProfile>,
  category?: string | null
): Record<string, boolean> | null {
  const profile = selectProfileForProduct(profiles, category);
  if (!profile || profile.comb.length === 0) return null;

  const top = profile.comb[0];
  const answers: Record<string, boolean> = {};
  for (const f of PROFILE_FEATURES) {
    answers[f] = top.f.includes(f);
  }
  return answers;
}
