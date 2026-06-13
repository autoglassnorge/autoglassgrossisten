import { describe, expect, it, vi } from "vitest";

import { handleVinLookup } from "./vin-lookup-api";

function mockDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("FROM vin_decode_cache")) {
                return {
                  vin: "WVWZZZ7HZ8D123456",
                  make: "VW",
                  model: "TRANSPORTER",
                  year: 2008,
                  normalized_key: "vw:transporter:2008",
                  confidence: 0.9,
                  expires_at: "2099-01-01T00:00:00.000Z",
                };
              }
              if (sql.includes("FROM glass_rules")) {
                return {
                  ktype: 17370,
                  confidence: 0.92,
                  evidence_count: 3,
                };
              }
              return null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("handleVinLookup", () => {
  it("uses vin_decode_cache for direct VIN lookups before falling back to external enrichment", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = new Request("http://internal/api/vin-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin: "wvw zzz7hz8d123456" }),
    });

    const response = await handleVinLookup(
      request,
      {
        GLASS_CATALOG_D1: mockDb(),
        SVV_API_KEY: "test",
      },
      { waitUntil() {}, passThroughOnException() {} } as ExecutionContext
    );

    const data = await response.json() as {
      status: string;
      vehicle: { make: string; model: string; year: number; vin: string; kType: number };
      resolutionPath: string[];
      paidLookupUsed: boolean;
    };

    expect(response.status).toBe(200);
    expect(data.status).toBe("resolved");
    expect(data.vehicle).toEqual({
      make: "VW",
      model: "TRANSPORTER",
      year: 2008,
      vin: "WVWZZZ7HZ8D123456",
      kType: 17370,
      bodyClass: "",
    });
    expect(data.resolutionPath).toEqual(["vin_decode_cache", "glass_rules"]);
    expect(data.paidLookupUsed).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
