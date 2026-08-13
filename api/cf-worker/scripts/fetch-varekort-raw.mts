import { execSync } from "node:child_process";
const sku = process.argv[2] || "2525GYAM";
const BASE = "https://auto-glass.no";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
function bwsValue(key: string): string {
  const arr = JSON.parse(execSync("bws secret list", { encoding: "utf8" }));
  const hit = arr.find((s: { key: string }) => s.key === key);
  if (!hit) throw new Error(`Mangler ${key}`);
  return hit.value;
}
async function login(): Promise<string> {
  const page = await fetch(`${BASE}/min-konto/`, { headers: { "User-Agent": UA } });
  const html = await page.text();
  const nonce = html.match(/name="woocommerce-login-nonce" value="([^"]+)"/)?.[1];
  if (!nonce) throw new Error("Ingen nonce");
  const form = new URLSearchParams({ username: bwsValue("AUTOGLASS_MIN_KONTO_LOGIN"), password: bwsValue("AUTOGLASS_MIN_KONTO_PASSWORD"), "woocommerce-login-nonce": nonce, _wp_http_referer: "/min-konto/", login: "Logg inn" });
  const res = await fetch(`${BASE}/min-konto/`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual" });
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : []).concat(res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []).map((c) => c.split(";")[0]).join("; ");
  if (!cookies) throw new Error(`Login feilet ${res.status}`);
  return cookies;
}
async function main() {
  const cookies = await login();
  const res = await fetch(`${BASE}/?s=${sku}&post_type=product`, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" });
  const html = await res.text();
  const url = html.match(/href="(https:\/\/auto-glass\.no\/produkt\/[^"]+)"/)?.[1];
  if (!url) { console.log("INGEN URL", res.status); return; }
  const pRes = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" });
  const pHtml = await pRes.text();
  // Søk etter alt tilbehørsrelatert
  const terms = ["gel", "sensor", "s1", "s2", "s3", "lim", "primer", "kobling", "adapter", "holder", "kit"];
  console.log("=== VAREKORT:", url, "| len", pHtml.length, "===");
  const lower = pHtml.toLowerCase();
  for (const t of terms) {
    const idxs = [...lower.matchAll(new RegExp(t, "g"))].map((m) => m.index);
    console.log(`[${t}]: ${idxs.length} treff`);
    for (const i of idxs.slice(0, 3)) {
      const snip = pHtml.slice(Math.max(0, i - 120), i + 180).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      console.log("   ...", snip.slice(0, 220));
    }
  }
  // Sjekk om det finnes andre seksjoner med 'Tilbehør'
  const tilbehor = [...lower.matchAll(/tilbehør/g)].length;
  console.log("Tilbehør-ord:", tilbehor);
}
main().catch((e) => { console.error("FEIL:", e.message); process.exit(1); });
