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
});
