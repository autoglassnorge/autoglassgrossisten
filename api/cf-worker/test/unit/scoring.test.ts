import { describe, it, expect } from "vitest";
import { scoreCandidate } from "../../src/lib/scoring";
import { detectFlagsFromOem } from "../../src/lib/equipment";

describe("scoreCandidate kType gate", () => {
  it("does not bury a correct non-kType candidate when vehicle kType is wrong", () => {
    const wrongKtypeRecord = {
      id: 1, eurocode: "WRONG", ktype: 999,
      brand: "VW", model: "GOLF VII", year_from: 2013, year_to: 2020,
      category: "frontrute", description: "FRONTRUTE",
    } as any;
    const correctRecord = {
      id: 2, eurocode: "CORRECT", ktype: 111,
      brand: "VW", model: "GOLF VII", year_from: 2013, year_to: 2020,
      category: "frontrute", description: "FRONTRUTE",
    } as any;
    const vehicle = {
      make: "VW", model: "GOLF VII", year: 2016, k_type: 999,
    } as any;
    const flags = detectFlagsFromOem([]);
    const wrongScore = scoreCandidate(wrongKtypeRecord, flags, vehicle, null, undefined, null, undefined);
    const correctScore = scoreCandidate(correctRecord, flags, vehicle, null, undefined, null, undefined);
    expect(correctScore).toBeGreaterThan(wrongScore - 400);
  });
});
