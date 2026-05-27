/**
 * VW T5 test mot beriket katalog med kType-eksplisitt.
 * Bruker kType=17270 (T5) som vi har funnet fra propagering.
 */
import { matchGlass, normalizeBrand, lookupPrefix4, type CatalogRecord, type VehicleSpec, type KnownFlags } from "../../api/scoring/match-scorer";
import { decodePRCodes, flagsToCatalogFilter } from "../../api/decoders/vag-pr-decoder";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const catalog: { records: CatalogRecord[] } = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalog-prod-ktype-enriched-v2.json"), "utf-8"));
const prefix4Cache = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ktype-prefix4-cache.json"), "utf-8"));

// VW T5 — kType 17270 fra propagering (sannsynlig T5 Transporter)
const vehicle: VehicleSpec = {
  vin: "WV1ZZZ7HZ5H060934",
  kType: 17270,
  brand: "VW",
  model: "TRANSPORTER",
  year: 2005,
  yearFrom: 2003,
  yearTo: 2009,
};

console.log("=".repeat(70));
console.log("VW T5 TEST V2 — kType 17270, beriket katalog");
console.log("=".repeat(70));

const scenarios: Array<{ name: string; flags: KnownFlags }> = [
  { name: "INGEN UTSTYR (verste fall, kun kType)", flags: {} },
  { name: "PR 4GL + 8N0 (basis, ingen regn)", flags: flagsToCatalogFilter(decodePRCodes(["4GL", "8N0"]).flags) as KnownFlags },
  { name: "PR 4GH + 8N3 (varmereflekt + solstripe + regnsensor)", flags: flagsToCatalogFilter(decodePRCodes(["4GH", "8N3"]).flags) as KnownFlags },
  { name: "Vet: ingen regn, ingen kamera, ingen solstripe (basis-T5)", flags: { rainSensor: false, camera: false, shade: false, laneAssist: false, hud: false, acoustic: false } },
];

const prefix4 = lookupPrefix4(prefix4Cache, "VW", "TRANSPORTER", 2005);
console.log(`\nprefix4 hint: ${prefix4}`);

for (const sc of scenarios) {
  console.log("\n" + "-".repeat(70));
  console.log("SCENARIO:", sc.name);
  console.log("Flagg:", JSON.stringify(sc.flags));
  const result = matchGlass({
    vehicle,
    knownFlags: sc.flags,
    prefix4Hint: prefix4,
    candidates: catalog.records,
  });
  console.log(`Kandidater: ${result.total_candidates}, exact_match: ${result.exact_match}, margin: ${result.diagnostics.margin}`);
  console.log("Topp 5:");
  for (const c of result.alternatives.slice(0, 5)) {
    const ktInfo = c.record.kTypes && c.record.kTypes.length > 0 ? `kT=${JSON.stringify(c.record.kTypes)}` : "kT=∅";
    console.log(`  ${c.score.toFixed(1).padStart(6)} ${c.record.eurocode.padEnd(18)} ${ktInfo.padEnd(20)} ${(c.record.description ?? "").substring(0, 50)}`);
    console.log(`         ${JSON.stringify(c.breakdown)}`);
  }
}
