#!/usr/bin/env node
/**
 * Verify a sample of the Bovsoft↔TecDoc kType crosswalk by comparing
 * brand / model / year range on both sides.
 *
 * Sources:
 *   - Crosswalk: data/ktype-crosswalk.sql
 *   - Bovsoft registry: data/finn-no-regnr/*.sql + .kimi/mempalace/bovsoft-strategic-*.json
 *   - TecDoc mapping: data/tecdoc-import/tecdoc-ktype-mapping.json
 *
 * Output:
 *   - data/ktype-crosswalk-verification.json
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const CROSSWALK_SQL = path.join(ROOT, "data", "ktype-crosswalk.sql");
const OUT_REPORT = path.join(ROOT, "data", "ktype-crosswalk-verification.json");
const SAMPLE_SIZE = 50;

function parseKtypeRegistrySql(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const regex =
    /INSERT INTO ktype_registry \(ktype, brand, model, year_from, year_to, body, source\) VALUES \((\d+),\s*'([^']*)',\s*'([^']*)',\s*(\d+|NULL),\s*(\d+|NULL),\s*'([^']*)',\s*'([^']*)'\)/gi;
  const entries = [];
  let m;
  while ((m = regex.exec(sql)) !== null) {
    entries.push({
      ktype: Number(m[1]),
      brand: m[2],
      model: m[3],
      year_from: m[4] === "NULL" ? null : Number(m[4]),
      year_to: m[5] === "NULL" ? null : Number(m[5]),
    });
  }
  return entries;
}

function loadStrategicBovsoftEntries() {
  const resultsFile = path.join(ROOT, ".kimi", "mempalace", "bovsoft-strategic-results.json");
  const candidatesFile = path.join(ROOT, ".kimi", "mempalace", "bovsoft-strategic-candidates.json");
  if (!fs.existsSync(resultsFile) || !fs.existsSync(candidatesFile)) return [];

  const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  const candidates = JSON.parse(fs.readFileSync(candidatesFile, "utf8"));
  const yearByRegnr = new Map(candidates.map((c) => [c.regnr, c.year]));

  const byKtype = new Map();
  for (const r of results) {
    let entry = byKtype.get(r.ktype);
    if (!entry) {
      const m = r.fullModel.match(/^\S+\s+(.+)$/);
      const model = m ? m[1] : r.fullModel;
      entry = {
        ktype: r.ktype,
        brand: r.brand,
        model,
        year_from: null,
        year_to: null,
      };
      byKtype.set(r.ktype, entry);
    }
    const year = yearByRegnr.get(r.regnr);
    if (year) {
      if (entry.year_from === null || year < entry.year_from) entry.year_from = year;
      if (entry.year_to === null || year > entry.year_to) entry.year_to = year;
    }
  }
  return Array.from(byKtype.values());
}

function loadBovsoftRegistry() {
  const entries = [];
  const files = [
    path.join(ROOT, "data", "finn-no-regnr", "bovsoft-v2-ktype-inserts.sql"),
    path.join(ROOT, "data", "finn-no-regnr", "generated-ktype-inserts.sql"),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) entries.push(...parseKtypeRegistrySql(file));
  }
  entries.push(...loadStrategicBovsoftEntries());
  const byKtype = new Map();
  for (const e of entries) byKtype.set(e.ktype, e);
  return byKtype;
}

function loadTecdocMapping() {
  const file = path.join(ROOT, "data", "tecdoc-import", "tecdoc-ktype-mapping.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const byKtype = new Map();
  for (const r of raw) byKtype.set(Number(r.ktype), r);
  return byKtype;
}

function parseYear(y) {
  if (!y || y === null || y === undefined) return null;
  const n = Number(y);
  if (Number.isNaN(n)) return null;
  if (n > 100000) return Math.floor(n / 100);
  return n;
}

function normalizeBrand(brand) {
  if (!brand) return "";
  const b = brand.toLowerCase().trim();
  if (b === "mercedes-benz") return "mercedes";
  if (b === "vw") return "volkswagen";
  return b;
}

function normalizeModel(model) {
  if (!model) return "";
  return model
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChassisCodes(model) {
  if (!model) return [];
  const codes = [];
  const regex = /\(([^)]*)\)/g;
  let m;
  while ((m = regex.exec(model)) !== null) {
    const parts = m[1]
      .toLowerCase()
      .split(/[,\s]+/)
      .map((p) => p.replace(/[^a-z0-9]/g, ""))
      .filter((p) => p.length > 0);
    codes.push(...parts);
  }
  return codes;
}

function yearsOverlap(fromA, toA, fromB, toB) {
  const a1 = parseYear(fromA) || 1900;
  const a2 = parseYear(toA) || 2100;
  const b1 = parseYear(fromB) || 1900;
  const b2 = parseYear(toB) || 2100;
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

function verifyPair(row, bov, tec) {
  const issues = [];

  const brandMatch = normalizeBrand(bov.brand) === normalizeBrand(tec.brand);
  if (!brandMatch) issues.push("brand mismatch");

  const bovCodes = extractChassisCodes(bov.model);
  const tecCodes = extractChassisCodes(tec.model);
  const chassisMatch =
    bovCodes.length === 0 || bovCodes.some((c) => tecCodes.includes(c));
  if (!chassisMatch) issues.push("chassis code mismatch");

  const bovNorm = normalizeModel(bov.model);
  const tecNorm = normalizeModel(tec.model);
  const baseMatch =
    bovNorm.split(/\s+/).some((token) => tecNorm.split(/\s+/).includes(token)) ||
    tecNorm.split(/\s+/).some((token) => bovNorm.split(/\s+/).includes(token));
  if (!baseMatch) issues.push("model token mismatch");

  const yearMatch = yearsOverlap(bov.year_from, bov.year_to, tec.year_from, tec.year_to);
  if (!yearMatch) issues.push("year range mismatch");

  return {
    ok: issues.length === 0,
    issues,
    bov_model: bov.model,
    tec_model: tec.model,
    bov_year: `${parseYear(bov.year_from) || "?"}-${parseYear(bov.year_to) || "?"}`,
    tec_year: `${parseYear(tec.year_from) || "?"}-${parseYear(tec.year_to) || "?"}`,
  };
}

function parseCrosswalkSql(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const regex =
    /INSERT INTO ktype_crosswalk \(bovsoft_ktype, tecdoc_ktype, vehicle_signature, match_evidence, confidence, verified, source\) VALUES \((\d+), (\d+), '((?:[^']|'')*)', '((?:[^']|'')*)', ([\d.]+), (\d+), '([^']*)'\)/g;
  const rows = [];
  let m;
  while ((m = regex.exec(sql)) !== null) {
    rows.push({
      bovsoft_ktype: Number(m[1]),
      tecdoc_ktype: Number(m[2]),
      vehicle_signature: m[3],
      confidence: parseFloat(m[5]),
      verified: Number(m[6]),
      source: m[7],
    });
  }
  return rows;
}

function sampleRows(rows, n) {
  const unique = rows.filter((r) => r.verified === 1);
  if (unique.length <= n) return unique;
  const shuffled = unique.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function main() {
  console.log("Loading crosswalk...");
  const crosswalk = parseCrosswalkSql(CROSSWALK_SQL);
  console.log(`  ${crosswalk.length} rows, ${crosswalk.filter((r) => r.verified === 1).length} unique`);

  console.log("Loading Bovsoft registry...");
  const bovRegistry = loadBovsoftRegistry();

  console.log("Loading TecDoc mapping...");
  const tecMapping = loadTecdocMapping();

  const sample = sampleRows(crosswalk, SAMPLE_SIZE);
  console.log(`Verifying sample of ${sample.length} unique mappings...`);

  const results = [];
  let okCount = 0;
  for (const row of sample) {
    const bov = bovRegistry.get(row.bovsoft_ktype);
    const tec = tecMapping.get(row.tecdoc_ktype);
    let verdict;
    if (!bov || !tec) {
      verdict = { ok: false, issues: [bov ? "missing tecdoc" : "missing bovsoft"] };
    } else {
      verdict = verifyPair(row, bov, tec);
    }
    if (verdict.ok) okCount++;
    results.push({
      bovsoft_ktype: row.bovsoft_ktype,
      tecdoc_ktype: row.tecdoc_ktype,
      signature: row.vehicle_signature,
      ...verdict,
    });
  }

  const precision = sample.length > 0 ? okCount / sample.length : 0;
  const report = {
    generated_at: new Date().toISOString(),
    sample_size: sample.length,
    ok: okCount,
    failed: sample.length - okCount,
    precision: Number(precision.toFixed(4)),
    results,
  };

  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nVerification result:`);
  console.log(`  Sample size: ${sample.length}`);
  console.log(`  OK:          ${okCount}`);
  console.log(`  Failed:      ${sample.length - okCount}`);
  console.log(`  Precision:   ${(precision * 100).toFixed(2)}%`);
  console.log(`  Report:      ${OUT_REPORT}`);
}

main();
