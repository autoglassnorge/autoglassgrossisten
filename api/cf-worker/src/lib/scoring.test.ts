import { describe, it, expect } from "vitest";

import { modelMatches, yearCompatible } from "./scoring.ts";

describe("modelMatches", () => {
  // ── VW T-family ─────────────────────────────────────────────────────────
  describe("VW T-family", () => {
    it("Caravelle ↔ Transporter", () => {
      expect(modelMatches("Caravelle", "Transporter", "vw")).toBe(true);
    });
    it("Multivan ↔ Transporter", () => {
      expect(modelMatches("Multivan", "Transporter", "vw")).toBe(true);
    });
    it("California ↔ Transporter", () => {
      expect(modelMatches("California", "Transporter", "vw")).toBe(true);
    });
    it("T5 generation match", () => {
      expect(modelMatches("Caravelle T5", "Transporter T5", "vw")).toBe(true);
    });
    it("T5 ≠ T6 (generation gate)", () => {
      // KNOWN BUG: currently falls through to token match on "transporter"
      // Fix: explicit false when generations differ
      expect(modelMatches("Transporter T5", "Transporter T6", "vw")).toBe(false);
    });
    it("T4 ≠ T6 (generation gate)", () => {
      expect(modelMatches("Transporter T4", "Transporter T6", "vw")).toBe(false);
    });
  });

  // ── Volvo space normalization ───────────────────────────────────────────
  describe("Volvo", () => {
    it("XC60 ↔ XC 60", () => {
      expect(modelMatches("XC60", "XC 60", "volvo")).toBe(true);
    });
    it("XC90 ↔ XC 90", () => {
      expect(modelMatches("XC90", "XC 90", "volvo")).toBe(true);
    });
    it("S80 ↔ S 80", () => {
      expect(modelMatches("S80", "S 80", "volvo")).toBe(true);
    });
    it("V70 ↔ V 70", () => {
      expect(modelMatches("V70", "V 70", "volvo")).toBe(true);
    });
    it("C30 ↔ C 30", () => {
      expect(modelMatches("C30", "C 30", "volvo")).toBe(true);
    });
    it("XC60 ≠ S80", () => {
      expect(modelMatches("XC60", "S 80", "volvo")).toBe(false);
    });
    it("V70 ≠ XC70", () => {
      expect(modelMatches("V70", "XC 70", "volvo")).toBe(false);
    });
    it("780 in 740_760-80 SERIE", () => {
      expect(modelMatches("780", "740_760-80 SERIE", "volvo")).toBe(true);
    });
    it("740 in 740_760-80 SERIE", () => {
      expect(modelMatches("740", "740_760-80 SERIE", "volvo")).toBe(true);
    });
    it("760 in 740_760-80 SERIE", () => {
      expect(modelMatches("760", "740_760-80 SERIE", "volvo")).toBe(true);
    });
  });

  // ── Jaguar Pace models ─────────────────────────────────────────────────
  describe("Jaguar", () => {
    it("I-PACE ↔ I-PACE", () => {
      expect(modelMatches("I-PACE", "I-PACE", "jaguar")).toBe(true);
    });
    it("I-PACE ≠ E-PACE", () => {
      expect(modelMatches("I-PACE", "E-PACE", "jaguar")).toBe(false);
    });
    it("I-PACE ≠ F-PACE", () => {
      expect(modelMatches("I-PACE", "F-PACE", "jaguar")).toBe(false);
    });
    it("E-PACE ≠ F-PACE", () => {
      expect(modelMatches("E-PACE", "F-PACE", "jaguar")).toBe(false);
    });
    it("JAGUAR I-PACE ↔ I-PACE", () => {
      expect(modelMatches("JAGUAR I-PACE", "I-PACE", "jaguar")).toBe(true);
    });
    it("JAGUAR I-PACE ≠ E-PACE (SVV make prefix must not match generic PACE token)", () => {
      expect(modelMatches("JAGUAR I-PACE", "E-PACE", "jaguar")).toBe(false);
    });
    it("JAGUAR I-PACE ≠ F-PACE", () => {
      expect(modelMatches("JAGUAR I-PACE", "F-PACE", "jaguar")).toBe(false);
    });
  });

  // ── BMW Series models ───────────────────────────────────────────────────
  describe("BMW", () => {
    it("3 SERIE ↔ 3 SERIE", () => {
      expect(modelMatches("BMW 3 SERIE", "3 SERIE", "bmw")).toBe(true);
    });
    it("3-SERIE ↔ 3 SERIE", () => {
      expect(modelMatches("BMW 3-SERIE", "3 SERIE", "bmw")).toBe(true);
    });
    it("3 SERIE ≠ 5 SERIE", () => {
      expect(modelMatches("BMW 3 SERIE", "5 SERIE", "bmw")).toBe(false);
    });
    it("3-SERIE ≠ 8-SERIE", () => {
      expect(modelMatches("BMW 3-SERIE", "8-SERIE", "bmw")).toBe(false);
    });
    it("3 SERIE ≠ 5 SERIE 2D COUPE", () => {
      expect(modelMatches("BMW 3 SERIE", "5 SERIE 2D COUPE 14- BAKRUTE", "bmw")).toBe(false);
    });
  });

  // ── Generic suffix guard ────────────────────────────────────────────────
  describe("Generic suffix guard", () => {
    it("A3 SPORTBACK ≠ A5 SPORTBACK", () => {
      expect(modelMatches("AUDI A3 SPORTBACK", "A5 SPORTBACK", "audi")).toBe(false);
    });
    it("C-KLASSE ≠ E-KLASSE", () => {
      expect(modelMatches("MERCEDES C-KLASSE", "E-KLASSE", "mercedes")).toBe(false);
    });
    it("YARIS CROSS ≠ COROLLA CROSS", () => {
      expect(modelMatches("TOYOTA YARIS CROSS", "COROLLA CROSS", "toyota")).toBe(false);
    });
  });

  // ── Mercedes W-series ───────────────────────────────────────────────────
  describe("Mercedes", () => {
    it("C-Klasse ↔ W203", () => {
      expect(modelMatches("C-Klasse", "SERIE W203", "mercedes")).toBe(true);
    });
    it("C-Klasse ↔ W205", () => {
      expect(modelMatches("C-Klasse", "SERIE W205", "mercedes")).toBe(true);
    });
    it("E-Klasse ↔ W212", () => {
      expect(modelMatches("E-Klasse", "SERIE W212", "mercedes")).toBe(true);
    });
    it("S-Klasse ↔ W222", () => {
      expect(modelMatches("S-Klasse", "SERIE W222", "mercedes")).toBe(true);
    });
    it("GLC ↔ X253", () => {
      expect(modelMatches("GLC", "SERIE X253", "mercedes")).toBe(true);
    });
    it("GLE ↔ W167", () => {
      expect(modelMatches("GLE", "SERIE W167", "mercedes")).toBe(true);
    });
    it("G-Klasse ↔ W463", () => {
      expect(modelMatches("G-Klasse", "SERIE W463", "mercedes")).toBe(true);
    });
    it("G-Klasse ↔ GELANDEWAGEN", () => {
      expect(modelMatches("G-Klasse", "GELANDEWAGEN", "mercedes")).toBe(true);
    });
    it("CLK ↔ W208", () => {
      expect(modelMatches("CLK", "SERIE W208", "mercedes")).toBe(true);
    });
    it("CLK ↔ W209", () => {
      expect(modelMatches("CLK", "SERIE W209", "mercedes")).toBe(true);
    });
    it("CLS ↔ W219", () => {
      expect(modelMatches("CLS", "SERIE W219", "mercedes")).toBe(true);
    });
    it("SL ↔ W230", () => {
      expect(modelMatches("SL", "SERIE W230", "mercedes")).toBe(true);
    });
    it("SLK ↔ W170", () => {
      expect(modelMatches("SLK", "SERIE W170", "mercedes")).toBe(true);
    });
    it("C-Klasse ≠ W210 (E-class)", () => {
      expect(modelMatches("C-Klasse", "SERIE W210", "mercedes")).toBe(false);
    });
    it("E-Klasse ≠ W205 (C-class)", () => {
      expect(modelMatches("E-Klasse", "SERIE W205", "mercedes")).toBe(false);
    });
  });

  // ── General fuzzy (hyphen/space stripping) ──────────────────────────────
  describe("General fuzzy", () => {
    it('3-SERIE ↔ "3 SERIE"', () => {
      expect(modelMatches("3-SERIE", "3 SERIE", "bmw")).toBe(true);
    });
    it("F-150 ↔ F150", () => {
      expect(modelMatches("F-150", "F150", "ford")).toBe(true);
    });
    it("CX-5 ↔ CX 5", () => {
      expect(modelMatches("CX-5", "CX 5", "mazda")).toBe(true);
    });
    it("HI-LUX ↔ Hilux", () => {
      expect(modelMatches("HI-LUX", "Hilux", "toyota")).toBe(true);
    });
    it("CR-V ↔ CRV", () => {
      expect(modelMatches("CR-V", "CRV", "honda")).toBe(true);
    });
    it("MODEL 3 ↔ Model3", () => {
      expect(modelMatches("MODEL 3", "Model3", "tesla")).toBe(true);
    });
    it("SANTA FE ↔ SantaFe", () => {
      expect(modelMatches("SANTA FE", "SantaFe", "hyundai")).toBe(true);
    });
    it("LANDCRUISER ↔ Land Cruiser", () => {
      expect(modelMatches("LANDCRUISER", "Land Cruiser", "toyota")).toBe(true);
    });
    it("L-200 ↔ L200", () => {
      expect(modelMatches("L-200", "L200", "mitsubishi")).toBe(true);
    });
  });

  // ── Negative cases ──────────────────────────────────────────────────────
  describe("Negative cases", () => {
    it("A3 ≠ A30 (substring trap)", () => {
      // KNOWN BUG: substring "A3" is inside "A30"
      expect(modelMatches("A3", "A30", "audi")).toBe(false);
    });
    it("A4 ≠ A40", () => {
      expect(modelMatches("A4", "A40", "audi")).toBe(false);
    });
    it("XC60 ≠ XC90", () => {
      expect(modelMatches("XC60", "XC 90", "volvo")).toBe(false);
    });
    it("Golf ≠ Passat", () => {
      expect(modelMatches("Golf", "Passat", "vw")).toBe(false);
    });
    it("C-Klasse ≠ A-Klasse", () => {
      expect(modelMatches("C-Klasse", "SERIE W177", "mercedes")).toBe(false);
    });
    it("CX-5 ≠ CX-50 (digit boundary is not enough)", () => {
      expect(modelMatches("CX-5", "CX-50", "mazda")).toBe(false);
    });
    it("CX5 ≠ CX50", () => {
      expect(modelMatches("CX5", "CX50", "mazda")).toBe(false);
    });
    it("MX-5 ≠ MX-50", () => {
      expect(modelMatches("MX-5", "MX-50", "mazda")).toBe(false);
    });
    it("BMW X3 ≠ X30", () => {
      expect(modelMatches("BMW X3", "X30", "bmw")).toBe(false);
    });
    it("BMW M3 ≠ M4", () => {
      expect(modelMatches("BMW M3", "M4", "bmw")).toBe(false);
    });
    it("BMW 3 SERIE ≠ 5 SERIE (explicit guard)", () => {
      expect(modelMatches("BMW 3 SERIE", "5 SERIE", "bmw")).toBe(false);
    });
    it("Audi A3 ≠ A30", () => {
      expect(modelMatches("Audi A3", "A30", "audi")).toBe(false);
    });
    it("Audi Q3 ≠ Q5", () => {
      expect(modelMatches("Audi Q3", "Q5", "audi")).toBe(false);
    });
    it("Mercedes C-Klasse ≠ E-Klasse", () => {
      expect(modelMatches("Mercedes C-Klasse", "E-Klasse", "mercedes")).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  describe("Edge cases", () => {
    it("empty record model → false", () => {
      expect(modelMatches("Golf", "", "vw")).toBe(false);
    });
    it("null record model → false", () => {
      expect(modelMatches("Golf", null as unknown, "vw")).toBe(false);
    });
    it("exact match", () => {
      expect(modelMatches("Golf", "Golf", "vw")).toBe(true);
    });
    it("case insensitive", () => {
      expect(modelMatches("golf", "GOLF", "vw")).toBe(true);
    });
  });
});

describe("yearCompatible", () => {
  const makeRecord = (desc: string, from: number | null, to: number | null) => ({
    description: desc,
    year_from: from,
    year_to: to,
    brand: "VW",
    model: "Transporter",
    eurocode: "TEST",
    id: 1,
    article_number: "",
    scan_number: "",
    category: "",
    supplier: "",
    prefix4: "",
    position: "",
    properties: "",
    adas_features: "",
    price: 0,
    stock_status: "",
    warehouse_location: "",
    oem_numbers: "",
    cross_references: "",
    weight: "",
    dimensions: "",
    image_url: "",
    pdf_url: "",
    source: "",
    nags_codes: "",
    brand_original: "",
    ktype: null,
    created_at: "",
    typeCode: "",
    typeCodeDesc: "",
    color: "",
  });

  it("T5 record (2003-2015) compatible with 2010", () => {
    expect(yearCompatible(makeRecord("Transporter T5 03-15", 2003, 2015), 2010, "VW", "Transporter")).toBe(true);
  });
  it("T4 record (1990-2003) NOT compatible with 2010", () => {
    expect(yearCompatible(makeRecord("Transporter T4 90-03", 1990, 2003), 2010, "VW", "Transporter")).toBe(false);
  });
  it("Caravelle 2003 rejects T6 records even when catalog year range is broad", () => {
    expect(yearCompatible(makeRecord("Transporter T6 16-", 2003, 2015), 2003, "VW", "CARAVELLE V BUSS (7HB)")).toBe(false);
  });
  it("Caravelle 2003 accepts T5 records", () => {
    expect(yearCompatible(makeRecord("Transporter T5 03-15", 2003, 2015), 2003, "VW", "CARAVELLE V BUSS (7HB)")).toBe(true);
  });
  it("Open-ended range compatible with 2020", () => {
    expect(yearCompatible(makeRecord("Model 2015-", 2015, null), 2020, "VW", "Golf")).toBe(true);
  });
  it("SU18018 Caravelle V registered in 2005 matches T5 records", () => {
    expect(yearCompatible(
      makeRecord("VW TRANSP+CARAVELLE T5 2003- FRONTRUTE", 2003, 2015),
      2005,
      "VW",
      "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)"
    )).toBe(true);
  });
  it("SU18018 Caravelle V registered in 2005 rejects older T4 records", () => {
    expect(yearCompatible(
      makeRecord("VW TRANSPORTER T4 91-02 FRONTRUTE", 1991, 2003),
      2005,
      "VW",
      "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)"
    )).toBe(false);
  });
  it("SU18018 Caravelle V registered in 2005 rejects older 91-03 records without explicit T4 token", () => {
    expect(yearCompatible(
      makeRecord("VW TRANSPORTER 91-03 FRONTRUTE", 1991, 2003),
      2005,
      "VW",
      "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)"
    )).toBe(false);
  });
  it("SU18018 Caravelle V registered in 2005 rejects newer T6 records despite broad catalog years", () => {
    expect(yearCompatible(
      makeRecord("VW TRANSPORTER T6 16- FRONTRUTE", 2003, 2015),
      2005,
      "VW",
      "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)"
    )).toBe(false);
  });
  it("SU18018 Caravelle V registered in 2005 rejects newer open-ended 22- records without catalog years", () => {
    expect(yearCompatible(
      makeRecord("VW ID BUZZ VAN 22- FR+AKU+LDW+DUGG+SENS+GN", null, null),
      2005,
      "VW",
      "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)"
    )).toBe(false);
  });

  // ── Mitsubishi Space Star generation split ───────────────────────────────
  describe("Mitsubishi Space Star", () => {
    it("2014 rejects old-generation 1999-2011 door glass record", () => {
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 1999-2011", 1999, 2011),
        2014,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(false);
    });

    it("2014 rejects old-generation open-ended 1999- record", () => {
      // Production data sometimes has NULL year_to; without generation gating
      // this would be accepted for a 2014 vehicle because 2014 >= 1999.
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 1999-", 1999, null),
        2014,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(false);
    });

    it("2014 accepts new-generation 2013-2025 door glass record", () => {
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 2013-2025", 2013, 2025),
        2014,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(true);
    });

    it("2014 accepts new-generation open-ended 2013- record", () => {
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 2013-", 2013, null),
        2014,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(true);
    });

    it("2005 accepts old-generation 1999-2011 record", () => {
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 1999-2011", 1999, 2011),
        2005,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(true);
    });

    it("2005 rejects new-generation 2013-2025 record", () => {
      expect(yearCompatible(
        makeRecord("MITSUBISHI SPACE STAR (MIRAGE) Dørrute 2013-2025", 2013, 2025),
        2005,
        "MITSUBISHI",
        "SPACE STAR"
      )).toBe(false);
    });
  });
});
