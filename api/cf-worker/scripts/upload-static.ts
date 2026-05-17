/**
 * Upload static files to Cloudflare KV
 * =====================================
 * Uploads HTML, CSS, JS and other static assets to KV for Worker serving.
 *
 * Usage:
 *   CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx KV_NAMESPACE_ID=xxx npx ts-node scripts/upload-static.ts
 */

import * as fs from "fs";
import * as path from "path";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");

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

async function uploadFile(filePath: string, kvKey: string): Promise<void> {
  const fullPath = path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠️  Skipping ${filePath} (not found)`);
    return;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${kvKey}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KV upload failed for ${kvKey}: ${response.status} ${text}`);
  }

  const result = await response.json() as { success?: boolean };
  if (!result.success) {
    throw new Error(`KV upload returned success=false for ${kvKey}`);
  }

  console.log(`  ✅ ${kvKey} (${content.length} bytes)`);
}

async function main() {
  console.log("☁️  Upload static files to Cloudflare KV\n");

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID) {
    console.error("❌ Missing environment variables: CF_ACCOUNT_ID, CF_API_TOKEN, KV_NAMESPACE_ID");
    process.exit(1);
  }

  let uploaded = 0;
  let failed = 0;

  for (const { file, key } of FILES) {
    try {
      await uploadFile(file, key);
      uploaded++;
    } catch (e) {
      console.error(`  ❌ ${key}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${uploaded} uploaded, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
