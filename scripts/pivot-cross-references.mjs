#!/usr/bin/env node
/**
 * pivot-cross-references.mjs
 * ==========================
 * Bygger inferred mappings fra eksisterende glass_catalog-data via
 * OEM-nummer og cross-references. Skriver resultater til scrape_results.
 *
 * Strategi:
 *   1. Les glass_catalog.oem_numbers (JSON-array) → bygg OE → eurocode mapping
 *   2. Finn produkter som deler samme OE-nummer → inferer relasjoner
 *   3. Cross-references: URL-parsing for brand/model/year signaler
 *   4. Skriv alt til scrape_results med confidence 0.50 (pivot/inferred)
 *
 * Bruk:
 *   node scripts/pivot-cross-references.mjs
 *   node scripts/pivot-cross-references.mjs --dry-run
 */

import { execSync } from "child_process";

const dryRun = process.argv.includes("--dry-run");

// ── Hovedflyt ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Pivot Cross-References");
  console.log(`  Modus: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Les glass_catalog fra D1
  const catalog = await d1Query(`
    SELECT id, eurocode, brand, model, year_from, year_to, oem_numbers, cross_references
    FROM glass_catalog
    WHERE (oem_numbers IS NOT NULL AND oem_numbers != '[]')
       OR (cross_references IS NOT NULL AND cross_references != '[]')
  `);

  const rows = catalog.results || [];
  console.log(`📋 Produkter med OE/cross-ref: ${rows.length}`);

  if (rows.length === 0) {
    console.log("⚠️  Ingen produkter med OE-numre eller cross-references funnet.");
    console.log("   Pivot gir ingen verdi ennå — kjør etter at scrape-kilder har populeret data.");
    return;
  }

  // 2. Bygg OE → eurocode(s) graf
  const oeToEurocodes = new Map(); // oeNumber → Set(eurocodes)
  let oeCount = 0;

  for (const row of rows) {
    const oemList = safeJsonParse(row.oem_numbers);
    for (const oe of oemList) {
      const cleanOe = cleanOeNumber(oe);
      if (!cleanOe) continue;
      if (!oeToEurocodes.has(cleanOe)) oeToEurocodes.set(cleanOe, new Set());
      oeToEurocodes.get(cleanOe).add(row.eurocode);
      oeCount++;
    }
  }

  console.log(`   Unike OE-numre: ${oeToEurocodes.size}`);
  console.log(`   Totale OE-relasjoner: ${oeCount}`);

  // 3. Finn OE-numre som mapper til flere eurocodes (inferred relasjoner)
  const inferred = [];
  for (const [oe, eurocodes] of oeToEurocodes) {
    if (eurocodes.size >= 2) {
      const euroList = [...eurocodes];
      for (let i = 0; i < euroList.length; i++) {
        for (let j = i + 1; j < euroList.length; j++) {
          inferred.push({
            oe_number: oe,
            eurocode_a: euroList[i],
            eurocode_b: euroList[j],
            confidence: 0.50 + Math.min(euroList.length - 2, 3) * 0.05,
          });
        }
      }
    }
  }

  console.log(`   Inferred relasjoner: ${inferred.length}`);

  // 4. Parse cross-references for brand/model/year signaler
  const crossRefSignals = [];
  for (const row of rows) {
    const refs = safeJsonParse(row.cross_references);
    for (const url of refs) {
      const parsed = parseAutoGlassUrl(url);
      if (parsed) {
        crossRefSignals.push({
          eurocode: row.eurocode,
          brand: parsed.brand,
          model: parsed.model,
          year: parsed.year,
          source_url: url,
        });
      }
    }
  }

  console.log(`   Cross-ref signaler: ${crossRefSignals.length}`);

  // 5. Lag scrape_job
  if (!dryRun) {
    const jobResult = await d1Query(`
      INSERT INTO scrape_jobs (job_type, status, params, started_at, completed_at)
      VALUES ('pivot_crossref', 'running', '{"source":"internal_catalog"}', datetime('now'), datetime('now'))
      RETURNING id
    `);
    const jobId = jobResult.results?.[0]?.id || 0;

    // 6. Skriv inferred til scrape_results
    let written = 0;
    for (const rel of inferred) {
      await d1Query(`
        INSERT INTO scrape_results (job_id, source, eurocode, oem_number, confidence, status, raw_payload)
        VALUES (${jobId}, 'pivot', '${rel.eurocode_a}', '${rel.oe_number}', ${rel.confidence}, 'raw',
                '${JSON.stringify({ inferred_eurocode: rel.eurocode_b, shared_oe: rel.oe_number })}')
      `);
      written++;
    }

    // 7. Skriv cross-ref signaler
    for (const sig of crossRefSignals) {
      await d1Query(`
        INSERT INTO scrape_results (job_id, source, eurocode, make, model, year, confidence, status, raw_payload)
        VALUES (${jobId}, 'pivot', '${sig.eurocode}', '${escapeSql(sig.brand)}', '${escapeSql(sig.model)}', ${sig.year || 'NULL'}, 0.40, 'raw',
                '${JSON.stringify({ source_url: sig.source_url })}')
      `);
      written++;
    }

    // 8. Oppdater jobb
    await d1Query(`
      UPDATE scrape_jobs
      SET status = 'completed', items_found = ${written}, items_valid = ${written}, items_written = ${written}
      WHERE id = ${jobId}
    `);

    console.log(`\n✅ Lagret ${written} rader i scrape_results (job_id=${jobId}).`);
  } else {
    console.log(`\n📊 Dry-run: ${inferred.length} inferred + ${crossRefSignals.length} cross-ref signaler.`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function safeJsonParse(str) {
  try {
    const parsed = JSON.parse(str || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanOeNumber(oe) {
  if (!oe) return null;
  const s = String(oe).trim();
  // Filtrer ut interne numre som "GlavistaNumber:..."
  if (s.toLowerCase().includes('glavistanumber') || s.toLowerCase().includes('pilkingtonnumber')) return null;
  // Ta bare ren numerisk/alfanumerisk
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.length >= 5 ? cleaned : null;
}

function parseAutoGlassUrl(url) {
  // https://auto-glass.no/varer/nettbutikk/autoglass/bmw/x4/2014-x4/
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // Forventer: ['varer','nettbutikk','autoglass',BRAND,MODEL,YEAR-MODEL]
    if (parts.length < 6) return null;
    const brand = parts[3];
    const model = parts[4];
    const yearPart = parts[5];
    const yearMatch = yearPart.match(/^(\d{4})/);
    return {
      brand: decodeURIComponent(brand || ''),
      model: decodeURIComponent(model || ''),
      year: yearMatch ? parseInt(yearMatch[1], 10) : null,
    };
  } catch {
    return null;
  }
}

function escapeSql(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "''");
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
