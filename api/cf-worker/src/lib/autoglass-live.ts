/**
 * Autoglass Live Client — logged-in B2B store access to auto-glass.no
 * =====================================================================
 * Primary data source for the senior order taker:
 *   - Login (WooCommerce /min-konto/) with session cookies cached in KV
 *   - Regnr search → vehicle + glass products (SKU, type, price, Oslo stock)
 *   - Product page → accessories (glue, primer, clips, trim) — wipers excluded for now
 *
 * Credentials come from wrangler secrets AUTOGLASS_LOGIN / AUTOGLASS_PASSWORD.
 * NEVER logged and NEVER returned to the browser.
 */

import type { Env } from "../types";

const BASE_URL = "https://auto-glass.no";
const SESSION_KEY = "autoglass:session:cookies";
const SESSION_TTL = 60 * 60 * 12; // 12h — WooCommerce sessions are long-lived

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Accessory names to exclude (e.g. wipers) — flip when Tom opts in */
const EXCLUDED_ACCESSORY_PATTERNS = [/visker/i, /wiper/i];

export interface LiveProduct {
  sku: string;
  title: string;
  typeCode: string;
  typeCodeKey: string;
  price: number | null;
  osloStock: number | null;
  stockStatus: "instock" | "onbackorder" | "outofstock" | null;
  url: string;
  /** e.g. "BRUK 2525GY VED TOM" — alternative product hint */
  note?: string;
}

export interface LiveVehicle {
  heading: string;
  model: string | null;
  registrationDate: string | null;
  chassis: string | null;
  body: string | null;
}

export interface LiveAccessory {
  sku: string;
  name: string;
  price: number;
}

export interface LiveSearchResult {
  vehicle: LiveVehicle;
  products: LiveProduct[];
  resultUrl: string;
}

// ---------------------------------------------------------------------------
// Session (KV-cached WooCommerce cookies)
// ---------------------------------------------------------------------------

function cookieHeaderFromSetCookie(setCookies: string[]): string {
  const pairs: string[] = [];
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    if (first && first.includes("=")) pairs.push(first);
  }
  return pairs.join("; ");
}

/** Cross-runtime Set-Cookie reader (Cloudflare provides getSetCookie()). */
function getSetCookies(res: Response): string[] {
  const h = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    const out = h.getSetCookie();
    if (out.length) return out;
  }
  const joined = res.headers.get("Set-Cookie");
  return joined ? [joined] : [];
}

async function getCachedCookies(env: Env): Promise<string | null> {
  try {
    return (await env.GLASS_CATALOG.get(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

async function cacheCookies(env: Env, cookies: string): Promise<void> {
  await env.GLASS_CATALOG.put(SESSION_KEY, cookies, { expirationTtl: SESSION_TTL });
}

/** Log in to auto-glass.no and cache the session cookies. Throws on failure. */
export async function login(env: Env): Promise<string> {
  if (!env.AUTOGLASS_LOGIN || !env.AUTOGLASS_PASSWORD) {
    throw new Error("AUTOGLASS_LOGIN/AUTOGLASS_PASSWORD secrets mangler");
  }

  // 1. Fetch login page for the nonce + initial cookies
  const loginPage = await fetch(`${BASE_URL}/min-konto/`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });
  const loginHtml = await loginPage.text();
  const nonceMatch = loginHtml.match(
    /name="woocommerce-login-nonce" value="([^"]+)"/
  );
  if (!nonceMatch) {
    throw new Error("Fant ikke woocommerce-login-nonce");
  }
  const nonce = nonceMatch[1];
  const initialCookies = cookieHeaderFromSetCookie(getSetCookies(loginPage));

  // 2. POST credentials
  const form = new URLSearchParams();
  form.append("username", env.AUTOGLASS_LOGIN);
  form.append("password", env.AUTOGLASS_PASSWORD);
  form.append("woocommerce-login-nonce", nonce);
  form.append("_wp_http_referer", "/min-konto/");
  form.append("rememberme", "forever");
  form.append("login", "Logg inn");

  const res = await fetch(`${BASE_URL}/min-konto/`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: initialCookies,
    },
    body: form.toString(),
    redirect: "manual",
  });

  const setCookies = getSetCookies(res);
  const cookies = cookieHeaderFromSetCookie(setCookies);

  if (!cookies.includes("wordpress_logged_in") || !cookies.includes("wordpress_sec")) {
    throw new Error("Innlogging feilet — ingen wordpress-sesjon mottatt");
  }

  await cacheCookies(env, cookies);
  return cookies;
}

/** Get a working session cookie, re-logging in if missing/stale. */
async function ensureSession(env: Env): Promise<string> {
  const cached = await getCachedCookies(env);
  if (cached && cached.includes("wordpress_logged_in")) {
    return cached;
  }
  return login(env);
}

/** Fetch a page with the logged-in session; re-login once on auth failure. */
async function fetchAuthed(
  env: Env,
  path: string,
  cookies: string
): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, Cookie: cookies },
    redirect: "follow",
  });

  // Redirected to login page → session expired; re-login and retry once
  if (res.url.includes("/min-konto/") && !res.url.includes("/produkt/")) {
    const fresh = await login(env);
    const retry = await fetch(`${BASE_URL}${path}`, {
      headers: { "User-Agent": USER_AGENT, Cookie: fresh },
      redirect: "follow",
    });
    return { html: await retry.text(), finalUrl: retry.url };
  }

  return { html: await res.text(), finalUrl: res.url };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parsePriceFromAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parseVehicle(html: string): LiveVehicle {
  // The lookup block is a simple <th>/<td> table; extract by labels
  const field = (label: string): string | null => {
    const m = html.match(
      new RegExp(
        `<t[dh][^>]*>\\s*${label}\\s*</t[dh]>\\s*<t[dh][^>]*>([^<]*)</t[dh]>`,
        "i"
      )
    );
    return m ? m[1].trim() || null : null;
  };

  const heading =
    (html.match(/<div class="ais-lookup">[\s\S]*?<h3>([^<]+)<\/h3>/i)?.[1] || "")
      .replace(/\s+/g, " ")
      .trim() || null;

  return {
    heading: heading || "",
    model: field("Modell"),
    registrationDate: field("Registreringsdato"),
    chassis: field("Chassisnummer"),
    body: field("Karosseri"),
  };
}

export function parseProducts(html: string): LiveProduct[] {
  const products: LiveProduct[] = [];
  const blocks = html.matchAll(
    /<li class="[^"]*post-\d+ product[^"]*".*?<\/li>/gs
  );

  for (const block of blocks) {
    const b = block[0];
    const sku = b.match(/class="sku" itemprop="sku">([^<]+)<\/span>/)?.[1] || null;
    const title =
      b.match(/woocommerce-loop-product__title">([^<]+)<\/h2>/)?.[1] || null;
    const typeCode =
      b.match(/class="typecode"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() || null;
    const typeCodeKey =
      b.match(/class="typecode" rel="([^"]+)"/)?.[1] || null;
    const url = b.match(/href="(https:\/\/auto-glass\.no\/produkt\/[^"]+)"/)?.[1] || null;

    const priceMatch = b.match(
      /woocommerce-Price-amount amount">(?:<span[^>]*>[^<]*<\/span>)?(?:&nbsp;|\s)*([\d][\d\s.,]*)/
    );
    const price = priceMatch ? parsePriceFromAmount(priceMatch[1]) : null;

    const stockMatch = b.match(/class="stock-status[^"]*" title="(\d+)"/);
    const osloStock = stockMatch ? parseInt(stockMatch[1], 10) : null;

    let stockStatus: LiveProduct["stockStatus"] = null;
    if (/outofstock/.test(b)) stockStatus = "outofstock";
    else if (/onbackorder/.test(b)) stockStatus = "onbackorder";
    else if (/instock/.test(b)) stockStatus = "instock";

    let note: string | undefined;
    if (title && /BRUK\s+\S+\s+VED\s+TOM/i.test(title)) {
      const m = title.match(/BRUK\s+(\S+)\s+VED\s+TOM/i);
      if (m) note = `BRUK ${m[1]} VED TOM`;
    }

    if (sku && title) {
      products.push({
        sku,
        title: title.replace(/\s+/g, " ").trim(),
        typeCode: typeCode || "",
        typeCodeKey: typeCodeKey || "",
        price,
        osloStock,
        stockStatus,
        url: url || "",
        note,
      });
    }
  }

  return products;
}

export function parseAccessories(html: string): LiveAccessory[] {
  const accessories: LiveAccessory[] = [];
  const section = html.match(
    /<table class="accessory-products">([\s\S]*?)<\/table>/
  );
  if (!section) return accessories;

  const rows = section[1].matchAll(/<tr class="product-row"[^>]*data-price="(\d+)"[\s\S]*?<\/tr>/g);
  for (const row of rows) {
    const r = row[0];
    const sku = r.match(/class="accessory-sku">[\s\S]*?<label[^>]*>([^<]+)<\/label>/)?.[1]?.trim() || null;
    const name = r.match(/class="accessory-name">[\s\S]*?<h4>[\s\S]*?<label[^>]*>([^<]+)<\/label>/)?.[1]?.trim() || null;
    const price = row[1] ? parseInt(row[1], 10) : null;

    if (!sku || !name || price === null) continue;
    if (EXCLUDED_ACCESSORY_PATTERNS.some((re) => re.test(name))) continue;

    accessories.push({ sku, name, price });
  }
  return accessories;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Live regnr search → vehicle + products (with live price + Oslo stock). */
export async function liveSearch(
  env: Env,
  regnr: string
): Promise<LiveSearchResult | null> {
  const cookies = await ensureSession(env);
  const q = encodeURIComponent(regnr.trim().toUpperCase());
  const { html, finalUrl } = await fetchAuthed(env, `/?s=${q}&search_type=regnr`, cookies);

  const products = parseProducts(html);
  const vehicle = parseVehicle(html);

  if (products.length === 0) return null;

  return { vehicle, products, resultUrl: finalUrl };
}

/** Live accessories (glue/primer/clips/trim) for a specific product page. */
export async function liveProductAccessories(
  env: Env,
  productUrl: string
): Promise<LiveAccessory[]> {
  const cookies = await ensureSession(env);
  const path = productUrl.replace(BASE_URL, "");
  const { html } = await fetchAuthed(env, path, cookies);
  return parseAccessories(html);
}
