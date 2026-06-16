/**
 * Volvo VIN variant-code scraper.
 * Fetches factory equipment information from Volvo parts sites and maps
 * variant codes to glass features. Results are cached in D1.
 *
 * NOTE: Volvo parts sites may block automated requests. This module is
 * designed to fail gracefully and return null so the resolver can fall
 * back to existing inferred features.
 */

import { parseVolvoVariantCodes, type ParsedVolvoFeatures } from "./volvo-variant-mapper";

const VOLVO_PARTS_BASE_URLS = [
  "https://usparts.volvocars.com",
  "https://volvo.oempartsonline.com",
];

/** Extract variant codes from raw HTML text using regex heuristics. */
function extractVariantCodesFromHtml(html: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  // Volvo variant codes are typically 3-6 uppercase alphanumerics.
  // Look for common patterns in parts page HTML.
  const patterns = [
    // Explicit variant code labels
    /Variant\s*Code[s]?\s*[:=]\s*([A-Z0-9]{3,8})/gi,
    /Variant\s*[:=]\s*([A-Z0-9]{3,8})/gi,
    /Factory\s*Code[s]?\s*[:=]\s*([A-Z0-9]{3,8})/gi,
    // Table cells / JSON blobs that contain variant arrays
    /"code"\s*:\s*"([A-Z0-9]{3,8})"/gi,
    /'code'\s*:\s*'([A-Z0-9]{3,8})'/gi,
    // Specific known prefixes that appear in Volvo parts data
    /\b(FW0[1-9]|FX0[1-9]|T[0-9]{3}|SENS|SENSOR|EL|ELE|HTB|AKU|AKO|ACO|COAT|HUD|CAM|CAMERA|LDW|ADAS|ANT|GNAG)\b/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const code = m[1] ? m[1].toUpperCase().trim() : m[0].toUpperCase().trim();
      if (code.length >= 3 && code.length <= 10 && !seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }

  return codes;
}

/**
 * Try to fetch variant codes for a Volvo VIN from parts sites.
 * Returns null on any failure so the resolver can fall back gracefully.
 */
export async function fetchVolvoVariantCodes(
  vin: string,
  db: D1Database
): Promise<{ variantCodes: string[]; features: ParsedVolvoFeatures; source: string } | null> {
  if (!vin || vin.length !== 17) return null;

  // 1. Check D1 cache first
  try {
    const cached = await db
      .prepare(
        "SELECT volvo_variant_codes FROM vin_decode_cache WHERE vin = ? AND expires_at > datetime('now')"
      )
      .bind(vin)
      .first<{ volvo_variant_codes: string | null }>();

    if (cached?.volvo_variant_codes) {
      const codes = JSON.parse(cached.volvo_variant_codes) as string[];
      if (Array.isArray(codes) && codes.length > 0) {
        return {
          variantCodes: codes,
          features: parseVolvoVariantCodes(codes),
          source: "volvo_variant_cache",
        };
      }
      // Cached empty array means previous scrape failed — avoid re-scraping
      if (Array.isArray(codes) && codes.length === 0) {
        return null;
      }
    }
  } catch (e) {
    console.warn(`[volvo-vin-scraper] Cache read error for ${vin}:`, e);
  }

  // 2. Attempt live scrape from Volvo parts sites
  let bestCodes: string[] | null = null;
  let bestSource = "";

  for (const baseUrl of VOLVO_PARTS_BASE_URLS) {
    try {
      // Strategy A: VIN search endpoint (best guess based on common patterns)
      const searchUrl = `${baseUrl}/SelectVehicle.aspx?vin=${encodeURIComponent(vin)}`;
      const res = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          Referer: baseUrl,
        },
        redirect: "follow",
      });

      if (!res.ok) continue;

      const html = await res.text();
      const codes = extractVariantCodesFromHtml(html);
      if (codes.length > 0) {
        bestCodes = codes;
        bestSource = baseUrl;
        break;
      }

      // Strategy B: If the site redirected to a model page, try to follow
      // and look for a "Windshield" parts page with variant codes.
      // We extract any model path from the response URL and append common paths.
      const responseUrl = res.url;
      if (responseUrl !== searchUrl) {
        const modelPath = responseUrl.replace(baseUrl, "");
        if (modelPath && modelPath !== "/") {
          const glassPaths = ["/Windshield-Glass", "/Body/Windshield", "/Glass/Windshield"];
          for (const glassPath of glassPaths) {
            try {
              const glassRes = await fetch(`${baseUrl}${modelPath}${glassPath}`, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  Referer: responseUrl,
                },
                redirect: "follow",
              });
              if (!glassRes.ok) continue;
              const glassHtml = await glassRes.text();
              const glassCodes = extractVariantCodesFromHtml(glassHtml);
              if (glassCodes.length > 0) {
                bestCodes = glassCodes;
                bestSource = `${baseUrl}${glassPath}`;
                break;
              }
            } catch {
              // ignore individual glass path errors
            }
          }
          if (bestCodes) break;
        }
      }
    } catch (e) {
      console.warn(`[volvo-vin-scraper] ${baseUrl} failed for ${vin}:`, e);
    }
  }

  // 3. Cache the result (even empty) to avoid repeated scraping attempts
  const codesToCache = bestCodes ?? [];
  try {
    await db
      .prepare(
        `INSERT INTO vin_decode_cache (vin, volvo_variant_codes, decoded_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(vin) DO UPDATE SET
           volvo_variant_codes = excluded.volvo_variant_codes,
           decoded_at = datetime('now')`
      )
      .bind(vin, JSON.stringify(codesToCache))
      .run();
  } catch (e) {
    console.warn(`[volvo-vin-scraper] Cache write error for ${vin}:`, e);
  }

  if (!bestCodes || bestCodes.length === 0) {
    return null;
  }

  return {
    variantCodes: bestCodes,
    features: parseVolvoVariantCodes(bestCodes),
    source: bestSource,
  };
}
