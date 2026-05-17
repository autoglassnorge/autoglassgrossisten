/**
 * Parse MyGrant PDFs → NAGS JSON
 * ================================
 * MyGrant "New Parts Release" PDFer inneholder tabeller med:
 *   NAGS-kode | Beskrivelse (år, kjøretøy, features) | Merke
 *
 * Denne parseren konverterer PDFene til JSON som matcher
 * eksisterende NAGS-format i data/nags-*.json
 *
 * Kjøring:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' api/scrapers/parse-mygrant-pdfs.ts
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

interface NagsRecord {
  nagsCode: string;
  suffix: string | null;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  glassType: string;
  features: string[];
  brandCode: string;
  source: string;
}

const PDF_DIRS = [
  "data/mygrant-2023",
  "data/mygrant-backfill",
  "data/mygrant-pdfs",
  "data/mygrant-pdfs-more",
];

const OUTPUT_DIR = "data";

// Brand-kodemapping (observasjon fra PDFer)
const BRAND_CODE_MAP: Record<string, string> = {
  FYG: "Fuyao",
  GBY: "Fuyao",
  GTY: "Fuyao",
  GBN: "Fuyao",
  GTN: "Fuyao",
  GGY: "Guardian",
  // MyGrant selv distribuerer glass fra mange produsenter
};

// Hovedprodusent per brandCode (fallback)
function resolveBrand(code: string): string {
  return BRAND_CODE_MAP[code.toUpperCase()] || code;
}

// Glass-type fra NAGS-prefix
function detectGlassType(nagsCode: string): string {
  const prefix = nagsCode.substring(0, 2).toUpperCase();
  const map: Record<string, string> = {
    FW: "frontrute",
    DW: "frontrute",
    FD: "frontrute",
    DD: "frontrute",
    SW: "siderute",
    SG: "siderute",
    DG: "siderute",
    QG: "siderute",
    BG: "bakrute",
    BW: "bakrute",
    RG: "bakrute",
    RS: "bakrute",
    TW: "frontrute",   // Truck windscreen
    TS: "siderute",    // Truck side
    TB: "bakrute",     // Truck back
    TD: "siderute",    // Truck door
  };
  return map[prefix] || "ukjent";
}

// Parse år fra beskrivelse: "23- ", "2023-2024", "2014-2024 Maserati..."
function parseYear(desc: string): { yearFrom: number | null; yearTo: number | null; cleanDesc: string } {
  // Mønster 1: "2014-2024 Maserati..." (4-sifret range ved start)
  const m1 = desc.match(/^(\d{4})\s*[-–]\s*(\d{4})\s+/);
  if (m1) {
    return {
      yearFrom: parseInt(m1[1]),
      yearTo: parseInt(m1[2]),
      cleanDesc: desc.replace(/^\d{4}\s*[-–]\s*\d{4}\s+/, ""),
    };
  }

  // Mønster 2: "2023-2024" (uten mellomrom etter)
  const m2 = desc.match(/^(\d{4})\s*[-–]\s*(\d{4})/);
  if (m2) {
    return {
      yearFrom: parseInt(m2[1]),
      yearTo: parseInt(m2[2]),
      cleanDesc: desc.replace(/^\d{4}\s*[-–]\s*\d{4}\s*/, ""),
    };
  }

  // Mønster 3: "23- " i starten (2-sifret år)
  const m3 = desc.match(/^(\d{2})[-\s]/);
  if (m3) {
    const yr = parseInt(m3[1]);
    const fullYear = yr >= 50 ? 1900 + yr : 2000 + yr;
    return {
      yearFrom: fullYear,
      yearTo: null,
      cleanDesc: desc.replace(/^\d{2}[-\s]+/, ""),
    };
  }

  // Mønster 4: "2023 " alene (4-sifret)
  const m4 = desc.match(/^(\d{4})[-\s]/);
  if (m4) {
    return {
      yearFrom: parseInt(m4[1]),
      yearTo: null,
      cleanDesc: desc.replace(/^\d{4}[-\s]+/, ""),
    };
  }

  return { yearFrom: null, yearTo: null, cleanDesc: desc };
}

// Kjente multi-ord merker
const MULTI_WORD_MAKES = [
  "ALFA ROMEO", "ALFA-ROMEO", "LAND ROVER", "LAND-ROVER",
  "ROLLS ROYCE", "ROLLS-ROYCE", "ASTON MARTIN", "ASTON-MARTIN",
  "GREAT WALL", "GREAT-WALL", "MERCEDES BENZ", "MERCEDES-BENZ",
];

// Parse merke/modell fra beskrivelse (allerede renset for år)
function parseVehicle(cleanDesc: string): { make: string; model: string } {
  const parenIdx = cleanDesc.indexOf("(");
  const beforeParen = parenIdx > 0 ? cleanDesc.substring(0, parenIdx).trim() : cleanDesc.trim();

  // Sjekk multi-ord merker først
  const upper = beforeParen.toUpperCase();
  for (const mw of MULTI_WORD_MAKES) {
    if (upper.startsWith(mw)) {
      const make = mw.replace(/-/g, " ");
      const model = beforeParen.substring(mw.length).trim().replace(/^[-\s]+/, "");
      return { make, model: model || "UNKNOWN" };
    }
  }

  // Standard: første ord = merke, resten = modell
  const tokens = beforeParen.split(/\s+/);
  if (tokens.length >= 2) {
    const make = tokens[0].toUpperCase();
    const model = tokens.slice(1).join(" ").replace(/^[-\s]+/, "");
    return { make, model: model || "UNKNOWN" };
  }

  return { make: "UKJENT", model: beforeParen };
}

// Parse features fra parentes
function parseFeatures(desc: string): string[] {
  const match = desc.match(/\(([^)]+)\)/);
  if (!match) return [];

  const raw = match[1];
  // Splitt på komma, men vær forsiktig med nested parenteser
  return raw
    .split(/,\s*/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !f.startsWith("see"));
}

function parsePdf(pdfPath: string): NagsRecord[] {
  const records: NagsRecord[] = [];
  const source = `mygrant-pdf-${path.basename(pdfPath, ".pdf")}`;

  let text: string;
  try {
    text = execSync(`pdftotext "${pdfPath}" -`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    console.error(`  ❌ pdftotext feilet for ${pdfPath}: ${(e as Error).message}`);
    return [];
  }

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // MyGrant PDF-tabeller har typisk:
  //   NAGS-kode (f.eks. "DW02995 GTY")
  //   Beskrivelse (kan være over flere linjer)
  //   Brand (f.eks. "FYG")
  //
  // Strategi: Finn linjer som starter med NAGS-mønster, deretter
  // les fram til neste NAGS-linje eller brand-linje.

  const NAGS_PATTERN = /^([A-Z]{1,2}\d{3,6})(?:\s+([A-Z]{2,3}))?$/;
  const BRAND_PATTERN = /^(FYG|GBY|GTY|GBN|GTN|GGY|FGY|BGY)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nagsMatch = line.match(NAGS_PATTERN);
    if (!nagsMatch) continue;

    const nagsCode = nagsMatch[1];
    const suffix = nagsMatch[2] || null;

    // Les beskrivelse (neste 1-5 linjer)
    let descLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && j < i + 8) {
      const nextLine = lines[j];
      // Stopp hvis vi treffer ny NAGS-kode
      if (nextLine.match(NAGS_PATTERN)) break;
      // Stopp hvis vi treffer brand-kode alene
      if (nextLine.match(BRAND_PATTERN) && nextLine.length <= 5) {
        // Dette er brand-linjen, ikke en del av beskrivelsen
        break;
      }
      descLines.push(nextLine);
      j++;
    }

    const description = descLines.join(" ").trim();
    if (!description || description.length < 5) continue;

    // Prøv å finne brand på linje j
    let brandCode = "UNKNOWN";
    if (j < lines.length && lines[j].match(BRAND_PATTERN)) {
      brandCode = lines[j];
    }

    const { yearFrom, yearTo, cleanDesc } = parseYear(description);
    const { make, model } = parseVehicle(cleanDesc);
    const features = parseFeatures(description);
    const glassType = detectGlassType(nagsCode);

    records.push({
      nagsCode,
      suffix,
      make,
      model,
      yearFrom,
      yearTo,
      glassType,
      features,
      brandCode,
      source,
    });

    // Hopp til slutten av denne posten
    i = j;
  }

  return records;
}

function main() {
  console.log("📄 Parse MyGrant PDFs → NAGS JSON");
  console.log("==================================\n");

  const allRecords: NagsRecord[] = [];

  for (const dir of PDF_DIRS) {
    const pdfs = fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => path.join(dir, f));

    if (pdfs.length === 0) continue;

    console.log(`📂 ${dir}: ${pdfs.length} PDFer`);
    for (const pdf of pdfs) {
      process.stdout.write(`   ${path.basename(pdf)} ... `);
      const records = parsePdf(pdf);
      allRecords.push(...records);
      console.log(`${records.length} poster`);
    }
  }

  console.log(`\n📊 Totalt: ${allRecords.length} NAGS-poster fra MyGrant PDFer`);

  // Dedupliser på nagsCode+suffix
  const seen = new Set<string>();
  const unique = allRecords.filter((r) => {
    const key = `${r.nagsCode}-${r.suffix || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`   Unike: ${unique.length}`);

  // Fordeling på glass-type
  const typeCounts = unique.reduce((acc, r) => {
    acc[r.glassType] = (acc[r.glassType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("   Fordeling:");
  for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${t}: ${c}`);
  }

  // Lagre
  const output = {
    meta: {
      parsedAt: new Date().toISOString(),
      totalRecords: unique.length,
      sources: PDF_DIRS,
    },
    entries: unique,
  };

  const outputPath = path.join(OUTPUT_DIR, "nags-mygrant-parsed.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Lagret til: ${outputPath}`);
}

main();
