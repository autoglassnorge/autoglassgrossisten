#!/usr/bin/env node
/**
 * bootstrap-from-existing-ktype.mjs
 * ==================================
 * Write existing ktype→eurocode mappings from local data into D1.
 *
 * Sources:
 *   - data/glass-variants-d1-ready.json (Pilkington data: 133 unique pairs)
 *
 * Actions:
 *   1. Extract unique (ktype, eurocode) pairs
 *   2. Batch-upsert into ktype_matches (50 per batch)
 *   3. Batch-update glass_catalog.ktype using CASE/WHEN (50 per batch)
 *   4. Report progress
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const D1_REMOTE = true; // Always use remote for production

// ── Load sources ──────────────────────────────────────────────────────────
function loadGlassVariants() {
  const file = path.join(ROOT, "data", "glass-variants-d1-ready.json");
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data || [];
}

// ── Build unique ktype→eurocode map ───────────────────────────────────────
function buildMappings(variants) {
  const map = new Map();
  for (const v of variants) {
    if (!v.ktype || !v.eurocode) continue;
    const key = `${v.ktype}:${v.eurocode}`;
    if (!map.has(key)) {
      map.set(key, { ktype: v.ktype, eurocode: v.eurocode });
    }
  }
  return Array.from(map.values());
}

// ── Execute D1 SQL ────────────────────────────────────────────────────────
function executeD1(sql) {
  const cmd = `cd ${path.join(ROOT, "api/cf-worker")} && npx wrangler d1 execute glass-catalog-db --remote --command "${sql.replace(/"/g, '\\"')}" 2>&1`;

  if (DRY_RUN) {
    console.log(`   [DRY-RUN] ${sql.slice(0, 150)}...`);
    return { success: true };
  }

  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout: 60_000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Batch upsert ktype_matches ────────────────────────────────────────────
function batchUpsertKtypeMatches(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const values = batch.map((m) =>
      `(${m.ktype}, '${m.eurocode}', 1, datetime('now'), datetime('now'))`
    ).join(",\n");

    const sql = `INSERT INTO ktype_matches (ktype, eurocode, hit_count, first_seen, last_seen)
      VALUES ${values}
      ON CONFLICT(ktype, eurocode) DO UPDATE SET
        hit_count = hit_count + 1,
        last_seen = datetime('now');`;

    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write(".");
    } else {
      failed += batch.length;
      process.stdout.write("X");
    }
  }

  return { success, failed };
}

// ── Batch update glass_catalog.ktype ──────────────────────────────────────
function batchUpdateCatalog(mappings) {
  const BATCH_SIZE = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const cases = batch.map((m) => `WHEN '${m.eurocode}' COLLATE NOCASE THEN ${m.ktype}`).join(" ");
    const eurocodes = batch.map((m) => `'${m.eurocode}'`).join(", ");

    const sql = `UPDATE glass_catalog
      SET ktype = CASE eurocode ${cases} END
      WHERE eurocode IN (${eurocodes}) COLLATE NOCASE;`;

    const result = executeD1(sql);
    if (result.success) {
      success += batch.length;
      process.stdout.write(".");
    } else {
      failed += batch.length;
      process.stdout.write("X");
    }
  }

  return { success, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Bootstrap from Existing kType Mappings");
  console.log("  Mode:", DRY_RUN ? "DRY-RUN" : "LIVE", "(REMOTE D1)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Load data
  const variants = loadGlassVariants();
  console.log(`📂 glass-variants-d1-ready.json: ${variants.length} entries`);

  // 2. Build unique mappings
  const mappings = buildMappings(variants);
  console.log(`\n🔍 Unique ktype→eurocode mappings: ${mappings.length}`);

  const byKtype = new Map();
  for (const m of mappings) {
    if (!byKtype.has(m.ktype)) byKtype.set(m.ktype, []);
    byKtype.get(m.ktype).push(m.eurocode);
  }
  console.log(`   Unique ktypes: ${byKtype.size}`);
  for (const [kt, codes] of [...byKtype.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`   ktype ${kt} → ${codes.length} eurocode(s)`);
  }

  if (mappings.length === 0) {
    console.log("❌ Ingen mappings funnet. Avbryter.");
    process.exit(1);
  }

  // 3. Upsert into ktype_matches
  console.log(`\n📝 Upserting ${mappings.length} rows into ktype_matches ...`);
  const ktypeResult = batchUpsertKtypeMatches(mappings);
  console.log(`\n   Success: ${ktypeResult.success}, Failed: ${ktypeResult.failed}`);

  // 4. Update glass_catalog.ktype
  console.log(`\n📝 Updating glass_catalog.ktype (${mappings.length} rows) ...`);
  const catalogResult = batchUpdateCatalog(mappings);
  console.log(`\n   Success: ${catalogResult.success}, Failed: ${catalogResult.failed}`);

  // 5. Verify
  if (!DRY_RUN) {
    console.log(`\n🔍 Verifying ...`);
    const verifySql = `SELECT COUNT(*) as cnt FROM glass_catalog WHERE ktype IS NOT NULL;`;
    const verifyResult = executeD1(verifySql);
    if (verifyResult.success && verifyResult.output) {
      const match = verifyResult.output.match(/"cnt":\s*(\d+)/);
      if (match) {
        console.log(`   Products with ktype: ${match[1]} / 39458 (${(parseInt(match[1])/39458*100).toFixed(2)}%)`);
      }
    }

    const verifyKtypeSql = `SELECT COUNT(*) as cnt FROM ktype_matches;`;
    const verifyKtypeResult = executeD1(verifyKtypeSql);
    if (verifyKtypeResult.success && verifyKtypeResult.output) {
      const match = verifyKtypeResult.output.match(/"cnt":\s*(\d+)/);
      if (match) {
        console.log(`   Rows in ktype_matches: ${match[1]}`);
      }
    }
  }

  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
