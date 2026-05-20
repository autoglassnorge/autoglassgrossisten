#!/usr/bin/env node
/**
 * Import TecDoc kType → eurocode mappings to D1
 * =================================================
 * Reads JSON or CSV with kType/eurocode mappings and generates SQL
 * to populate glass_catalog.ktype. Can run locally (writes SQL file)
 * or remotely (executes via Wrangler).
 *
 * Expected input formats:
 *   JSON: [{ "ktype": 32787, "eurocode": "7812AGSGYMVZ", ... }, ...]
 *   CSV:  ktype,eurocode,brand,model
 *
 * Usage:
 *   node scripts/import-tecdoc-ktype.mjs data/tecdoc-mappings.json
 *   node scripts/import-tecdoc-ktype.mjs data/tecdoc-mappings.csv
 *
 * With remote execution (requires CF_API_TOKEN):
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx node scripts/import-tecdoc-ktype.mjs data/mappings.json --remote
 */

import * as fs from "fs";
import * as path from "path";

const inputFile = process.argv[2];
const remoteMode = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";

// ── Helpers ───────────────────────────────────────────────────────────────

function parseValue(raw) {
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "null") return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function detectColumns(obj) {
  const keys = Object.keys(obj).map((k) => k.toLowerCase().trim());
  const ktypeKey = keys.find((k) =>
    k === "ktype" || k === "k_type" || k === "k-type" || k === "typeid" || k === "type_id"
  );
  const eurocodeKey = keys.find((k) =>
    k === "eurocode" || k === "euro_code" || k === "euro-code" || k === "artnr" || k === "art_no" || k === "article"
  );
  const brandKey = keys.find((k) =>
    k === "brand" || k === "make" || k === "manufacturer" || k === "manufcar" || k === "hersteller"
  );
  const modelKey = keys.find((k) =>
    k === "model" || k === "modelcar" || k === "modell" || k === "vehicle_model"
  );
  return { ktypeKey, eurocodeKey, brandKey, modelKey };
}

function readJson(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (Array.isArray(data)) return data;
  if (data.results && Array.isArray(data.results)) return data.results;
  if (data.records && Array.isArray(data.records)) return data.records;
  if (data.data && Array.isArray(data.data)) return data.data;
  throw new Error("JSON is not an array and has no recognized wrapper key");
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8").trim();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });
}

function extractMappings(records) {
  if (!records || records.length === 0) return [];
  const first = records[0];
  const cols = detectColumns(first);

  if (!cols.ktypeKey) {
    console.error("❌ Could not detect kType column. Tried: ktype, k_type, k-type, typeId, type_id");
    console.error("   Found columns:", Object.keys(first).join(", "));
    process.exit(1);
  }
  if (!cols.eurocodeKey) {
    console.error("❌ Could not detect eurocode column. Tried: eurocode, euro_code, euro-code, artNr, art_no, article");
    console.error("   Found columns:", Object.keys(first).join(", "));
    process.exit(1);
  }

  console.log(`📊 Detected columns: kType='${cols.ktypeKey}', eurocode='${cols.eurocodeKey}'`);
  if (cols.brandKey) console.log(`   Optional: brand='${cols.brandKey}'`);
  if (cols.modelKey) console.log(`   Optional: model='${cols.modelKey}'`);

  const mappings = [];
  for (const r of records) {
    const ktype = parseValue(r[cols.ktypeKey]);
    const eurocode = String(r[cols.eurocodeKey] || "").trim().toUpperCase();
    if (!ktype || !eurocode) continue;
    mappings.push({
      ktype,
      eurocode,
      brand: cols.brandKey ? String(r[cols.brandKey] || "").trim() : undefined,
      model: cols.modelKey ? String(r[cols.modelKey] || "").trim() : undefined,
    });
  }
  return mappings;
}

function generateSql(mappings) {
  const lines = [
    "-- TecDoc kType Import",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Mappings: ${mappings.length}`,
    "",
  ];

  // Group by eurocode to detect conflicts
  const byEurocode = new Map();
  for (const m of mappings) {
    if (!byEurocode.has(m.eurocode)) byEurocode.set(m.eurocode, []);
    byEurocode.get(m.eurocode).push(m);
  }

  let conflicts = 0;
  let updates = 0;

  for (const [eurocode, list] of byEurocode) {
    if (list.length > 1) {
      const ktypes = list.map((l) => l.ktype).join(", ");
      lines.push(`-- ⚠️ CONFLICT: ${eurocode} has ${list.length} kTypes: ${ktypes} (skipping)`);
      conflicts++;
      continue;
    }
    const m = list[0];
    lines.push(`UPDATE glass_catalog SET ktype = ${m.ktype} WHERE eurocode = '${eurocode}';`);
    updates++;
  }

  lines.push("");
  lines.push(`-- Summary: ${updates} updates, ${conflicts} conflicts`);

  return { sql: lines.join("\n"), updates, conflicts };
}

async function executeRemote(sql) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.error("❌ Missing env: CF_ACCOUNT_ID, CF_API_TOKEN");
    process.exit(1);
  }

  const dbId = "f79095b3-da80-43fe-8064-ff480e8a1b4b"; // glass-catalog-db
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${dbId}/query`;

  console.log("🌐 Executing on remote D1...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Remote execution failed: ${res.status} ${err.slice(0, 200)}`);
    process.exit(1);
  }

  const data = await res.json();
  if (!data.success) {
    console.error("❌ D1 error:", JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }

  console.log("✅ Remote execution complete");
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!inputFile) {
    console.error("Usage: node scripts/import-tecdoc-ktype.mjs <file.json|file.csv> [--remote] [--dry-run]");
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  const ext = path.extname(inputFile).toLowerCase();
  console.log(`📁 Reading ${ext.toUpperCase().slice(1)}: ${inputFile}\n`);

  const records = ext === ".csv" ? readCsv(inputFile) : readJson(inputFile);
  console.log(`📊 Total records: ${records.length}\n`);

  const mappings = extractMappings(records);
  console.log(`📊 Valid mappings: ${mappings.length}\n`);

  const { sql, updates, conflicts } = generateSql(mappings);

  console.log(`📊 SQL Summary: ${updates} UPDATEs, ${conflicts} conflicts\n`);

  if (dryRun) {
    const outFile = inputFile.replace(/\.(json|csv)$/i, "-import.sql");
    fs.writeFileSync(outFile, sql);
    console.log(`💾 Dry run — SQL written to: ${outFile}`);
    return;
  }

  if (remoteMode) {
    await executeRemote(sql);
  } else {
    const outFile = inputFile.replace(/\.(json|csv)$/i, "-import.sql");
    fs.writeFileSync(outFile, sql);
    console.log(`💾 SQL written to: ${outFile}`);
    console.log(`\nTo execute on remote D1:`);
    console.log(`  npx wrangler d1 execute glass-catalog-db --remote --file ${outFile}`);
    console.log(`\nOr via GitHub Actions (recommended):`);
    console.log(`  Upload ${outFile} to repo, trigger d1-migrate.yml workflow`);
  }
}

main().catch(console.error);
