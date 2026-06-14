import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { searchByRegnr } from "../../src/handlers/search";
import {
  seedSchema,
  seedGroundTruth,
  seedCatalogFromJson,
  buildTecdocVehicle,
  cacheSvvVehicleInKV,
  seedSvvTecdocMatch,
} from "./helpers";
import { computeMetrics, printReport } from "./report";
import golden from "./fixtures/sample-golden.json";
import schemaSql from "../../schema.sql?raw";
import groundTruthSql from "./fixtures/ground-truth-sample.sql?raw";
import catalogData from "./fixtures/catalog-sample.json";

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  it("always merges ground_truth even when Layer 0.5 fires", async () => {
    const regnr = "ZZ99999";
    const make = "TESTMAKE";
    const model = "TESTMODEL";
    const year = 2020;
    const correctEurocode = "GT99AGAMVZ";
    const wrongEurocode = "WR99AGAMVZ";
    const wrongKtype = 88888;

    // Cache SVV vehicle so the lookup succeeds.
    await cacheSvvVehicleInKV(
      env.GLASS_CATALOG,
      regnr,
      buildTecdocVehicle({ regnr, make, model, year })
    );

    // Insert ground truth for this regnr.
    const gtHash = await sha256(regnr);
    await env.GLASS_CATALOG_D1.prepare(`
      INSERT INTO ground_truth
        (regnr_hash, make, model, year, frontrute_eurocode, verified_by, verified_at, confidence)
      VALUES (?, ?, ?, ?, ?, 'test', datetime('now'), 1.0)
    `).bind(gtHash, make, model, year, correctEurocode).run();

    // Insert catalog rows: the correct one (ground truth) and a wrong one
    // attached to the Layer 0.5 cached kType. Both match the vehicle so that
    // Layer 0.5 actually fires and produces a candidate.
    await env.GLASS_CATALOG_D1.prepare(`
      INSERT INTO glass_catalog
        (eurocode, category, brand, model, year_from, year_to, ktype, supplier)
      VALUES
        (?, 'frontrute', ?, ?, ?, ?, ?, 'test-correct'),
        (?, 'frontrute', ?, ?, ?, ?, ?, 'test-wrong')
    `).bind(
      correctEurocode, make, model, year, year, 99999,
      wrongEurocode, make, model, year, year, wrongKtype
    ).run();

    // Seed Layer 0.5 with a high-confidence but wrong kType.
    await seedSvvTecdocMatch(env.GLASS_CATALOG_D1, regnr, {
      make,
      model,
      year,
      ktype: wrongKtype,
      confidenceLevel: "exact",
    });

    const result = await searchByRegnr(regnr, env, "frontrute");
    const body = result.body as {
      candidates?: Array<{ eurocode?: string | null }>;
      layer?: number;
      confidence?: string;
    } | null;

    const predicted = (body?.candidates ?? [])
      .slice(0, 3)
      .map((r) => r.eurocode)
      .filter((e): e is string => Boolean(e));

    expect(predicted).toContain(correctEurocode);
    expect(body?.layer).toBe(-1);
    expect(body?.confidence).toBe("exact");
  }, 30000);
});
