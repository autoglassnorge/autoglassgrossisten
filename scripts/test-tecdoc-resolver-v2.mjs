/**
 * Test-suite v2 for TecDoc D1 resolver logic
 * Tests the same scoring algorithm as the Worker code.
 */

import fs from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";

function extractChassisCodes(text) {
  const codes = [];
  const m1 = text.match(/\b([A-Z]\d{1,3}[A-Z]?)\b/g);
  if (m1) codes.push(...m1);
  const m2 = text.match(/\b(\d[A-Z]\d{1,2})\b/g);
  if (m2) codes.push(...m2);
  const m3 = text.match(/\b(V?I{1,3}|IV|VI{1,3}|IX|X{1,3})\b/gi);
  if (m3) codes.push(...m3.map((r) => r.toUpperCase()));
  return codes;
}

async function loadRows() {
  const rows = [];
  const rl = createInterface({
    input: createReadStream("data/tecdoc-import/passengercars.csv"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const c = line.split("\t");
    if (c.length < 10) continue;
    const yf = c[5]?.match(/(\d{4})/)?.[1] ? parseInt(c[5].match(/(\d{4})/)[1]) : null;
    const yt = c[6]?.match(/(\d{4})/)?.[1] ? parseInt(c[6].match(/(\d{4})/)[1]) : null;
    rows.push({ ktype: parseInt(c[1], 10), brand: c[3]?.trim(), model: c[8]?.trim(), year_from: yf, year_to: yt });
  }
  return rows;
}

function resolveTecDoc(rows, make, model, year) {
  if (!make || !model) return null;

  const candidates = rows.filter((r) => {
    if (r.brand?.toUpperCase() !== make.toUpperCase()) return false;
    if (year && year > 1900) {
      if (r.year_from && year < r.year_from - 1) return false;
      if (r.year_to && r.year_to > 0 && year > r.year_to + 1) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  const queryNorm = model.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const queryTokens = new Set(queryNorm.split(/\s+/).filter((t) => t.length >= 1));
  const queryChassis = new Set(extractChassisCodes(model));

  let bestKtype = 0;
  let bestScore = 0;

  for (const row of candidates) {
    const rowNorm = row.model.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const rowTokens = new Set(rowNorm.split(/\s+/).filter((t) => t.length >= 1));
    const rowChassis = new Set(extractChassisCodes(row.model));

    if (rowTokens.size === 0) continue;

    let score = 0;
    score += 0.10; // brand

    if (queryChassis.size > 0 && rowChassis.size > 0) {
      let commonChassis = 0;
      for (const c of queryChassis) {
        if (rowChassis.has(c)) commonChassis++;
      }
      if (commonChassis > 0) score += 0.40;
    }

    if (queryNorm.length >= 2 && rowNorm.includes(queryNorm)) {
      score += 0.35;
    } else if (rowNorm.length >= 2 && queryNorm.includes(rowNorm)) {
      score += 0.25;
    }

    let common = 0;
    for (const t of queryTokens) {
      if (rowTokens.has(t)) common++;
    }
    const tokenScore = queryTokens.size <= 2 ? common / queryTokens.size : common / Math.max(queryTokens.size, rowTokens.size);
    if (tokenScore >= 0.5) score += 0.20;
    else if (tokenScore >= 0.3) score += 0.10;
    else if (tokenScore > 0) score += 0.05;

    if (year && year > 1900) {
      const yf = row.year_from ?? 0;
      const yt = row.year_to ?? 9999;
      if (year >= yf - 1 && year <= yt + 1) score += 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      bestKtype = row.ktype;
    }
  }

  if (bestScore < 0.35) return null;
  const confidence = bestScore >= 0.80 ? 0.90 : bestScore >= 0.60 ? 0.80 : bestScore >= 0.45 ? 0.70 : 0.60;
  return { ktype: bestKtype, confidence, score: bestScore };
}

async function main() {
  console.log("📂 Loading TecDoc passenger cars...");
  const rows = await loadRows();
  console.log(`   Loaded ${rows.length.toLocaleString()} rows\n`);

  const tests = [
    { make: "VW", model: "GOLF VII", year: 2015, expectedKtype: 44286 },
    { make: "BMW", model: "3", year: 2012, expectedKtype: 23196 },
    { make: "MERCEDES-BENZ", model: "C-CLASS", year: 2015, expectedKtype: 27303 },
    { make: "AUDI", model: "A4", year: 2010, expectedKtype: 28586 },
    { make: "FORD", model: "MUSTANG", year: 2020, expectedKtype: null },
    { make: "TOYOTA", model: "COROLLA", year: 2018, expectedKtype: null },
    { make: "NISSAN", model: "JUKE", year: 2015, expectedKtype: null },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const result = resolveTecDoc(rows, t.make, t.model, t.year);
    const ktypeStr = result ? result.ktype : "null";
    const confStr = result ? result.confidence.toFixed(2) : "-";
    const scoreStr = result ? result.score.toFixed(2) : "-";
    const ok = (result && result.ktype === t.expectedKtype) || (!result && !t.expectedKtype);
    const status = ok ? "✅" : "❌";
    console.log(`${status} ${t.make} ${t.model} ${t.year} → kType=${ktypeStr} conf=${confStr} score=${scoreStr} (expected: ${t.expectedKtype || "no match"})`);
    if (ok) passed++; else failed++;
  }

  console.log(`\n📊 Results: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
