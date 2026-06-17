#!/usr/bin/env node
/**
 * Build a Bovsoft/SVV kType ↔ TecDoc 1Q2019 kType crosswalk.
 *
 * Sources:
 *   - Bovsoft kTypes: data/finn-no-regnr/bovsoft-v2-ktype-inserts.sql
 *                     data/finn-no-regnr/generated-ktype-inserts.sql
 *   - TecDoc vehicles: data/tecdoc-import/tecdoc-ktype-mapping.json
 *
 * Output:
 *   - data/ktype-crosswalk.sql     (INSERT statements for ktype_crosswalk)
 *   - data/ktype-crosswalk-report.json
 *
 * The mapping is isolated; it does NOT affect production search until manually
 * verified.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT_SQL = path.join(ROOT, "data", "ktype-crosswalk.sql");
const OUT_REPORT = path.join(ROOT, "data", "ktype-crosswalk-report.json");

function normalizeModel(model) {
  if (!model) return "";
  // Remove chassis codes in parentheses, then normalize whitespace/punctuation
  return model
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // remove (8TA), (F53), etc.
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

function normalizeBrand(brand) {
  if (!brand) return "";
  const b = brand.toLowerCase().trim();
  if (b === "mercedes-benz") return "mercedes";
  if (b === "vw") return "volkswagen";
  return b;
}

const BODY_SUBTYPE_WORDS = new Set([
  "sportback",
  "avant",
  "estate",
  "kombi",
  "stasjonsvogn",
  "variant",
  "sedan",
  "limousine",
  "saloon",
  "cabriolet",
  "convertible",
  "allroad",
  "coupe",
  "crossover",
  "suv",
  "hatchback",
  "monospace",
  "van",
  "pickup",
]);

const BODY_SYNONYMS = {
  limousine: "sedan",
  saloon: "sedan",
  kombi: "estate",
  stasjonsvogn: "estate",
  variant: "estate",
  cabriolet: "convertible",
};

function normalizeSubtype(token) {
  return BODY_SYNONYMS[token] || token;
}

function extractFamilyTokens(model) {
  const tokens = normalizeModel(model)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const bases = [];
  const subtypes = new Set();
  for (const token of tokens) {
    if (BODY_SUBTYPE_WORDS.has(token)) {
      subtypes.add(normalizeSubtype(token));
    } else if (/^[a-z]+\d*[a-z]?$/.test(token)) {
      // e.g. "a5", "s5", "rs5", "gti", "m3"
      bases.push(token);
    }
  }
  return { bases, subtypes: Array.from(subtypes) };
}

function parseYear(y) {
  if (!y || y === null || y === undefined) return null;
  const n = Number(y);
  if (Number.isNaN(n)) return null;
  if (n > 100000) return Math.floor(n / 100); // e.g. 200909 -> 2009
  return n;
}

function yearsOverlap(fromA, toA, fromB, toB) {
  const a1 = parseYear(fromA) || 1900;
  const a2 = parseYear(toA) || 2100;
  const b1 = parseYear(fromB) || 1900;
  const b2 = parseYear(toB) || 2100;
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

function yearToMonth(y) {
  if (!y || y === null || y === undefined) return null;
  const s = String(y);
  const year = Number(s.slice(0, 4));
  const month = s.length >= 6 ? Number(s.slice(4, 6)) : 1;
  if (Number.isNaN(year)) return null;
  return year * 12 + (Number.isNaN(month) ? 0 : month - 1);
}

function yearOverlapMonths(fromA, toA, fromB, toB) {
  const a1 = yearToMonth(fromA) || 1900 * 12;
  const a2 = yearToMonth(toA) || 2100 * 12;
  const b1 = yearToMonth(fromB) || 1900 * 12;
  const b2 = yearToMonth(toB) || 2100 * 12;
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function parseKtypeRegistrySql(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const regex = /INSERT INTO ktype_registry \(ktype, brand, model, year_from, year_to, body, source\) VALUES \((\d+),\s*'([^']*)',\s*'([^']*)',\s*(\d+|NULL),\s*(\d+|NULL),\s*'([^']*)',\s*'([^']*)'\)/gi;
  const entries = [];
  let m;
  while ((m = regex.exec(sql)) !== null) {
    entries.push({
      ktype: Number(m[1]),
      brand: m[2],
      model: m[3],
      year_from: m[4] === "NULL" ? null : Number(m[4]),
      year_to: m[5] === "NULL" ? null : Number(m[5]),
      body: m[6],
      source: m[7],
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

  // Group by ktype; derive year range from candidate years.
  const byKtype = new Map();
  for (const r of results) {
    let entry = byKtype.get(r.ktype);
    if (!entry) {
      // fullModel is like "MERCEDES-BENZ V-CLASS (W447)"
      const m = r.fullModel.match(/^\S+\s+(.+)$/);
      const model = m ? m[1] : r.fullModel;
      entry = {
        ktype: r.ktype,
        brand: r.brand,
        model,
        year_from: null,
        year_to: null,
        body: "",
        source: "bovsoft_strategic",
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

function loadBovsoftEntries() {
  const entries = [];
  const files = [
    path.join(ROOT, "data", "finn-no-regnr", "bovsoft-v2-ktype-inserts.sql"),
    path.join(ROOT, "data", "finn-no-regnr", "generated-ktype-inserts.sql"),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) {
      entries.push(...parseKtypeRegistrySql(file));
    }
  }
  entries.push(...loadStrategicBovsoftEntries());

  // Deduplicate by ktype, preferring bovsoft_v2 over finn_bovsoft over strategic
  const sourceRank = { bovsoft_v2: 0, finn_bovsoft: 1, bovsoft_strategic: 2 };
  const byKtype = new Map();
  for (const e of entries) {
    const existing = byKtype.get(e.ktype);
    if (!existing || sourceRank[e.source] < sourceRank[existing.source]) {
      byKtype.set(e.ktype, e);
    }
  }
  return Array.from(byKtype.values());
}

function loadTecdocEntries() {
  const file = path.join(ROOT, "data", "tecdoc-import", "tecdoc-ktype-mapping.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.map((r) => ({
    ktype: Number(r.ktype),
    brand: r.brand,
    model: r.model,
    year_from: r.year_from,
    year_to: r.year_to,
  }));
}

function familyMatches(bovModel, tecModel) {
  const bov = extractFamilyTokens(bovModel);
  const tec = extractFamilyTokens(tecModel);
  if (bov.bases.length === 0 || tec.bases.length === 0) return false;

  // Require an exact base-model match (e.g. "a5" == "a5", not "a5" startsWith "a1")
  const baseOverlap = bov.bases.some((bb) => tec.bases.includes(bb));
  if (!baseOverlap) return false;

  // If either side carries a canonical body subtype, require subtype overlap.
  // This prevents "A5 (8T3)" from matching "A5 Sportback (8TA)".
  const bovHasSubtype = bov.subtypes.length > 0;
  const tecHasSubtype = tec.subtypes.length > 0;
  if (bovHasSubtype || tecHasSubtype) {
    const subtypeOverlap = bov.subtypes.some((bs) => tec.subtypes.includes(bs));
    if (!subtypeOverlap) return false;
  }

  // If Bovsoft carries chassis codes, require at least one to appear in TecDoc.
  const bovChassis = extractChassisCodes(bovModel);
  if (bovChassis.length > 0) {
    const tecChassis = extractChassisCodes(tecModel);
    const chassisOverlap =
      tecChassis.length === 0 || bovChassis.some((bc) => tecChassis.includes(bc));
    if (!chassisOverlap) return false;
  }

  return true;
}

function buildCrosswalk(bovsoftEntries, tecdocEntries) {
  const byTecdoc = new Map();
  for (const t of tecdocEntries) {
    if (!byTecdoc.has(t.ktype)) byTecdoc.set(t.ktype, []);
    byTecdoc.get(t.ktype).push(t);
  }

  const byBrandModel = new Map();
  for (const t of tecdocEntries) {
    const key = `${normalizeBrand(t.brand)}:${normalizeModel(t.model)}`;
    if (!byBrandModel.has(key)) byBrandModel.set(key, []);
    byBrandModel.get(key).push(t);
  }

  const results = [];
  const stats = { total: 0, unique: 0, collision: 0, no_match: 0 };

  for (const bov of bovsoftEntries) {
    stats.total++;
    const bovBrand = normalizeBrand(bov.brand);
    const bovModelNorm = normalizeModel(bov.model);
    const key = `${bovBrand}:${bovModelNorm}`;

    const candidates = [];
    for (const t of tecdocEntries) {
      if (normalizeBrand(t.brand) !== bovBrand) continue;
      if (!familyMatches(bov.model, t.model)) continue;
      if (!yearsOverlap(bov.year_from, bov.year_to, t.year_from, t.year_to)) continue;
      candidates.push(t);
    }

    let confidence = 0;
    let tag = "no_match";
    let evidence = {};
    let chosen = null;

    if (candidates.length >= 1) {
      // Group by exact TecDoc model string (incl. chassis code) to collapse
      // engine variants into a single vehicle signature.
      const groups = new Map();
      for (const t of candidates) {
        const key = `${normalizeBrand(t.brand)}:${t.model}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      }
      const groupList = Array.from(groups.values());

      if (groupList.length === 1) {
        chosen = groupList[0][0];
        confidence = 0.95;
        tag = "unique";
        evidence = {
          bov_model: bov.model,
          tec_model: chosen.model,
          year_overlap: true,
        };
      } else {
        // Pick the group whose year range has the largest overlap with Bovsoft.
        let bestGroup = groupList[0];
        let bestOverlap = -1;
        for (const g of groupList) {
          const t = g[0];
          const overlap = yearOverlapMonths(bov.year_from, bov.year_to, t.year_from, t.year_to);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestGroup = g;
          }
        }
        chosen = bestGroup[0];
        confidence = 0.3;
        tag = "collision";
        evidence = {
          bov_model: bov.model,
          tec_models: Array.from(groups.keys()),
          chosen_model: chosen.model,
          count: candidates.length,
          group_count: groupList.length,
        };
      }

      results.push({
        bovsoft_ktype: bov.ktype,
        tecdoc_ktype: chosen.ktype,
        vehicle_signature: `${bovBrand}:${normalizeModel(bov.model)}:${parseYear(bov.year_from) || "?"}-${parseYear(bov.year_to) || "?"}`,
        match_evidence: JSON.stringify(evidence),
        confidence,
        verified: tag === "unique" ? 1 : 0,
        source: "bovsoft",
      });
      if (tag === "unique") stats.unique++;
      else stats.collision++;
    } else {
      stats.no_match++;
    }
  }

  return { results, stats };
}

function writeOutputs(crosswalk, stats) {
  const sql = [
    "-- ktype_crosswalk generated by scripts/build-ktype-crosswalk.mjs",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Bovsoft entries: ${stats.total}, unique: ${stats.unique}, collision: ${stats.collision}, no_match: ${stats.no_match}`,
    "DELETE FROM ktype_crosswalk WHERE source = 'bovsoft';",
    ...crosswalk.map(
      (r) =>
        `INSERT INTO ktype_crosswalk (bovsoft_ktype, tecdoc_ktype, vehicle_signature, match_evidence, confidence, verified, source) VALUES (${r.bovsoft_ktype}, ${r.tecdoc_ktype}, '${r.vehicle_signature.replace(/'/g, "''")}', '${r.match_evidence.replace(/'/g, "''")}', ${r.confidence.toFixed(2)}, ${r.verified}, '${r.source}') ON CONFLICT(bovsoft_ktype, tecdoc_ktype) DO UPDATE SET vehicle_signature = excluded.vehicle_signature, match_evidence = excluded.match_evidence, confidence = excluded.confidence, verified = excluded.verified, source = excluded.source;`
    ),
  ].join("\n");

  fs.writeFileSync(OUT_SQL, sql + "\n");
  fs.writeFileSync(
    OUT_REPORT,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        stats,
        unique_mappings: crosswalk.filter((r) => r.confidence >= 0.95).length,
        collision_mappings: crosswalk.filter((r) => r.confidence < 0.95 && r.confidence > 0).length,
        sample: crosswalk.slice(0, 10),
      },
      null,
      2
    ) + "\n"
  );
}

function main() {
  console.log("Loading Bovsoft kType registry entries...");
  const bovsoft = loadBovsoftEntries();
  console.log(`  ${bovsoft.length} unique Bovsoft kTypes`);

  console.log("Loading TecDoc 1Q2019 vehicles...");
  const tecdoc = loadTecdocEntries();
  console.log(`  ${tecdoc.length} TecDoc entries`);

  console.log("Building crosswalk...");
  const { results, stats } = buildCrosswalk(bovsoft, tecdoc);

  console.log("Writing outputs...");
  writeOutputs(results, stats);

  console.log(`\nResults:`);
  console.log(`  Total Bovsoft kTypes: ${stats.total}`);
  console.log(`  Unique matches:       ${stats.unique}`);
  console.log(`  Collisions:           ${stats.collision}`);
  console.log(`  No match:             ${stats.no_match}`);
  console.log(`  SQL written to:       ${OUT_SQL}`);
  console.log(`  Report written to:    ${OUT_REPORT}`);
}

main();
