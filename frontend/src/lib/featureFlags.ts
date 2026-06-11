/**
 * Simple feature-flag system with build-time (env) and runtime (localStorage) overrides.
 *
 * Usage:
 *   if (isEnabled(FEATURE_FLAGS.AI_FIRST_HERO)) { … }
 *
 * Build-time:
 *   VITE_FF_AI_FIRST_HERO=true npm run build
 *
 * Runtime (browser console):
 *   localStorage.setItem('ff_ai_first_hero', 'true'); location.reload()
 */

export const FEATURE_FLAGS = {
  AI_FIRST_HERO: 'ai_first_hero',
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Check whether a feature flag is enabled.
 * Priority:
 *   1. Build-time env var `VITE_FF_<FLAG>` (true/false)
 *   2. localStorage key `ff_<flag>` (true/false)
 *   3. Default: true for AI-first homepage hero
 */
export function isEnabled(flag: FeatureFlag): boolean {
  const envKey = `VITE_FF_${flag.toUpperCase()}`;
  const envVal = import.meta.env[envKey];
  if (envVal === 'true' || envVal === '1') return true;
  if (envVal === 'false' || envVal === '0') return false;

  const lsVal = localStorage.getItem(`ff_${flag}`);
  if (lsVal === 'true' || lsVal === '1') return true;
  if (lsVal === 'false' || lsVal === '0') return false;

  if (flag === FEATURE_FLAGS.AI_FIRST_HERO) return true;

  return false;
}

/** Override a flag locally for testing. */
export function setLocalOverride(flag: FeatureFlag, value: boolean): void {
  localStorage.setItem(`ff_${flag}`, String(value));
}

/** Remove local override. */
export function clearLocalOverride(flag: FeatureFlag): void {
  localStorage.removeItem(`ff_${flag}`);
}
