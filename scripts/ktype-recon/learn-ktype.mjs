#!/usr/bin/env node
/**
 * Fase 5: Selvlærende kType Inference
 * =====================================
 * Lærer av eksisterende kType-mappings og infererer kType for
 * nye kjøretøy basert på brand+model+year+body.
 *
 * Strategi:
 * 1. Les seed-data (verifiserte kType fra D1/Bovsoft)
 * 2. Bygg lookup-tabell: brand → model → year → kType
 * 3. For nye kjøretøy: finn nærmeste match
 * 4. Støtter fuzzy matching på modellnavn
 * 5. Confidence basert på avstand i år og modell-likhet
 *
 * Usage:
 *   node learn-ktype.mjs --seed <verified-bovsoft.ndjson>
 *   node learn-ktype.mjs --seed <seed.ndjson> --predict <vehicles.ndjson>
 *   node learn-ktype.mjs --seed <seed.ndjson> --regnr SU18018 --brand VW --model Transporter --year 2005
 */

import { readFileSync, writeFileSync } from "fs";

// === Normalisering ===
function normalizeBrand(brand) {
  const b = (brand || "").toUpperCase().trim();
  const map = {
    VOLKSWAGEN: "VW", "VW TRUCKS": "VW", "VW": "VW",
    "MERCEDES-BENZ": "MERCEDES", "MERCEDES BENZ": "MERCEDES",
    "LAND ROVER": "LANDROVER",
  };
  return map[b] || b;
}

function normalizeModel(model) {
  return (model || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelSimilarity(a, b) {
  const na = normalizeModel(a);
  const nb = normalizeModel(b);
  if (na === nb) return 1.0;
  // Jaccard similarity on word tokens
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const intersection = new Set([...ta].filter(x => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

// === Learner ===
class KtypeLearner {
  constructor() {
    this.seeds = []; // {ktype, brand, model, yearFrom, yearTo, body}
  }

  loadFromNdjson(path) {
    const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      const r = JSON.parse(line);
      this.addSeed({
        ktype: r.ktype,
        brand: r.brand || r.manufCar,
        model: r.model || r.modelCar,
        yearFrom: r.yearFrom || r.typeFromYearCar || r.year_from,
        yearTo: r.yearTo || r.typeToYearCar || r.year_to,
        body: r.body || r.bodyCar,
        source: r.source || "seed",
      });
    }
  }

  loadFromRegistry(path) {
    // SQL INSERT format parsing
    const text = readFileSync(path, "utf-8");
    const regex = /VALUES \((\d+),\s*'([^']+)',\s*'([^']+)',\s*(\d+|NULL),\s*(\d+|NULL),\s*'([^']*)',/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      this.addSeed({
        ktype: parseInt(m[1], 10),
        brand: m[2],
        model: m[3],
        yearFrom: m[4] === "NULL" ? null : parseInt(m[4], 10),
        yearTo: m[5] === "NULL" ? null : parseInt(m[5], 10),
        body: m[6],
        source: "registry",
      });
    }
  }

  addSeed(seed) {
    if (!seed.ktype || !seed.brand) return;
    // Parse yearFrom/yearTo — kan være "200808" (yyyymm) eller 2008
    let yf = seed.yearFrom;
    let yt = seed.yearTo;
    if (typeof yf === "string" && yf.length === 6) yf = parseInt(yf.slice(0, 4), 10);
    else if (typeof yf === "string") yf = parseInt(yf, 10);
    if (typeof yt === "string" && yt.length === 6) yt = parseInt(yt.slice(0, 4), 10);
    else if (typeof yt === "string") yt = parseInt(yt, 10);

    this.seeds.push({
      ...seed,
      yearFrom: yf,
      yearTo: yt,
      normBrand: normalizeBrand(seed.brand),
      normModel: normalizeModel(seed.model),
    });
  }

  predict(vehicle) {
    const { brand, model, year, body } = vehicle;
    const targetBrand = normalizeBrand(brand);
    const targetModel = normalizeModel(model);

    // Find candidates
    const candidates = [];
    for (const s of this.seeds) {
      if (s.normBrand !== targetBrand) continue;

      const sim = modelSimilarity(s.normModel, targetModel);
      if (sim < 0.3) continue; // Too different

      // Year overlap
      const yearOverlap = year && s.yearFrom && s.yearTo
        ? Math.max(0, Math.min(year, s.yearTo) - Math.max(year, s.yearFrom) + 1)
        : 0;
      const yearDistance = year && s.yearFrom
        ? Math.abs(year - s.yearFrom)
        : 999;

      // Body match
      const bodyMatch = body && s.body
        ? body.toLowerCase() === s.body.toLowerCase()
        : false;

      candidates.push({
        ...s,
        modelSim: sim,
        yearOverlap,
        yearDistance,
        bodyMatch,
      });
    }

    if (candidates.length === 0) {
      return { predicted: false, reason: "no_candidates" };
    }

    // Score candidates
    for (const c of candidates) {
      c.score =
        c.modelSim * 40 +
        (c.yearOverlap > 0 ? 30 : 0) +
        (c.yearDistance <= 2 ? 20 : c.yearDistance <= 5 ? 10 : 0) +
        (c.bodyMatch ? 10 : 0);
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // Confidence
    let confidence;
    if (best.score >= 80 && best.yearOverlap > 0) confidence = "high";
    else if (best.score >= 50) confidence = "medium";
    else if (best.score >= 30) confidence = "low";
    else confidence = "none";

    return {
      predicted: confidence !== "none",
      ktype: best.ktype,
      confidence,
      score: best.score,
      matchedSeed: {
        brand: best.brand,
        model: best.model,
        yearFrom: best.yearFrom,
        yearTo: best.yearTo,
        body: best.body,
      },
      candidates: candidates.slice(0, 3),
    };
  }
}

// === CLI ===
async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const seedPath = getArg("--seed") || "data/finn-no-regnr/verified-bovsoft.ndjson";
  const predictPath = getArg("--predict");

  const learner = new KtypeLearner();

  if (seedPath.endsWith(".sql")) {
    learner.loadFromRegistry(seedPath);
  } else {
    learner.loadFromNdjson(seedPath);
  }

  console.log(`📚 Lastet ${learner.seeds.length} seed-kType`);
  console.log(`   Merker: ${[...new Set(learner.seeds.map(s => s.normBrand))].join(", ")}`);

  // Single prediction
  const regnr = getArg("--regnr");
  const brand = getArg("--brand");
  const model = getArg("--model");
  const year = getArg("--year") ? parseInt(getArg("--year"), 10) : undefined;
  const body = getArg("--body");

  if (brand || regnr) {
    const result = learner.predict({ brand, model, year, body });
    console.log(`\n🔮 Prediksjon for ${brand} ${model} (${year}):`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Batch prediction
  if (predictPath) {
    const lines = readFileSync(predictPath, "utf-8").split("\n").filter(Boolean);
    const vehicles = lines.map(l => JSON.parse(l));

    console.log(`\n🔮 Predikerer kType for ${vehicles.length} kjøretøy...`);
    const predictions = [];
    let hit = 0, miss = 0;

    for (const v of vehicles) {
      const result = learner.predict({
        brand: v.brand || v.make || v.vpic?.make,
        model: v.model || v.vpic?.model,
        year: v.year || v.vpic?.year,
        body: v.body || v.vpic?.body,
      });
      predictions.push({ ...v, prediction: result });
      if (result.predicted) hit++; else miss++;
    }

    const outFile = predictPath.replace(/\.ndjson$/, "-predicted.ndjson");
    writeFileSync(outFile, predictions.map(r => JSON.stringify(r)).join("\n") + "\n");

    console.log(`✅ Ferdig: ${hit} treff, ${miss} bom`);
    console.log(`   Output: ${outFile}`);

    // Summary by brand
    const byBrand = {};
    for (const p of predictions) {
      if (p.prediction.predicted) {
        const b = normalizeBrand(p.brand || p.make || "UNKNOWN");
        byBrand[b] = (byBrand[b] || 0) + 1;
      }
    }
    console.log(`\n   Treff per merke:`);
    for (const [b, c] of Object.entries(byBrand).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${b}: ${c}`);
    }
    return;
  }

  console.log(`Usage:
  node learn-ktype.mjs --seed <verified-bovsoft.ndjson>
  node learn-ktype.mjs --seed <seed.ndjson> --predict <vehicles.ndjson>
  node learn-ktype.mjs --seed <seed.ndjson> --brand VW --model Transporter --year 2005`);
  process.exit(1);
}

main().catch(console.error);
