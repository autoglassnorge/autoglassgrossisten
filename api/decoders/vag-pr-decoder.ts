/**
 * Autoglass AS — VAG PR-kode-dekoder
 * ===================================
 * Konverterer VW/Audi/Skoda/Seat PR-koder → glassrelevante utstyrsflagg.
 *
 * Kilde: data/decoders/vag-pr-codes.json (kuratert fra vdveer-engineering.nl)
 *
 * Bruk:
 *   import { decodePRCodes, isVAGBrand } from "./vag-pr-decoder";
 *   const flags = decodePRCodes(["4GG", "8N6", "QV1"]);
 *   // → { laminated: true, shade: true, heated: true, rainSensor: true,
 *   //     lightSensor: true, laneAssist: true, camera: true }
 *
 * PR-koder kan hentes fra:
 *   - Klistremerke under teppe i bagasjerom (T5/T6: dashbord-undersiden)
 *   - Servicehefte side 2-3
 *   - OBD/VCDS scan
 *   - Biluppgifter OEM2 API hvis tilgjengelig
 *   - VAG ETKA / erWin (betalt)
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPER
// ============================================================================

export interface GlassFlags {
  // Frontrute-spesifikt
  laminated?: boolean;
  heatReflective?: boolean;
  heated?: boolean;
  shade?: boolean;            // solstripe øverst
  vinWindow?: boolean;        // lite vindu med VIN
  // Sensorer
  rainSensor?: boolean;
  lightSensor?: boolean;
  camera?: boolean;
  // ADAS
  adas?: boolean;
  laneAssist?: boolean;
  hud?: boolean;
  // Lyd
  acoustic?: boolean;
  // Sideruter (sjelden relevant for frontrute-match, men nyttig kontekst)
  tinted?: boolean;
  privacyGlass?: boolean;
  sidesLaminated?: boolean;
  sidesHeatReflective?: boolean;
  blueTint?: boolean;
  burglaryResistant?: boolean;
  // Spesialtilfeller
  plastic?: boolean;
  missing?: boolean;
  category?: string;
}

interface PRCodeEntry {
  description: string;
  flags: GlassFlags;
}

interface PRCodeDatabase {
  meta: { version: string; source: string; scope: string; lastUpdated: string };
  families: Record<string, { name: string; codes: Record<string, PRCodeEntry> }>;
  compatibility: Record<string, string[]>;
}

// ============================================================================
// LASTING
// ============================================================================

const DB_PATH = process.env.VAG_PR_DB
  || path.join(__dirname, "../../data/decoders/vag-pr-codes.json");

let _db: PRCodeDatabase | null = null;

function loadDB(): PRCodeDatabase {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`VAG PR-database ikke funnet: ${DB_PATH}`);
  }
  _db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  return _db!;
}

// Bygg flat lookup ved init (raskere enn å traversere families ved hver request)
let _flatLookup: Map<string, PRCodeEntry> | null = null;
function flatLookup(): Map<string, PRCodeEntry> {
  if (_flatLookup) return _flatLookup;
  const db = loadDB();
  _flatLookup = new Map();
  for (const family of Object.values(db.families)) {
    for (const [code, entry] of Object.entries(family.codes)) {
      _flatLookup.set(code.toUpperCase(), entry);
    }
  }
  return _flatLookup;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface DecodeResult {
  flags: GlassFlags;
  matched: Array<{ code: string; description: string }>;
  unknown: string[];
  confidence: number; // 0-1, basert på antall gjenkjente glass-relevante koder
}

/**
 * Konverter liste av PR-koder til konsoliderte glass-flagg.
 * Tar OR over alle treff (hvis 4GG sier shade:true vinner det over 4GL som ikke nevner det).
 */
export function decodePRCodes(codes: string[]): DecodeResult {
  const lookup = flatLookup();
  const flags: GlassFlags = {};
  const matched: Array<{ code: string; description: string }> = [];
  const unknown: string[] = [];

  for (const rawCode of codes) {
    const code = rawCode.trim().toUpperCase();
    if (!code) continue;
    const entry = lookup.get(code);
    if (!entry) {
      unknown.push(code);
      continue;
    }
    matched.push({ code, description: entry.description });
    // Merge flagg (OR for boolean, sist vinner for string)
    for (const [k, v] of Object.entries(entry.flags)) {
      if (typeof v === "boolean") {
        (flags as any)[k] = (flags as any)[k] || v;
      } else if (v !== undefined && v !== null) {
        (flags as any)[k] = v;
      }
    }
  }

  // Konfidens: 1.0 hvis vi har minst én 4G-kode (frontrute eksplisitt definert)
  const has4G = matched.some(m => m.code.startsWith("4G"));
  const has8N = matched.some(m => m.code.startsWith("8N"));
  let confidence = 0;
  if (has4G) confidence += 0.6;
  if (has8N) confidence += 0.3;
  if (matched.length > 0) confidence += 0.1;
  confidence = Math.min(confidence, 1);

  return { flags, matched, unknown, confidence };
}

/**
 * Sjekker om et merke er en VAG-merke (PR-koder gjelder kun for disse).
 */
export function isVAGBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  const db = loadDB();
  const normalized = brand.trim().toUpperCase();
  for (const variants of Object.values(db.compatibility)) {
    if (variants.includes(normalized)) return true;
  }
  return false;
}

/**
 * Trekk ut PR-kode-kandidater fra fritekst (f.eks. Biluppgifter equipment.description).
 * Matcher mønstre som "PR-4GG", "4GG", "PR 8N6".
 */
export function extractPRCodesFromText(text: string): string[] {
  if (!text) return [];
  const pattern = /\b(?:PR[- ]?)?([0-9][A-Z][0-9A-Z])\b/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text.toUpperCase())) !== null) {
    found.add(m[1]);
  }
  return Array.from(found);
}

/**
 * Mapper VAG-flagg til catalog-prod GlassRecord-flagg (samme nøkler).
 * Brukes for å matche mot eurokoder direkte i scoring-funksjonen.
 */
export function flagsToCatalogFilter(flags: GlassFlags): {
  rainSensor?: boolean;
  acoustic?: boolean;
  heated?: boolean;
  shade?: boolean;
  camera?: boolean;
  laneAssist?: boolean;
  adas?: boolean;
  hud?: boolean;
  antenna?: boolean;
} {
  return {
    rainSensor: flags.rainSensor,
    acoustic: flags.acoustic,
    heated: flags.heated,
    shade: flags.shade,
    camera: flags.camera,
    laneAssist: flags.laneAssist,
    adas: flags.adas || flags.camera || flags.laneAssist,
    hud: flags.hud,
  };
}

// ============================================================================
// CLI for testing
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Bruk: ts-node vag-pr-decoder.ts <PR-kode> [<PR-kode> ...]");
    console.log("Eksempel: ts-node vag-pr-decoder.ts 4GG 8N6 QV1");
    process.exit(1);
  }
  const result = decodePRCodes(args);
  console.log(JSON.stringify(result, null, 2));
}
