import { describe, it, expect } from "vitest";
import { modelMatches } from "../src/lib/scoring.ts";

/**
 * Known false-positive model pairs that must NOT match.
 * These represent different models that previously slipped through due to
 * generic suffix tokens, digit-boundary substring traps, or shared body-style words.
 */
const KNOWN_FALSE_POSITIVES: [string, string, string][] = [
  ["JAGUAR I-PACE", "E-PACE", "jaguar"],
  ["JAGUAR I-PACE", "F-PACE", "jaguar"],
  ["BMW 3 SERIE", "5 SERIE", "bmw"],
  ["BMW 3-SERIE", "8-SERIE", "bmw"],
  ["BMW X3", "X30", "bmw"],
  ["BMW M3", "M4", "bmw"],
  ["MAZDA CX-5", "CX-50", "mazda"],
  ["MAZDA CX5", "CX50", "mazda"],
  ["AUDI A3", "A30", "audi"],
  ["AUDI Q3", "Q5", "audi"],
  ["MERCEDES C-KLASSE", "E-KLASSE", "mercedes"],
  ["VW TRANSPORTER T5", "T6", "vw"],
  ["VOLVO XC60", "XC 90", "volvo"],
  ["AUDI A4", "A40", "audi"],
];

/**
 * Known true-positive model pairs that MUST still match.
 * These verify that stricter matching does not break legitimate normalization.
 */
const KNOWN_TRUE_POSITIVES: [string, string, string][] = [
  ["JAGUAR I-PACE", "I-PACE", "jaguar"],
  ["BMW 3 SERIE", "3 SERIE", "bmw"],
  ["BMW 3-SERIE", "3 SERIE", "bmw"],
  ["BMW X3", "X3", "bmw"],
  ["MAZDA CX-5", "CX 5", "mazda"],
  ["AUDI A3", "A3", "audi"],
  ["MERCEDES C-KLASSE", "C-KLASSE", "mercedes"],
  ["VW TRANSPORTER T5", "TRANSPORTER T5", "vw"],
  ["VOLVO XC60", "XC 60", "volvo"],
];

describe("model collision audit", () => {
  it("rejects known false-positive model pairs", () => {
    for (const [vehicleModel, recordModel, make] of KNOWN_FALSE_POSITIVES) {
      expect(modelMatches(vehicleModel, recordModel, make)).toBe(false);
    }
  });

  it("accepts known true-positive model pairs", () => {
    for (const [vehicleModel, recordModel, make] of KNOWN_TRUE_POSITIVES) {
      expect(modelMatches(vehicleModel, recordModel, make)).toBe(true);
    }
  });
});
