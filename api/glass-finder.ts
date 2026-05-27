/**
 * Autoglass AS — Eksakt Glass Finder (orkestrator)
 * =================================================
 * Kombinerer alle deteksjons-lag og returnerer best mulig match.
 *
 * Flyt:
 *   1. Vehicle lookup (regnr/VIN → kType, brand, model, year)
 *   2. Utstyrsdeteksjon (PR-koder hvis VAG → Biluppgifter OEM2 → statistisk signatur)
 *   3. Prefix4-oppslag fra cache
 *   4. Multikriterie-rangering mot catalog-prod
 *   5. Hvis ikke eksakt match: returner liste med "needs_user_input"
 *
 * Bruk:
 *   await findGlass({ regnr: "AB12345" });
 *   await findGlass({ vin: "WV1ZZZ7HZ5H060934" });
 *   await findGlass({ vin: "WV1...", prCodes: ["4GG", "8N6"] });
 *   await findGlass({ vin: "WV1...", imageUrl: "https://..." });
 */

import * as fs from "fs";
import * as path from "path";
import {
  decodePRCodes, isVAGBrand, extractPRCodesFromText, flagsToCatalogFilter,
  type GlassFlags
} from "./decoders/vag-pr-decoder";
import {
  matchGlass, lookupPrefix4,
  type VehicleSpec, type KnownFlags, type CatalogRecord, type MatchResult
} from "./scoring/match-scorer";
import { identifyGlassFeatures, imageFeaturesToKnownFlags } from "./image-id/image-identifier";

// ============================================================================
// KONFIGURASJON
// ============================================================================

const ROOT = path.resolve(__dirname, "../..");
const CONFIG = {
  CATALOG_PATH: process.env.CATALOG_PATH || path.join(ROOT, "data/catalog-prod.json"),
  PREFIX4_PATH: process.env.PREFIX4_PATH || path.join(ROOT, "data/ktype-prefix4-cache.json"),
  EQUIP_SIG_PATH: process.env.EQUIP_SIG_PATH || path.join(ROOT, "data/equipment-signatures.json"),
  BILUPPGIFTER_API_KEY: process.env.BILUPPGIFTER_API_KEY || "",
  BILUPPGIFTER_BASE: "https://api.biluppgifter.se/api/v1",
};

// Lazy-load
let _catalog: { records: CatalogRecord[] } | null = null;
let _prefix4: any = null;
let _equipSig: any = null;

function getCatalog() {
  if (!_catalog) _catalog = JSON.parse(fs.readFileSync(CONFIG.CATALOG_PATH, "utf-8"));
  return _catalog!;
}
function getPrefix4() {
  if (!_prefix4) _prefix4 = JSON.parse(fs.readFileSync(CONFIG.PREFIX4_PATH, "utf-8"));
  return _prefix4;
}
function getEquipSig() {
  if (!_equipSig) _equipSig = JSON.parse(fs.readFileSync(CONFIG.EQUIP_SIG_PATH, "utf-8"));
  return _equipSig;
}

// ============================================================================
// BILUPPGIFTER WRAPPERS
// ============================================================================

async function fetchVehicleByRegnr(regnr: string): Promise<VehicleSpec> {
  const url = `${CONFIG.BILUPPGIFTER_BASE}/tecdoc/regno/${encodeURIComponent(regnr)}?country_code=NO`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CONFIG.BILUPPGIFTER_API_KEY}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Biluppgifter regnr feil: ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  const v = data.data?.vehicle;
  if (!v) throw new Error("Ingen kjøretøydata returnert");
  return {
    regnr: v.regno, vin: v.vin, kType: v.k_type,
    brand: v.make, model: v.model, year: v.year, bodyType: v.body_type
  };
}

async function fetchEquipmentByVin(vin: string): Promise<{ flags: KnownFlags; prCodes: string[]; raw: any }> {
  const url = `${CONFIG.BILUPPGIFTER_BASE}/oem2/vin/${encodeURIComponent(vin)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CONFIG.BILUPPGIFTER_API_KEY}`, Accept: "application/json" }
    });
    if (!res.ok) return { flags: {}, prCodes: [], raw: null };
    const data = await res.json() as any;
    const equipment = data.data?.vehicle?.equipment || [];

    // Forsøk å trekke ut PR-koder
    const prCodes = new Set<string>();
    const descriptions: string[] = [];
    for (const e of equipment) {
      if (e.code && /^[0-9][A-Z][0-9A-Z]$/.test(e.code)) prCodes.add(e.code);
      if (e.description) {
        descriptions.push(e.description);
        extractPRCodesFromText(e.description).forEach(c => prCodes.add(c));
      }
    }

    // Map keywords i beskrivelser til flagg
    const flags: KnownFlags = {};
    const text = descriptions.join(" ").toLowerCase();
    if (/rain.?sensor|regn.?sensor|regen.?sensor/.test(text)) flags.rainSensor = true;
    if (/acoustic|akustisk|sound.?screen/.test(text)) flags.acoustic = true;
    if (/heated.?windscreen|oppvarmet.?front|beheizt/.test(text)) flags.heated = true;
    if (/lane.?assist|spor.?holder/.test(text)) flags.laneAssist = true;
    if (/head.?up|hud/.test(text)) flags.hud = true;
    if (/camera|kamera/.test(text)) flags.camera = true;
    if (/heat.?reflect|ir.?reflect|climate.?coat|infrarot/.test(text)) flags.heatReflective = true;

    return { flags, prCodes: Array.from(prCodes), raw: equipment };
  } catch {
    return { flags: {}, prCodes: [], raw: null };
  }
}

// ============================================================================
// STATISTISK SIGNATUR
// ============================================================================

function flagsFromSignature(brand: string, model: string, year: number): KnownFlags {
  const sig = getEquipSig();
  const b = brand.toUpperCase();
  const m = model.toUpperCase();
  const keys = [`${b}:${m}:${year}`, `${b}:${m}`];
  for (const key of keys) {
    const entry = sig.brandModelYear?.[key];
    if (!entry) continue;
    const flags: KnownFlags = {};
    for (const [flag, prob] of Object.entries(entry)) {
      if (flag === "count" || typeof prob !== "number") continue;
      if (prob >= 0.85) (flags as any)[flag] = true;
      else if (prob <= 0.05) (flags as any)[flag] = false;
    }
    return flags;
  }
  return {};
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface FindGlassParams {
  regnr?: string;
  vin?: string;
  vehicle?: VehicleSpec;         // bypass Biluppgifter hvis du allerede har data
  prCodes?: string[];             // manuelle PR-koder
  manualFlags?: KnownFlags;       // bruker-spesifiserte flagg
  imageUrl?: string;              // bildebasert deteksjon
  imagePath?: string;
  category?: string;              // default "frontrute"
  skipBiluppgifter?: boolean;     // for testing / offline
}

export interface FindGlassResult {
  match: MatchResult;
  vehicle: VehicleSpec;
  flags: {
    final: KnownFlags;
    sources: {
      prCodes?: GlassFlags;
      biluppgifter?: KnownFlags;
      signature?: KnownFlags;
      image?: KnownFlags;
      manual?: KnownFlags;
    };
  };
  detectionConfidence: number;
}

export async function findGlass(params: FindGlassParams): Promise<FindGlassResult> {
  // 1) Vehicle
  let vehicle: VehicleSpec;
  if (params.vehicle) {
    vehicle = params.vehicle;
  } else if (params.regnr) {
    vehicle = await fetchVehicleByRegnr(params.regnr);
  } else if (params.vin) {
    // VIN-only: vi har ikke regnr, så vi prøver å hente via OEM-endpoint og parse merke ut
    // Eller bruker gir oss vehicle direkte
    throw new Error("VIN-only oppslag krever vehicle-objekt eller regnr. Bruk Biluppgifter VIN-endpoint separat.");
  } else {
    throw new Error("Må gi regnr, vin eller vehicle");
  }

  // 2) Utstyrsdeteksjon — kjør parallelt der mulig
  const sources: any = {};

  // 2a) PR-koder (manuelle)
  if (params.prCodes && params.prCodes.length > 0) {
    const decoded = decodePRCodes(params.prCodes);
    sources.prCodes = decoded.flags;
  }

  // 2b + 2c) Biluppgifter OEM + statistisk signatur (parallelt)
  const [bilupResult, signature] = await Promise.all([
    !params.skipBiluppgifter && vehicle.vin && CONFIG.BILUPPGIFTER_API_KEY
      ? fetchEquipmentByVin(vehicle.vin)
      : Promise.resolve({ flags: {}, prCodes: [], raw: null }),
    vehicle.brand && vehicle.model && vehicle.year
      ? Promise.resolve(flagsFromSignature(vehicle.brand, vehicle.model, vehicle.year))
      : Promise.resolve({}),
  ]);

  if (bilupResult.flags && Object.keys(bilupResult.flags).length > 0) {
    sources.biluppgifter = bilupResult.flags;
  }
  // Hvis Biluppgifter ga oss PR-koder, dekode dem også
  if (bilupResult.prCodes.length > 0 && isVAGBrand(vehicle.brand)) {
    const decoded = decodePRCodes(bilupResult.prCodes);
    sources.prCodes = { ...(sources.prCodes ?? {}), ...decoded.flags };
  }
  if (Object.keys(signature).length > 0) {
    sources.signature = signature;
  }

  // 2d) Bildebasert deteksjon
  if (params.imageUrl || params.imagePath) {
    try {
      const features = await identifyGlassFeatures({
        imageUrl: params.imageUrl,
        imagePath: params.imagePath,
      });
      sources.image = imageFeaturesToKnownFlags(features) as KnownFlags;
    } catch (e: any) {
      console.warn("Bildedeteksjon feilet:", e.message);
    }
  }

  // 2e) Manuelle flagg (har høyest prioritet)
  if (params.manualFlags) sources.manual = params.manualFlags;

  // Slå sammen alle kilder (manual > image > prCodes > biluppgifter > signature)
  const final: KnownFlags = {
    ...(sources.signature ?? {}),
    ...(sources.biluppgifter ?? {}),
    ...(flagsToCatalogFilter(sources.prCodes ?? {}) as KnownFlags),
    ...(sources.image ?? {}),
    ...(sources.manual ?? {}),
  };

  // 3) Prefix4
  const prefix4 = vehicle.brand && vehicle.model
    ? lookupPrefix4(getPrefix4(), vehicle.brand, vehicle.model.split(" ")[0], vehicle.year)
    : undefined;

  // 4) Match
  const match = matchGlass({
    vehicle,
    knownFlags: final,
    prefix4Hint: prefix4,
    candidates: getCatalog().records,
    category: params.category ?? "frontrute",
  });

  // Detection confidence: andel flagg vi vet noe om
  const totalFlagSlots = 10; // FLAG_KEYS.length
  const knownCount = Object.keys(final).filter(k => (final as any)[k] !== undefined).length;
  const detectionConfidence = Math.round((knownCount / totalFlagSlots) * 100) / 100;

  return {
    match,
    vehicle,
    flags: { final, sources },
    detectionConfidence,
  };
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (const a of args) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) argMap[m[1]] = m[2];
  }

  const params: FindGlassParams = {
    regnr: argMap.regnr,
    vin: argMap.vin,
  };

  if (argMap.prCodes) params.prCodes = argMap.prCodes.split(",");
  if (argMap.image) params.imageUrl = argMap.image;
  if (argMap.skipBiluppgifter) params.skipBiluppgifter = true;

  findGlass(params)
    .then(r => {
      console.log("\n=== KJØRETØY ===");
      console.log(JSON.stringify(r.vehicle, null, 2));
      console.log("\n=== FLAGG ===");
      console.log("Final:", JSON.stringify(r.flags.final, null, 2));
      console.log("Detection confidence:", r.detectionConfidence);
      console.log("\n=== MATCH ===");
      console.log("Exact match:", r.match.exact_match);
      console.log("Total kandidater:", r.match.total_candidates);
      console.log("Trenger input:", r.match.needs_user_input);
      console.log("\nTop 3 kandidater:");
      for (const c of r.match.alternatives.slice(0, 3)) {
        console.log(`  ${c.score.toFixed(1).padStart(5)}  ${c.record.eurocode.padEnd(15)} ${c.record.supplier?.padEnd(15)} ${c.record.description.substring(0, 60)}`);
      }
    })
    .catch(err => {
      console.error("Feil:", err.message);
      process.exit(1);
    });
}
