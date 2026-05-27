#!/usr/bin/env python3
"""
Parse Hella Gutmann CSC Coverage List from converted Excel
Uses known row ranges for each section based on PDF structure

Usage:
  python3 scripts/parse-csc-excel.py <input.xlsx>

Output: data/csc-parsed/combined.json
"""

import json
import re
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("pandas not installed. Run: pip3 install pandas openpyxl")
    sys.exit(1)

INPUT_FILE = sys.argv[1] if len(sys.argv) > 1 else "Abdeckungsliste_CSC_V78_DIN_A3_EN (1).xlsx"
OUTPUT_DIR = Path("data/csc-parsed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Known brands for validation
KNOWN_BRANDS = {
    "Alfa Romeo", "Audi", "BMW", "Chevrolet", "Citroën", "Citroen", "Cupra",
    "Dacia", "Dodge", "DS", "DS Automobiles", "Fiat", "Ford", "Genesis", "Honda",
    "Hyundai", "Isuzu", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lynk",
    "Maserati", "Mazda", "Mercedes", "Mercedes-Benz", "Mini", "Mitsubishi",
    "Nissan", "Opel", "Peugeot", "Polestar", "Porsche", "Renault", "Seat",
    "Skoda", "Smart", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo",
}

# Row ranges for each section (determined from PDF structure)
SECTION_RANGES = [
    ("front_camera", "Front Camera", 7, 558),
    ("front_camera", "Front Camera", 559, 690),
    ("rear_camera", "Rear View Camera", 691, 716),
    ("area_camera", "Area View Camera", 717, 829),
    ("front_radar", "Front Radar", 830, 1060),
    ("front_radar", "Front Radar", 1061, 1252),
    ("rear_radar", "Rear Radar", 1253, 1433),
    ("laser_sensor", "Laser Sensor", 1434, 1445),
    ("front_corner_radar", "Front Corner Radar", 1446, 1473),
]


def extract_fields(vals):
    """Extract all fields from a row by pattern matching across all columns"""
    fields = {
        "brand": None,
        "model": None,
        "year_range": None,
        "triggers": None,
        "cal_type": None,
        "csc_tool": None,
        "target": None,
        "notes": None,
    }

    for v in vals:
        v = v.strip()
        if not v or v in ["NaN", "nan"]:
            continue

        # Brand
        if not fields["brand"]:
            for brand in KNOWN_BRANDS:
                if v.upper() == brand.upper():
                    fields["brand"] = brand
                    break

        # Model (skip if it's a known brand or year)
        if not fields["model"]:
            if re.search(r'[A-Za-z].*\d|\d.*[A-Za-z]', v) or (len(v) > 2 and re.search(r'[A-Za-z]{2,}', v)):
                if v not in KNOWN_BRANDS and "Vehicle" not in v and "Coverage" not in v:
                    if not re.match(r'^\d{4}\s*[-–—]', v) and not re.match(r'^\d+$', v):
                        if len(v) < 60:
                            fields["model"] = v

        # Year range
        if not fields["year_range"]:
            if re.match(r'^\d{4}\s*[-–—]', v):
                fields["year_range"] = v

        # Triggers
        if not fields["triggers"]:
            if re.search(r'#\d', v):
                fields["triggers"] = v

        # Calibration type
        if not fields["cal_type"]:
            v_lower = v.lower()
            if any(t in v_lower for t in ["static", "dynamic"]):
                if len(v) < 50:
                    fields["cal_type"] = v

        # CSC-Tool
        if not fields["csc_tool"]:
            v_clean = v.lower().replace(" ", "")
            if v_clean in ["yes", "no", "yes/no"]:
                fields["csc_tool"] = v

        # Target plate
        if not fields["target"]:
            if re.match(r'^CSC\s+\d+[-–—]\d+$', v):
                fields["target"] = v.replace("—", "-").replace("–", "-")

        # Notes
        if not fields["notes"]:
            if len(v) > 15 and len(v) < 200:
                if any(kw in v.lower() for kw in ["calibration", "requirement", "hgs", "possible", "aid"]):
                    fields["notes"] = v

    return fields


def parse_year(year_str):
    if not year_str:
        return None, None
    s = year_str.replace("—", "-").replace("–", "-").replace(" ", "")
    match = re.match(r'(\d{4})-(\d{4})?', s)
    if match:
        return int(match.group(1)), int(match.group(2)) if match.group(2) else None
    match = re.match(r'(\d{4})', s)
    if match:
        return int(match.group(1)), None
    return None, None


def main():
    print(f"Reading: {INPUT_FILE}")
    df = pd.read_excel(INPUT_FILE, header=None)
    print(f"Total rows: {len(df)}\n")

    all_records = []

    for sensor_type, sensor_label, start_row, end_row in SECTION_RANGES:
        print(f"Parsing {sensor_label} (rows {start_row}-{end_row})...")
        records = []

        for idx in range(start_row, min(end_row + 1, len(df))):
            row = df.iloc[idx]
            vals = [str(v) if pd.notna(v) else "" for v in row.values]
            row_text = " ".join(vals)

            # Skip header/footer rows
            if "Manufacturer" in row_text and "Model" in row_text:
                continue
            if "Coverage List" in row_text:
                continue
            if "Calibration required" in row_text and "#1" in row_text:
                continue
            if "Status" in row_text and "Version" in row_text:
                continue

            fields = extract_fields(vals)

            if not fields["brand"] or not fields["model"] or not fields["year_range"]:
                continue
            if fields["brand"] not in KNOWN_BRANDS:
                continue

            year_from, year_to = parse_year(fields["year_range"])
            triggers = [f"#{m}" for m in re.findall(r'#(\d)', fields["triggers"] or "")]

            records.append({
                "manufacturer": fields["brand"],
                "model": fields["model"],
                "year_range": fields["year_range"],
                "year_from": year_from,
                "year_to": year_to,
                "calibration_required_by": triggers,
                "calibration_type": fields["cal_type"] or "",
                "csc_tool": fields["csc_tool"] or "",
                "target_plate": fields["target"] or "",
                "notes": fields["notes"] or "",
                "sensor_type": sensor_type,
                "sensor_label": sensor_label,
                "source": "hella_gutmann_v78",
            })

        print(f"  -> {len(records)} records")
        all_records.extend(records)

    print(f"\n=== Summary ===")
    print(f"Total records: {len(all_records)}")

    # Save
    output_path = OUTPUT_DIR / "combined.json"
    with open(output_path, "w") as f:
        json.dump(all_records, f, indent=2, ensure_ascii=False)
    print(f"Saved to: {output_path}")

    # Stats
    by_sensor = {}
    by_brand = {}
    for r in all_records:
        by_sensor[r["sensor_type"]] = by_sensor.get(r["sensor_type"], 0) + 1
        by_brand[r["manufacturer"]] = by_brand.get(r["manufacturer"], 0) + 1

    print("\nBy sensor type:")
    for k, v in sorted(by_sensor.items()):
        print(f"  {k}: {v}")

    print("\nTop 10 brands:")
    for k, v in sorted(by_brand.items(), key=lambda x: -x[1])[:10]:
        print(f"  {k}: {v}")

    print("\nSample records:")
    for r in all_records[:3]:
        print(f"  {r['manufacturer']} {r['model']} ({r['year_range']}) [{r['sensor_type']}] | {r['calibration_type']} | {r['csc_tool']} | {r['target_plate']}")


if __name__ == "__main__":
    main()
