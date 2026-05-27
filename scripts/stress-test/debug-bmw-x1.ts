/**
 * Debug: BMW X1 (kType 32114) test mot beriket katalog.
 */
import { matchGlass, lookupPrefix4, normalizeBrand, type CatalogRecord, type VehicleSpec } from "../../api/scoring/match-scorer";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const catalog: { records: CatalogRecord[] } = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalog-prod-ktype-enriched-v2.json"), "utf-8"));
const prefix4Cache = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ktype-prefix4-cache.json"), "utf-8"));

const vehicle: VehicleSpec = {
  vin: "WBAVP110X0VP26440",
  regnr: "BS10000",
  kType: 32114,
  brand: "BMW",
  model: "X1 (E84)",
  year: 2009,
  yearFrom: 2009,
  yearTo: 2015,
};

const prefix4 = lookupPrefix4(prefix4Cache, normalizeBrand(vehicle.brand!), vehicle.model!.split(" ")[0], vehicle.year);
console.log("Vehicle:", vehicle);
console.log("Prefix4 hint:", prefix4);

const result = matchGlass({
  vehicle,
  knownFlags: {},
  prefix4Hint: prefix4,
  candidates: catalog.records,
});

console.log("\nTotal kandidater:", result.total_candidates);
console.log("Exact match:", result.exact_match);
console.log("Margin:", result.diagnostics.margin);
console.log("\nTopp 5:");
for (const c of result.alternatives.slice(0, 5)) {
  console.log(`  ${c.score.toFixed(1).padStart(6)} ${c.record.eurocode.padEnd(18)} kTypes=${JSON.stringify(c.record.kTypes ?? []).padEnd(15)} model=${(c.record.model||"").substring(0,30)}`);
  console.log(`         breakdown:`, JSON.stringify(c.breakdown));
}
