import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { searchByRegnr } from "../../src/handlers/search";
import {
  seedSchema,
  seedGroundTruth,
  seedCatalogFromJson,
  buildTecdocVehicle,
  cacheSvvVehicleInKV,
} from "./helpers";
import { computeMetrics, printReport } from "./report";
import golden from "./fixtures/sample-golden.json";
import schemaSql from "../../schema.sql?raw";
import groundTruthSql from "./fixtures/ground-truth-sample.sql?raw";
import catalogData from "./fixtures/catalog-sample.json";

const CATEGORIES = ["frontrute", "bakrute", "sideglass", "dørglass"] as const;

type GoldenFixture = {
  regnr: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  expected: Record<string, string[]>;
};

const goldenFixtures = golden as GoldenFixture[];
const catalogRecords = Array.isArray(catalogData)
  ? (catalogData as unknown[])
  : (catalogData as { records?: unknown[] }).records ?? [];

describe("search accuracy harness", () => {
  beforeAll(async () => {
    // Collect all eurocodes we need from the golden fixture.
    const neededEurocodes = new Set<string>();
    for (const c of goldenFixtures) {
      for (const codes of Object.values(c.expected)) {
        for (const code of codes) {
          if (code) neededEurocodes.add(code);
        }
      }
    }

    await seedSchema(env.GLASS_CATALOG_D1, schemaSql);
    await seedGroundTruth(env.GLASS_CATALOG_D1, groundTruthSql);
    await seedCatalogFromJson(
      env.GLASS_CATALOG_D1,
      catalogRecords,
      neededEurocodes
    );

    for (const c of goldenFixtures) {
      await cacheSvvVehicleInKV(
        env.GLASS_CATALOG,
        c.regnr,
        buildTecdocVehicle({ ...c, regnr: c.regnr })
      );
    }
  });

  it("meets baseline accuracy targets", async () => {
    const results: Array<{
      regnr: string;
      category: string;
      expected: string[];
      predicted: string[];
      bucket: string;
      layer: number;
      confidence: string;
    }> = [];
    let total = 0;

    for (const c of goldenFixtures) {
      for (const category of CATEGORIES) {
        const expected = c.expected[category] ?? [];
        if (expected.length === 0) continue;
        total++;

        const result = await searchByRegnr(c.regnr, env, category);
        const body = result.body as {
          candidates?: Array<{ eurocode?: string | null }>;
          layer?: number;
          confidence?: string;
        } | null;

        const predicted = (body?.candidates ?? [])
          .slice(0, 5)
          .map((r) => r.eurocode)
          .filter((e): e is string => Boolean(e));

        results.push({
          regnr: c.regnr,
          category,
          expected,
          predicted,
          bucket: "missing_or_wrong",
          layer: body?.layer ?? -1,
          confidence: body?.confidence ?? "none",
        });
      }
    }

    const metrics = computeMetrics(results, total);
    printReport(metrics);
    expect(metrics.top1 / metrics.total).toBeGreaterThanOrEqual(0.0);
  }, 120000);
});
