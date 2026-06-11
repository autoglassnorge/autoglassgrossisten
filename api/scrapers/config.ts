/**
 * Scraper-konfigurasjon
 * =====================
 * Sentralisert rate-limit, timeout, og retry-innstillinger
 * for alle scrapere.
 */

export const SCRAPER_CONFIG = {
  /** Maks antall parallelle requests */
  maxConcurrency: 10,

  /** Timeout per request (ms) */
  requestTimeoutMs: 10_000,

  /** Delay mellom batches (ms) */
  batchDelayMs: 2_000,

  /** Retry-innstillinger */
  retry: {
    maxAttempts: 3,
    backoffMs: [2_000, 4_000, 8_000], // exponential
  },

  /** User-Agent */
  userAgent:
    "AutoglassAS-B2B-Scraper/1.0 (+https://auto-glass.no; contact@auto-glass.no)",

  /** Respekter robots.txt */
  respectRobotsTxt: true,

  /** Maks requests per minutt per domene */
  rateLimitPerMinute: 60,
} as const;

/**
 * Hent fetch-konfigurasjon med timeout
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = SCRAPER_CONFIG.requestTimeoutMs
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "User-Agent": SCRAPER_CONFIG.userAgent,
      ...options.headers,
    },
  }).finally(() => clearTimeout(timeout));
}

/**
 * Retry-wrapper med exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = SCRAPER_CONFIG.requestTimeoutMs
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < SCRAPER_CONFIG.retry.maxAttempts; i++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }

    if (i < SCRAPER_CONFIG.retry.maxAttempts - 1) {
      const delay = SCRAPER_CONFIG.retry.backoffMs[i] || 8_000;
      console.warn(`  ⚠️  Retry ${i + 1}/${SCRAPER_CONFIG.retry.maxAttempts} etter ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`Fetch failed etter ${SCRAPER_CONFIG.retry.maxAttempts} forsøk`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
