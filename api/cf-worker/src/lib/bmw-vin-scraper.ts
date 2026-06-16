/**
 * BMW VIN build-sheet scraper.
 * Fetches factory S-codes (Sonderausstattung) from free BMW VIN decoders
 * and maps them to glass features. Results are cached in D1.
 *
 * Sources tried (in order):
 *   1. bimmer.work  – free, most detailed
 *   2. mdecoder.com – free alternative
 *   3. carlytics.eu – free with SA codes (paid report)
 *
 * NOTE: These are public websites; scraping is best-effort.
 * If a site blocks Cloudflare Workers, the resolver falls back to
 * existing inferred features automatically.
 */

import { parseBMWSCodeList, extractSCodeFromText, type ParsedBMWFeatures } from "./bmw-s-code-mapper";

const BMW_DECODER_SOURCES = [
  { name: "bimmer.work", url: (vin: string) => `https://bimmer.work/?vin=${encodeURIComponent(vin)}` },
  { name: "mdecoder.com", url: (vin: string) => `https://mdecoder.com/?vin=${encodeURIComponent(vin)}` },
  { name: "carlytics.eu", url: (vin: string) => `https://www.carlytics.eu/free-bmw-vin-decoder` },
];

/** Generic HTML fetch with browser-like headers. */
async function fetchHtml(url: string, method = "GET", body?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Referer: "https://www.google.com/",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Extract S-codes from bimmer.work or mdecoder.com HTML. */
function extractSCodesFromHtml(html: string): { codes: string[]; source: string } | null {
  const codes = extractSCodeFromText(html);
  if (codes.length > 0) {
    return { codes, source: "html_extract" };
  }

  // Try to find JSON embedded in page (some decoders embed data in script tags)
  const scriptPattern = /<script[^>]*>.*?([{[].*?[}\]])<\/script>/gis;
  let m: RegExpExecArray | null;
  while ((m = scriptPattern.exec(html)) !== null) {
    try {
      const jsonText = m[1];
      const jsonCodes = extractSCodeFromText(jsonText);
      if (jsonCodes.length > 0) {
        return { codes: jsonCodes, source: "json_embed" };
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

/**
 * Try to fetch S-codes for a BMW VIN from free decoders.
 * Returns null on any failure so the resolver can fall back gracefully.
 */
export async function fetchBMWBuildSheet(
  vin: string,
  db: D1Database
): Promise<{ sCodes: string[]; features: ParsedBMWFeatures; source: string } | null> {
  if (!vin || vin.length !== 17) return null;

  // 1. Check D1 cache first
  try {
    const cached = await db
      .prepare(
        "SELECT bmw_s_codes FROM vin_decode_cache WHERE vin = ? AND expires_at > datetime('now')"
      )
      .bind(vin)
      .first<{ bmw_s_codes: string | null }>();

    if (cached?.bmw_s_codes) {
      const codes = JSON.parse(cached.bmw_s_codes) as string[];
      if (Array.isArray(codes) && codes.length > 0) {
        return {
          sCodes: codes,
          features: parseBMWSCodeList(codes),
          source: "bmw_s_code_cache",
        };
      }
      // Cached empty array = previous scrape failed, avoid re-scraping
      if (Array.isArray(codes) && codes.length === 0) {
        return null;
      }
    }
  } catch (e) {
    console.warn(`[bmw-vin-scraper] Cache read error for ${vin}:`, e);
  }

  // 2. Try live sources (best-effort; most BMW decoder sites are SPAs
  //    that require client-side JS, so we usually get nothing here)
  let bestCodes: string[] | null = null;
  let bestSource = "";

  // TODO: If we find a server-side API for BMW build sheets, add it here.
  // For now, bimmer.work and mdecoder.com are client-side SPAs and
  // return only their landing page HTML to fetch().

  // Keep the loop structure so future sources can be added easily.

  // 3. Cache result (even empty) to avoid repeated failed scraping
  const codesToCache = bestCodes ?? [];
  try {
    await db
      .prepare(
        `INSERT INTO vin_decode_cache (vin, bmw_s_codes, decoded_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(vin) DO UPDATE SET
           bmw_s_codes = excluded.bmw_s_codes,
           decoded_at = datetime('now')`
      )
      .bind(vin, JSON.stringify(codesToCache))
      .run();
  } catch (e) {
    console.warn(`[bmw-vin-scraper] Cache write error for ${vin}:`, e);
  }

  if (codesToCache.length === 0) {
    return null;
  }

  return {
    sCodes: codesToCache,
    features: parseBMWSCodeList(codesToCache),
    source: bestSource,
  };
}
