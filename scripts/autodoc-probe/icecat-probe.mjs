/**
 * Icecat Probe — Alternative data source for product + fitment data
 *
 * Icecat Open Catalog provides free product datasheets including:
 * - Product specs
 * - GTIN/EAN
 * - Images
 * - Category data
 * - Limited vehicle compatibility via "Feature" blocks
 *
 * This probe tests whether Icecat has Pilkington/autoglass products
 * with enough data to serve as an Autodoc alternative.
 *
 * API: https://live.icecat.biz/api/?shopname=open&Language=NO&IcecatID={id}
 * Search via: https://live.icecat.biz/api/?shopname=open&Language=NO&Brand={brand}&ProductCode={code}
 */

import fs from "fs";
import path from "path";

const OUT = "data/autodoc-probe/icecat";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

async function icecatByBrandCode(brand, productCode) {
  const url = `https://live.icecat.biz/api/?shopname=open&Language=NO&Brand=${encodeURIComponent(brand)}&ProductCode=${encodeURIComponent(productCode)}`;
  console.log(`  📡 Icecat: ${brand} / ${productCode}`);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    const text = await res.text();
    if (text.includes("<Product") || text.includes("<?xml")) {
      return { status: res.status, xml: text.slice(0, 15000) };
    }
    return { status: res.status, text: text.slice(0, 500) };
  } catch (e) {
    return { status: "error", error: e.message };
  }
}

async function main() {
  // Test-caser: Pilkington produktkoder fra vår katalog
  const tests = [
    { brand: "Pilkington", code: "6689658", note: "Frontrute" },
    { brand: "Pilkington", code: "7676695", note: "Bakrute" },
    { brand: "Pilkington", code: "6686074", note: "Sideglass" },
    { brand: "Pilkington", code: "6690686", note: "Frontrute ADAS" },
    // Prøv også EAN-koder (hvis vi hadde dem)
    { brand: "Pilkington", code: "4043981105802", note: "EAN test" },
  ];

  const results = [];
  for (const t of tests) {
    const r = await icecatByBrandCode(t.brand, t.code);
    results.push({ ...t, ...r });
    const outPath = path.join(OUT, `icecat_${t.brand}_${t.code}.xml`);
    fs.writeFileSync(outPath, r.xml || r.text || "", "utf-8");
    console.log(`     → ${r.status} | saved ${path.basename(outPath)}`);
    await SLEEP(2000); // respektfull rate-limiting
  }

  fs.writeFileSync(
    path.join(OUT, "_summary.json"),
    JSON.stringify({ run_at: new Date().toISOString(), results }, null, 2),
    "utf-8"
  );

  console.log("\n✅ Icecat probe complete");
}

main().catch(console.error);
