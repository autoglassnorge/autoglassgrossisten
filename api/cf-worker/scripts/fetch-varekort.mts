/**
 * Henter EKTE varekort fra auto-glass.no (innlogget) og viser tilbehørsseksjonen.
 * Bruker BWS-credentials. Kjøring: npx tsx scripts/fetch-varekort.mts <sku>
 */
import { execSync } from "node:child_process";

const sku = process.argv[2] || "2525GYAM";
const BASE = "https://auto-glass.no";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Hent credentials fra BWS (ikke print dem)
function bwsValue(key: string): string {
  const out = execSync("bws secret list", { encoding: "utf8" });
  const arr = JSON.parse(out);
  const hit = arr.find((s: { key: string }) => s.key === key);
  if (!hit) throw new Error(`Mangler ${key} i BWS`);
  return hit.value;
}

async function login(): Promise<string> {
  const user = bwsValue("AUTOGLASS_MIN_KONTO_LOGIN");
  const pass = bwsValue("AUTOGLASS_MIN_KONTO_PASSWORD");
  // Hent login-side for nonce
  const page = await fetch(`${BASE}/min-konto/`, { headers: { "User-Agent": UA } });
  const html = await page.text();
  const nonce = html.match(/name="woocommerce-login-nonce" value="([^"]+)"/)?.[1];
  if (!nonce) throw new Error("Fant ikke login-nonce");
  const form = new URLSearchParams({
    username: user,
    password: pass,
    "woocommerce-login-nonce": nonce,
    _wp_http_referer: "/min-konto/",
    login: "Logg inn",
  });
  const res = await fetch(`${BASE}/min-konto/`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(form.toString().length),
    },
    body: form,
    redirect: "manual",
  });
  const setCookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .concat(res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  const cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookies) throw new Error(`Login feilet (status ${res.status})`);
  return cookies;
}

async function main() {
  const cookies = await login();
  console.log("LOGIN OK");
  // Finn varekort-URL via katalogsøk (direkte produkt-URL)
  const res = await fetch(`${BASE}/?s=${sku}&post_type=product`, {
    headers: { "User-Agent": UA, Cookie: cookies },
    redirect: "follow",
  });
  const html = await res.text();
  const url = html.match(/href="(https:\/\/auto-glass\.no\/produkt\/[^"]+)"/)?.[1];
  if (!url) {
    console.log("Fant ikke produkt-URL for", sku, "— status", res.status, "len", html.length);
    return;
  }
  console.log("PRODUKT-URL:", url);
  const pRes = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" });
  const pHtml = await pRes.text();
  const m = pHtml.match(/<h3 class="section-title">Tilbehør<\/h3>([\s\S]*?)<\/tbody><\/table>/);
  if (!m) {
    console.log("INGEN tilbehørsseksjon på varekortet:", url);
    return;
  }
  const rows = [...m[1].matchAll(/accessory-sku"><p><label[^>]*>([^<]+)<\/label><\/p><\/td><td class="accessory-name"><h4><label[^>]*>([^<]+)<\/label><\/h4><\/td><td class="accessory-price"><p class="price"><label[^>]*><span class="price-label">Pris:<\/span> <span class="woocommerce-Price-amount[^>]*>.*?kr<\/span>&nbsp;<span class="woocommerce-Price-amount">([^<]+)/gs)];
  console.log("TILBEHØR på varekortet (" + rows.length + " stk):");
  for (const r of rows) console.log(" -", r[1], "|", r[2], "|", r[3].trim(), "kr");
}

main().catch((e) => {
  console.error("FEIL:", e.message);
  process.exit(1);
});
