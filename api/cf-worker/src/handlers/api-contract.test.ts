import { describe, expect, it, beforeAll } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../index";
import schemaSql from "../../schema.sql?raw";

const TEST_REGNR = "SU18018";

async function callWorker(path: string, init?: RequestInit): Promise<Response> {
  const request = new Request(`http://localhost${path}`, init);
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function splitSqlStatements(sql: string): string[] {
  // Strip single-line comments, then split on semicolons.
  const withoutComments = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function seedCatalog(): Promise<void> {
  const db = env.GLASS_CATALOG_D1;

  // Apply the canonical D1 schema so lookups return empty results quickly
  // instead of raising "no such table" errors for every query path.
  const statements = splitSqlStatements(schemaSql).map((stmt) => db.prepare(stmt));
  await db.batch(statements);

  await db
    .prepare(
      `INSERT INTO glass_catalog
        (eurocode, article_number, category, supplier, brand, model, year_from, year_to, prefix4, description, source, ktype)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      "1234ABC",
      "ART1",
      "frontrute",
      "test",
      "VW",
      "CARAVELLE",
      2003,
      2015,
      "1234",
      "VW CARAVELLE 03-15 FRONTRUTE",
      "test",
      12345
    )
    .run();
}

describe("API contract tests", () => {
  beforeAll(async () => {
    await seedCatalog();
  });
  it("GET /api/health returns 200 with status ok and catalogSize", async () => {
    const response = await callWorker("/api/health");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.catalogSize).toBeDefined();
  });

  it(
    "GET /api/glass?regnr=SU18018 returns 200 with vehicle and candidates",
    async () => {
    // Seed the SVV vehicle cache so the test never calls the real SVV API.
    await env.GLASS_CATALOG.put(
      `svv:regnr:${TEST_REGNR}`,
      JSON.stringify({
        regno: TEST_REGNR,
        vin: "",
        make: "VOLKSWAGEN",
        model: "CARAVELLE",
        year: 2005,
        k_type: 12345,
        typeCode: "",
        length: 0,
        fuelCode: "",
        engineCode: "",
        seats: 0,
        gvwr: 0,
      })
    );

    const response = await callWorker(`/api/glass?regnr=${TEST_REGNR}`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.vehicle).toMatchObject({
      make: "VW",
      model: "CARAVELLE",
      year: 2005,
    });
    expect(Array.isArray(body.candidates)).toBe(true);
  },
  30000);

  it("GET /api/catalog/search returns 200 with products and filters", async () => {
    const response = await callWorker("/api/catalog/search?q=frontrute&page=1&per_page=5");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.filters).toBeDefined();
  });

  it("GET /api/catalog/brands returns 200 with an array/object response", async () => {
    const response = await callWorker("/api/catalog/brands");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.brands !== undefined).toBe(true);
  });

  it("GET /api/catalog/categories returns 200", async () => {
    const response = await callWorker("/api/catalog/categories");

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.categories !== undefined).toBe(true);
  });

  it("GET /api/vehicle/equipment-profile returns learned profile", async () => {
    // Seed a minimal gzipped profile into KV.
    const testProfile = {
      meta: { generatedAt: new Date().toISOString(), records: 1, features: ["adas", "rainSensor"], categories: ["frontrute"] },
      profiles: {
        "VOLKSWAGEN:CARAVELLE:2005": {
          n: 10,
          cat: {
            frontrute: {
              n: 5,
              pos: ["antenna"],
              neg: ["adas"],
              p: { adas: 0, rainSensor: 0, heated: 0, acoustic: 0, antenna: 0.6, camera: 0, hud: 0, solar: 0, tinted: 0, coated: 0, laneAssist: 0, shade: 0 },
              comb: [{ f: ["antenna"], c: 3, p: 0.6 }, { f: [], c: 2, p: 0.4 }],
            },
            all: {
              n: 10,
              pos: ["antenna"],
              neg: ["adas"],
              p: { adas: 0, rainSensor: 0, heated: 0, acoustic: 0, antenna: 0.6, camera: 0, hud: 0, solar: 0, tinted: 0, coated: 0, laneAssist: 0, shade: 0 },
              comb: [{ f: ["antenna"], c: 6, p: 0.6 }, { f: [], c: 4, p: 0.4 }],
            },
          },
        },
      },
      brandModel: {},
      brand: {},
    };

    const { gzipSync } = await import("zlib");
    const compressed = gzipSync(Buffer.from(JSON.stringify(testProfile)));
    await env.GLASS_CATALOG.put("equipment:profiles:v1", compressed);

    const response = await callWorker("/api/vehicle/equipment-profile?brand=VOLKSWAGEN&model=CARAVELLE&year=2005&category=frontrute");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.profileKey).toBe("VOLKSWAGEN:CARAVELLE:2005");
    expect(body.profileLevel).toBe("exact");
    expect(body.categoryProfile).toMatchObject({
      category: "frontrute",
      possible: ["antenna"],
      impossible: ["adas"],
    });
  });

  it("unknown route returns 404", async () => {
    const response = await callWorker("/api/does-not-exist");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
  });
});
