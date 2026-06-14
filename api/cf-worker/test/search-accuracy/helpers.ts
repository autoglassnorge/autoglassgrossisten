/**
 * Seed helpers for the search accuracy harness.
 * Runs inside @cloudflare/vitest-pool-workers; no node:fs.
 */

import type { TecdocVehicle } from "../../src/providers/svv";

export async function seedSchema(db: D1Database, sql: string): Promise<void> {
  // Strip SQL comments so D1 does not choke on them.
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/--.*$/gm, "");
  const statements = withoutLineComments
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

export async function seedGroundTruth(db: D1Database, sql: string): Promise<void> {
  // D1 exec rejects comments; strip them and run statements individually.
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/--.*$/gm, "");
  const statements = withoutLineComments
    .split(/;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

export async function seedCatalogFromJson(
  db: D1Database,
  records: unknown[],
  neededEurocodes: Set<string>
): Promise<void> {
  const columns = [
    "eurocode",
    "article_number",
    "scan_number",
    "category",
    "supplier",
    "brand",
    "model",
    "position",
    "year_from",
    "year_to",
    "adas",
    "rain_sensor",
    "heated",
    "acoustic",
    "antenna",
    "hud",
    "shade",
    "camera",
    "lane_assist",
    "price",
    "description",
    "type_description",
    "type_code",
    "type_code_desc",
    "properties",
    "prefix4",
    "source",
    "ktype",
    "brand_original",
    "accessory_skus",
  ];

  const filtered = records.filter((r) => {
    const rec = r as Record<string, unknown>;
    const code = String(rec.eurocode ?? "");
    return code && neededEurocodes.has(code);
  });

  // Insert one row at a time to stay well under D1's parameter limits.
  const placeholders = `(${columns.map(() => "?").join(", ")})`;
  const stmt = db.prepare(
    `INSERT INTO glass_catalog (${columns.join(", ")}) VALUES ${placeholders}`
  );

  for (const r of filtered) {
    const rec = r as Record<string, unknown>;
    const properties = rec.properties as Record<string, unknown> | undefined;
    const prefix4 = String(rec.prefix4 ?? "");
    const eurocode = String(rec.eurocode ?? "");
    const computedPrefix4 = prefix4 || eurocode.slice(0, 4);

    const params: (string | number | null)[] = [
      eurocode || null,
      String(rec.article_number ?? rec.supplier_sku ?? "") || null,
      String(rec.scan_number ?? "") || null,
      String(rec.category ?? "") || null,
      String(rec.supplier ?? "") || null,
      String(rec.brand ?? "") || null,
      String(rec.model ?? "") || null,
      String(rec.position ?? properties?.position ?? "") || null,
      rec.year_from ? Number(rec.year_from) : null,
      rec.year_to ? Number(rec.year_to) : null,
      boolToInt(rec.adas ?? properties?.adas),
      boolToInt(rec.rain_sensor ?? properties?.rainSensor),
      boolToInt(rec.heated ?? properties?.heated),
      boolToInt(rec.acoustic ?? properties?.acoustic),
      boolToInt(rec.antenna ?? properties?.antenna),
      boolToInt(rec.hud ?? properties?.hud),
      boolToInt(rec.shade ?? properties?.shade),
      boolToInt(rec.camera ?? properties?.camera),
      boolToInt(rec.lane_assist ?? properties?.laneAssist),
      rec.price ? Number(rec.price) : null,
      String(rec.description ?? "") || null,
      String(rec.type_description ?? "") || null,
      String(rec.type_code ?? "") || null,
      String(rec.type_code_desc ?? rec.type_description ?? "") || null,
      properties ? JSON.stringify(properties) : null,
      computedPrefix4 || null,
      String(rec.source ?? "") || null,
      rec.ktype ? Number(rec.ktype) : null,
      String(rec.brand_original ?? "") || null,
      rec.accessory_skus ? JSON.stringify(rec.accessory_skus) : null,
    ];
    await stmt.bind(...params).run();
  }
}

function boolToInt(value: unknown): number {
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

export function buildTecdocVehicle(gt: {
  regnr?: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
}): TecdocVehicle {
  return {
    regno: gt.regnr || "",
    make: gt.make,
    model: gt.model,
    year: gt.year,
    vin: gt.vin || "",
    typeCode: "",
    fuelCode: "",
    engineCode: "",
    k_type: 0,
  };
}

export async function cacheSvvVehicleInKV(
  kv: KVNamespace,
  regnr: string,
  vehicle: TecdocVehicle
): Promise<void> {
  await kv.put(
    `svv:regnr:${regnr.toUpperCase()}`,
    JSON.stringify(vehicle),
    { expirationTtl: 86400 }
  );
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function seedSvvTecdocMatch(
  db: D1Database,
  regnr: string,
  opts: {
    make: string;
    model: string;
    year: number;
    ktype: number;
    confidenceLevel: "exact" | "high";
  }
): Promise<void> {
  // Ensure the table exists; in production this is created by migration 0019.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS svv_tecdoc_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regnr TEXT,
      regnr_hash TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      normalized_make TEXT NOT NULL,
      normalized_model TEXT NOT NULL,
      ktype INTEGER,
      tecdoc_brand TEXT,
      tecdoc_model TEXT,
      tecdoc_year_from INTEGER,
      tecdoc_year_to INTEGER,
      confidence_score REAL,
      confidence_level TEXT DEFAULT 'none',
      match_reasons TEXT,
      svv_status TEXT DEFAULT 'ok',
      svv_source TEXT DEFAULT 'test',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `).run();

  const hash = await sha256(regnr);
  await db.prepare(`
    INSERT INTO svv_tecdoc_matches
      (regnr, regnr_hash, make, model, year, normalized_make, normalized_model,
       ktype, tecdoc_brand, tecdoc_model, confidence_score, confidence_level,
       match_reasons, svv_status, svv_source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    regnr,
    hash,
    opts.make,
    opts.model,
    opts.year,
    opts.make.toLowerCase(),
    opts.model.toLowerCase(),
    opts.ktype,
    opts.make,
    opts.model,
    opts.confidenceLevel === "exact" ? 1.0 : 0.85,
    opts.confidenceLevel,
    JSON.stringify(["test"]),
    "ok",
    "test"
  ).run();
}
