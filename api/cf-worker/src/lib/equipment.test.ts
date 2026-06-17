import { describe, it, expect } from "vitest";
import {
  applyEquipmentFilter,
  inferRecordEquipment,
  computeEquipmentMatch,
  detectFlagsFromDescription,
  computeProfileMatchConfidence,
  selectVehicleProfile,
  selectCategoryProfile,
} from "./equipment.ts";
import type { GlassRecord } from "../types";
import type { VehicleEquipmentProfiles } from "./equipment";

function makeRecord(
  equipment: Partial<{
    adas: number; rain_sensor: number; heated: number;
    acoustic: number; antenna: number; camera: number; hud: number;
    description: string; article_number: string;
  }> & { eurocode?: string } = {}
): GlassRecord {
  return {
    id: 1,
    supplier_sku: "TEST",
    eurocode: equipment.eurocode ?? "TEST",
    article_number: equipment.article_number ?? "TEST",
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

  it('"COAT/HUD/LDW" → hud: true', () => {
    const flags = detectFlagsFromDescription("JAGUAR I-PACE 5D SUV 18-20 COAT/HUD/LDW/EL/SENS");
    expect(flags.hud).toBe(true);
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

describe("inferRecordEquipment — rain sensor from M suffix", () => {
  it("frontrute with eurocode ending in M → rainSensor: true", () => {
    const record = makeRecord({
      eurocode: "1646GYM",
      description: "MERCEDES W129 300-600 2D SL 89-01 FR+GY",
      rain_sensor: 0,
    });
    const eq = inferRecordEquipment(record);
    expect(eq.rainSensor).toBe(true);
  });

  it("frontrute with article_number ending in M → rainSensor: true", () => {
    const record = makeRecord({
      article_number: "1846CSM",
      eurocode: "TEST",
      description: "TEST FRONTRUTE",
      rain_sensor: 0,
    });
    const eq = inferRecordEquipment(record);
    expect(eq.rainSensor).toBe(true);
  });

  it("non-frontrute with M suffix → rainSensor stays false", () => {
    const record = makeRecord({
      eurocode: "4153ASMRL",
      description: "SIDEGLASS LEFT",
      rain_sensor: 0,
    });
    (record as any).category = "sideglass";
    const eq = inferRecordEquipment(record);
    expect(eq.rainSensor).toBe(false);
  });

  it("description negating rain sensor overrides M suffix", () => {
    const record = makeRecord({
      eurocode: "1646GYM",
      description: "MERCEDES W129 FR+GY UTEN REGNSENSOR",
      rain_sensor: 0,
    });
    const eq = inferRecordEquipment(record);
    expect(eq.rainSensor).toBe(false);
  });
});

describe("computeProfileMatchConfidence", () => {
  const baseProfile = {
    n: 100,
    pos: ["adas", "rainSensor"],
    neg: ["hud"],
    p: {
      adas: 0.3,
      rainSensor: 0.7,
      heated: 0.0,
      acoustic: 0.0,
      antenna: 0.0,
      camera: 0.0,
      hud: 0.0,
      solar: 0.0,
      tinted: 0.0,
      coated: 0.0,
      laneAssist: 0.0,
      shade: 0.0,
    },
    comb: [
      { f: ["rainSensor"], c: 60, p: 0.6 },
      { f: ["adas", "rainSensor"], c: 25, p: 0.25 },
      { f: [], c: 15, p: 0.15 },
    ],
  };

  it("returns null for empty profile", () => {
    expect(computeProfileMatchConfidence({}, null)).toBeNull();
    expect(computeProfileMatchConfidence({}, { n: 0, pos: [], neg: [], p: {}, comb: [] })).toBeNull();
  });

  it("returns 0% when product has an impossible feature", () => {
    const result = computeProfileMatchConfidence({ hud: true }, baseProfile);
    expect(result?.confidence).toBe(0);
  });

  it("returns exact combo confidence for matching combination", () => {
    const result = computeProfileMatchConfidence({ rainSensor: true }, baseProfile);
    expect(result?.confidence).toBe(60);
  });

  it("returns exact combo confidence for multi-feature match", () => {
    const result = computeProfileMatchConfidence({ adas: true, rainSensor: true }, baseProfile);
    expect(result?.confidence).toBe(25);
  });

  it("falls back to per-feature average for unseen combination", () => {
    const result = computeProfileMatchConfidence({ adas: true }, baseProfile);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThan(100);
  });

  it("handles numeric 1 as true", () => {
    const result = computeProfileMatchConfidence({ rainSensor: 1 }, baseProfile);
    expect(result?.confidence).toBe(60);
  });
});

describe("selectVehicleProfile", () => {
  const profiles = {
    meta: { generatedAt: "", records: 0, features: [], categories: [] },
    profiles: {
      "VOLKSWAGEN:GOLF:2020": { n: 10, cat: {} as any },
      "VOLKSWAGEN:GOLF": { n: 20, cat: {} as any },
    },
    brandModel: {
      "VOLKSWAGEN:POLO": { n: 30, cat: {} as any },
    },
    brand: {
      VOLKSWAGEN: { n: 100, cat: {} as any },
    },
  } satisfies VehicleEquipmentProfiles;

  it("prefers exact brand:model:year match", () => {
    const selected = selectVehicleProfile(profiles, "volkswagen", "golf", 2020);
    expect(selected?.level).toBe("exact");
    expect(selected?.key).toBe("VOLKSWAGEN:GOLF:2020");
  });

  it("falls back to brand:model when year missing", () => {
    const selected = selectVehicleProfile(profiles, "volkswagen", "golf");
    expect(selected?.level).toBe("brandModel");
    expect(selected?.key).toBe("VOLKSWAGEN:GOLF");
  });

  it("falls back to brand-level profile", () => {
    const selected = selectVehicleProfile(profiles, "volkswagen", "unknown");
    expect(selected?.level).toBe("brand");
    expect(selected?.key).toBe("VOLKSWAGEN");
  });

  it("returns null when no match", () => {
    const selected = selectVehicleProfile(profiles, "toyota", "corolla");
    expect(selected).toBeNull();
  });
});

describe("selectCategoryProfile", () => {
  const vehicleProfile = {
    n: 10,
    cat: {
      frontrute: { n: 5, pos: [], neg: [], p: {}, comb: [] } as any,
      all: { n: 10, pos: [], neg: [], p: {}, comb: [] } as any,
    },
  };

  it("selects requested category", () => {
    expect(selectCategoryProfile(vehicleProfile, "frontrute")?.n).toBe(5);
  });

  it("falls back to all category", () => {
    expect(selectCategoryProfile(vehicleProfile, "bakrute")?.n).toBe(10);
  });
});

describe("selectVehicleProfile — model normalization", () => {
  const profiles = {
    meta: { generatedAt: "", records: 0, features: [], categories: [] },
    profiles: {
      "VW:CARAVELLE:2005": { n: 10, cat: {} as any },
      "VW:TRANSPORTER": { n: 20, cat: {} as any },
    },
    brandModel: {},
    brand: {
      VW: { n: 100, cat: {} as any },
    },
  } satisfies VehicleEquipmentProfiles;

  it("matches Caravelle model variant from Bovsoft", () => {
    const selected = selectVehicleProfile(profiles, "vw", "CARAVELLE V BUSS (7HB, 7HJ)", 2005);
    expect(selected?.level).toBe("exact");
    expect(selected?.key).toBe("VW:CARAVELLE:2005");
  });

  it("falls back to first model word", () => {
    const selected = selectVehicleProfile(profiles, "vw", "TRANSPORTER T5 4MOTION");
    expect(selected?.level).toBe("brandModel");
    expect(selected?.key).toBe("VW:TRANSPORTER");
  });

  it("matches Volkswagen brand alias", () => {
    const selected = selectVehicleProfile(profiles, "VOLKSWAGEN", "CARAVELLE V BUSS", 2005);
    expect(selected?.level).toBe("exact");
    expect(selected?.key).toBe("VW:CARAVELLE:2005");
  });
});
