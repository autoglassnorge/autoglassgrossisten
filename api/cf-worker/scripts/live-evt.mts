/**
 * Live-oppslag EV21734: bil → frontrute-kandidater → varekort-tilbehør.
 * Kjøring: npx tsx scripts/live-evt.mts <regnr>
 */
import { execSync } from "node:child_process";

const regnr = process.argv[2] || "EV21734";
const BASE = "https://auto-glass.no";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function bwsValue(key: string): string {
  const arr = JSON.parse(execSync("bws secret list", { encoding: "utf8" }));
  const hit = arr.find((s: { key: string }) => s.key === key);
  if (!hit) throw new Error(`Mangler ${key} i BWS`);
  return hit.value;
}

async function login(): Promise<string> {
  const page = await fetch(`${BASE}/min-konto/`, { headers: { "User-Agent": UA } });
  const html = await page.text();
  const nonce = html.match(/name="woocommerce-login-nonce" value="([^"]+)"/)?.[1];
  if (!nonce) throw new Error("Fant ikke login-nonce");
  const form = new URLSearchParams({
    username: bwsValue("AUTOGLASS_MIN_KONTO_LOGIN"),
    password: bwsValue("AUTOGLASS_MIN_KONTO_PASSWORD"),
    "woocommerce-login-nonce": nonce,
    _wp_http_referer: "/min-konto/",
    login: "Logg inn",
  });
  const res = await fetch(`${BASE}/min-konto/`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .concat(res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookies) throw new Error(`Login feilet (status ${res.status})`);
  return cookies;
}

async function fetchAuthed(cookies: string, path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" });
  return res.text();
}

function parseVehicle(html: string) {
  const heading = html.match(/<div class="ais-lookup">[\s\S]*?<h3>([^<]+)<\/h3>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
  const field = (label: string) =>
    html.match(new RegExp(`<t[dh][^>]*>\\s*${label}\\s*</t[dh]>\\s*<t[dh][^>]*>([^<]*)</t[dh]>`, "i"))?.[1]?.trim() || null;
  return { heading, model: field("Modell"), regDate: field("Registreringsdato"), chassis: field("Chassisnummer") };
}

function parseProducts(html: string) {
  const out: { sku: string; title: string; type: string; price: number | null; url: string }[] = [];
  for (const b of html.matchAll(/<li class="[^"]*post-\d+ product[^"]*".*?<\/li>/gs)) {
    const blk = b[0];
    const sku = blk.match(/class="sku" itemprop="sku">([^<]+)<\/span>/)?.[1] || null;
    const title = blk.match(/woocommerce-loop-product__title">([^<]+)<\/h2>/)?.[1] || null;
    const type = blk.match(/class="typecode"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() || "";
    const url = blk.match(/href="(https:\/\/auto-glass\.no\/produkt\/[^"]+)"/)?.[1] || null;
    const priceMatch = blk.match(/woocommerce-Price-amount amount">(?:<span[^>]*>[^<]*<\/span>)?(?:&nbsp;|\s)*([\d][\d\s.,]*)/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, ""), 10) : null;
    if (sku && title) out.push({ sku, title: title.replace(/\s+/g, " ").trim(), type, price, url: url || "" });
  }
  return out;
}

function parseAccessories(html: string) {
  const out: { sku: string; name: string; price: number | null; checked: boolean }[] = [];
  const section = html.match(/<table class="accessory-products">([\s\S]*?)<\/table>/);
  if (!section) return out;
  for (const row of section[1].matchAll(/<tr class="product-row"[^>]*data-price="(\d+)"[\s\S]*?<\/tr>/g)) {
    const r = row[0];
    const sku = r.match(/class="accessory-sku">[\s\S]*?<label[^>]*>([^<]+)<\/label>/)?.[1]?.trim() || null;
    const name = r.match(/class="accessory-name">[\s\S]*?<h4>[\s\S]*?<label[^>]*>([^<]+)<\/label>/)?.[1]?.trim() || null;
    if (!sku || !name) continue;
    out.push({ sku, name, price: parseInt(row[1], 10), checked: /checked="checked"/.test(r) });
  }
  return out;
}

async function main() {
  const cookies = await login();
  console.log("LOGIN OK — slår opp", regnr);
  const html = await fetchAuthed(cookies, `/?s=${encodeURIComponent(regnr)}&search_type=regnr`);
  const vehicle = parseVehicle(html);
  const products = parseProducts(html);
  console.log("BIL:", JSON.stringify(vehicle));
  console.log("PRODUKTER (" + products.length + "):");
  for (const p of products) console.log(`  ${p.sku} | ${p.type} | ${p.title.slice(0, 60)} | ${p.price} kr`);
  // Frontrute-kandidater med sensor
  const fronts = products.filter((p) => /FRONT|FRONTR/.test(p.title.toUpperCase()) || p.type === "Frontrute");
  const target = fronts.find((p) => /SENSOR|SENS/i.test(p.title.toUpperCase())) || fronts[0];
  if (!target) { console.log("Ingen frontrute funnet"); return; }
  console.log("\nVAREKORT-TILBEHØR for", target.sku, "→", target.url);
  const pHtml = await fetchAuthed(cookies, target.url.replace(BASE, ""));
  const acc = parseAccessories(pHtml);
  for (const a of acc) console.log(`  ${a.checked ? "[FORHÅNDSAVHUKET]" : "[valgfritt]"} ${a.sku} | ${a.name.slice(0, 60)} | ${a.price} kr`);
  if (acc.length === 0) console.log("  (ingen tilbehør på dette varekortet)");
}

main().catch((e) => { console.error("FEIL:", e.message); process.exit(1); });
