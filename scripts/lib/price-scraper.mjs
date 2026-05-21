/**
 * Lightweight price scraper for auto-glass.no
 * Uses existing cookies for auth, fetches prices from category pages.
 */
import { parse } from 'node-html-parser';
import { readFileSync } from 'fs';

const FETCH_TIMEOUT = 25000;

/**
 * @param {string} url
 * @param {string} cookieHeader
 * @returns {Promise<{sku: string, price: number|null}[]>}
 */
export async function fetchPricesFromPage(url, cookieHeader) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(id);

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const html = await res.text();
    const root = parse(html);
    const cards = root.querySelectorAll('.product');
    const prices = [];

    for (const card of cards) {
      const skuEl = card.querySelector('.sku');
      const priceEl = card.querySelector('.woocommerce-Price-amount');

      const sku = skuEl?.textContent?.trim() || null;
      let price = null;
      if (priceEl) {
        const priceText = priceEl.textContent.replace(/\s/g, '').replace(/\./g, '');
        const match = priceText.match(/(\d+)/);
        if (match) price = parseInt(match[1], 10);
      }

      if (sku) {
        prices.push({ sku, price });
      }
    }

    return prices;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

/**
 * Scrape all pages for a category URL (handles pagination)
 * @param {string} baseUrl
 * @param {string} cookieHeader
 * @returns {Promise<{sku: string, price: number|null}[]>}
 */
export async function fetchPricesFromCategory(baseUrl, cookieHeader) {
  let pageNum = 1;
  let hasMore = true;
  const allPrices = [];

  while (hasMore) {
    const url = pageNum === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}paged=${pageNum}`;
    const prices = await fetchPricesFromPage(url, cookieHeader);

    if (prices.length === 0 && pageNum === 1) {
      // Maybe 404 or empty
      hasMore = false;
      break;
    }

    allPrices.push(...prices);

    // Check for next page
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(id);
      const html = await res.text();
      const root = parse(html);
      const hasNext = root.querySelector('a.next, .next.page-numbers') !== null;
      hasMore = hasNext && prices.length > 0;
    } catch (e) {
      clearTimeout(id);
      hasMore = false;
    }

    pageNum++;
  }

  return allPrices;
}

/**
 * Load cookies from file
 * @param {string} cookieFile
 * @returns {string}
 */
export function loadCookieHeader(cookieFile) {
  const cookies = JSON.parse(readFileSync(cookieFile, 'utf-8'));
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}
