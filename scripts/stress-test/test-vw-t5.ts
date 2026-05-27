/**
 * Test: VW T5 VIN-spesifikk match med simulert utstyr
 */
import { matchGlass, normalizeBrand, lookupPrefix4, type CatalogRecord, type VehicleSpec, type KnownFlags } from "../../api/scoring/match-scorer";
import { decodePRCodes, flagsToCatalogFilter } from "../../api/decoders/vag-pr-decoder";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const catalog: { records: CatalogRecord[] } = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalog-prod.json"), "utf-8"));
const prefix4Cache = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ktype-prefix4-cache.json"), "utf-8"));

// VW T5 fra VIN-analyse (Hannover, 2005, Transporter)
const vehicle: VehicleSpec = {
  vin: "WV1ZZZ7HZ5H060934",
  brand: "VW",
  model: "TRANSPORTER",
  year: 2005,
  yearFrom: 2003,
  yearTo: 2009,
  bodyType: "Kassevogn",
};

console.log("=".repeat(70));
console.log("VW T5 TEST — VIN: WV1ZZZ7HZ5H060934, 2005-modell");
console.log("=".repeat(70));

// Test-scenarier
const scenarios: Array<{ name: string; flags: KnownFlags }> = [
  { name: "INGEN INPUT (verste fall)", flags: {} },
  { name: "Vet at IKKE har regnsensor (basis-T5)", flags: { rainSensor: false, adas: false, camera: false, laneAssist: false, hud: false, acoustic: false, shade: false, heated: false } },
  { name: "Vet at IKKE har regnsensor + IKKE solstripe", flags: { rainSensor: false, shade: false, acoustic: false, camera: false } },
  { name: "Med PR-koder 4GL + 8N0 (klar laminert, ingen regnsensor)", flags: flagsToCatalogFilter(decodePRCodes(["4GL", "8N0"]).flags) as KnownFlags },
  { name: "Med PR-koder 4GR + 8N3 (laminert oppvarmet, regnsensor)", flags: flagsToCatalogFilter(decodePRCodes(["4GR", "8N3"]).flags) as KnownFlags },
];

const prefix4 = lookupPrefix4(prefix4Cache, "VW", "TRANSPORTER", 2005);
console.log(`\nFunnet prefix4: ${prefix4 ?? "(ingen)"}\n`);

for (const sc of scenarios) {
  console.log("\n" + "-".repeat(70));
  console.log("SCENARIO:", sc.name);
  console.log("Kjente flagg:", JSON.stringify(sc.flags));
  const result = matchGlass({
    vehicle,
    knownFlags: sc.flags,
    prefix4Hint: prefix4,
    candidates: catalog.records,
  });
  console.log("Total kandidater:", result.total_candidates);
  console.log("Exact match:", result.exact_match);
  console.log("Margin:", result.diagnostics.margin);
  console.log("Trenger input:", result.needs_user_input);
  console.log("Topp 3:");
  for (const c of result.alternatives.slice(0, 3)) {
    console.log(`  ${c.score.toFixed(1).padStart(5)}  ${c.record.eurocode.padEnd(15)} ${(c.record.supplier ?? "?").padEnd(15)} ${c.record.description.substring(0, 60)}`);
    console.log(`         matched=${c.flagsMatched.join(",")} unknown=${c.flagsUnknown.join(",")}`);
  }
}
