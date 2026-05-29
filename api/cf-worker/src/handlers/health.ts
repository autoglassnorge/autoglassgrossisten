/**
 * Handler for GET /api/health
 */

import type { Env } from "../types";
import { jsonResponse } from "../lib/cors";
import { getCatalogStats } from "../lib/db";

export async function handleHealth(_request: Request, env: Env): Promise<Response> {
  const stats = await getCatalogStats(env.GLASS_CATALOG_D1);
  const svvConfigured = !!(env.SVV_API_KEY && env.SVV_API_KEY !== "NOT_SET");
  const bovsoftConfigured = !!(env.BOVSOFT_CLIENT_ID && env.BOVSOFT_CLIENT_ID !== "NOT_SET");
  const biluppgifterConfigured = !!(env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET");
  const vincarioConfigured = !!(env.VINCARIO_API_KEY && env.VINCARIO_SECRET_KEY);
  const macsVisConfigured = !!env.MACS_VIS_API_KEY;
  return jsonResponse({
    status: "ok",
    version: "2.3",
    catalogSize: stats.total,
    brands: stats.brands,
    rulesCount: stats.rulesCount,
    rulesConfigured: stats.rulesCount > 0,
    d1Configured: true,
    svvConfigured,
    bovsoftConfigured,
    biluppgifterConfigured,
    vincarioConfigured,
    macsVisConfigured,
    timestamp: new Date().toISOString(),
  });
}
