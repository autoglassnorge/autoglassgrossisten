#!/usr/bin/env node
/**
 * batch-bootstrap-ktype.mjs
 * =========================
 * Live Bovsoft REGNUM → kType batch bootstrap med glass_rules seeding.
 *
 * Bovsoft REGNUM (http://54.38.179.43:150) returnerer kType direkte fra
 * norsk regnr. Funksjonelt fra Node.js, blokkert i Cloudflare Workers (port 150).
 *
 * Strategi:
 *   1. Les regnr-liste (fra fil eller default 6 kjente)
 *   2. Kall Bovsoft for hvert regnr (ett søk per unik regnr)
 *   3. Ved treff: upsert i glass_rules (brand:model:year → kType, confidence 0.92)
 *   4. Logg alt til JSON
 *   5. Generer rapport
 *
 * Bruk:
 *   node scripts/batch-bootstrap-ktype.mjs                    # Kjør på 6 kjente regnre
 *   node scripts/batch-bootstrap-ktype.mjs regnre.txt         # Kjør på egne regnre
 *   node scripts/batch-bootstrap-ktype.mjs --dry-run          # Simuler uten API-kall
 *   node scripts/batch-bootstrap-ktype.mjs --seed-only        # Seed glass_rules fra cache
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Bovsoft-konfigurasjon ─────────────────────────────────────────────────
const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";
const DELAY_MS = 2000; // 2s mellom kall for å ikke overbelaste

// ── CLI flags ─────────────────────────────────────────────────────────────
const dryRun = process.argv.includes("--dry-run");
const seedOnly = process.argv.includes("--seed-only");
const d1Local = process.argv.includes("--d1-local");
const d1Remote = process.argv.includes("--remote");
const regnrFile = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));

const outputDir = path.join(ROOT, "scripts", "data");
fs.mkdirSync(outputDir, { recursive: true });

// ── Hovedflyt ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Bovsoft REGNUM → kType Batch Bootstrap");
  const modeLabel = dryRun ? "DRY-RUN" : seedOnly ? "SEED-ONLY" : d1Remote ? "LIVE API → REMOTE D1" : d1Local ? "LIVE API → LOCAL D1" : "LIVE API (SQL-only)";
  console.log(`  Modus: ${modeLabel}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Last regnr-liste
  const regnrs = await loadRegnrList();
  if (regnrs.length === 0) {
    console.error("❌ Ingen regnr å prosessere.");
    console.error("   Bruk: node scripts/batch-bootstrap-ktype.mjs <regnr-fil.txt>");
    console.error("   Eller: node scripts/batch-bootstrap-ktype.mjs (for 6 kjente regnre)");
    process.exit(1);
  }

  console.log(`📋 Regnr å prosessere: ${regnrs.length}`);
  console.log(`   ${regnrs.slice(0, 10).join(", ")}${regnrs.length > 10 ? " ..." : ""}\n`);

  if (seedOnly) {
    // Seed fra eksisterende cache uten API-kall
    await seedFromCache(regnrs);
    return;
  }

  // 2. Kjør Bovsoft-batch
  const results = [];
  const errors = [];
  let remainingRequests = 333; // Starter med 333, oppdateres basert på siste Bovsoft-respons

  for (let i = 0; i < regnrs.length; i++) {
    const regnr = regnrs[i];
    process.stdout.write(`[${i + 1}/${regnrs.length}] ${regnr} ... `);

    if (dryRun) {
      console.log("⏭️  DRY-RUN");
      continue;
    }

    try {
      const data = await lookupBovsoft(regnr);

      if (data.status === 200 && data.data?.datacar?.[0]) {
        const car = data.data.datacar[0];
        const entry = {
          regnr,
          ktype: parseInt(car.ktype, 10),
          brand: car.manufCar?.trim() || "",
          model: car.modelCar?.trim() || "",
          yearFrom: car.typeFromYearCar ? parseInt(car.typeFromYearCar) : null,
          yearTo: car.typeToYearCar ? parseInt(car.typeToYearCar) : null,
          body: car.bodyCar?.trim() || "",
          type: car.typeNameCar?.trim() || "",
          vin: car.vin?.trim() || "",
          engineCode: car.engineCodeCar?.trim() || "",
          fuel: car.fuelCar?.trim() || "",
          hp: car.hpCar?.trim() || "",
          kw: car.kwCar?.trim() || "",
          fetchedAt: new Date().toISOString(),
        };
        results.push(entry);
        remainingRequests = car.freeRequests ?? remainingRequests;
        console.log(`✅ kType=${entry.ktype} ${entry.brand} ${entry.model} (${entry.yearFrom})`);
      } else if (data.status === 403) {
        console.log("⛔ Konto ikke bekreftet (403)");
        errors.push({ regnr, error: "account_not_confirmed", status: 403 });
      } else if (data.status === 404 || data.status === 400) {
        console.log("⚠️  Ikke funnet");
        errors.push({ regnr, error: "not_found", status: data.status });
      } else {
        console.log(`❌ Feil: ${data.status} ${data.statusText || data.error || ""}`);
        errors.push({ regnr, error: data.statusText || data.error || "unknown", status: data.status });
      }
    } catch (e) {
      console.log(`💥 Exception: ${e.message}`);
      errors.push({ regnr, error: e.message });
    }

    // Delay mellom kall
    if (i < regnrs.length - 1 && !dryRun) {
      await sleep(DELAY_MS);
    }
  }

  // 3. Lagre råresultater
  const dateStr = new Date().toISOString().slice(0, 10);
  const rawPath = path.join(outputDir, `bovsoft-bootstrap-log-${dateStr}.json`);
  fs.writeFileSync(
    rawPath,
    JSON.stringify({ results, errors, total: regnrs.length, remainingRequests, generatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
  console.log(`\n💾 Rådata lagret: ${rawPath}`);

  // 4. Upsert i glass_rules
  const seededCount = await upsertGlassRules(results);
  console.log(`🌱 Genererte ${seededCount} mappings i glass_rules`);
  if (d1Remote) {
    console.log(`   🌍 Seedet til remote D1`);
  } else if (d1Local) {
    console.log(`   💻 Seedet til lokal D1`);
  } else {
    console.log(`   📝 SQL lagret til: ${path.join(outputDir, "glass-rules-bovsoft-seed.sql")}`);
    console.log(`   Kjør med --remote for å seede remote D1`);
  }

  // 5. Generer rapport
  const report = generateReport(results, errors, regnrs.length, remainingRequests);
  const reportPath = path.join(outputDir, `bovsoft-bootstrap-report-${dateStr}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`📄 Rapport lagret: ${reportPath}`);

  // 6. Oppsummering
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Oppsummering");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`✅ Vellykkede: ${results.length}`);
  console.log(`❌ Feil: ${errors.length}`);
  console.log(`💳 Gjenstående Bovsoft-søk: ~${remainingRequests}`);
  console.log(`🌱 glass_rules seedet: ${seededCount}`);
  console.log(`\nUnike kType funnet: ${[...new Set(results.map((r) => r.ktype))].length}`);

  if (results.length > 0) {
    console.log("\n📊 Topp merker:");
    const brandCounts = {};
    for (const r of results) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
    Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([b, c]) => console.log(`   ${b.padEnd(20)} ${c}`));
  }

  console.log("\n💡 Neste steg:");
  console.log("   1. Samle flere norske regnr for populære modeller");
  console.log("   2. Kjør skriptet på nytt med utvidet regnr-liste");
  console.log("   3. Ved 80%+ dekning av topp 20 merker: vurder deploy");
}

// ── Regnr-liste ───────────────────────────────────────────────────────────

async function loadRegnrList() {
  // Prioritet 1: Fil fra CLI
  if (regnrFile && fs.existsSync(regnrFile)) {
    const text = fs.readFileSync(regnrFile, "utf-8");
    return text
      .split("\n")
      .map((r) => r.trim().toUpperCase())
      .filter((r) => /^[A-Z]{2}\d{4,5}$/.test(r));
  }

  // Prioritet 2: Kjente regnre fra bovsoft-bootstrap-results.json
  const bovsoftPath = path.join(ROOT, "data", "bovsoft-bootstrap-results.json");
  if (fs.existsSync(bovsoftPath)) {
    const data = JSON.parse(fs.readFileSync(bovsoftPath, "utf-8"));
    const known = (data.results || [])
      .map((r) => r.regnr?.trim().toUpperCase())
      .filter((r) => /^[A-Z]{2}\d{4,5}$/.test(r));
    if (known.length > 0) return [...new Set(known)];
  }

  return [];
}

// ── Bovsoft API-kall ──────────────────────────────────────────────────────

async function lookupBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    // Bovsoft kan returnere feilformatert JSON i noen tilfeller
    try {
      return JSON.parse(text);
    } catch {
      return { status: res.status, statusText: res.statusText, raw: text.slice(0, 200) };
    }
  } catch (e) {
    return { status: -1, error: e.message };
  }
}

// ── glass_rules seeding ───────────────────────────────────────────────────

async function upsertGlassRules(results) {
  if (results.length === 0) return 0;

  // Generer SQL
  const lines = [
    "-- Bovsoft batch seed — generert " + new Date().toISOString(),
    "-- Antall mappings: " + results.length,
    "",
  ];

  let seeded = 0;
  for (const r of results) {
    if (!r.ktype || !r.brand || !r.model || !r.yearFrom) continue;

    const normalizedKey = [
      r.brand.toLowerCase().trim().replace(/\s+/g, "_"),
      r.model.toLowerCase().trim().replace(/\s+/g, "_"),
      String(r.yearFrom),
    ].join(":");

    lines.push(`INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)`);
    lines.push(`VALUES ('${normalizedKey}', 'EU', 'windshield', 'default', ${r.ktype}, 0.92, 1, 1, 'bovsoft:${r.regnr}:vin=${r.vin || "unknown"}', datetime('now'), datetime('now'))`);
    lines.push(`ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET`);
    lines.push(`  ktype = excluded.ktype,`);
    lines.push(`  confidence = MAX(excluded.confidence, glass_rules.confidence),`);
    lines.push(`  evidence_count = glass_rules.evidence_count + 1,`);
    lines.push(`  notes = excluded.notes,`);
    lines.push(`  updated_at = datetime('now');`);
    lines.push("");
    seeded++;
  }

  const sqlPath = path.join(outputDir, "glass-rules-bovsoft-seed.sql");
  fs.writeFileSync(sqlPath, lines.join("\n"), "utf-8");

  // Seed til D1
  if (d1Local) {
    try {
      const sqlite3 = await import("better-sqlite3");
      const dbPath = findLocalD1Path();
      if (dbPath) {
        const db = new sqlite3.default(dbPath);
        const insert = db.prepare(`
          INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
          VALUES (?, 'EU', 'windshield', 'default', ?, 0.92, 1, 1, ?, datetime('now'), datetime('now'))
          ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
            ktype = excluded.ktype,
            confidence = MAX(excluded.confidence, glass_rules.confidence),
            evidence_count = glass_rules.evidence_count + 1,
            notes = excluded.notes,
            updated_at = datetime('now')
        `);
        for (const r of results) {
          if (!r.ktype || !r.brand || !r.model || !r.yearFrom) continue;
          const key = [
            r.brand.toLowerCase().trim().replace(/\s+/g, "_"),
            r.model.toLowerCase().trim().replace(/\s+/g, "_"),
            String(r.yearFrom),
          ].join(":");
          try {
            insert.run(key, r.ktype, `bovsoft:${r.regnr}:vin=${r.vin || "unknown"}`);
          } catch (e) {
            // ignore duplicates etc.
          }
        }
        db.close();
        console.log(`   ✅ Seedet til lokal D1: ${dbPath}`);
      }
    } catch (e) {
      console.log(`   ⚠️  Kunne ikke seede lokal D1: ${e.message}`);
    }
  }

  if (d1Remote) {
    try {
      const sqlPath = path.join(outputDir, "glass-rules-bovsoft-seed.sql");
      const wranglerDir = path.join(ROOT, "api", "cf-worker");
      const cmd = `npx wrangler d1 execute glass-catalog-db --remote --file=${sqlPath} --yes`;
      execSync(cmd, { cwd: wranglerDir, stdio: "pipe" });
      console.log(`   ✅ Seedet til remote D1`);
    } catch (e) {
      console.log(`   ❌ Kunne ikke seede remote D1: ${e.message}`);
    }
  }

  return seeded;
}

async function seedFromCache(regnrs) {
  // Les eksisterende resultater og seed uten API-kall
  const bovsoftPath = path.join(ROOT, "data", "bovsoft-bootstrap-results.json");
  if (!fs.existsSync(bovsoftPath)) {
    console.error("❌ Ingen cache funnet. Kjør uten --seed-first.");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(bovsoftPath, "utf-8"));
  const cached = (data.results || []).filter((r) => regnrs.includes(r.regnr?.toUpperCase()));
  console.log(`📦 Fant ${cached.length} cached entries`);
  const seeded = await upsertGlassRules(cached);
  console.log(`🌱 Seedet ${seeded} mappings fra cache`);
}

function findLocalD1Path() {
  const searchPaths = [
    path.join(ROOT, ".wrangler", "state", "v3", "d1"),
    path.join(ROOT, "api", "cf-worker", ".wrangler", "state", "v3", "d1"),
  ];
  for (const base of searchPaths) {
    if (fs.existsSync(base)) {
      const files = fs.readdirSync(base, { recursive: true });
      const sqlite = files.find((f) => f.endsWith(".sqlite"));
      if (sqlite) return path.join(base, sqlite);
    }
  }
  return null;
}

// ── Rapport ───────────────────────────────────────────────────────────────

function generateReport(results, errors, total, remainingRequests) {
  const uniqueKtypes = [...new Set(results.map((r) => r.ktype))];
  const brandCounts = {};
  for (const r of results) {
    if (r.brand) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalProcessed: total,
    successful: results.length,
    failed: errors.length,
    remainingRequests,
    uniqueKtypes: uniqueKtypes.length,
    topBrands: Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    mappings: results.map((r) => ({
      regnr: r.regnr,
      ktype: r.ktype,
      normalizedKey: `${r.brand?.toLowerCase().replace(/\s+/g, "_")}:${r.model?.toLowerCase().replace(/\s+/g, "_")}:${r.yearFrom}`,
      brand: r.brand,
      model: r.model,
      year: r.yearFrom,
      vin: r.vin,
    })),
    errors: errors.map((e) => ({ regnr: e.regnr, error: e.error, status: e.status })),
  };
}

// ── Utils ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Kjør ──────────────────────────────────────────────────────────────────
main().catch((e) => {
  console.error("💥 Fatal feil:", e);
  process.exit(1);
});
