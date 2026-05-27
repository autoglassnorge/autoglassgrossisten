#!/usr/bin/env node
/**
 * score-confidence.mjs
 * ====================
 * Batch-prosesserer scrape_results og tildeler confidence-score.
 *
 * Bruk:
 *   node scripts/score-confidence.mjs                    # Alle rå resultater
 *   node scripts/score-confidence.mjs --job-id=123       # Kun én jobb
 *   node scripts/score-confidence.mjs --dry-run          # Simuler uten DB-update
 */

// ── Konfigurasjon ──────────────────────────────────────────────────────────
const SOURCE_BASELINE = {
  svv_ground_truth: 1.00,
  bovsoft:          0.92,
  tecdoc_api:       0.85,
  ebay:             0.75,
  pdf:              0.60,
  pivot:            0.50,
  finn:             0.70,
  macs_vis:         0.80,
  agm:              0.78,
};

const dryRun = process.argv.includes("--dry-run");
const jobIdArg = process.argv.find((a) => a.startsWith("--job-id="));
const jobIdFilter = jobIdArg ? parseInt(jobIdArg.split("=")[1], 10) : null;

// ── Hovedflyt ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Confidence Scoring Engine");
  console.log(`  Modus: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  if (jobIdFilter) console.log(`  Job-filter: ${jobIdFilter}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Les scrape_results fra D1 via wrangler
  const where = jobIdFilter
    ? `WHERE job_id = ${jobIdFilter} AND status = 'raw'`
    : `WHERE status = 'raw'`;

  const sql = `SELECT id, job_id, source, ktype, eurocode, oem_number, article_number, glass_part_type, raw_payload FROM scrape_results ${where}`;

  const dbResult = await d1Query(sql);
  const rows = dbResult.results || [];

  console.log(`📋 Rå resultater å score: ${rows.length}`);
  if (rows.length === 0) {
    console.log("✅ Ingenting å score.");
    return;
  }

  // Tell bekreftelser per (ktype, eurocode) for multi-source boost
  const confirmationMap = await buildConfirmationMap(rows);

  let updated = 0;
  for (const row of rows) {
    const score = computeConfidence(row, confirmationMap);
    const newStatus = score >= 0.90 ? "validated" : score >= 0.60 ? "validated" : "rejected";

    if (!dryRun) {
      await d1Query(
        `UPDATE scrape_results SET confidence = ${score}, status = '${newStatus}', updated_at = datetime('now') WHERE id = ${row.id}`
      );
    }
    updated++;
  }

  console.log(`\n✅ Scoret ${updated} resultater.`);
  if (dryRun) console.log("   (Dry-run — ingen DB-endringer)");
}

// ── Confidence-beregning ──────────────────────────────────────────────────
function computeConfidence(row, confirmationMap) {
  let score = SOURCE_BASELINE[row.source] || 0.30;

  // Multi-source bekreftelse
  const key = `${row.ktype || 'null'}:${(row.eurocode || '').toUpperCase()}`;
  const confirmations = confirmationMap.get(key) || 0;
  if (confirmations >= 3) score += 0.10;
  if (confirmations >= 5) score += 0.05;

  // Data-kompletthet
  if (row.oem_number) score += 0.03;
  if (row.article_number) score += 0.02;
  if (row.glass_part_type) score += 0.01;

  // Parse raw_payload for ekstra signaler
  try {
    const payload = JSON.parse(row.raw_payload || '{}');
    if (payload.verified === true) score += 0.05;
    if (payload.year_match === true) score += 0.03;
  } catch { /* ignore */ }

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

// ── Bekreftelses-kart ─────────────────────────────────────────────────────
async function buildConfirmationMap(rows) {
  // Hent alle eksisterende scrape_results med samme ktype+eurocode
  const ktypes = [...new Set(rows.map((r) => r.ktype).filter(Boolean))];
  const eurocodes = [...new Set(rows.map((r) => r.eurocode).filter(Boolean))];

  if (ktypes.length === 0 || eurocodes.length === 0) return new Map();

  const ktList = ktypes.join(",");
  const ecList = eurocodes.map((e) => `'${e.toUpperCase().replace(/'/g, "''")}'`).join(",");

  const sql = `
    SELECT ktype, UPPER(eurocode) as eurocode, COUNT(*) as cnt
    FROM scrape_results
    WHERE ktype IN (${ktList}) AND UPPER(eurocode) IN (${ecList}) AND status IN ('raw','validated','merged')
    GROUP BY ktype, UPPER(eurocode)
  `;

  const result = await d1Query(sql);
  const map = new Map();
  for (const r of result.results || []) {
    map.set(`${r.ktype}:${r.eurocode}`, r.cnt);
  }
  return map;
}

// ── D1 Helper ─────────────────────────────────────────────────────────────
async function d1Query(sql) {
  const { execSync } = await import("child_process");
  const cmd = `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --command="${sql.replace(/"/g, '\\"')}" --json`;
  try {
    const out = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    const parsed = JSON.parse(out);
    return parsed[0] || { results: [] };
  } catch (err) {
    // Fallback: hvis wrangler feiler, returner tomt
    console.warn(`⚠️ D1 query feilet: ${err.message?.slice(0, 100)}`);
    return { results: [] };
  }
}

main().catch((e) => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
