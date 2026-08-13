import { execSync } from "node:child_process";
const BASE = "https://auto-glass.no";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
function bwsValue(key: string): string {
  const arr = JSON.parse(execSync("bws secret list", { encoding: "utf8" }));
  return arr.find((s: { key: string }) => s.key === key).value;
}
async function login(): Promise<string> {
  const page = await fetch(`${BASE}/min-konto/`, { headers: { "User-Agent": UA } });
  const html = await page.text();
  const nonce = html.match(/name="woocommerce-login-nonce" value="([^"]+)"/)?.[1];
  const form = new URLSearchParams({ username: bwsValue("AUTOGLASS_MIN_KONTO_LOGIN"), password: bwsValue("AUTOGLASS_MIN_KONTO_PASSWORD"), "woocommerce-login-nonce": nonce, _wp_http_referer: "/min-konto/", login: "Logg inn" });
  const res = await fetch(`${BASE}/min-konto/`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual" });
  return (res.headers.getSetCookie ? res.headers.getSetCookie() : []).concat(res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []).map((c) => c.split(";")[0]).join("; ");
}
function parseProducts(html: string) {
  const out: { sku: string; title: string; url: string }[] = [];
  for (const b of html.matchAll(/<li class="[^"]*post-\d+ product[^"]*".*?<\/li>/gs)) {
    const blk = b[0];
    const sku = blk.match(/class="sku" itemprop="sku">([^<]+)<\/span>/)?.[1] || null;
    const title = blk.match(/woocommerce-loop-product__title">([^<]+)<\/h2>/)?.[1] || null;
    const url = blk.match(/href="(https:\/\/auto-glass\.no\/produkt\/[^"]+)"/)?.[1] || null;
    if (sku && title && url) out.push({ sku, title: title.replace(/\s+/g, " ").trim(), url });
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
    if (sku && name) out.push({ sku, name, price: parseInt(row[1], 10), checked: /checked="checked"/.test(r) });
  }
  return out;
}
async function main() {
  const cookies = await login();
  const html = await fetch(`${BASE}/?s=EV21734&search_type=regnr`, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" }).then((r) => r.text());
  const prods = parseProducts(html).filter((p) => p.title.toUpperCase().includes("COAT") || p.title.toUpperCase().includes("FRONT"));
  for (const p of prods) {
    const pHtml = await fetch(p.url, { headers: { "User-Agent": UA, Cookie: cookies }, redirect: "follow" }).then((r) => r.text());
    const acc = parseAccessories(pHtml);
    console.log(`\n=== ${p.sku} | ${p.title.slice(0, 55)}`);
    if (acc.length === 0) console.log("  (ingen tilbehør)");
    for (const a of acc) console.log(`  ${a.checked ? "[FORHÅNDSAVHUKET]" : "[valgfritt]"} ${a.sku} | ${a.name.slice(0, 65)} | ${a.price} kr`);
  }
}
main().catch((e) => { console.error("FEIL:", e.message); process.exit(1); });
