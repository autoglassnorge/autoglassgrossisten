/**
 * UNI MICRO Product Catalog Exporter
 * ==================================
 * Henter ALLE frontruter (og andre glasskategorier) fra UNI Micro ERP
 * og eksporterer til standardisert JSON for glass-lookup-pipeline.
 *
 * Kjøring:
 *   UNIMICRO_CLIENT_ID=xxx UNIMICRO_CLIENT_SECRET=xxx \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' export-catalog.ts
 *
 * Output: data/unimicro-catalog.json
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// KONFIGURASJON — tilpass etter din UNI Micro-app
// ============================================================================

const CONFIG = {
  // Hent fra developer.unimicro.no → din app
  CLIENT_ID: process.env.UNIMICRO_CLIENT_ID || "",
  CLIENT_SECRET: process.env.UNIMICRO_CLIENT_SECRET || "",

  // UNI Micro API base URL
  BASE_URL: process.env.UNIMICRO_BASE_URL || "https://api.unimicro.no/api/v1",

  // OAuth token endpoint
  TOKEN_URL:
    process.env.UNIMICRO_TOKEN_URL || "https://api.unimicro.no/oauth2/token",

  // Hvilke varegrupper som er glass (tilpass etter deres kategorikoder i UNI)
  GLASS_CATEGORY_CODES: (process.env.GLASS_CATEGORIES || "FRONTRUTE,SIDERUTE,BAKRUTE,BAKLUKE,SPESIAL")
    .split(",")
    .map((s) => s.trim().toUpperCase()),

  // Output-fil
  OUTPUT_PATH: process.env.OUTPUT_PATH || path.join(__dirname, "../../data/unimicro-catalog.json"),

  // Paginering
  PAGE_SIZE: 500,
  MAX_PAGES: 10000, // sikkerhetsgrense
};

// ============================================================================
// TYPER — alle felter som trengs for 100% dekning
// ============================================================================

interface UnimicroProduct {
  ID: number;
  Name: string;
  ProductNo: string; // varenummer
  BarCode?: string; // scannummer / strekkode
  Description?: string;
  Comment?: string;
  UnitCostPrice?: number; // innkjøpspris
  UnitPrice?: number; // salgspris (kundeavhengig)
  StockQuantity?: number; // lagerbeholdning
  Weight?: number; // vekt i kg
  Width?: number; // bredde mm
  Height?: number; // høyde mm
  Depth?: number; // tykkelse mm
  Supplier?: {
    ID: number;
    Name: string;
  };
  ProductCategory?: {
    ID: number;
    Name: string;
    AccountNumber?: string; // kan brukes til kategorikoder
  };
  CustomFields?: Array<{
    Name: string;
    Value: string;
  }>;
  // UNI Micro har ofte "Relations" eller "Attributes" for ekstra felter
  Relations?: Array<{
    RelationType: string;
    Value: string;
  }>;
}

interface GlassRecord {
  // Identifikatorer
  eurocode: string; // f.eks. "5351AGNMV" — KRITISK for VIN-søk
  articleNumber: string; // UNI Micro varenummer
  scanNumber: string | null; // strekkode / scannummer

  // Klassifisering
  category: "frontrute" | "siderute" | "bakrute" | "bakluke" | "spesialglass" | "tilbehør" | "ukjent";
  supplier: string | null; // Pilkington, AGC, Saint-Gobain, Sekurit...
  brand: string | null; // bilmerke: VW, BMW, Volvo...
  model: string | null; // bilmodell: Golf, 3-serie, XC60...
  yearFrom: number | null;
  yearTo: number | null;

  // Utstyr / flagg (avgjør eksakt-match)
  adas: boolean; // kamera/radar bak frontruten
  rainSensor: boolean; // regnsensor
  heated: boolean; // oppvarmet frontrute
  acoustic: boolean; // akustisk laminert glass
  antenna: boolean; // antenne integrert i glass
  hud: boolean; // head-up display
  shade: boolean; // solstripe / tonet øvre kant
  camera: boolean; // dashkamera / frontkamera
  laneAssist: boolean; // filskifteassistent

  // Pris & lager
  price: number | null; // listepris (eks. mva)
  stockStatus: number; // antall på lager
  warehouseLocation: string | null; // hylle/plassering

  // OEM-kryssreferanser
  oemNumbers: string[]; // originale delenumre fra bilprodusent
  crossReferences: string[]; // andre leverandørers numre

  // Fysisk
  weight: number | null; // kg
  dimensions: {
    width: number | null; // mm
    height: number | null; // mm
    thickness: number | null; // mm
  };

  // Metadata
  description: string;
  prefix4: string; // første 4 siffer av eurokode — for kType-lookup
  imageUrl: string | null;
  pdfUrl: string | null; // monteringsveiledning
  source: "unimicro";
  lastUpdated: string; // ISO timestamp
}

// ============================================================================
// HJELPEFUNKSJONER
// ============================================================================

/** Hent OAuth2 access token */
async function getAccessToken(): Promise<string> {
  const response = await fetch(CONFIG.TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${CONFIG.CLIENT_ID}:${CONFIG.CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "products.read inventory.read", // tilpass scopes
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth feilet: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { access_token: string };
  console.log("✅ OAuth token hentet");
  return data.access_token;
}

/** Hent én side med produkter */
async function fetchProductPage(
  token: string,
  page: number
): Promise<UnimicroProduct[]> {
  const url = new URL(`${CONFIG.BASE_URL}/products`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pagesize", String(CONFIG.PAGE_SIZE));
  // Filtrer på varegrupper hvis API støtter det:
  // url.searchParams.set("category", CONFIG.GLASS_CATEGORY_CODES.join(","));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`API feil side ${page}: ${response.status}`);
  }

  const data = (await response.json()) as { Data: UnimicroProduct[] };
  return data.Data || [];
}

/** Hent lagerstatus for et produkt (batch eller enkeltvis) */
async function fetchInventory(
  token: string,
  productIds: number[]
): Promise<Map<number, { stock: number; location: string | null }>> {
  // UNI Micro har ofte /inventory eller /warehouses endpoint
  // Dette er et generisk pattern — tilpass etter deres API-respons
  const url = new URL(`${CONFIG.BASE_URL}/inventory`);
  url.searchParams.set("productIds", productIds.join(","));

  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return new Map();

    const data = (await response.json()) as {
      Data: Array<{
        ProductID: number;
        Quantity: number;
        Location?: string;
      }>;
    };

    const map = new Map<number, { stock: number; location: string | null }>();
    for (const item of data.Data || []) {
      map.set(item.ProductID, {
        stock: item.Quantity ?? 0,
        location: item.Location ?? null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

// ============================================================================
// PARSING — hent eurokode og flagg fra UNI Micro felter
// ============================================================================

/**
 * UNI Micro lagrer ofte eurokode i:
 * - ProductNo (hvis det ER eurokoden)
 * - CustomFields (f.eks. "Eurokode" = "5351AGNMV")
 * - Description (inline: "Frontrute 5351AGNMV VW Golf 2020-")
 * - BarCode / scanNumber
 *
 * Denne funksjonen prøver alle kilder og returnerer beste gjett.
 */
function extractEurocode(product: UnimicroProduct): string | null {
  // 1. Custom field eksplisitt
  const customEuro = product.CustomFields?.find(
    (f) =>
      f.Name.toLowerCase().includes("euro") ||
      f.Name.toLowerCase().includes("argic")
  )?.Value;
  if (customEuro) return cleanEurocode(customEuro);

  // 2. ProductNo ser ut som eurokode? (4 siffer + 4-7 bokstaver)
  if (/^\d{4}[A-Z]{4,7}$/i.test(product.ProductNo)) {
    return cleanEurocode(product.ProductNo);
  }

  // 3. BarCode / scanNumber
  if (product.BarCode && /^\d{4}[A-Z]{4,7}$/i.test(product.BarCode)) {
    return cleanEurocode(product.BarCode);
  }

  // 4. Parse fra beskrivelse
  const fromDesc = extractFromDescription(product.Description || product.Name);
  if (fromDesc) return fromDesc;

  return null;
}

function cleanEurocode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "").trim();
}

const EUROCODE_REGEX = /(\d{4}[A-Z]{4,7})/gi;

function extractFromDescription(text: string): string | null {
  const matches = text.match(EUROCODE_REGEX);
  return matches ? cleanEurocode(matches[0]) : null;
}

/** Bestem glasskategori fra UNI Micro kategori + navn */
function detectCategory(
  product: UnimicroProduct
): GlassRecord["category"] {
  const name = (product.Name + " " + (product.Description || "")).toLowerCase();
  const catName = (product.ProductCategory?.Name || "").toLowerCase();

  const combined = name + " " + catName;

  if (combined.includes("frontrute") || combined.includes("windshield") || combined.includes("windscreen"))
    return "frontrute";
  if (combined.includes("siderute") || combined.includes("side window") || combined.includes("dør"))
    return "siderute";
  if (combined.includes("bakrute") || combined.includes("rear window") || combined.includes("bak vindu"))
    return "bakrute";
  if (combined.includes("bakluke") || combined.includes("tailgate") || combined.includes("heck"))
    return "bakluke";
  if (combined.includes("spesial") || combined.includes("special") || combined.includes("panorama"))
    return "spesialglass";
  if (combined.includes("tilbehør") || combined.includes("tilbeh") || combined.includes("accessory"))
    return "tilbehør";

  // Fallback: sjekk kategorikoder
  const code = (product.ProductCategory?.AccountNumber || "").toUpperCase();
  if (code.startsWith("FR")) return "frontrute";
  if (code.startsWith("SI")) return "siderute";
  if (code.startsWith("BA")) return "bakrute";
  if (code.startsWith("BL")) return "bakluke";
  if (code.startsWith("SP")) return "spesialglass";

  return "ukjent";
}

/** Parse utstyrsflagg fra beskrivelse og custom felter */
function detectFlags(product: UnimicroProduct): {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  shade: boolean;
  camera: boolean;
  laneAssist: boolean;
} {
  const text = (product.Name + " " + (product.Description || "") + " " + (product.Comment || "")).toLowerCase();
  const customText = (product.CustomFields?.map((f) => f.Value).join(" ") || "").toLowerCase();
  const full = text + " " + customText;

  return {
    adas: /\b(adas|kamera|camera|sensor|vindusspor| rain.sensor|lanes?\s*assist|filskifte|collisjon|dcc)\b/i.test(full),
    rainSensor: /\b(regn|rain|regn.sensor|regnsensor|vindusspor|wipe.sensor)\b/i.test(full),
    heated: /\b(oppvarm|heated|varme|el.opp|elektrisk|defrost|demister|antenna.heat)\b/i.test(full),
    acoustic: /\b(akustisk|acoustic|støydemp|sound.proof|quiet|t.akust)\b/i.test(full),
    antenna: /\b(antenne|antenna|fm|dab|radio|gsm|telefon|mobil)\b/i.test(full),
    hud: /\b(hud|head.up|headup|projeksjon|projection)\b/i.test(full),
    shade: /\b(solstripe|shade|tonet|tinted|solbeskytt|sun.strip|band)\b/i.test(full),
    camera: /\b(dashcam|dash.kam|frontkamera|frem.kam|park.kam)\b/i.test(full),
    laneAssist: /\b(lane|fil.hold|filskifte|lane.keeping|side.assist)\b/i.test(full),
  };
}

/** Parse modell/år fra beskrivelse */
function parseModelYear(text: string): {
  brand: string | null;
  model: string | null;
  yearFrom: number | null;
  yearTo: number | null;
} {
  // Regex for år: "2020-", "2019-2023", "(2021)"
  const yearMatch = text.match(/(\d{4})\s*[-–]\s*(\d{4}|\s*)/);
  let yearFrom: number | null = null;
  let yearTo: number | null = null;

  if (yearMatch) {
    yearFrom = parseInt(yearMatch[1], 10);
    const toStr = yearMatch[2]?.trim();
    yearTo = toStr ? parseInt(toStr, 10) : null;
  } else {
    const singleYear = text.match(/\b(20\d{2}|19\d{2})\b/);
    if (singleYear) yearFrom = parseInt(singleYear[1], 10);
  }

  // Merke-deteksjon (simplifisert — kan utvides)
  const brands: Record<string, string[]> = {
    volkswagen: ["vw", "volkswagen"],
    bmw: ["bmw"],
    mercedes: ["mercedes", "merc", "mb"],
    audi: ["audi"],
    volvo: ["volvo"],
    toyota: ["toyota"],
    ford: ["ford"],
    skoda: ["skoda", "škoda"],
    seat: ["seat"],
    peugeot: ["peugeot"],
    renault: ["renault"],
    nissan: ["nissan"],
    hyundai: ["hyundai"],
    kia: ["kia"],
    mazda: ["mazda"],
    subaru: ["subaru"],
    honda: ["honda"],
    mitsubishi: ["mitsubishi"],
    opel: ["opel", "vauxhall"],
    citroen: ["citroen", "citroën"],
  };

  let brand: string | null = null;
  const lower = text.toLowerCase();
  for (const [b, aliases] of Object.entries(brands)) {
    if (aliases.some((a) => lower.includes(a))) {
      brand = b;
      break;
    }
  }

  // Modell (simplifisert — tar første ord etter merke)
  let model: string | null = null;
  if (brand) {
    const afterBrand = lower.split(brand === "volkswagen" ? /\b(vw|volkswagen)\b/ : brand)[2];
    if (afterBrand) {
      model = afterBrand.trim().split(/[\s,;-]/)[0];
      if (model && model.length > 1) model = model.charAt(0).toUpperCase() + model.slice(1);
    }
  }

  return { brand, model, yearFrom, yearTo };
}

/** Hent OEM-numre fra custom felter eller relasjoner */
function extractOemNumbers(product: UnimicroProduct): string[] {
  const oems: string[] = [];

  // Custom fields
  product.CustomFields?.forEach((f) => {
    if (/oem|original|oe.?nr|dele.?nr/i.test(f.Name)) {
      oems.push(...f.Value.split(/[,;/]/).map((s) => s.trim()));
    }
  });

  // Relations
  product.Relations?.forEach((r) => {
    if (/oem|original/i.test(r.RelationType)) {
      oems.push(r.Value.trim());
    }
  });

  return oems.filter((o) => o.length > 5); // sanity check
}

// ============================================================================
// HOVED-FLYT
// ============================================================================

async function main() {
  console.log("🚗 Autoglass AS — UNI Micro Katalog Eksport");
  console.log("============================================");

  if (!CONFIG.CLIENT_ID || !CONFIG.CLIENT_SECRET) {
    console.error("❌ Sett UNIMICRO_CLIENT_ID og UNIMICRO_CLIENT_SECRET miljøvariabler");
    process.exit(1);
  }

  const token = await getAccessToken();

  const allProducts: UnimicroProduct[] = [];
  let page = 1;

  console.log("📥 Henter produktsider...");
  while (page <= CONFIG.MAX_PAGES) {
    const batch = await fetchProductPage(token, page);
    if (batch.length === 0) break;

    allProducts.push(...batch);
    process.stdout.write(`\r   Side ${page} — ${allProducts.length} produkter totalt`);

    if (batch.length < CONFIG.PAGE_SIZE) break;
    page++;
  }
  console.log("\n✅ Hentet ferdig");

  // Hent lagerstatus i batcher
  console.log("📦 Henter lagerstatus...");
  const inventoryMap = await fetchInventory(
    token,
    allProducts.map((p) => p.ID)
  );
  console.log(`   Lagerdata for ${inventoryMap.size} produkter`);

  // Transformér til GlassRecord
  console.log("🔧 Parser og transformerer...");
  const glassRecords: GlassRecord[] = [];
  let skippedNoEurocode = 0;
  let skippedNonGlass = 0;

  for (const product of allProducts) {
    const category = detectCategory(product);

    // Hopp over hvis det ikke er glass (valgfritt — fjern for å eksportere alt)
    if (
      !CONFIG.GLASS_CATEGORY_CODES.includes("*") &&
      category === "ukjent" &&
      !CONFIG.GLASS_CATEGORY_CODES.includes("UKJENT")
    ) {
      skippedNonGlass++;
      continue;
    }

    const eurocode = extractEurocode(product);
    if (!eurocode) {
      skippedNoEurocode++;
      continue;
    }

    const flags = detectFlags(product);
    const { brand, model, yearFrom, yearTo } = parseModelYear(product.Name);
    const inventory = inventoryMap.get(product.ID);
    const oems = extractOemNumbers(product);

    const record: GlassRecord = {
      eurocode,
      articleNumber: product.ProductNo,
      scanNumber: product.BarCode || null,
      category,
      supplier: product.Supplier?.Name || null,
      brand,
      model,
      yearFrom,
      yearTo,
      ...flags,
      price: product.UnitPrice ?? null,
      stockStatus: inventory?.stock ?? product.StockQuantity ?? 0,
      warehouseLocation: inventory?.location ?? null,
      oemNumbers: oems,
      crossReferences: [], // fylles ved behov
      weight: product.Weight ?? null,
      dimensions: {
        width: product.Width ?? null,
        height: product.Height ?? null,
        thickness: product.Depth ?? null,
      },
      description: product.Description || product.Name,
      prefix4: eurocode.slice(0, 4),
      imageUrl: null, // kan lenkes til hvis dere har bilder i UNI Micro
      pdfUrl: null,
      source: "unimicro",
      lastUpdated: new Date().toISOString(),
    };

    glassRecords.push(record);
  }

  console.log(`\n📊 Resultat:`);
  console.log(`   Totalt i UNI Micro:     ${allProducts.length}`);
  console.log(`   Ikke-glass (hoppet):    ${skippedNonGlass}`);
  console.log(`   Manglet eurokode:       ${skippedNoEurocode}`);
  console.log(`   ✅ Eksportert:          ${glassRecords.length}`);

  // Kategori-fordeling
  const catCounts = glassRecords.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`\n   Fordeling:`);
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log(`      ${cat}: ${count}`);
  }

  // Lagre
  const outputDir = path.dirname(CONFIG.OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    CONFIG.OUTPUT_PATH,
    JSON.stringify(
      {
        meta: {
          exportedAt: new Date().toISOString(),
          source: "UNI Micro",
          totalRecords: glassRecords.length,
          categories: catCounts,
        },
        records: glassRecords,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Lagret til: ${CONFIG.OUTPUT_PATH}`);
  console.log("   Klar for upload-catalog-to-kv.ts eller glass-lookup.ts");
}

main().catch((err) => {
  console.error("❌ Feil:", err);
  process.exit(1);
});
