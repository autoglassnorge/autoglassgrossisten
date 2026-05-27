#!/usr/bin/env node
/**
 * Parse Hella Gutmann CSC Coverage List PDF pages using Gemini Vision API
 * 
 * Usage:
 *   node scripts/parse-csc-pdf.mjs
 * 
 * Requires: GEMINI_API_KEY env var
 * Input:  data/csc-parsed/page-*.png (24 pages)
 * Output: data/csc-parsed/results/page-*.json
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY not set");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: { temperature: 0, maxOutputTokens: 32768 },
});

const INPUT_DIR = "data/csc-parsed";
const OUTPUT_DIR = "data/csc-parsed/results";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Section mapping based on PDF table of contents
const SECTIONS = {
  3:  { name: "front_camera", label: "Front Camera" },
  4:  { name: "front_camera", label: "Front Camera" },
  5:  { name: "front_camera", label: "Front Camera" },
  6:  { name: "front_camera", label: "Front Camera" },
  7:  { name: "front_camera", label: "Front Camera" },
  8:  { name: "front_camera", label: "Front Camera" },
  9:  { name: "rear_camera", label: "Rear View Camera" },
  10: { name: "rear_camera", label: "Rear View Camera" },
  11: { name: "area_camera", label: "Area View Camera" },
  12: { name: "area_camera", label: "Area View Camera" },
  13: { name: "front_radar", label: "Front Radar" },
  14: { name: "front_radar", label: "Front Radar" },
  15: { name: "front_radar", label: "Front Radar" },
  16: { name: "front_radar", label: "Front Radar" },
  17: { name: "front_radar", label: "Front Radar" },
  18: { name: "front_radar", label: "Front Radar" },
  19: { name: "rear_radar", label: "Rear Radar" },
  20: { name: "rear_radar", label: "Rear Radar" },
  21: { name: "rear_radar", label: "Rear Radar" },
  22: { name: "laser_sensor", label: "Laser Sensor" },
  23: { name: "front_corner_radar", label: "Front Corner Radar" },
};

function buildPrompt(sensorType, sensorLabel) {
  return `Parse the vehicle calibration table from this image.

This is the "${sensorLabel}" section of the Hella Gutmann CSC Coverage List.

Extract ALL vehicle rows with these columns:
- manufacturer (brand name, e.g. "Audi", "BMW", "Ford")
- model (full model name including platform code in parentheses, e.g. "A3 (8Y)", "3 Series (G20/G21)")
- year_range (exactly as shown, e.g. "2016-", "2018-2020", "2024-")
- calibration_required_by (array of strings: "#1","#2","#3","#4","#5","#6")
- calibration_type (e.g. "static", "dynamic", "dynamic & static", "static & dynamic", "dynamic/static")
- csc_tool ("yes", "no", "yes/no")
- target_plate (e.g. "CSC 1-01", "CSC 1-05", "CSC 1-16", "No", etc.)
- notes (any text from the Notes column, or empty string)

Return ONLY a valid JSON array. No markdown, no explanation.

Format:
[
  {"manufacturer":"Audi","model":"A3 (8Y)","year_range":"2020-","calibration_required_by":["#1","#2","#3","#4","#5","#6"],"calibration_type":"static","csc_tool":"yes","target_plate":"CSC 1-01","notes":""},
  ...
]`;
}

async function parsePage(pageNum) {
  const pngPath = path.join(INPUT_DIR, `page-${String(pageNum).padStart(2, "0")}.png`);
  const jsonPath = path.join(OUTPUT_DIR, `page-${String(pageNum).padStart(2, "0")}.json`);

  if (!fs.existsSync(pngPath)) {
    console.log(`  Skip page ${pageNum}: PNG not found`);
    return null;
  }

  if (fs.existsSync(jsonPath)) {
    console.log(`  Skip page ${pageNum}: already parsed`);
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  }

  const section = SECTIONS[pageNum];
  if (!section) {
    console.log(`  Skip page ${pageNum}: no data section (cover/TOC)`);
    return null;
  }

  console.log(`  Parsing page ${pageNum} (${section.label})...`);

  const imageData = fs.readFileSync(pngPath);
  const prompt = buildPrompt(section.name, section.label);

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: "image/png",
        data: imageData.toString("base64"),
      },
    },
  ]);

  const text = result.response.text();

  // Extract JSON from response
  let jsonText = text;
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (codeBlock) jsonText = codeBlock[1];
  else {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) jsonText = arrMatch[0];
  }

  let rows;
  try {
    rows = JSON.parse(jsonText);
  } catch (e) {
    console.error(`    FAILED to parse JSON for page ${pageNum}:`, e.message);
    fs.writeFileSync(jsonPath.replace(".json", ".raw.txt"), text);
    return null;
  }

  // Add metadata
  const enriched = rows.map((r) => ({
    ...r,
    sensor_type: section.name,
    sensor_label: section.label,
    page: pageNum,
    source: "hella_gutmann_v78",
  }));

  fs.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2));
  console.log(`    → ${enriched.length} rows extracted`);
  return enriched;
}

async function main() {
  console.log("=== CSC PDF Parser ===");
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const allRows = [];

  for (let page = 3; page <= 23; page++) {
    const rows = await parsePage(page);
    if (rows) allRows.push(...rows);

    // Rate limit: wait 1s between calls
    if (page < 23) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total rows extracted: ${allRows.length}`);

  // Save combined
  const combinedPath = path.join(OUTPUT_DIR, "combined.json");
  fs.writeFileSync(combinedPath, JSON.stringify(allRows, null, 2));
  console.log(`Combined saved to: ${combinedPath}`);

  // Stats by sensor type
  const bySensor = {};
  for (const r of allRows) {
    bySensor[r.sensor_type] = (bySensor[r.sensor_type] || 0) + 1;
  }
  console.log("\nBy sensor type:");
  for (const [k, v] of Object.entries(bySensor).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  // Stats by brand
  const byBrand = {};
  for (const r of allRows) {
    byBrand[r.manufacturer] = (byBrand[r.manufacturer] || 0) + 1;
  }
  console.log("\nTop brands:");
  const topBrands = Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of topBrands) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
