#!/usr/bin/env node
/**
 * provider-stats.mjs
 * ==================
 * Observability-dashboard for VIN → kType resolver.
 *
 * Leser provider_calls og glass_rules fra D1 (lokal eller remote)
 * og genererer en rapport med:
 *   - Kall per provider (suksessrate, median latency, total kostnad)
 *   - Cache hit rate (glass_rules treff / totale søk)
 *   - Paid fallback rate
 *   - Topp 20 modeller med flest cache-miss
 *   - Kostnadsoversikt
 *
 * Bruk:
 *   node scripts/provider-stats.mjs              # lokal D1
 *   node scripts/provider-stats.mjs --remote     # remote D1 (krever CF_API_TOKEN)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const remoteMode = process.argv.includes("--remote");
const outputDir = path.join(ROOT, "scripts", "data");
fs.mkdirSync(outputDir, { recursive: true });

// ── Hovedflyt ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Provider Stats — Observability Dashboard");
  console.log(`  Kilde: ${remoteMode ? "Remote D1" : "Lokal D1"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const db = await connectDb();

  // 1. Provider-kall
  const providerStats = await getProviderStats(db);
  console.log("📞 Provider-kall:");
  for (const [provider, stats] of Object.entries(providerStats.byProvider)) {
    console.log(`   ${provider.padEnd(18)} ${stats.calls.toString().padStart(4)} kall  ${(stats.successRate * 100).toFixed(1)}% suksess  median ${stats.medianLatency}ms  $${stats.totalCost.toFixed(2)}`);
  }

  // 2. Cache-hit rate
  const cacheStats = await getCacheStats(db);
  console.log(`\n💾 Cache-statistikk:`);
  console.log(`   glass_rules entries: ${cacheStats.ruleCount}`);
  console.log(`   Cache-hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);

  // 3. Resolution-flyt
  const resolutionStats = await getResolutionStats(db);
  console.log(`\n🔍 Resolution-flyt:`);
  console.log(`   Totale requests: ${resolutionStats.totalRequests}`);
  console.log(`   Resolved: ${resolutionStats.resolved} (${(resolutionStats.resolvedRate * 100).toFixed(1)}%)`);
  console.log(`   Needs review: ${resolutionStats.needsReview} (${(resolutionStats.needsReviewRate * 100).toFixed(1)}%)`);
  console.log(`   Failed: ${resolutionStats.failed} (${(resolutionStats.failedRate * 100).toFixed(1)}%)`);
  console.log(`   Paid lookup used: ${resolutionStats.paidUsed} (${(resolutionStats.paidRate * 100).toFixed(1)}%)`);

  // 4. Topp 20 cache-miss
  const topMisses = await getTopCacheMisses(db);
  console.log(`\n🏆 Topp 20 modeller med flest cache-miss:`);
  for (const [i, m] of topMisses.entries()) {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${m.normalizedKey.padEnd(40)} ${m.missCount} miss`);
  }

  // 5. Lag rapport
  const report = {
    generatedAt: new Date().toISOString(),
    source: remoteMode ? "remote_d1" : "local_d1",
    providerStats,
    cacheStats,
    resolutionStats,
    topMisses,
  };

  const dateStr = new Date().toISOString().split("T")[0];
  const reportPath = path.join(outputDir, `provider-stats-${dateStr}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n📄 Rapport skrevet: ${reportPath}`);
}

// ── DB-tilkobling ─────────────────────────────────────────────────────────

async function connectDb() {
  if (remoteMode) {
    // Remote: bruk Wrangler CLI
    const { execSync } = await import("child_process");
    console.log("🌐 Kobler til remote D1 via Wrangler...");
    // For remote mode bruker vi bare wrangler for queries
    return { remote: true, execSync };
  }

  // Lokal: better-sqlite3
  try {
    const { Database } = await import("better-sqlite3");
    // Prøv å finne D1-fil
    const searchPaths = [
      path.join(ROOT, ".wrangler", "state", "v3", "d1"),
      path.join(ROOT, "api", "cf-worker", ".wrangler", "state", "v3", "d1"),
    ];
    for (const base of searchPaths) {
      if (fs.existsSync(base)) {
        const files = fs.readdirSync(base, { recursive: true });
        const sqlite = files.find((f) => f.endsWith(".sqlite"));
        if (sqlite) {
          const dbFile = path.join(base, sqlite);
          console.log(`🗄️  Lokal D1: ${dbFile}`);
          return new Database(dbFile);
        }
      }
    }
    throw new Error("Ingen lokal D1-database funnet");
  } catch (e) {
    console.warn("⚠️  Kunne ikke koble til lokal D1:", e.message);
    console.log("   Bruker mock-data (tom rapport).");
    return null;
  }
}

// ── Statistikk-helpers ────────────────────────────────────────────────────

function query(db, sql, params = []) {
  if (!db) return [];
  if (db.remote) {
    // Remote: bruk wrangler d1 execute
    try {
      const output = db.execSync(
        `cd ${path.join(ROOT, "api", "cf-worker")} && npx wrangler d1 execute glass-catalog-db --command="${sql.replace(/"/g, '\\"')}" --json`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      return JSON.parse(output);
    } catch {
      return [];
    }
  }
  // Lokal: better-sqlite3
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function queryFirst(db, sql, params = []) {
  if (!db) return null;
  if (db.remote) {
    const rows = query(db, sql, params);
    return rows[0] || null;
  }
  try {
    return db.prepare(sql).get(...params) || null;
  } catch {
    return null;
  }
}

// ── Provider-statistikk ───────────────────────────────────────────────────

async function getProviderStats(db) {
  const rows = query(db, `
    SELECT
      provider,
      COUNT(*) as calls,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
      AVG(latency_ms) as avg_latency,
      SUM(cost_amount) as total_cost
    FROM provider_calls
    GROUP BY provider
    ORDER BY calls DESC
  `);

  const byProvider = {};
  const allLatencies = [];

  for (const r of rows) {
    // Hent median latency per provider
    const latRows = query(db, `
      SELECT latency_ms FROM provider_calls
      WHERE provider = ? AND latency_ms IS NOT NULL
      ORDER BY latency_ms
    `, [r.provider]);

    const latencies = latRows.map((row) => row.latency_ms).filter((n) => n > 0);
    allLatencies.push(...latencies);

    const medianLatency = latencies.length > 0
      ? latencies[Math.floor(latencies.length / 2)]
      : 0;

    byProvider[r.provider] = {
      calls: r.calls,
      successes: r.successes,
      successRate: r.calls > 0 ? r.successes / r.calls : 0,
      avgLatency: Math.round(r.avg_latency || 0),
      medianLatency,
      totalCost: r.total_cost || 0,
    };
  }

  const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0);
  const totalSuccesses = rows.reduce((sum, r) => sum + r.successes, 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  return {
    totalCalls,
    totalSuccesses,
    totalCost,
    overallSuccessRate: totalCalls > 0 ? totalSuccesses / totalCalls : 0,
    byProvider,
  };
}

// ── Cache-statistikk ──────────────────────────────────────────────────────

async function getCacheStats(db) {
  const ruleCountRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_rules WHERE active = 1");
  const ruleCount = ruleCountRow?.count || 0;

  // Cache hit rate = antall requests som ble resolved uten paid lookup
  const resolvedRow = queryFirst(db, `
    SELECT COUNT(*) as count FROM glass_resolution_requests
    WHERE status = 'resolved' AND paid_lookup_used = 0
  `);
  const totalResolvedRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests WHERE status = 'resolved'");

  const cacheHits = resolvedRow?.count || 0;
  const totalResolved = totalResolvedRow?.count || 1;

  return {
    ruleCount,
    cacheHits,
    totalResolved,
    hitRate: totalResolved > 0 ? cacheHits / totalResolved : 0,
  };
}

// ── Resolution-statistikk ─────────────────────────────────────────────────

async function getResolutionStats(db) {
  const totalRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests");
  const resolvedRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests WHERE status = 'resolved'");
  const needsReviewRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests WHERE status = 'needs_review'");
  const failedRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests WHERE status = 'failed'");
  const paidRow = queryFirst(db, "SELECT COUNT(*) as count FROM glass_resolution_requests WHERE paid_lookup_used = 1");

  const total = totalRow?.count || 0;

  return {
    totalRequests: total,
    resolved: resolvedRow?.count || 0,
    needsReview: needsReviewRow?.count || 0,
    failed: failedRow?.count || 0,
    paidUsed: paidRow?.count || 0,
    resolvedRate: total > 0 ? (resolvedRow?.count || 0) / total : 0,
    needsReviewRate: total > 0 ? (needsReviewRow?.count || 0) / total : 0,
    failedRate: total > 0 ? (failedRow?.count || 0) / total : 0,
    paidRate: total > 0 ? (paidRow?.count || 0) / total : 0,
  };
}

// ── Topp cache-miss ───────────────────────────────────────────────────────

async function getTopCacheMisses(db) {
  // Finn requests som endte i needs_review (cache-miss)
  const rows = query(db, `
    SELECT
      SUBSTR(vin, 1, 8) as vin_prefix,
      COUNT(*) as missCount
    FROM glass_resolution_requests
    WHERE status = 'needs_review'
    GROUP BY vin_prefix
    ORDER BY missCount DESC
    LIMIT 20
  `);

  return rows.map((r) => ({
    normalizedKey: r.vin_prefix + "*******",
    missCount: r.missCount,
  }));
}

// ── Kjør ──────────────────────────────────────────────────────────────────
main().catch((e) => {
  console.error("💥 Fatal feil:", e);
  process.exit(1);
});
