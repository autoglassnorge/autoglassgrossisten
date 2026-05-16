/**
 * Autoglass AS — Glass Lookup Pipeline
 * ====================================
 * Flyt: regnr → Biluppgifter TecDoc → kType → prefix4 → eurokode
 *
 * Kjøring:
 *   BILUPPGIFTER_API_KEY=xxx npx ts-node glass-lookup.ts --regnr=AB12345
 *   BILUPPGIFTER_API_KEY=xxx npx ts-node glass-lookup.ts --vin=WVWZZZ...
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// KONFIGURASJON
// ============================================================================

const CONFIG = {
  BILUPPGIFTER_API_KEY: process.env.BILUPPGIFTER_API_KEY || "",
  BILUPPGIFTER_BASE: "https://api.biluppgifter.se/api/v1",
  CATALOG_PATH: process.env.CATALOG_PATH || path.join(__dirname, "../../data/mock-katalog.json"),
  PREFIX4_CACHE_PATH: process.env.PREFIX4_CACHE || path.join(__dirname, "../../data/ktype-prefix4-cache.json"),
};

// ============================================================================
// TYPER
// ============================================================================

interface CatalogData {
  meta: { totalRecords: number; exportedAt: string };
  records: GlassRecord[];
}

interface GlassRecord {
  eurocode: string;
  articleNumber: string;
  scanNumber: string | null;
  category: string;
  supplier: string | null;
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
  price: number | null;
  stockStatus: number;
  warehouseLocation: string | null;
  oemNumbers: string[];
  crossReferences: string[];
  weight: number | null;
  dimensions: { width: number | null; height: number | null; thickness: number | null };
  description: string;
  prefix4: string;
  imageUrl: string | null;
  pdfUrl: string | null;
  source: string;
  lastUpdated: string;
}

interface BiluppgifterTecdocResponse {
  data: {
    vehicle: {
      regno: string;
      vin: string;
      make: string;
      model: string;
      year: number;
      k_type: number; // kType / kTypeId
      body_type?: string;
      fuel?: string;
      engine_code?: string;
    };
  };
}

interface BiluppgifterOemResponse {
  data: {
    vehicle: {
      vin: string;
      equipment?: Array<{
        code: string;
        description: string;
      }>;
    };
  };
}

interface Prefix4Cache {
  [kType: number]: {
    prefix4: string;
    brand: string;
    model: string;
    yearFrom: number;
    yearTo: number;
  };
}

// ============================================================================
// DATA LASTING
// ============================================================================

let _catalog: CatalogData | null = null;
let _prefixCache: Prefix4Cache | null = null;

function loadCatalog(): CatalogData {
  if (_catalog) return _catalog;
  const raw = fs.readFileSync(CONFIG.CATALOG_PATH, "utf-8");
  _catalog = JSON.parse(raw) as CatalogData;
  return _catalog;
}

function loadPrefixCache(): Prefix4Cache {
  if (_prefixCache) return _prefixCache;
  if (!fs.existsSync(CONFIG.PREFIX4_CACHE_PATH)) return {};
  const raw = fs.readFileSync(CONFIG.PREFIX4_CACHE_PATH, "utf-8");
  _prefixCache = JSON.parse(raw) as Prefix4Cache;
  return _prefixCache;
}

// ============================================================================
// API-KALL
// ============================================================================

async function fetchTecdoc(regnr: string): Promise<BiluppgifterTecdocResponse["data"]["vehicle"]> {
  const url = `${CONFIG.BILUPPGIFTER_BASE}/tecdoc/regno/${encodeURIComponent(regnr)}?country_code=NO`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${CONFIG.BILUPPGIFTER_API_KEY}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Biluppgifter TecDoc feil: ${response.status} ${err}`);
  }

  const data = (await response.json()) as BiluppgifterTecdocResponse;
  return data.data.vehicle;
}

async function fetchOemFlags(vin: string): Promise<string[]> {
  const url = `${CONFIG.BILUPPGIFTER_BASE}/oem2/vin/${encodeURIComponent(vin)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${CONFIG.BILUPPGIFTER_API_KEY}`,
        "Accept": "application/json",
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as BiluppgifterOemResponse;
    return (data.data?.vehicle?.equipment || []).map((e) => e.description.toLowerCase());
  } catch {
    return [];
  }
}

// ============================================================================
// LOGIKK: regnr → kType → prefix4 → kandidater
// ============================================================================

interface LookupResult {
  vehicle: {
    regnr: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    kType: number;
  };
  candidates: GlassRecord[];
  confidence: "high" | "medium" | "low" | "none";
  layer: 1 | 2 | 3 | 4; // se nedenfor
  flags: {
    adas: boolean;
    rainSensor: boolean;
    heated: boolean;
    acoustic: boolean;
    antenna: boolean;
    hud: boolean;
  };
  sources: string[];
}

/**
 * LAG-STRUKTUR (konfidens):
 *   Lag 1: prefix4 + år + merke + modell = eksakt match
 *   Lag 2: prefix4 + år + merke = god match (kan være facelift)
 *   Lag 3: prefix4 + merke = sannsynlig match (sjekk år)
 *   Lag 4: prefix4 = uklart (flere mulig, krever VIN-flagg)
 */
async function lookup(regnr: string): Promise<LookupResult> {
  const catalog = loadCatalog();
  const prefixCache = loadPrefixCache();

  // Steg 1: regnr → TecDoc
  const vehicle = await fetchTecdoc(regnr);
  const kType = vehicle.k_type;

  // Steg 2: Hent VIN-flagg parallelt
  const oemDescriptions = await fetchOemFlags(vehicle.vin);

  const detectedFlags = {
    adas: oemDescriptions.some((d) => /adas|camera|sensor|kamera|filskifte|lane|collision/i.test(d)),
    rainSensor: oemDescriptions.some((d) => /rain|regn|wipe|vindusspor/i.test(d)),
    heated: oemDescriptions.some((d) => /heat|oppvarm|varme|defrost/i.test(d)),
    acoustic: oemDescriptions.some((d) => /acoustic|akustisk|quiet|støydemp/i.test(d)),
    antenna: oemDescriptions.some((d) => /antenna|antenne|radio|fm|dab/i.test(d)),
    hud: oemDescriptions.some((d) => /hud|head.up|projeksjon/i.test(d)),
  };

  // Steg 3: kType → prefix4
  let prefix4: string | null = null;

  // 3a: Sjekk lokal cache
  if (prefixCache[kType]) {
    prefix4 = prefixCache[kType].prefix4;
  }

  // 3b: Finn prefix4 fra katalog (mest vanlige for denne kType)
  if (!prefix4) {
    const matchingByYear = catalog.records.filter((r) => {
      if (!r.brand || !r.yearFrom) return false;
      const brandMatch = r.brand.toLowerCase() === vehicle.make.toLowerCase();
      const yearMatch = r.yearFrom <= vehicle.year && (r.yearTo === null || r.yearTo >= vehicle.year);
      return brandMatch && yearMatch;
    });

    if (matchingByYear.length > 0) {
      // Velg mest vanlige prefix4
      const freq: Record<string, number> = {};
      for (const r of matchingByYear) freq[r.prefix4] = (freq[r.prefix4] || 0) + 1;
      prefix4 = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
  }

  // Steg 4: Finn kandidater
  let candidates: GlassRecord[] = [];
  let layer: 1 | 2 | 3 | 4 = 4;
  let confidence: LookupResult["confidence"] = "none";

  if (prefix4) {
    // Filtrer på prefix4
    candidates = catalog.records.filter((r) => r.prefix4 === prefix4);

    // Lag 1: eksakt (år + merke + modell)
    const l1 = candidates.filter((r) => {
      const brandMatch = r.brand?.toLowerCase() === vehicle.make.toLowerCase();
      const modelMatch = r.model && vehicle.model.toLowerCase().includes(r.model.toLowerCase());
      const yearMatch = r.yearFrom && r.yearFrom <= vehicle.year && (r.yearTo === null || r.yearTo >= vehicle.year);
      return brandMatch && modelMatch && yearMatch;
    });

    if (l1.length > 0) {
      candidates = l1;
      layer = 1;
      confidence = "high";
    } else {
      // Lag 2: prefix4 + år + merke
      const l2 = candidates.filter((r) => {
        const brandMatch = r.brand?.toLowerCase() === vehicle.make.toLowerCase();
        const yearMatch = r.yearFrom && r.yearFrom <= vehicle.year && (r.yearTo === null || r.yearTo >= vehicle.year);
        return brandMatch && yearMatch;
      });

      if (l2.length > 0) {
        candidates = l2;
        layer = 2;
        confidence = "medium";
      } else {
        // Lag 3: prefix4 + merke
        const l3 = candidates.filter((r) => r.brand?.toLowerCase() === vehicle.make.toLowerCase());
        if (l3.length > 0) {
          candidates = l3;
          layer = 3;
          confidence = "medium";
        } else {
          layer = 4;
          confidence = "low";
        }
      }
    }

    // Score kandidater basert på VIN-flagg
    candidates = scoreByFlags(candidates, detectedFlags);
  }

  // Bygg resultat
  const sources = ["biluppgifter.tecdoc"];
  if (oemDescriptions.length > 0) sources.push("biluppgifter.oem");
  if (prefixCache[kType]) sources.push("ktype-prefix4-cache");

  return {
    vehicle: {
      regnr: vehicle.regno,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      kType,
    },
    candidates,
    confidence: candidates.length > 0 ? confidence : "none",
    layer,
    flags: detectedFlags,
    sources,
  };
}

/** Score kandidater etter hvor godt de matcher VIN-flagg */
function scoreByFlags(candidates: GlassRecord[], flags: LookupResult["flags"]): GlassRecord[] {
  const scored = candidates.map((c) => {
    let score = 0;
    if (flags.adas && c.adas) score += 10;
    if (flags.rainSensor && c.rainSensor) score += 8;
    if (flags.heated && c.heated) score += 6;
    if (flags.acoustic && c.acoustic) score += 4;
    if (flags.antenna && c.antenna) score += 4;
    if (flags.hud && c.hud) score += 6;
    // Hvis flagg er false men kandidat har true, trekk litt
    if (!flags.adas && c.adas) score -= 3;
    if (!flags.hud && c.hud) score -= 2;
    return { record: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.record);
}

// ============================================================================
// CLI
// ============================================================================

function printResult(result: LookupResult) {
  console.log("\n🔍 Søkeresultat");
  console.log("===============");
  console.log(`Kjøretøy:  ${result.vehicle.make} ${result.vehicle.model} (${result.vehicle.year})`);
  console.log(`Regnr:     ${result.vehicle.regnr}`);
  console.log(`VIN:       ${result.vehicle.vin}`);
  console.log(`kType:     ${result.vehicle.kType}`);
  console.log(`Kilder:    ${result.sources.join(", ")}`);
  console.log(`
Konfidens: ${result.confidence.toUpperCase()} (Lag ${result.layer})`);
  console.log(`Utstyr:    ADAS=${result.flags.adas ? "✅" : "❌"} | Regn=${result.flags.rainSensor ? "✅" : "❌"} | Oppv.=${result.flags.heated ? "✅" : "❌"} | Akust.=${result.flags.acoustic ? "✅" : "❌"} | Ant.=${result.flags.antenna ? "✅" : "❌"} | HUD=${result.flags.hud ? "✅" : "❌"}`);

  if (result.candidates.length === 0) {
    console.log("\n❌ Ingen treff i katalogen.");
    return;
  }

  console.log(`\n📦 ${result.candidates.length} kandidat(er):\n`);
  for (let i = 0; i < Math.min(result.candidates.length, 10); i++) {
    const c = result.candidates[i];
    const flags = [
      c.adas && "ADAS",
      c.rainSensor && "REGN",
      c.heated && "OPPV",
      c.acoustic && "AKUST",
      c.antenna && "ANT",
      c.hud && "HUD",
      c.shade && "SOLSTR",
    ].filter(Boolean).join(" | ");

    console.log(`${i + 1}. ${c.eurocode} — ${c.description.slice(0, 60)}`);
    console.log(`   Merke: ${c.brand || "?"} ${c.model || ""} | År: ${c.yearFrom || "?"}-${c.yearTo || ""}`);
    console.log(`   Pris: ${c.price ?? "?"} kr | Lager: ${c.stockStatus} stk`);
    if (flags) console.log(`   Flag: ${flags}`);
    if (c.oemNumbers.length > 0) console.log(`   OEM:  ${c.oemNumbers.join(", ")}`);
    console.log("");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const regnrIdx = args.findIndex((a) => a.startsWith("--regnr="));
  const vinIdx = args.findIndex((a) => a.startsWith("--vin="));

  if (regnrIdx === -1 && vinIdx === -1) {
    console.log("Bruk:");
    console.log("  npx ts-node glass-lookup.ts --regnr=AB12345");
    console.log("  npx ts-node glass-lookup.ts --vin=WVWZZZ...");
    process.exit(0);
  }

  if (!CONFIG.BILUPPGIFTER_API_KEY) {
    console.error("❌ Sett BILUPPGIFTER_API_KEY miljøvariabel");
    process.exit(1);
  }

  try {
    if (regnrIdx !== -1) {
      const regnr = args[regnrIdx].split("=")[1];
      const result = await lookup(regnr);
      printResult(result);
    }
    // VIN-lookup kan utvides senere
  } catch (err) {
    console.error("❌ Feil:", err);
    process.exit(1);
  }
}

main();
