#!/usr/bin/env python3
"""
Nord Glass PDF → Staging SQL Extractor
Uses pdfplumber to extract the columnar table and produces SQL INSERTs.
"""
import pdfplumber
import json
import sys
import re
from datetime import datetime
from uuid import uuid4

pdf_path = sys.argv[1] if len(sys.argv) > 1 else "659486770-Nord-Glass.pdf"
output_sql = sys.argv[2] if len(sys.argv) > 2 else "nordglass-staging.sql"

# Family mapping for this specific Nord Glass PDF
FAMILY_MAP = {
    "WS": {"category": "windscreen", "position": "FR"},
    "RW": {"category": "rear_window", "position": "RR"},
    "BO": {"category": "body_glass", "position": "UNKNOWN"},  # refined by internal code
    "GU": {"category": "moulding", "position": "UNKNOWN"},
}

# Position codes inside internal code
POSITION_CODES = {"FD", "RD", "RQ", "FV", "RV", "MQ", "RDO"}
SIDE_CODES = {"L": "L", "R": "R", "LG": "L", "RG": "R", "LO": "L", "RO": "R"}

# Known feature codes
TINT_CODES = {"GY", "BL", "GR", "GN", "GS", "BR", "CL"}
KNOWN_FEATURES = {"H", "V", "M", "A", "Z", "O", "sp", "mb", "vin", "frame", "rectangle", "oval", "round", "trapez"}


def clean_cell(cell):
    if cell is None:
        return ""
    return str(cell).replace("\n", " ").strip()


def parse_year(year_raw):
    """Parse YY/MM-YY/MM or YY/MM- format to YYYY-MM."""
    year_raw = year_raw.strip()
    if not year_raw:
        return None, None

    # Full range: YY/MM-YY/MM
    m = re.match(r"(\d{2})/(\d{2})-(\d{2})/(\d{2})", year_raw)
    if m:
        y1, m1, y2, m2 = m.groups()
        y1_full = 2000 + int(y1) if int(y1) < 50 else 1900 + int(y1)
        y2_full = 2000 + int(y2) if int(y2) < 50 else 1900 + int(y2)
        return f"{y1_full}-{m1}", f"{y2_full}-{m2}"

    # Open-ended: YY/MM-
    m = re.match(r"(\d{2})/(\d{2})-$", year_raw)
    if m:
        y1, m1 = m.groups()
        y1_full = 2000 + int(y1) if int(y1) < 50 else 1900 + int(y1)
        return f"{y1_full}-{m1}", None

    # Single: YY/MM
    m = re.match(r"(\d{2})/(\d{2})", year_raw)
    if m:
        y1, m1 = m.groups()
        y1_full = 2000 + int(y1) if int(y1) < 50 else 1900 + int(y1)
        return f"{y1_full}-{m1}", None

    return None, None


def parse_features(remarks):
    """Extract tint, features, flags from remarks."""
    features = []
    tint = None
    has_heating = None
    has_vin = None
    has_antenna = None

    tokens = remarks.split()
    for token in tokens:
        upper = token.upper()

        # Tint codes
        if upper in TINT_CODES:
            tint = upper
            features.append(token)
            continue

        # Known features
        if token.lower() in KNOWN_FEATURES or upper in KNOWN_FEATURES:
            features.append(token)
            if upper == "H":
                has_heating = True
            if upper == "V":
                has_vin = True
            if upper == "A":
                has_antenna = True
            continue

        # Unknown but tracked
        features.append(token)

    return features, tint, has_heating, has_vin, has_antenna


def parse_internal_code(code_str):
    """Extract position and side from internal code."""
    position = None
    side = None

    for pos in POSITION_CODES:
        if pos in code_str:
            position = pos
            break

    for code, s in SIDE_CODES.items():
        if code in code_str:
            side = s
            break

    return position, side


def build_dedupe_key(record):
    parts = [
        record["manufacturer_name"].lower(),
        record["vehicle_model_name"].lower(),
        (record["vehicle_body_type_raw"] or "*").lower(),
        record["production_from"] or "*",
        record["production_to"] or "*",
        record["glass_position"],
        record["side"] or "*",
        record["opening_type"] or "*",
        "H" if record["has_heating"] else "*",
        "*",  # sensor
        record["tint_code"] or "*",
    ]
    return "|".join(parts)


def evaluate_status(record):
    """OK / REVIEW / HOLD based on confidence."""
    if not record["product_family"] or record["product_family"] == "UNKNOWN":
        return "HOLD"
    if not record["manufacturer_name"]:
        return "HOLD"
    if not record["vehicle_model_name"]:
        return "HOLD"
    if not record["production_from"]:
        return "HOLD"

    family = record["product_family"]

    # Windscreen / rear window: need dims
    if family in ("WS", "RW"):
        if record["width_mm"] and record["height_mm"]:
            return "OK"
        if record["production_from"]:
            return "REVIEW"
        return "HOLD"

    # Body glass: need side or position
    if family == "BO":
        if record["side"] and record["production_from"]:
            return "OK"
        if record["production_from"]:
            return "REVIEW"
        return "HOLD"

    # Moulding
    if family == "GU":
        return "REVIEW" if record["production_from"] else "HOLD"

    return "HOLD"


def main():
    records = []
    current_mfr = ""
    stats = {"ok": 0, "review": 0, "hold": 0, "total": 0}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.find_tables()
            for table in tables:
                rows = table.extract()
                if not rows:
                    continue

                # Skip header rows
                for row in rows:
                    if not row:
                        continue

                    cells = [clean_cell(c) for c in row]
                    if len(cells) < 9:
                        continue

                    # Manufacturer line: text in col 0, nothing else
                    if cells[0] and not any(cells[1:]):
                        mfr = cells[0]
                        # Skip header words
                        if mfr.upper() not in {"MAKE / MODEL", "EUROCODE / NAGS"}:
                            current_mfr = mfr
                        continue

                    # Data row: must have year and family
                    model = cells[1]
                    body = cells[2]
                    year_raw = cells[3]
                    family = cells[4]
                    remarks = cells[5]
                    nord_code = cells[6]
                    dim_raw = cells[7]
                    extra = cells[8]

                    if not year_raw or not family:
                        continue
                    if family not in FAMILY_MAP:
                        continue

                    prod_from, prod_to = parse_year(year_raw)

                    # Parse dimensions
                    width_mm = None
                    height_mm = None
                    dim_match = re.search(r"(\d{3,4})x(\d{3,4})", dim_raw)
                    if dim_match:
                        width_mm = int(dim_match.group(1))
                        height_mm = int(dim_match.group(2))

                    # Parse features
                    features, tint, has_heating, has_vin, has_antenna = parse_features(remarks)

                    # Parse internal code for position/side
                    code_for_parse = f"{nord_code} {extra}".strip()
                    position, side = parse_internal_code(code_for_parse)

                    # Map family
                    mapped = FAMILY_MAP[family]
                    glass_position = position or mapped["position"]

                    # Side logic
                    if family in ("WS", "RW"):
                        side = "BOTH"

                    # Opening type
                    opening_type = None
                    if family == "BO":
                        # Try to infer from remarks
                        if "Lo" in remarks or "frame" in remarks.lower():
                            opening_type = "OPENING" if "Lo" in remarks else "FIXED"

                    record = {
                        "id": str(uuid4()),
                        "source_line_raw": " | ".join(cells),
                        "nord_internal_code": nord_code or extra or None,
                        "sales_code": extra if extra != nord_code else None,
                        "manufacturer_name": current_mfr,
                        "vehicle_model_name": model,
                        "vehicle_body_type_raw": body or None,
                        "production_from_raw": year_raw,
                        "production_to_raw": None,
                        "production_from": prod_from,
                        "production_to": prod_to,
                        "product_family": family,
                        "glass_category": mapped["category"],
                        "glass_position": glass_position,
                        "side": side,
                        "opening_type": opening_type,
                        "tint_code": tint,
                        "feature_codes": features,
                        "has_sensor": None,
                        "has_heating": has_heating,
                        "has_vin_window": has_vin,
                        "has_antenna": has_antenna,
                        "dimensions_raw": dim_raw if dim_raw else None,
                        "width_mm": width_mm,
                        "height_mm": height_mm,
                        "parse_status": "HOLD",
                        "parse_warnings": [],
                        "parse_errors": [],
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    }

                    record["dedupe_key"] = build_dedupe_key(record)
                    record["parse_status"] = evaluate_status(record)

                    records.append(record)

    # Stats
    stats = {
        "ok": sum(1 for r in records if r["parse_status"] == "OK"),
        "review": sum(1 for r in records if r["parse_status"] == "REVIEW"),
        "hold": sum(1 for r in records if r["parse_status"] == "HOLD"),
        "total": len(records),
    }

    # Generate SQL
    sql = f"""-- Nord Glass staging insert: {len(records)} rows
-- Generated: {datetime.utcnow().isoformat()}Z
-- Stats: OK={stats['ok']}, REVIEW={stats['review']}, HOLD={stats['hold']}

INSERT INTO nordglass_staging (
    id, source_line_raw, nord_internal_code, sales_code,
    manufacturer_name, vehicle_model_name, vehicle_body_type_raw,
    production_from_raw, production_to_raw,
    product_family, glass_category, glass_position, side, opening_type,
    tint_code, feature_codes_json,
    has_sensor, has_heating, has_vin_window, has_antenna,
    dimensions_raw, width_mm, height_mm,
    dedupe_key, parse_status, parse_warnings_json, parse_errors_json,
    created_at
) VALUES
"""

    def esc(s):
        if s is None:
            return "NULL"
        return "'" + str(s).replace("'", "''") + "'"

    values = []
    for r in records:
        val = f"""  (
      {esc(r['id'])}, {esc(r['source_line_raw'])}, {esc(r['nord_internal_code'])}, {esc(r['sales_code'])},
      {esc(r['manufacturer_name'])}, {esc(r['vehicle_model_name'])}, {esc(r['vehicle_body_type_raw'])},
      {esc(r['production_from_raw'])}, {esc(r['production_to_raw'])},
      {esc(r['product_family'])}, {esc(r['glass_category'])}, {esc(r['glass_position'])}, {esc(r['side'])}, {esc(r['opening_type'])},
      {esc(r['tint_code'])}, {esc(json.dumps(r['feature_codes']))},
      {r['has_sensor'] if r['has_sensor'] is not None else 'NULL'}, {r['has_heating'] if r['has_heating'] is not None else 'NULL'}, {r['has_vin_window'] if r['has_vin_window'] is not None else 'NULL'}, {r['has_antenna'] if r['has_antenna'] is not None else 'NULL'},
      {esc(r['dimensions_raw'])}, {r['width_mm'] if r['width_mm'] is not None else 'NULL'}, {r['height_mm'] if r['height_mm'] is not None else 'NULL'},
      {esc(r['dedupe_key'])}, {esc(r['parse_status'])}, {esc(json.dumps(r['parse_warnings']))}, {esc(json.dumps(r['parse_errors']))},
      {esc(r['created_at'])}
    )"""
        values.append(val)

    sql += ",\n".join(values) + ";\n"

    with open(output_sql, "w") as f:
        f.write(sql)

    print(f"Extracted {len(records)} records → {output_sql}")
    print(f"Stats: OK={stats['ok']}, REVIEW={stats['review']}, HOLD={stats['hold']}")


if __name__ == "__main__":
    main()
