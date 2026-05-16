const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://www.pilkingtonautomotiveglass.ie";
const CONCURRENCY = 3;
const DELAY_MS = 50;
const CHECKPOINT_EVERY = 500;
const OUTPUT_DIR = path.join(process.cwd(), "data", "scrapers");
const LOG_FILE = "/tmp/nf-scraper.log";

function log(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

function parseProductPage(html, id) {
  const scripts = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1].trim());
  let data;
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s);
      if (parsed["@type"] === "Product" && parsed.sku && parsed.name) { data = parsed; break; }
    } catch { continue; }
  }
  if (!data) return null;
  return { id, eurocode: data.sku, name: data.name };
}

async function main() {
  fs.writeFileSync(LOG_FILE, "Starting node-fetch scraper...\n");
  const checkpointPath = path.join(OUTPUT_DIR, "pilkington-checkpoint.json");
  
  let checkpoint;
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    log(`Resumed: ${checkpoint.completedIds.length}`);
  } else {
    checkpoint = { completedIds: [], products: [], lastIndex: 0 };
  }
  
  log("Fetching sitemap...");
  const xml = await fetch(`${BASE_URL}/sitemap.xml`).then(r => r.text());
  const allIds = [];
  const re = /products\/id-(\d+)\.html/g;
  let m;
  while ((m = re.exec(xml)) !== null) allIds.push(parseInt(m[1]));
  
  const remaining = Array.from(allIds.filter(id => !new Set(checkpoint.completedIds).has(id)));
  log(`Remaining: ${remaining.length}`);
  
  const total = remaining.length;
  const startTime = Date.now();
  
  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const htmls = await Promise.all(batch.map(id => fetchWithRetry(`${BASE_URL}/products/id-${id}.html`, 2).catch(() => null)));
    const results = htmls.map((html, idx) => html ? parseProductPage(html, batch[idx]) : null);
    
    for (const p of results) {
      if (p) {
        checkpoint.products.push(p);
        checkpoint.completedIds.push(p.id);
      }
    }
    
    const completed = checkpoint.completedIds.length;
    if (completed % 100 === 0 || completed === total) {
      log(`${completed}/${total} done (${((Date.now()-startTime)/1000).toFixed(0)}s), last: ${batch[batch.length-1]}`);
    }
    
    if (completed > 0 && completed % CHECKPOINT_EVERY === 0) {
      checkpoint.lastIndex = i + CONCURRENCY;
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 1));
      log(`Checkpoint: ${completed}`);
    }
    
    if (i + CONCURRENCY < total) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  
  fs.writeFileSync(path.join(OUTPUT_DIR, "pilkington-products.json"), JSON.stringify(checkpoint.products, null, 1));
  log(`Done in ${((Date.now()-startTime)/1000/60).toFixed(1)}m. Total: ${checkpoint.products.length}`);
}

main().catch(e => log(`ERROR: ${e.message}`));
