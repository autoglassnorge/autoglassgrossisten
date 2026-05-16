const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_URL = "https://www.pilkingtonautomotiveglass.ie";
const CONCURRENCY = 1; // curl is sync, so sequential
const DELAY_MS = 0;
const CHECKPOINT_EVERY = 500;
const OUTPUT_DIR = path.join(process.cwd(), "data", "scrapers");
const LOG_FILE = "/tmp/curl-scraper.log";

function log(msg) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

function fetchWithCurl(url) {
  try {
    return execSync(`curl -s -L --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`, {
      encoding: "utf-8",
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
  } catch (e) {
    return null;
  }
}

function parseProductPage(html, id) {
  if (!html) return null;
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
  fs.writeFileSync(LOG_FILE, "Starting curl scraper...\n");
  const checkpointPath = path.join(OUTPUT_DIR, "pilkington-checkpoint.json");
  
  let checkpoint;
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    log(`Resumed: ${checkpoint.completedIds.length}`);
  } else {
    checkpoint = { completedIds: [], products: [], lastIndex: 0 };
  }
  
  log("Fetching sitemap...");
  const xml = fetchWithCurl(`${BASE_URL}/sitemap.xml`);
  const allIds = [];
  const re = /products\/id-(\d+)\.html/g;
  let m;
  while ((m = re.exec(xml)) !== null) allIds.push(parseInt(m[1]));
  
  const remaining = Array.from(allIds.filter(id => !new Set(checkpoint.completedIds).has(id)));
  log(`Remaining: ${remaining.length}`);
  
  const total = remaining.length;
  const startTime = Date.now();
  
  for (let i = 0; i < total; i++) {
    const id = remaining[i];
    const html = fetchWithCurl(`${BASE_URL}/products/id-${id}.html`);
    const result = parseProductPage(html, id);
    if (result) {
      checkpoint.products.push(result);
      checkpoint.completedIds.push(result.id);
    }
    
    const completed = checkpoint.completedIds.length;
    if (completed % 100 === 0 || completed === total) {
      log(`${completed}/${total} done (${((Date.now()-startTime)/1000).toFixed(0)}s), last: ${id}`);
    }
    
    if (completed > 0 && completed % CHECKPOINT_EVERY === 0) {
      checkpoint.lastIndex = i;
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 1));
      log(`Checkpoint: ${completed}`);
    }
  }
  
  fs.writeFileSync(path.join(OUTPUT_DIR, "pilkington-products.json"), JSON.stringify(checkpoint.products, null, 1));
  log(`Done in ${((Date.now()-startTime)/1000/60).toFixed(1)}m. Total: ${checkpoint.products.length}`);
}

main().catch(e => log(`ERROR: ${e.message}`));
