/**
 * Autodoc Probe — Phase 1: Network Capture
 *
 * Åpner én og én Autodoc-produktside i Playwright (headed),
 * fanger alle network responses, filtrerer interessante,
 * og lagrer strukturerte rådata til data/autodoc-probe/.
 *
 * Bruk:
 *   node scripts/autodoc-probe/capture.mjs
 *
 * Krever: Playwright installert (npx playwright install chromium)
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.resolve(ROOT, CONFIG.outDir);

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function sanitizeFilename(url) {
  const u = new URL(url);
  const base = u.pathname.replace(/\//g, "_").replace(/^_/, "").replace(/_$/, "");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base || "index"}_${ts}`;
}

function isInteresting(response) {
  const url = response.url().toLowerCase();
  const ct = (response.headers()["content-type"] || "").toLowerCase();

  // Pattern-match på URL
  const urlMatch = CONFIG.interestPatterns.some((pat) =>
    url.includes(pat.toLowerCase())
  );

  // Content-type match
  const ctMatch = CONFIG.interestContentTypes.some((t) => ct.includes(t));

  return urlMatch || ctMatch;
}

async function capturePage(browser, url) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "no-NO",
  });

  const page = await context.newPage();

  const captured = [];
  const allResponses = [];

  page.on("response", async (response) => {
    const req = response.request();
    const info = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      method: req.method(),
      contentType: response.headers()["content-type"] || null,
      contentLength: response.headers()["content-length"] || null,
      timestamp: new Date().toISOString(),
      interesting: isInteresting(response),
    };

    allResponses.push(info);

    if (isInteresting(response)) {
      let bodyPreview = null;
      try {
        const ct = (info.contentType || "").toLowerCase();
        if (ct.includes("json") || ct.includes("text/plain")) {
          const text = await response.text();
          bodyPreview = text.slice(0, 5000); // første 5KB
          info.bodySize = text.length;
        } else {
          bodyPreview = "[binary/skipped]";
        }
      } catch (e) {
        bodyPreview = `[error reading body: ${e.message}]`;
      }
      info.bodyPreview = bodyPreview;
      captured.push(info);
    }
  });

  console.log(`\n🌐 Navigating: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: CONFIG.timeout });
    // Vent litt ekstra for lazy-loaded AJAX
    await page.waitForTimeout(3000);
  } catch (e) {
    console.warn(`   ⚠️ Navigation warning: ${e.message}`);
  }

  // Ta screenshot for referanse
  const shotPath = path.join(OUT, `${sanitizeFilename(url)}.png`);
  try {
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`   📸 Screenshot: ${path.basename(shotPath)}`);
  } catch (e) {
    console.warn(`   ⚠️ Screenshot failed: ${e.message}`);
  }

  // Dump page HTML for å se etter inline-data
  const htmlPath = path.join(OUT, `${sanitizeFilename(url)}.html`);
  try {
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, "utf-8");
    console.log(`   📝 HTML saved: ${path.basename(htmlPath)}`);
  } catch (e) {
    console.warn(`   ⚠️ HTML save failed: ${e.message}`);
  }

  await context.close();

  return { url, captured, allResponsesCount: allResponses.length };
}

async function main() {
  ensureDir(OUT);

  console.log("========================================");
  console.log("  Autodoc Probe — Network Capture");
  console.log("========================================");
  console.log(`Output: ${OUT}`);
  console.log(`URLs:   ${CONFIG.urls.length}`);
  console.log(`Mode:   ${CONFIG.headless ? "headless" : "headed (visuell)"}`);
  console.log("");

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
  });

  const results = [];
  for (const url of CONFIG.urls) {
    const res = await capturePage(browser, url);
    results.push(res);

    // Lagre per-URL capture
    const safeName = sanitizeFilename(url);
    const capturePath = path.join(OUT, `${safeName}_capture.json`);
    fs.writeFileSync(
      capturePath,
      JSON.stringify(
        {
          source_url: url,
          captured_at: new Date().toISOString(),
          total_responses: res.allResponsesCount,
          interesting_count: res.captured.length,
          captured_requests: res.captured,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(
      `   💾 Capture saved: ${path.basename(capturePath)} (${res.captured.length} interesting / ${res.allResponsesCount} total)`
    );
  }

  await browser.close();

  // Lagre summary
  const summaryPath = path.join(OUT, "_summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        config: {
          headless: CONFIG.headless,
          slowMo: CONFIG.slowMo,
          timeout: CONFIG.timeout,
        },
        results: results.map((r) => ({
          url: r.url,
          total_responses: r.allResponsesCount,
          interesting: r.captured.length,
        })),
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\n========================================");
  console.log("  Capture complete");
  console.log(`  Summary: ${summaryPath}`);
  console.log("========================================");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
