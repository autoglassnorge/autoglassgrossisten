#!/usr/bin/env node
/**
 * writeback-scrape-results.mjs
 * ============================
 * Idempotent write-back fra scrape_results til:
 *   - ground_truth   (confidence >= 0.90)
 *   - ktype_matches  (confidence >= 0.75)
 *   - glass_catalog  (ktype oppdatering, confidence >= 0.75)
 *
 * Bruk:
 *   node scripts/writeback-scrape-results.mjs              # Alle validerte
 *   node scripts/writeback-scrape-results.mjs --dry-run    # Simuler
 *   node scripts/writeback-scrape-results.mjs --source=ebay # Kun én kilde
 */

import { execSync } from "child_process";

const dryRun = process.argv.includes("--dry-run");
const sourceArg = process.argv.find((a) => a.startsWith("--source="));
const sourceFilter = sourceArg ? sourceArg.split("=")[1] : null;

// ── Hovedflyt ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Write-back: scrape_results → ground_truth / ktype_matches");
  console.log(`  Modus: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  if (sourceFilter) console.log(`  Source-filter: ${sourceFilter}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const sourceClause = sourceFilter ? `AND source = '${sourceFilter}'` : "";

  // 1. Hent validerte resultater
  const sql = `
    SELECT id, ktype, make, model, year, eurocode, oem_number, glass_part_type, confidence, source
    FROM scrape_results
    WHERE status = 'validated' ${sourceClause}
    ORDER BY confidence DESC, id ASC
  `;
  const dbResult = await d1Query(sql);
  const rows = dbResult.results || [];

  console.log(`📋 Validerte resultater å writebacke: ${rows.length}`);
  if (rows.length === 0) {
    console.log("✅ Ingenting å writebacke.");
    return;
  }

  // 2. Kategoriser
  const toGroundTruth = rows.filter((r) => r.confidence >= 0.90);
  const toKtypeMatches = rows.filter((r) => r.confidence >= 0.75);
  const toGlassCatalog = rows.filter((r) => r.confidence >= 0.75 && r.ktype && r.eurocode);

  console.log(`   → ground_truth (≥0.90): ${toGroundTruth.length}`);
  console.log(`   → ktype_matches (≥0.75): ${toKtypeMatches.length}`);
  console.log(`   → glass_catalog ktype (≥0.75): ${toGlassCatalog.length}`);

  let written = 0;

  // 3. Write-back ground_truth
  for (const r of toGroundTruth) {
    if (!r.ktype || !r.eurocode) continue;
    // Regnr_hash: vi har ikke regnr fra scrape, bruk SHA256 av composite key
    const regnrHash = hashComposite(r.make, r.model, r.year, r.ktype);

    const upsert = `
      INSERT INTO ground_truth (regnr_hash, k_type, make, model, year, frontrute_eurocode, verified_by, confidence, source_url)
      VALUES ('${regnrHash}', ${r.ktype}, '${escapeSql(r.make || '')}', '${escapeSql(r.model || '')}', ${r.year || 0}, '${r.eurocode}', 'scrape_pipeline', ${r.confidence}, '${escapeSql(r.source)}')
      ON CONFLICT(regnr_hash) DO UPDATE SET
        k_type = COALESCE(excluded.k_type, ground_truth.k_type),
        frontrute_eurocode = COALESCE(excluded.frontrute_eurocode, ground_truth.frontrute_eurocode),
        confidence = MAX(excluded.confidence, ground_truth.confidence),
        verified_at = datetime('now')
    `;
    if (!dryRun) await d1Query(upsert);
    written++;
  }

  // 4. Write-back ktype_matches
  for (const r of toKtypeMatches) {
    if (!r.ktype || !r.eurocode) continue;
    const upsert = `
      INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
      VALUES (${r.ktype}, '${r.eurocode}', 1, datetime('now'), datetime('now'))
      ON CONFLICT(ktype, eurocode) DO UPDATE SET
        hit_count = hit_count + 1,
        last_seen = datetime('now')
    `;
    if (!dryRun) await d1Query(upsert);
    written++;
  }

  // 5. Oppdater glass_catalog.ktype
  for (const r of toGlassCatalog) {
    const update = `
      UPDATE glass_catalog
      SET ktype = ${r.ktype}
      WHERE eurocode = '${r.eurocode}' AND (ktype IS NULL OR ktype = 0)
    `;
    if (!dryRun) await d1Query(update);
  }

  // 6. Marker som merged
  if (!dryRun) {
    const ids = rows.map((r) => r.id).join(",");
    await d1Query(`UPDATE scrape_results SET status = 'merged', updated_at = datetime('now') WHERE id IN (${ids})`);
  }

  console.log(`\n✅ Write-back fullført: ${written} rader prosessert.`);
  if (dryRun) console.log("   (Dry-run — ingen DB-endringer)");
}

// ── Helpers ───────────────────────────────────────────────────────────────
function hashComposite(make, model, year, ktype) {
  const crypto = require("crypto");
  const str = `${make || ''}|${model || ''}|${year || 0}|${ktype || 0}`;
  return crypto.createHash("sha256").update(str).digest("hex");
}

function escapeSql(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "''").replace(/\\/g, "\\\\");
}

async function d1Query(sql) {
  const cmd = `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --command="${sql.replace(/"/g, '\\"')}" --json`;
  try {
    const out = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    const parsed = JSON.parse(out);
    return parsed[0] || { results: [] };
  } catch (err) {
    console.warn(`⚠️ D1 query feilet: ${err.message?.slice(0, 120)}`);
    return { results: [] };
  }
}

main().catch((e) => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});
