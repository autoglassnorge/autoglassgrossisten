import type { Env } from "../types";
import { jsonResponse } from "../lib/cors";
import { resolveTecDocKType } from "../lib/tecdoc-resolver";

/**
 * Admin endpoint: Build kType mappings for glass_catalog rows without ktype.
 * POST /api/admin/build-ktype-mapping
 * Body: { batchSize?: number, dryRun?: boolean }
 */
export async function handleBuildKtypeMapping(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const db = env.GLASS_CATALOG_D1;
  const body = await request.json().catch(() => ({})) as { batchSize?: number; dryRun?: boolean };
  const batchSize = Math.min(body.batchSize || 100, 500);
  const dryRun = body.dryRun ?? true;

  // Get rows without ktype
  const { results } = await db
    .prepare(`SELECT id, eurocode, brand, model, year_from, year_to, category FROM glass_catalog WHERE ktype IS NULL AND brand IS NOT NULL AND model IS NOT NULL LIMIT ?`)
    .bind(batchSize)
    .all();

  const rows = (results || []) as Array<{
    id: number;
    eurocode: string;
    brand: string;
    model: string;
    year_from: number;
    year_to: number;
    category: string;
  }>;

  const mappings: Array<{
    id: number;
    eurocode: string;
    brand: string;
    model: string;
    year: number;
    ktype: number;
    score: number;
    reasons: string[];
  }> = [];

  const skipped: Array<{
    id: number;
    eurocode: string;
    brand: string;
    model: string;
    reason: string;
  }> = [];

  for (const row of rows) {
    const year = row.year_from || 2000;
    const result = resolveTecDocKType(row.brand, row.model, year);

    if (result.status === "resolved" && result.candidates.length >= 1) {
      const candidate = result.candidates[0];
      if (candidate.score >= 0.3) {
        mappings.push({
          id: row.id,
          eurocode: row.eurocode,
          brand: row.brand,
          model: row.model,
          year,
          ktype: candidate.ktype,
          score: candidate.score,
          reasons: candidate.reasons,
        });
      } else {
        skipped.push({ id: row.id, eurocode: row.eurocode, brand: row.brand, model: row.model, reason: `score too low: ${candidate.score.toFixed(2)}` });
      }
    } else {
      skipped.push({ id: row.id, eurocode: row.eurocode, brand: row.brand, model: row.model, reason: result.status });
    }
  }

  let applied = 0;
  if (!dryRun && mappings.length > 0) {
    // Build batch SQL
    const sql = mappings.map(m => `UPDATE glass_catalog SET ktype = ${m.ktype} WHERE id = ${m.id};`).join("\n");
    await db.prepare(sql).run();
    applied = mappings.length;
  }

  return jsonResponse({
    dryRun,
    batchSize: rows.length,
    mapped: mappings.length,
    applied,
    skipped: skipped.length,
    sampleMappings: mappings.slice(0, 10),
    sampleSkipped: skipped.slice(0, 5),
  });
}
