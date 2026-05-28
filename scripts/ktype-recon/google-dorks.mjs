#!/usr/bin/env node
/**
 * Google Dorks Generator for kType OSINT Recon
 * Genererer ferdige søkespørringer for å finne kType-data på
 * forum, markedsplasser, TecDoc-sider og nettbutikker.
 *
 * Usage:
 *   node google-dorks.mjs --brand "VW" --model "Transporter" --year 2005
 *   node google-dorks.mjs --eurocode "2525CSGYA"
 *   node google-dorks.mjs --file <missing-ktypes.json>
 */

function generateDorks({ brand, model, year, eurocode, oeNumber, engine, body }) {
  const q = [];
  const base = `${brand || ""} ${model || ""}`.trim();
  const yearStr = year ? ` ${year}` : "";

  // --- Identitetslag: brede søk ---
  q.push({ label: "Bredt kType-søk", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" ktype`)}` });
  q.push({ label: "Bredt TecDoc-søk", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" TecDoc`)}` });
  q.push({ label: "Forum + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`site:forum "${base}" ktype`)}` });

  // --- Eurocode-spesifikt ---
  if (eurocode) {
    q.push({ label: "Eurocode + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`"${eurocode}" ktype`)}` });
    q.push({ label: "Eurocode + TecDoc", url: `https://www.google.com/search?q=${encodeURIComponent(`"${eurocode}" TecDoc`)}` });
    q.push({ label: "Eurocode + part number", url: `https://www.google.com/search?q=${encodeURIComponent(`"${eurocode}" part number`)}` });
    q.push({ label: "Eurocode på eBay", url: `https://www.google.com/search?q=${encodeURIComponent(`site:ebay.com "${eurocode}"`)}` });
    q.push({ label: "Eurocode på Amazon", url: `https://www.google.com/search?q=${encodeURIComponent(`site:amazon.com "${eurocode}"`)}` });
  }

  // --- OE-nummer ---
  if (oeNumber) {
    q.push({ label: "OE-nummer + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`"${oeNumber}" ktype`)}` });
    q.push({ label: "OE-nummer + TecDoc", url: `https://www.google.com/search?q=${encodeURIComponent(`"${oeNumber}" TecDoc`)}` });
  }

  // --- Merke/modell-spesifikt ---
  if (brand && model) {
    q.push({ label: "Merke+modell + glass + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" windshield ktype`)}` });
    q.push({ label: "Merke+modell + bakrute + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" rear window ktype`)}` });
    q.push({ label: "TecAlliance parts", url: `https://www.google.com/search?q=${encodeURIComponent(`site:tecalliance.com "${base}"`)}` });
    q.push({ label: "Autodoc + merke+modell", url: `https://www.google.com/search?q=${encodeURIComponent(`site:autodoc.de "${base}" windshield`)}` });
    q.push({ label: "Europarts + merke+modell", url: `https://www.google.com/search?q=${encodeURIComponent(`site:europarts.de "${base}" windshield`)}` });
  }

  // --- Markedsplasser ---
  q.push({ label: "eBay + merke+modell + glass", url: `https://www.google.com/search?q=${encodeURIComponent(`site:ebay.com "${base}" windshield`)}` });
  q.push({ label: "Alibaba/1688 + merke+modell + glass", url: `https://www.google.com/search?q=${encodeURIComponent(`site:alibaba.com "${base}" auto glass ktype`)}` });

  // --- Forum ---
  const forumSites = [
    "vwvortex.com", "passatworld.com", "audiworld.com", "bmwforum.no",
    "mercedesforum.com", "toyotanation.com", "fordforum.no"
  ];
  for (const site of forumSites) {
    if (base.toLowerCase().includes(site.split(".")[0].replace(/[0-9]/g, ""))) {
      q.push({ label: `Forum: ${site}`, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${site} "${base}" glass`)}` });
    }
  }

  // --- TecDoc-relatert ---
  q.push({ label: "TecDoc online", url: `https://www.google.com/search?q=${encodeURIComponent(`site:tecdoc-online.com "${base}"`)}` });
  q.push({ label: "TecDoc katalog", url: `https://www.google.com/search?q=${encodeURIComponent(`site:tecalliance.com "${base}" ktype`)}` });

  // --- Årsmodell-spesifikt ---
  if (year) {
    q.push({ label: "Årsmodell + kType", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" ${year} ktype`)}` });
  }

  // --- VIN-dekoding ---
  q.push({ label: "VIN-dekoding + merke+modell", url: `https://www.google.com/search?q=${encodeURIComponent(`"${base}" VIN decoder`)}` });

  return q;
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);
  const fs = await import("fs");

  if (args.length === 0) {
    console.log(`Usage:
  node google-dorks.mjs --brand "VW" --model "Transporter" --year 2005
  node google-dorks.mjs --eurocode "2525CSGYA" --brand "VW" --model "Transporter"
  node google-dorks.mjs --file <records.json> --out <dorks.md>`);
    process.exit(1);
  }

  // Single query
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const brand = getArg("--brand");
  const model = getArg("--model");
  const year = getArg("--year") ? parseInt(getArg("--year"), 10) : undefined;
  const eurocode = getArg("--eurocode");
  const oeNumber = getArg("--oe");

  if (brand || model || eurocode) {
    const dorks = generateDorks({ brand, model, year, eurocode, oeNumber });
    console.log(`# Google Dorks for ${brand || ""} ${model || ""} ${year || ""} ${eurocode || ""}\n`);
    dorks.forEach((d, i) => console.log(`${i + 1}. **${d.label}**\n   ${d.url}\n`));
    return;
  }

  // Batch from file
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0) {
    const file = args[fileIdx + 1];
    const outIdx = args.indexOf("--out");
    const outFile = outIdx >= 0 ? args[outIdx + 1] : file.replace(/\.json$/, "-dorks.md");

    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const records = Array.isArray(data) ? data : [data];

    let md = `# kType OSINT Google Dorks\n\nGenerert: ${new Date().toISOString()}\n\n`;
    for (const r of records) {
      const dorks = generateDorks({
        brand: r.brand,
        model: r.model,
        year: r.year,
        eurocode: r.eurocode,
        oeNumber: r.oeNumber,
      });
      md += `## ${r.brand || ""} ${r.model || ""} ${r.year || ""} ${r.eurocode || ""}\n\n`;
      dorks.forEach((d, i) => {
        md += `${i + 1}. [${d.label}](${d.url})\n`;
      });
      md += "\n---\n\n";
    }

    fs.writeFileSync(outFile, md);
    console.log(`✅ Generert ${records.length} dork-sett i ${outFile}`);
    return;
  }

  console.error("Ukjent kommando");
  process.exit(1);
}

main().catch(console.error);
