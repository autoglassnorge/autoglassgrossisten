#!/usr/bin/env node
/**
 * Import Hella Gutmann CSC data from Excel/CSV into D1 SQL
 *
 * Usage:
 *   node scripts/import-csc-data.mjs <input.xlsx|input.csv>
 *
 * Input format (Excel/CSV columns):
 *   manufacturer, model, year_range, calibration_required_by, calibration_type,
 *   csc_tool, target_plate, notes, [sensor_type, sensor_label]
 *
 * Output: api/cf-worker/generated-csc-inserts.sql
 */

import fs from "fs";
import path from "path";

const INPUT_FILE = process.argv[2];
if (!INPUT_FILE) {
  console.error("Usage: node scripts/import-csc-data.mjs <input.xlsx|input.csv>");
  process.exit(1);
}

const OUTPUT_FILE = "api/cf-worker/generated-csc-inserts.sql";
const BATCH_SIZE = 100;

function parseYearRange(yearRange) {
  if (!yearRange) return { from: null, to: null };
  const s = String(yearRange).trim();
  // "2016-"
  const matchOpen = s.match(/^(\d{4})-\s*$/);
  if (matchOpen) return { from: parseInt(matchOpen[1]), to: null };
  // "2018-2020"
  const matchRange = s.match(/^(\d{4})\s*[-–]\s*(\d{4})\s*$/);
  if (matchRange) return { from: parseInt(matchRange[1]), to: parseInt(matchRange[2]) };
  // "2016"
  const matchSingle = s.match(/^(\d{4})$/);
  if (matchSingle) return { from: parseInt(matchSingle[1]), to: null };
  return { from: null, to: null };
}

function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  const s = String(value).replace(/'/g, "''");
  return `'${s}'`;
}

function recordToValues(r) {
  const yr = parseYearRange(r.year_range);
  return [
    escapeSql(r.brand),
    escapeSql(r.model),
    yr.from,
    yr.to,
    escapeSql(r.sensor_type),
    escapeSql(r.sensor_label),
    escapeSql(JSON.stringify(r.calibration_required_by || [])),
    escapeSql(r.calibration_type),
    r.csc_tool === "yes" ? 1 : 0,
    escapeSql(r.target_plate),
    escapeSql(r.notes),
    escapeSql(r.source || "hella_gutmann_v78"),
  ].join(", ");
}

async function main() {
  const ext = path.extname(INPUT_FILE).toLowerCase();
  let rows = [];

  if (ext === ".csv") {
    const text = fs.readFileSync(INPUT_FILE, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      const row = {};
      headers.forEach((h, j) => (row[h] = values[j]?.trim() || ""));
      rows.push(row);
    }
  } else if (ext === ".xlsx" || ext === ".xls") {
    // Try to use xlsx package
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.readFile(INPUT_FILE);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    } catch (e) {
      console.error("xlsx package not installed. Run: npm install xlsx");
      process.exit(1);
    }
  } else {
    console.error(`Unsupported file format: ${ext}`);
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} rows from ${INPUT_FILE}`);

  // Normalize column names
  const normalized = rows.map((r) => {
    const find = (keys) => {
      for (const k of keys) {
        if (r[k] !== undefined) return r[k];
      }
      return "";
    };

    return {
      brand: find(["manufacturer", "brand", "make", "merke", "hersteller"]),
      model: find(["model", "modell", "modell"]),
      year_range: find(["year_range", "year", "år", "jahr", "baujahr"]),
      calibration_required_by: (() => {
        const v = find(["calibration_required_by", "calibration required by", "triggers"]);
        if (Array.isArray(v)) return v;
        if (typeof v === "string") {
          return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        }
        return [];
      })(),
      calibration_type: find(["calibration_type", "calibration type", "calibrationtype", "kalibrierung"]),
      csc_tool: find(["csc_tool", "csc tool", "equipment csc-tool", "csc-tool"]),
      target_plate: find(["target_plate", "target plate", "targets", "target", "zielplatte"]),
      notes: find(["notes", "note", "bemerkung", "kommentar"]),
      sensor_type: find(["sensor_type", "sensor type", "sensortype"]) || "front_camera",
      sensor_label: find(["sensor_label", "sensor label", "section", "sektion"]) || "Front Camera",
      source: "hella_gutmann_v78",
    };
  }).filter((r) => r.brand && r.model);

  console.log(`Normalized ${normalized.length} valid rows`);

  // Generate SQL
  const sql = [];
  sql.push("-- Generated CSC calibration inserts");
  sql.push("-- Source: Hella Gutmann Coverage List V78");
  sql.push("-- Generated: " + new Date().toISOString());
  sql.push("");
  sql.push("DELETE FROM adas_calibration_requirements WHERE source = 'hella_gutmann_v78';");
  sql.push("");

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    sql.push(
      `INSERT INTO adas_calibration_requirements ` +
      `(brand, model, year_from, year_to, sensor_type, sensor_label, calibration_triggers, calibration_type, csc_tool_supported, target_plate, notes, source) VALUES\n` +
      batch.map((r) => `  (${recordToValues(r)})`).join(",\n") +
      ";\n"
    );
  }

  fs.writeFileSync(OUTPUT_FILE, sql.join("\n"));
  console.log(`SQL written to: ${OUTPUT_FILE}`);
  console.log(`Total batches: ${Math.ceil(normalized.length / BATCH_SIZE)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
