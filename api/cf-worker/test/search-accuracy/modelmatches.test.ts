import { describe, it, expect } from "vitest";
import { modelMatches } from "../../src/lib/scoring";
import { expectedGeneration } from "../../src/lib/generation";

describe("modelMatches Mercedes aliases", () => {
  it("matches English C-CLASS to Norwegian SERIE W206 (C-KLASS)", () => {
    expect(modelMatches("C-CLASS", "SERIE W206 (C-KLASS)", "MERCEDES")).toBe(true);
  });
  it("matches English E-CLASS to W213", () => {
    expect(modelMatches("E-CLASS", "SERIE W213 (E-KLASS)", "MERCEDES")).toBe(true);
  });
  it("matches Norwegian C-KLASSE to W205", () => {
    expect(modelMatches("C-KLASSE", "C-CLASSE W205", "MERCEDES")).toBe(true);
  });
});

describe("expectedGeneration Mercedes C-Class", () => {
  it("returns W205 for 2020", () => {
    expect(expectedGeneration("MERCEDES", "C-CLASS", 2020)).toBe("W205");
  });
  it("returns W206 for 2021", () => {
    expect(expectedGeneration("MERCEDES", "C-CLASS", 2021)).toBe("W206");
  });
  it("returns W206 for 2024", () => {
    expect(expectedGeneration("MERCEDES", "C-CLASS", 2024)).toBe("W206");
  });
});
