import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseProducts,
  parseAccessories,
  parseVehicle,
} from "./autoglass-live";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf-8");

describe("autoglass-live parsers (real auto-glass.no HTML)", () => {
  const searchHtml = fixture("search-su18018.html");

  it("parses the vehicle lookup block", () => {
    const v = parseVehicle(searchHtml);
    expect(v.heading).toBe("SU18018 VOLKSWAGEN T5 TRANSPORTER");
    expect(v.model).toBe("2005");
    expect(v.registrationDate).toBe("20050420");
    expect(v.chassis).toBe("WV1ZZZ7HZ5H060934");
    expect(v.body).toBe("Buss/skåp");
  });

  it("parses the full product list with live price + Oslo stock", () => {
    const products = parseProducts(searchHtml);
    expect(products.length).toBeGreaterThanOrEqual(43);

    const first = products.find((p) => p.sku === "2525CSGYA");
    expect(first).toBeDefined();
    expect(first!.price).toBe(14045);
    expect(first!.osloStock).toBe(1);
    expect(first!.typeCode).toBe("Frontrute");
    expect(first!.typeCodeKey).toBe("F");
    expect(first!.url).toContain("https://auto-glass.no/produkt/");

    // "BRUK X VED TOM" alternative-product hint
    const alt = products.find((p) => p.sku === "3393GN");
    expect(alt?.note).toBe("BRUK 2525GY VED TOM");
  });

  it("excludes wiper sets from accessories (Tom: 'ikke viskere ennå')", () => {
    const accessories = parseAccessories(fixture("product-2525csgya.html"));
    // The product page only lists BOSCH VISKERSETT (610S / A938S) → filtered out.
    expect(accessories).toEqual([]);
  });

  it("returns no accessories for a product with none (dørrute)", () => {
    expect(parseAccessories(fixture("product-26493gn.html"))).toEqual([]);
  });
});
