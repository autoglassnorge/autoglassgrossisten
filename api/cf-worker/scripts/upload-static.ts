/**
 * Upload static files to Cloudflare KV
 * =====================================
 * Laster HTML, CSS, JS og andre statiske assets opp til KV
 * med retry, timeout, parallell upload og progress-logging.
 *
 * Usage:
 *   CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx KV_NAMESPACE_ID=xxx \
 *     npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/upload-static.ts
 */

import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const CONCURRENCY = 5;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

const FILES: Array<{ file: string; key: string }> = [
  { file: "index.html", key: "_site_index_html" },
  { file: "vin-sok.html", key: "_site_vin_sok_html" },
  { file: "produkter.html", key: "_site_produkter_html" },
  { file: "bli-kunde.html", key: "_site_bli_kunde_html" },
  { file: "kontakt.html", key: "_site_kontakt_html" },
  { file: "om-oss.html", key: "_site_om_oss_html" },
  { file: "kundeportal.html", key: "_site_kundeportal_html" },
  { file: "css/tokens.css", key: "_site_css_tokens_css" },
  { file: "css/base.css", key: "_site_css_base_css" },
  { file: "css/components.css", key: "_site_css_components_css" },
  { file: "js/i18n.js", key: "_site_js_i18n_js" },
  { file: "js/main.js", key: "_site_js_main_js" },
  { file: "js/search-glass.js", key: "_site_js_search_glass_js" },
  { file: "js/auth.js", key: "_site_js_auth_js" },
  { file: "robots.txt", key: "_site_robots_txt" },
  { file: "sitemap.xml", key: "_site_sitemap_xml" },
];

/* ── Retry + Timeout upload ────────────────────────────────── */

async function uploadWithRetry(
  kvKey: string,
  content: string,
  retries = MAX_RETRIES
): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${kvKey}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body: content,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        return;
      }

      const isRetryable = response.status === 429 || response.status >= 500;
      const errorText = await response.text().catch(() => "unknown");

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`   ⚠️  ${kvKey}: ${response.status} (retry ${attempt + 1}/${retries} om ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(`KV upload feilet for ${kvKey}: ${response.status} ${errorText}`);
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof Error && err.name === "AbortError";

      if (isTimeout && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`   ⏱️  ${kvKey}: Timeout (retry ${attempt + 1}/${retries} om ${Math.round(delay)}ms)`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (attempt >= retries) {
        throw new Error(`KV upload feilet for ${kvKey} etter ${retries} retries: ${(err as Error).message}`);
      }
      throw err;
    }
  }
}

/* ── Main ──────────────────────────────────────────────────── */

async function main() {
  console.log("☁️  Upload statiske filer til Cloudflare KV\n");

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error("❌ Mangler miljøvariabler: CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID");
    process.exit(1);
  }

  const limit = pLimit(CONCURRENCY);
  const tasks: Promise<{ key: string; size: number; status: "ok" | "skip" | "fail" }>[] = [];

  for (const { file, key } of FILES) {
    const fullPath = path.join(REPO_ROOT, file);

    if (!fs.existsSync(fullPath)) {
      console.log(`  ⚠️  Skipper ${file} (ikke funnet)`);
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    tasks.push(
      limit(async () => {
        try {
          await uploadWithRetry(key, content);
          return { key, size: content.length, status: "ok" as const };
        } catch (e) {
          return { key, size: 0, status: "fail" as const };
        }
      })
    );
  }

  const results = await Promise.all(tasks);

  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "fail");
  const totalBytes = ok.reduce((sum, r) => sum + r.size, 0);

  console.log(`\n📊 Oppsummering:`);
  console.log(`   ✅ ${ok.length} filer lastet opp (${(totalBytes / 1024).toFixed(1)} KB)`);

  if (failed.length > 0) {
    console.error(`   ❌ ${failed.length} feil:`);
    for (const { key } of failed) {
      console.error(`      ${key}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Ferdig!");
}

main().catch((e) => {
  console.error("❌ Uventet feil:", e.message);
  process.exit(1);
});
