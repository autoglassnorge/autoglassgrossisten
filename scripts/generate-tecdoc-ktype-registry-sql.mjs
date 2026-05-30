/**
 * Generer SQL for å fylle ktype_registry i D1 med alle TecDoc-entries.
 *
 * Bruk:
 *   node scripts/generate-tecdoc-ktype-registry-sql.mjs
 *   cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --file=data/tecdoc-ktype-registry.sql --yes
 */

import fs from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

const TECDOC_DIR = path.join(process.cwd(), "data", "tecdoc-import");
const OUT_SQL = path.join(process.cwd(), "api", "cf-worker", "data", "tecdoc-ktype-registry.sql");

// Ensure output dir exists
fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });

async function loadCsv(filename, parser) {
  const fp = path.join(TECDOC_DIR, filename);
  const lines = [];
  const rl = createInterface({ input: createReadStream(fp), crlfDelay: Infinity });
  for await (const line of rl) {
    const parsed = parser(line);
    if (parsed) lines.push(parsed);
  }
  return lines;
}

function extractYear(dateStr) {
  if (!dateStr || dateStr === "0000-00-00") return null;
  const m = dateStr.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  console.log("📂 Loading TecDoc data...");

  // Load manufacturers
  const manufacturers = await loadCsv("manufacturers.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 4) return null;
    return { man_id: c[0], brand_name: c[3]?.trim() };
  });
  const manMap = new Map(manufacturers.map((m) => [m.man_id, m.brand_name]));

  // Load models
  const models = await loadCsv("models.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 5) return null;
    return { model_id: c[0], man_id: c[1], model_name: c[4]?.trim() };
  });
  const modelMap = new Map(models.map((m) => [m.model_id, m]));

  const entries = [];

  // Passenger cars
  console.log("  Reading passengercars.csv...");
  const pc = await loadCsv("passengercars.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 10) return null;
    return {
      ktype: parseInt(c[1], 10),
      brand: c[3]?.trim(),
      model: c[8]?.trim(),
      year_from: extractYear(c[5]),
      year_to: extractYear(c[6]),
    };
  });
  for (const e of pc) {
    if (e.ktype) entries.push(e);
  }

  // Commercial vehicles
  console.log("  Reading commercialvehicles.csv...");
  const cv = await loadCsv("commercialvehicles.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 9) return null;
    const modelId = c[2];
    const manId = c[4];
    const modelInfo = modelMap.get(modelId);
    const brand = manMap.get(manId) || (modelInfo ? manMap.get(modelInfo.man_id) : null);
    return {
      ktype: parseInt(c[1], 10),
      brand,
      model: c[8]?.trim() || (modelInfo ? modelInfo.model_name : ""),
      year_from: extractYear(c[5]),
      year_to: extractYear(c[6]),
    };
  });
  for (const e of cv) {
    if (e.ktype && e.brand) entries.push(e);
  }

  // Motorbikes
  console.log("  Reading motorbikes.csv...");
  const mb = await loadCsv("motorbikes.csv", (line) => {
    const c = line.split("\t");
    if (c.length < 10) return null;
    return {
      ktype: parseInt(c[1], 10),
      brand: c[3]?.trim(),
      model: c[8]?.trim(),
      year_from: extractYear(c[5]),
      year_to: extractYear(c[6]),
    };
  });
  for (const e of mb) {
    if (e.ktype) entries.push(e);
  }

  console.log(`\n📝 Total entries: ${entries.length.toLocaleString()}`);

  // Build SQL
  const sql = [];
  sql.push("-- TecDoc ktype_registry population");
  sql.push("-- Generated: " + new Date().toISOString());
  sql.push("DELETE FROM ktype_registry WHERE source = 'tecdoc_1q2019';");

  // Batch inserts (SQLite supports up to 1000 rows per INSERT)
  const BATCH_SIZE = 500;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const values = batch
      .map((e) => {
        const brand = (e.brand || "").replace(/'/g, "''");
        const model = (e.model || "").replace(/'/g, "''");
        const yf = e.year_from ?? "NULL";
        const yt = e.year_to ?? "NULL";
        return `(${e.ktype}, '${brand}', '${model}', ${yf}, ${yt}, '', 'tecdoc_1q2019', datetime('now'))`;
      })
      .join(",\n");
    sql.push(
      `INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source, created_at) VALUES\n${values};`
    );
  }

  fs.writeFileSync(OUT_SQL, sql.join("\n"), "utf-8");
  console.log(`💾 SQL written: ${OUT_SQL}`);
  console.log(`   Size: ${(fs.statSync(OUT_SQL).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Batches: ${Math.ceil(entries.length / BATCH_SIZE)}`);
}

main().catch(console.error);
