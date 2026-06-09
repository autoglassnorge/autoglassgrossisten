import { describe, it, expect } from "vitest";

import { normalizeBrand, getBrandAliases } from "./brand.ts";

describe("normalizeBrand", () => {
  it("VOLKSWAGEN → VW", () => {
    expect(normalizeBrand("VOLKSWAGEN")).toBe("VW");
  });
  it("Mercedes-Benz → MERCEDES", () => {
    expect(normalizeBrand("Mercedes-Benz")).toBe("MERCEDES");
  });
  it("Land Rover → LANDROVER", () => {
    expect(normalizeBrand("Land Rover")).toBe("LANDROVER");
  });
  it("unknown brand passes through uppercase", () => {
    expect(normalizeBrand("Tesla")).toBe("TESLA");
  });
});

describe("getBrandAliases", () => {
  it("MINI includes BMW for cross-search", () => {
    const aliases = getBrandAliases("MINI");
    expect(aliases.includes("MINI")).toBeTruthy();
    expect(aliases.includes("BMW")).toBeTruthy();
  });
  it("BMW includes MINI for cross-search", () => {
    const aliases = getBrandAliases("BMW");
    expect(aliases.includes("BMW")).toBeTruthy();
    expect(aliases.includes("MINI")).toBeTruthy();
  });
  it("VW returns VW alias set", () => {
    const aliases = getBrandAliases("Volkswagen");
    expect(aliases.includes("VW")).toBeTruthy();
    expect(aliases.includes("VOLKSWAGEN")).toBeTruthy();
  });
  it("NISSAN includes NISSAN TRUCKS", () => {
    const aliases = getBrandAliases("NISSAN");
    expect(aliases.includes("NISSAN")).toBeTruthy();
    expect(aliases.includes("NISSAN TRUCKS")).toBeTruthy();
  });
  it("FIAT includes FIAT TRUCKS", () => {
    const aliases = getBrandAliases("FIAT");
    expect(aliases.includes("FIAT")).toBeTruthy();
    expect(aliases.includes("FIAT TRUCKS")).toBeTruthy();
  });
  it("RENAULT includes RENAULT TRUCKS", () => {
    const aliases = getBrandAliases("RENAULT");
    expect(aliases.includes("RENAULT")).toBeTruthy();
    expect(aliases.includes("RENAULT TRUCKS")).toBeTruthy();
  });
  it("MITSUBISHI includes MITSUBISHI TRUCKS", () => {
    const aliases = getBrandAliases("MITSUBISHI");
    expect(aliases.includes("MITSUBISHI")).toBeTruthy();
    expect(aliases.includes("MITSUBISHI TRUCKS")).toBeTruthy();
  });
  it("MAZDA includes MAZDA TRUCKS", () => {
    const aliases = getBrandAliases("MAZDA");
    expect(aliases.includes("MAZDA")).toBeTruthy();
    expect(aliases.includes("MAZDA TRUCKS")).toBeTruthy();
  });
  it("CHEVROLET includes USA CARS", () => {
    const aliases = getBrandAliases("CHEVROLET");
    expect(aliases.includes("USA CARS")).toBeTruthy();
  });
  it("FORD includes USA CARS", () => {
    const aliases = getBrandAliases("FORD");
    expect(aliases.includes("USA CARS")).toBeTruthy();
  });
  it("JEEP includes USA CARS", () => {
    const aliases = getBrandAliases("JEEP");
    expect(aliases.includes("USA CARS")).toBeTruthy();
  });
  it("USA CARS includes CHEVROLET", () => {
    const aliases = getBrandAliases("USA CARS");
    expect(aliases.includes("CHEVROLET")).toBeTruthy();
    expect(aliases.includes("FORD")).toBeTruthy();
    expect(aliases.includes("JEEP")).toBeTruthy();
  });
});
