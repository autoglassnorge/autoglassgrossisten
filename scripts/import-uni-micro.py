#!/usr/bin/env python3
"""
Import UNI MICRO price list into glass_catalog D1 database.

Reads: /Users/taj/Downloads/PROSEKT API 16 MAI26 (1).xls
Output: SQL insert statements for missing entries

Usage:
    python3 scripts/import-uni-micro.py [--dry-run] [--limit 1000]
"""

from typing import Optional, Dict, Tuple, List
import argparse
import sys
import re
import xlrd
from pathlib import Path

# Brand mapping from UNI MICRO naming → D1 catalog brand
BRAND_MAP = {
    "MERCEDES-BENZ": "MERCEDES",
    "MERCEDES": "MERCEDES",
    "LANDROVER": "LANDROVER",
    "LAND ROVER": "LANDROVER",
    "ALFA ROMEO": "ALFA ROMEO",
    "ASTON MARTIN": "ASTON MARTIN",
    "ROLLS ROYCE": "ROLLS ROYCE",
    "BMW": "BMW",
    "AUDI": "AUDI",
    "VW": "VW",
    "VOLKSWAGEN": "VW",
    "FORD": "FORD",
    "TOYOTA": "TOYOTA",
    "HONDA": "HONDA",
    "NISSAN": "NISSAN",
    "HYUNDAI": "HYUNDAI",
    "KIA": "KIA",
    "SKODA": "SKODA",
    "SEAT": "SEAT",
    "VOLVO": "VOLVO",
    "PEUGEOT": "PEUGEOT",
    "CITROEN": "CITROEN",
    "CITROËN": "CITROEN",
    "RENAULT": "RENAULT",
    "OPEL": "OPEL",
    "FIAT": "FIAT",
    "MAZDA": "MAZDA",
    "MITSUBISHI": "MITSUBISHI",
    "MITS.": "MITSUBISHI",
    "SUBARU": "SUBARU",
    "SUZUKI": "SUZUKI",
    "MINI": "MINI",
    "SMART": "SMART",
    "JEEP": "JEEP",
    "CHRYSLER": "CHRYSLER",
    "DODGE": "DODGE",
    "CADILLAC": "CADILLAC",
    "GMC": "GMC",
    "HUMMER": "HUMMER",
    "CHEVROLET": "CHEVROLET",
    "DAEWOO": "DAEWOO",
    "PORSCHE": "PORSCHE",
    "JAGUAR": "JAGUAR",
    "LEXUS": "LEXUS",
    "INFINITI": "INFINITI",
    "ACURA": "ACURA",
    "TESLA": "TESLA",
    "POLESTAR": "POLESTAR",
    "CUPRA": "CUPRA",
    "MAXUS": "MAXUS",
    "INEOS": "INEOS",
    "JAC": "JAC (CH)",
    "JAC (CH)": "JAC (CH)",
    "DFSK": "DFSK (SERES)",
    "DFSK (SERES)": "DFSK (SERES)",
    "HONGQI": "HONGQI",
    "VOYAH": "VOYAH",
    "XPENG": "XPENG",
    "ZEEKR": "ZEEKR",
    "BYD": "BYD",
    "ORA": "ORA",
    "NIO": "NIO",
    "FISKER": "FISKER",
    "RIVIAN": "USA CARS",
    "LUCID": "USA CARS",
    "MG": "MG",
    "SAAB": "SAAB",
    "LADA": "LADA / TOGLIATTI",
    "ROVER": "ROVER",
    "BENTLEY": "BENTLEY",
    "FERRARI": "FERRARI",
    "MASERATI": "MASERATI",
    "LAMBORGHINI": "LAMBORGHINI",
    "LAMBORGH.": "LAMBORGHINI",
    "ALFA": "ALFA ROMEO",
    "ABARTH": "FIAT",
    "MAN": "MAN",
    "SCANIA": "SCANIA TRUCKS",
    "DAF": "DAF",
    "IVECO": "IVECO (FIAT) TRUCKS",
    "HINO": "HINO TRUCKS",
    "ISUZU": "ISUZU",
    "TRUCKS": "TRUCKS",
    "VETERAN": "VETERAN",
    "BUS": "BUS",
    "FORD TRUCKS": "FORD",
    "TOYOTA TRUCKS": "TOYOTA",
    "PEUGEOT TRUCKS": "PEUGEOT",
    "CITROEN TRUCKS": "CITROEN",
    "AUDI TRUCKS": "AUDI",
    "BMW TRUCKS": "BMW",
    "NISSAN TRUCKS": "NISSAN",
    "FIAT TRUCKS": "FIAT",
    "RENAULT TRUCKS": "RENAULT",
    "MITSUBISHI TRUCKS": "MITSUBISHI",
    "MAZDA TRUCKS": "MAZDA",
    "ISUZU TRUCKS": "ISUZU",
    "HINO TRUCKS": "HINO",
    "MAN TRUCKS": "MAN",
    "OPEL TRUCKS": "OPEL",
    "HYUNDAI TRUCKS": "HYUNDAI",
    "KIA TRUCKS": "KIA",
    "SUZUKI TRUCKS": "SUZUKI",
    "HONDA TRUCKS": "HONDA",
    "SUBARU TRUCKS": "SUBARU",
    "SSANGYONG TRUCKS": "SSANGYONG",
    "MERCEDES TRUCKS": "MERCEDES",
    "VOLVO TRUCKS": "VOLVO",
    "VW TRUCKS": "VW",
}

# Known two-word brands
TWO_WORD_BRANDS = [
    "ALFA ROMEO", "ASTON MARTIN", "ROLLS ROYCE", "LAND ROVER",
    "DAEWOO (CHEVROLET)", "DFSK (SERES)", "JAC (CH)", "LYNK & CO",
    "JC INDIGO", "LADA / TOGLIATTI", "IVECO (FIAT) TRUCKS",
    "MERCEDES-BENZ", "MERCEDES BENZ", "MERCEDES AMG",
    "VAUXHALL/OPEL", "OPEL/VAUXHALL",
]


def normalize_brand(brand: str) -> str:
    b = brand.upper().strip()
    return BRAND_MAP.get(b, b)


def extract_brand_model(description: str) -> Tuple[str, str]:
    """Extract brand and model from UNI MICRO description."""
    d = description.strip()
    if not d:
        return ("", "")

    # Try two-word brands first
    for twb in TWO_WORD_BRANDS:
        if d.upper().startswith(twb + " "):
            brand = normalize_brand(twb)
            rest = d[len(twb):].strip()
            return (brand, rest)

    # Single-word brand
    parts = d.split()
    if len(parts) >= 2:
        brand = normalize_brand(parts[0])
        rest = " ".join(parts[1:])
        return (brand, rest)

    return ("", d)


# Category keywords from description
CATEGORY_KEYWORDS = {
    "frontrute": ["FRONTRUTE", "FRONTRUTA", "FRONTRUTEN", "WINDSHIELD", "FR+", "WS ", " FR "],
    "bakrute": ["BAKRUTE", "BAKRUTA", "BAKRUTEN", "REAR", "BACKLITE", "BAK+"],
    "dørglass": ["DØRRUTE", "DØRRUTA", "DØRRUTEN", "DORRUTE", "DORRUTA", "DOORWAY", "DØR+"],
    "sideglass": ["SIDERUTE", "SIDERUTA", "SIDERUTEN", "VENTILRUTE", "VENTILRUTA", "QTR", "QUARTER"],
}


def detect_category(description: str) -> str:
    d = description.upper()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in d:
                return cat
    return "annet"


# Equipment keywords
EQUIPMENT_MAP = {
    "heated": ["EL", "HEATED", "ELEKTRISK", "VARMET", "VARMET"],
    "rain_sensor": ["SENS", "SENSOR", "REGNSENSOR", "RAINSENSOR"],
    "acoustic": ["AKU", "ACO", "ACOUSTIC", "AKUSTISK", "LYS", "AKU"],
    "antenna": ["ANT", "ANTENNE", "ANTENNA", "GPS"],
    "hud": ["HUD", "HEAD-UP", "HEADUP"],
    "camera": ["CAM", "CAMERA", "KAMERA", "LDW", "ADAS"],
    "tinted": ["SOTET", "SOTETE", "TINTED", "PRIVACY", "PRIV"],
    "solar": ["SOLAR", "SOL", "COATED", "COAT"],
}


def detect_equipment(description: str) -> Dict[str, int]:
    d = description.upper()
    result = {}
    for key, keywords in EQUIPMENT_MAP.items():
        found = any(kw in d for kw in keywords)
        result[key] = 1 if found else 0
    return result


def parse_year_range(description: str) -> Tuple[Optional[int], Optional[int]]:
    """Parse year range from description like '88-95' or '15-' or '20-'."""
    d = description
    # 4-digit year patterns: 2015-2019, 2015- 
    m = re.search(r'(\d{4})\s*[-–]\s*(\d{4})?', d)
    if m:
        from_year = int(m.group(1))
        to_year = int(m.group(2)) if m.group(2) else None
        return (from_year, to_year)
    # 2-digit year patterns: 88-95, 15- 
    m = re.search(r'(?<!\d)(\d{2})\s*[-–]\s*(\d{2})?(?!\d)', d)
    if m:
        from_y = int(m.group(1))
        to_y = int(m.group(2)) if m.group(2) else None
        from_year = 2000 + from_y if from_y < 50 else 1900 + from_y
        to_year = 2000 + to_y if to_y and to_y < 50 else (1900 + to_y if to_y else None)
        return (from_year, to_year)
    # Single 4-digit year: 2020, 2015
    m = re.search(r'(\d{4})', d)
    if m:
        year = int(m.group(1))
        if 1950 <= year <= 2035:
            return (year, None)
    return (None, None)


def generate_prefix4(varenr: str) -> str:
    """Generate prefix4 from varenr (first 4 digits of numeric part)."""
    # Extract numeric part from varenr like "2306AGACMUVZ" → "2306"
    digits = re.match(r'(\d{4})', varenr)
    if digits:
        return digits.group(1)
    # Or from varenr like "5518BYPEA" → "5518"
    digits = re.match(r'(\d{4})', varenr)
    if digits:
        return digits.group(1)
    return "0000"


def parse_row(row: list) -> Optional[Dict]:
    """Parse a single UNI MICRO row into structured data."""
    if len(row) < 6:
        return None

    varenr = str(row[0]).strip().upper()
    varenavn = str(row[1]).strip() if row[1] else ""
    info = str(row[2]).strip() if len(row) > 2 and row[2] else ""
    pris_raw = row[3]
    eurokode_raw = row[5] if len(row) > 5 else ""

    # Skip header rows and invalid rows
    if not varenr or varenr == "VAREN" or varenr == "VARENR" or varenr == "SCANCOD":
        return None
    if not varenavn or varenavn == "Varenavn":
        return None

    # Clean price
    price = None
    if pris_raw and isinstance(pris_raw, (int, float)) and pris_raw > 0:
        price = float(pris_raw)

    # Clean eurokode
    eurokode = str(eurokode_raw).strip().upper() if eurokode_raw else None
    if eurokode == "EUROCODE" or eurokode == "EUROKODE":
        eurokode = None

    # Full description
    full_desc = varenavn
    if info:
        full_desc += " " + info

    # Extract brand and model
    brand, model_rest = extract_brand_model(varenavn)
    if not brand:
        return None

    # Skip non-glass items (clips, rubbers, etc.)
    if any(kw in varenavn.upper() for kw in ["BRUK", "KLIPS", "RUBBER", "UNIVERSAL", "VISKER", "VISKERSETT", "VISKERBLAD"]):
        return None

    # Skip if no recognizable glass-related keywords
    glass_keywords = ["FRONTRUTE", "BAKRUTE", "DØRRUTE", "DORRUTE", "SIDERUTE", "VENTILRUTE", "BACKLITE", "WINDSHIELD", "DOORWAY", "WS ", " FR ", " BAK ", " QTR ", " QUARTER "]
    if not any(kw in varenavn.upper() for kw in glass_keywords):
        return None

    # Detect category
    category = detect_category(full_desc)

    # Detect equipment
    equipment = detect_equipment(full_desc)

    # Parse year range
    year_from, year_to = parse_year_range(varenavn)

    # Generate prefix4
    prefix4 = generate_prefix4(varenr)

    return {
        "supplier_sku": varenr,
        "article_number": varenr,
        "eurocode": eurokode,
        "description": full_desc,
        "brand": brand,
        "model": model_rest,
        "category": category,
        "year_from": year_from,
        "year_to": year_to,
        "price": price,
        "prefix4": prefix4,
        "adas": equipment.get("camera", 0),  # Simplification: camera ≈ ADAS
        "rain_sensor": equipment.get("rain_sensor", 0),
        "heated": equipment.get("heated", 0),
        "acoustic": equipment.get("acoustic", 0),
        "antenna": equipment.get("antenna", 0),
        "hud": equipment.get("hud", 0),
        "shade": 0,
        "camera": equipment.get("camera", 0),
        "lane_assist": 0,
        "tinted": equipment.get("tinted", 0),
        "solar": equipment.get("solar", 0),
        "stock_status": 1,
        "source": "uni_micro",
        "supplier": "UNI MICRO",
    }


def main():
    parser = argparse.ArgumentParser(description="Import UNI MICRO price list into glass_catalog")
    parser.add_argument("--dry-run", action="store_true", help="Don't generate SQL, just report stats")
    parser.add_argument("--limit", type=int, default=0, help="Limit rows to process")
    parser.add_argument("--output", type=str, default="/Users/taj/workspace/uni_micro_import.sql", help="Output SQL file")
    args = parser.parse_args()

    xls_path = "/Users/taj/Downloads/PROSEKT API 16 MAI26 (1).xls"
    print(f"Reading {xls_path}...")

    wb = xlrd.open_workbook(xls_path)
    ws = wb.sheet_by_index(0)

    stats = {
        "total_rows": 0,
        "parsed": 0,
        "skipped": 0,
        "by_brand": {},
        "by_category": {},
        "by_year": {},
        "has_eurokode": 0,
        "has_price": 0,
    }

    records = []
    seen_skus = set()

    for i in range(6, ws.nrows):
        if args.limit and i >= 6 + args.limit:
            break

        stats["total_rows"] += 1
        row = ws.row_values(i)
        parsed = parse_row(row)

        if not parsed:
            stats["skipped"] += 1
            continue

        # Skip duplicates
        if parsed["supplier_sku"] in seen_skus:
            stats["skipped"] += 1
            continue
        seen_skus.add(parsed["supplier_sku"])

        stats["parsed"] += 1
        records.append(parsed)

        # Stats
        brand = parsed["brand"]
        stats["by_brand"][brand] = stats["by_brand"].get(brand, 0) + 1

        cat = parsed["category"]
        stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

        year = parsed["year_from"]
        if year:
            decade = (year // 10) * 10
            stats["by_year"][decade] = stats["by_year"].get(decade, 0) + 1

        if parsed["eurocode"]:
            stats["has_eurokode"] += 1
        if parsed["price"]:
            stats["has_price"] += 1

    # Print stats
    print(f"\n=== Stats ===")
    print(f"Total rows: {stats['total_rows']}")
    print(f"Parsed: {stats['parsed']}")
    print(f"Skipped: {stats['skipped']}")
    print(f"Has eurokode: {stats['has_eurokode']}")
    print(f"Has price: {stats['has_price']}")

    print(f"\nBy brand (top 20):")
    for brand, count in sorted(stats["by_brand"].items(), key=lambda x: -x[1])[:20]:
        print(f"  {brand}: {count}")

    print(f"\nBy category:")
    for cat, count in sorted(stats["by_category"].items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    print(f"\nBy decade:")
    for decade, count in sorted(stats["by_year"].items()):
        print(f"  {decade}s: {count}")

    # Show 2020+ stats
    count_2020 = sum(1 for r in records if r["year_from"] and r["year_from"] >= 2020)
    print(f"\n2020+ entries: {count_2020}")

    # Show sample records
    print(f"\nSample 2020+ records:")
    for r in records:
        if r["year_from"] and r["year_from"] >= 2020:
            print(f"  {r['supplier_sku']} | {r['brand']} {r['model'][:40]} | {r['category']} | {r['year_from']}-{r['year_to']} | {r['eurocode']} | {r['price']}kr")
            if count_2020 > 10:
                break

    if args.dry_run:
        print("\nDry run complete. No SQL generated.")
        return

    # Generate SQL
    print(f"\nGenerating SQL...")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        f.write("-- UNI MICRO Import SQL\n")
        f.write(f"-- Generated from: {xls_path}\n")
        f.write(f"-- Records: {len(records)}\n\n")

        # INSERT OR IGNORE for each record
        for r in records:
            cols = [
                "article_number", "eurocode", "category", "supplier",
                "brand", "model", "year_from", "year_to", "prefix4",
                "adas", "rain_sensor", "heated", "acoustic", "antenna", "hud",
                "shade", "camera", "lane_assist",
                "price", "stock_status", "description", "source",
            ]
            vals = [
                r["article_number"],
                r["eurocode"] or "",
                r["category"],
                r["supplier"] or "",
                r["brand"],
                r["model"] or "",
                r["year_from"] if r["year_from"] else "NULL",
                r["year_to"] if r["year_to"] else "NULL",
                r["prefix4"],
                r["adas"], r["rain_sensor"], r["heated"], r["acoustic"],
                r["antenna"], r["hud"], r["shade"], r["camera"], r["lane_assist"],
                r["price"] if r["price"] else "NULL",
                r["stock_status"],
                r["description"].replace("'", "''"),
                r["source"],
            ]

            # Format values for SQL
            sql_vals = []
            for v in vals:
                if v is None or v == "NULL":
                    sql_vals.append("NULL")
                elif isinstance(v, (int, float)):
                    sql_vals.append(str(v))
                else:
                    sql_vals.append(f"'{v}'")

            sql = f"INSERT OR IGNORE INTO glass_catalog ({', '.join(cols)}) VALUES ({', '.join(sql_vals)});\n"
            f.write(sql)

    print(f"SQL written to: {output_path}")
    print(f"Total records: {len(records)}")


if __name__ == "__main__":
    main()
