/**
 * useRoutePreload — Preloads a page component on hover/touch.
 * Reduces perceived navigation delay by fetching chunks before click.
 */

import { useCallback } from 'react';

// Registry of preloaded modules to avoid duplicate fetches
const preloaded = new Set<string>();

/**
 * Preload a page module by its import path.
 * Uses Vite's dynamic import with webpackPrefetch comment.
 */
export function preloadPage(importFn: () => Promise<unknown>): void {
  const key = importFn.toString();
  if (preloaded.has(key)) return;
  preloaded.add(key);

  // Vite handles /* webpackPrefetch: true */ in comments
  importFn().catch(() => {
    // Silently ignore prefetch errors — user can still navigate normally
    preloaded.delete(key);
  });
}

/**
 * Hook that returns handlers for preloading on hover/focus.
 */
export function useRoutePreload(importFn: () => Promise<unknown>) {
  const handlePreload = useCallback(() => {
    preloadPage(importFn);
  }, [importFn]);

  return { onMouseEnter: handlePreload, onFocus: handlePreload };
}

/**
 * Commonly preloaded routes — use in Header and key CTAs.
 */
export const PAGE_IMPORTS = {
  search: () => import('@/pages/SearchPage'),
  browse: () => import('@/pages/BrowsePage'),
  bilglassguide: () => import('@/pages/BilglassguidePage'),
  kontakt: () => import('@/pages/KontaktPage'),
  cart: () => import('@/pages/CartPage'),
  account: () => import('@/pages/AccountPage'),
} as const;
