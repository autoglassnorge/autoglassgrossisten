import { describe, expect, it } from "vitest";

import type { GlassRecord } from "../types";
import { filterKtypeCandidatesForVehicle, recordMatchesGlassSelection } from "./search";

function record(overrides: Partial<GlassRecord>): GlassRecord {
  return {
    id: 1,
    supplier_sku: "TEST",
    eurocode: "TEST",
    article_number: "TEST",
    scan_number: null,
    category: "frontrute",
    supplier: "test",
    brand: "VW",
    model: "TRANSPORTER T5",
    submodel: null,
    year_from: 2003,
    year_to: 2015,
    prefix4: "TEST",
    adas: 0,
    rain_sensor: 0,
    heated: 0,
    acoustic: 0,
    antenna: 0,
    hud: 0,
    shade: 0,
    camera: 0,
    lane_assist: 0,
    adas_features: null,
    price: 0,
    stock_status: 0,
    warehouse_location: null,
    oem_numbers: null,
    cross_references: null,
    weight: null,
    dimensions: null,
    color: null,
    solar: 0,
    tinted: 0,
    description: "VW TRANSPORTER T5 03-15 FRONTRUTE",
    image_url: null,
    pdf_url: null,
    source: "test",
    source_url: null,
    nags_codes: null,
    brand_original: null,
    ktype: 17370,
    created_at: null,
    ...overrides,
  };
}

describe("filterKtypeCandidatesForVehicle", () => {
  const su18018Vehicle = {
    make: "VW",
    model: "CARAVELLE V BUSS (7HB, 7HJ, 7EB, 7EJ, 7EF, 7EG, 7HF, 7EC)",
    year: 2005,
  };

  it("rejects stale kType rows from other VW models and years", () => {
    const rows = [
      record({
        id: 81592,
        eurocode: "1570GN3",
        model: "PASSAT",
        year_from: 1995,
        year_to: 1996,
        description: "VW PASSAT 10/94-96 FRONTRUTE GN INNK TYPE 3",
      }),
    ];

    expect(filterKtypeCandidatesForVehicle(rows, su18018Vehicle)).toEqual([]);
  });

  it("rejects stale kType rows from other brands", () => {
    const rows = [
      record({
        brand: "RENAULT",
        model: "MASTER I Platform/Chassis (P__)",
        year_from: 1989,
        year_to: 1993,
        description: "RENAULT MASTER I 1989-1993 FRONTRUTE",
      }),
    ];

    expect(filterKtypeCandidatesForVehicle(rows, su18018Vehicle)).toEqual([]);
  });

  it("keeps compatible VW T-family rows for Caravelle", () => {
    const rows = [
      record({
        eurocode: "2525AGN",
        model: "TRANSPORTER T5",
        year_from: 2003,
        year_to: 2015,
        description: "VW TRANSPORTER T5 03-15 FRONTRUTE",
      }),
    ];

    expect(filterKtypeCandidatesForVehicle(rows, su18018Vehicle)).toHaveLength(1);
  });
});

describe("recordMatchesGlassSelection", () => {
  it("matches dørglass by category", () => {
    expect(recordMatchesGlassSelection(record({
      category: "dørglass",
      typeCode: "DFF",
      position: "driver",
      description: "VW TRANSPORTER DØRRUTE FREMME",
    }), "dørglass")).toBe(true);
  });

  it("does not include sideglass when dørglass is selected", () => {
    expect(recordMatchesGlassSelection(record({
      category: "sideglass",
      typeCode: "SFB1",
      position: "driver",
      description: "VW TRANSPORTER SIDERUTE BAK",
    }), "dørglass")).toBe(false);
  });

  it("keeps structured sideglass category even when description says dørrute", () => {
    expect(recordMatchesGlassSelection(record({
      category: "sideglass",
      typeCode: "",
      position: "driver",
      description: "VW TRANSPORTER T5 03- DØRRUTE SKYVEDØR FAST VS",
    }), "dørglass")).toBe(false);
  });

  it("matches driver side from type code fallback", () => {
    expect(recordMatchesGlassSelection(record({
      category: "sideglass",
      typeCode: "SFB1",
      position: null,
      description: "VW TRANSPORTER SIDERUTE BAK",
    }), "sideglass", "driver")).toBe(true);
  });

  it("rejects passenger side when driver side is selected", () => {
    expect(recordMatchesGlassSelection(record({
      category: "sideglass",
      typeCode: "SPB1",
      position: null,
      description: "VW TRANSPORTER SIDERUTE BAK",
    }), "sideglass", "driver")).toBe(false);
  });

  it("rejects unknown side when a specific side is selected", () => {
    expect(recordMatchesGlassSelection(record({
      category: "sideglass",
      typeCode: "",
      position: null,
      description: "VW TRANSPORTER SIDERUTE BAK",
    }), "sideglass", "driver")).toBe(false);
  });
});
