import { describe, it, expect } from "vitest";
import { applyEquipmentFilter, inferRecordEquipment, computeEquipmentMatch, detectFlagsFromDescription } from "./equipment.ts";
import type { GlassRecord } from "../types";

function makeRecord(
  equipment: Partial<{
    adas: number; rain_sensor: number; heated: number;
    acoustic: number; antenna: number; camera: number; hud: number;
    description: string;
  }> & { eurocode?: string } = {}
): GlassRecord {
  return {
    id: 1,
    supplier_sku: "TEST",
    eurocode: equipment.eurocode ?? "TEST",
    article_number: "TEST",
    scan_number: null,
    category: "frontrute",
    supplier: "test",
    brand: "VW",
    model: "GOLF",
    submodel: null,
    year_from: 2010,
    year_to: 2015,
    prefix4: "TEST",
    adas: equipment.adas ?? 0,
    rain_sensor: equipment.rain_sensor ?? 0,
    heated: equipment.heated ?? 0,
    acoustic: equipment.acoustic ?? 0,
    antenna: equipment.antenna ?? 0,
    hud: equipment.hud ?? 0,
    shade: 0,
    camera: equipment.camera ?? 0,
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
    description: equipment.description ?? "TEST",
    image_url: null,
    pdf_url: null,
    source: "test",
    source_url: null,
    nags_codes: null,
    brand_original: null,
    ktype: null,
    created_at: null,
  };
}

describe("applyEquipmentFilter", () => {
  describe("antenna filter", () => {
    it("filters OUT candidates without antenna when user answered antenna=true", () => {
      const candidates = [
        makeRecord({ antenna: 1 }), // has antenna
        makeRecord({ antenna: 0 }), // no antenna
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: true });
      expect(exact).toHaveLength(1);
      expect(exact[0].antenna).toBe(1);
      expect(uncertain).toHaveLength(1);
      expect(uncertain[0].antenna).toBe(0);
    });

    it("filters OUT candidates WITH antenna when user answered antenna=false", () => {
      const candidates = [
        makeRecord({ antenna: 1 }),
        makeRecord({ antenna: 0 }),
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: false });
      expect(exact).toHaveLength(1);
      expect(exact[0].antenna).toBe(0);
      expect(uncertain).toHaveLength(1);
      expect(uncertain[0].antenna).toBe(1);
    });

    it("keeps ALL candidates when user has not answered (undefined)", () => {
      const candidates = [
        makeRecord({ antenna: 1 }),
        makeRecord({ antenna: 0 }),
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: undefined });
      expect(exact).toHaveLength(2);
      expect(uncertain).toHaveLength(0);
    });

    it("returns 0 exact when no candidate matches antenna=true", () => {
      const candidates = [
        makeRecord({ antenna: 0 }),
        makeRecord({ antenna: 0 }),
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: true });
      expect(exact).toHaveLength(0);
      expect(uncertain).toHaveLength(2);
    });
  });

  describe("multiple equipment filters", () => {
    it("filters on both camera and heated when both answered", () => {
      const candidates = [
        makeRecord({ camera: 1, heated: 1 }), // exact match
        makeRecord({ camera: 1, heated: 0 }), // missing heated
        makeRecord({ camera: 0, heated: 1 }), // missing camera
        makeRecord({ camera: 0, heated: 0 }), // missing both
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { camera: true, heated: true });
      expect(exact).toHaveLength(1);
      expect(exact[0].camera).toBe(1);
      expect(exact[0].heated).toBe(1);
      expect(uncertain).toHaveLength(3);
    });

    it("filters on camera=true AND heated=false (mixed)", () => {
      const candidates = [
        makeRecord({ camera: 1, heated: 0 }), // exact
        makeRecord({ camera: 1, heated: 1 }), // wrong heated
        makeRecord({ camera: 0, heated: 0 }), // wrong camera
        makeRecord({ camera: 0, heated: 1 }), // wrong both
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { camera: true, heated: false });
      expect(exact).toHaveLength(1);
      expect(exact[0].camera).toBe(1);
      expect(exact[0].heated).toBe(0);
      expect(uncertain).toHaveLength(3);
    });
  });

  describe("edge cases", () => {
    it("empty candidates → empty exact and uncertain", () => {
      const { exact, uncertain } = applyEquipmentFilter([], { antenna: true });
      expect(exact).toHaveLength(0);
      expect(uncertain).toHaveLength(0);
    });

    it("empty answers object → all candidates exact", () => {
      const candidates = [makeRecord({ antenna: 1 }), makeRecord({ antenna: 0 })];
      const { exact, uncertain } = applyEquipmentFilter(candidates, {});
      expect(exact).toHaveLength(2);
      expect(uncertain).toHaveLength(0);
    });

    it("all answers undefined → all candidates exact", () => {
      const candidates = [makeRecord({ antenna: 1 }), makeRecord({ antenna: 0 })];
      const { exact, uncertain } = applyEquipmentFilter(candidates, {
        adas: undefined,
        rainSensor: undefined,
        heated: undefined,
        acoustic: undefined,
        antenna: undefined,
        camera: undefined,
        hud: undefined,
      });
      expect(exact).toHaveLength(2);
      expect(uncertain).toHaveLength(0);
    });
  });

  describe("SU18018 scenario", () => {
    it("SU18018 with antenna=true: only glass WITH antenna is exact", () => {
      // Simulate VW Transporter T5 glass variants
      const candidates = [
        makeRecord({ brand: "VW", model: "TRANSPORTER T5", antenna: 1, eurocode: "WITH_ANT" }),
        makeRecord({ brand: "VW", model: "TRANSPORTER T5", antenna: 0, eurocode: "NO_ANT" }),
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: true });
      expect(exact).toHaveLength(1);
      expect(exact[0].eurocode).toBe("WITH_ANT");
      expect(uncertain).toHaveLength(1);
      expect(uncertain[0].eurocode).toBe("NO_ANT");
    });

    it("SU18018 with antenna=true: 0 exact when no glass has antenna", () => {
      const candidates = [
        makeRecord({ brand: "VW", model: "TRANSPORTER T5", antenna: 0, eurocode: "NO_ANT_1" }),
        makeRecord({ brand: "VW", model: "TRANSPORTER T5", antenna: 0, eurocode: "NO_ANT_2" }),
      ];
      const { exact, uncertain } = applyEquipmentFilter(candidates, { antenna: true });
      expect(exact).toHaveLength(0);
      expect(uncertain).toHaveLength(2);
    });
  });
});

describe("detectFlagsFromDescription — negation handling", () => {
  it('"IKKE ANT" → antenna: false', () => {
    const flags = detectFlagsFromDescription("VW TRANSP+CARAVELLE 2003-  FR+GY+INK-NB IKKE ANT");
    expect(flags.antenna).toBe(false);
  });

  it('"+ANT" → antenna: true', () => {
    const flags = detectFlagsFromDescription("VW TRANSP+CARAVELLE T5 2003-  FRONTRUTE +INNK+ANT");
    expect(flags.antenna).toBe(true);
  });

  it('"SENSOR OG ANT" → antenna: true', () => {
    const flags = detectFlagsFromDescription("VW TRANSP+CARAVELLE 2003-  GY+INNK+SENSOR OG ANT");
    expect(flags.antenna).toBe(true);
  });

  it('"NB- IKKE ANT" → antenna: false', () => {
    const flags = detectFlagsFromDescription("VW TRANSP+CARAVELLE 2003- +GY+INNK+SENSOR NB- IKKE ANT");
    expect(flags.antenna).toBe(false);
  });

  it('"IKKE CAMERA" → camera: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE IKKE CAMERA");
    expect(flags.camera).toBe(false);
  });

  it('"+CAMERA" → camera: true', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE +CAMERA");
    expect(flags.camera).toBe(true);
  });

  it('"NOT HEATED" → heated: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE NOT HEATED");
    expect(flags.heated).toBe(false);
  });

  it('"UTEN REGNSENSOR" → rainSensor: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE UTEN REGNSENSOR");
    expect(flags.rainSensor).toBe(false);
  });

  it('"NO ADAS" → adas: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE NO ADAS");
    expect(flags.adas).toBe(false);
  });

  it('"WITHOUT HUD" → hud: false', () => {
    const flags = detectFlagsFromDescription("BMW 5 SERIES 2015- FRONTRUTE WITHOUT HUD");
    expect(flags.hud).toBe(false);
  });

  it('"NEI ACOUSTIC" → acoustic: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE NEI ACOUSTIC");
    expect(flags.acoustic).toBe(false);
  });

  it('"INGEN ANTENNE" → antenna: false', () => {
    const flags = detectFlagsFromDescription("VW GOLF 2015- FRONTRUTE INGEN ANTENNE");
    expect(flags.antenna).toBe(false);
  });
});

describe("inferRecordEquipment — description fallback with negation", () => {
  it("uses description-parsed antenna when DB column is 0", () => {
    const record = makeRecord({
      antenna: 0,
      description: "VW TRANSP+CARAVELLE T5 2003-  FRONTRUTE +INNK+ANT",
    });
    const eq = inferRecordEquipment(record);
    expect(eq.antenna).toBe(true);
  });

  it("uses description-parsed antenna (negated) when DB column is 0", () => {
    const record = makeRecord({
      antenna: 0,
      description: "VW TRANSP+CARAVELLE 2003-  FR+GY+INK-NB IKKE ANT",
    });
    const eq = inferRecordEquipment(record);
    expect(eq.antenna).toBe(false);
  });

  it("returns all equipment fields, not just 3", () => {
    const record = makeRecord({
      antenna: 0,
      description: "VW TRANSP+CARAVELLE T5 2003-  FRONTRUTE +INNK+ANT",
    });
    const eq = inferRecordEquipment(record);
    expect(eq).toHaveProperty("adas");
    expect(eq).toHaveProperty("rainSensor");
    expect(eq).toHaveProperty("heated");
    expect(eq).toHaveProperty("acoustic");
    expect(eq).toHaveProperty("antenna");
    expect(eq).toHaveProperty("camera");
    expect(eq).toHaveProperty("hud");
    expect(eq).toHaveProperty("shade");
  });
});
