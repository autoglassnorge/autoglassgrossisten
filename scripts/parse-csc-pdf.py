#!/usr/bin/env python3
"""
Parse Hella Gutmann CSC Coverage List PDF pages using Gemini Vision API (google.genai)

Usage:
  GEMINI_API_KEY=... python3 scripts/parse-csc-pdf.py

Input:  data/csc-parsed/page-*.png (24 pages)
Output: data/csc-parsed/results/page-*.json
"""

import os
import json
import time
from pathlib import Path

from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("GEMINI_API_KEY not set")
    exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)
MODEL = "gemini-2.5-flash"

INPUT_DIR = Path("data/csc-parsed")
OUTPUT_DIR = Path("data/csc-parsed/results")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Section mapping based on PDF table of contents
SECTIONS = {
    3:  {"name": "front_camera", "label": "Front Camera"},
    4:  {"name": "front_camera", "label": "Front Camera"},
    5:  {"name": "front_camera", "label": "Front Camera"},
    6:  {"name": "front_camera", "label": "Front Camera"},
    7:  {"name": "front_camera", "label": "Front Camera"},
    8:  {"name": "front_camera", "label": "Front Camera"},
    9:  {"name": "rear_camera", "label": "Rear View Camera"},
    10: {"name": "rear_camera", "label": "Rear View Camera"},
    11: {"name": "area_camera", "label": "Area View Camera"},
    12: {"name": "area_camera", "label": "Area View Camera"},
    13: {"name": "front_radar", "label": "Front Radar"},
    14: {"name": "front_radar", "label": "Front Radar"},
    15: {"name": "front_radar", "label": "Front Radar"},
    16: {"name": "front_radar", "label": "Front Radar"},
    17: {"name": "front_radar", "label": "Front Radar"},
    18: {"name": "front_radar", "label": "Front Radar"},
    19: {"name": "rear_radar", "label": "Rear Radar"},
    20: {"name": "rear_radar", "label": "Rear Radar"},
    21: {"name": "rear_radar", "label": "Rear Radar"},
    22: {"name": "laser_sensor", "label": "Laser Sensor"},
    23: {"name": "front_corner_radar", "label": "Front Corner Radar"},
}


def build_prompt(sensor_type, sensor_label):
    return f'''Parse the vehicle calibration table from this image.

This is the "{sensor_label}" section of the Hella Gutmann CSC Coverage List.

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
  {{"manufacturer":"Audi","model":"A3 (8Y)","year_range":"2020-","calibration_required_by":["#1","#2","#3","#4","#5","#6"],"calibration_type":"static","csc_tool":"yes","target_plate":"CSC 1-01","notes":""}},
  ...
]'''


def parse_page(page_num):
    png_path = INPUT_DIR / f"page-{page_num:02d}.png"
    json_path = OUTPUT_DIR / f"page-{page_num:02d}.json"

    if not png_path.exists():
        print(f"  Skip page {page_num}: PNG not found")
        return None

    if json_path.exists():
        print(f"  Skip page {page_num}: already parsed")
        return json.loads(json_path.read_text())

    section = SECTIONS.get(page_num)
    if not section:
        print(f"  Skip page {page_num}: no data section (cover/TOC)")
        return None

    print(f"  Parsing page {page_num} ({section['label']})...")

    prompt = build_prompt(section["name"], section["label"])

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=png_path.read_bytes(), mime_type="image/png"),
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=32768,
            ),
        )
    except Exception as e:
        print(f"    API ERROR: {e}")
        return None

    text = response.text

    # Extract JSON from response
    json_text = text
    if "```json" in text:
        json_text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 3:
            json_text = parts[1].strip()
    else:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            json_text = text[start:end+1]

    try:
        rows = json.loads(json_text)
    except json.JSONDecodeError as e:
        print(f"    FAILED to parse JSON: {e}")
        raw_path = OUTPUT_DIR / f"page-{page_num:02d}.raw.txt"
        raw_path.write_text(text)
        return None

    # Add metadata
    enriched = []
    for r in rows:
        r["sensor_type"] = section["name"]
        r["sensor_label"] = section["label"]
        r["page"] = page_num
        r["source"] = "hella_gutmann_v78"
        enriched.append(r)

    json_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False))
    print(f"    -> {len(enriched)} rows extracted")
    return enriched


def main():
    print("=== CSC PDF Parser ===")
    print(f"Input: {INPUT_DIR}")
    print(f"Output: {OUTPUT_DIR}\n")

    all_rows = []

    for page in range(3, 24):
        rows = parse_page(page)
        if rows:
            all_rows.extend(rows)

        # Rate limit: wait between calls
        if page < 23:
            time.sleep(2)

    print(f"\n=== Summary ===")
    print(f"Total rows extracted: {len(all_rows)}")

    # Save combined
    combined_path = OUTPUT_DIR / "combined.json"
    combined_path.write_text(json.dumps(all_rows, indent=2, ensure_ascii=False))
    print(f"Combined saved to: {combined_path}")

    # Stats by sensor type
    by_sensor = {}
    for r in all_rows:
        by_sensor[r["sensor_type"]] = by_sensor.get(r["sensor_type"], 0) + 1
    print("\nBy sensor type:")
    for k, v in sorted(by_sensor.items()):
        print(f"  {k}: {v}")

    # Stats by brand
    by_brand = {}
    for r in all_rows:
        by_brand[r["manufacturer"]] = by_brand.get(r["manufacturer"], 0) + 1
    print("\nTop brands:")
    for k, v in sorted(by_brand.items(), key=lambda x: -x[1])[:10]:
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
