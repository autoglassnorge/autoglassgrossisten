import { readFileSync } from "fs";

const catalog = JSON.parse(readFileSync("data/catalog-prod.json", "utf-8"));
const records = catalog.records || catalog;

const unmatched = records.filter(r => !r.ktype);
console.log("Records without ktype: " + unmatched.length);

const counts = {};
for (const r of unmatched) {
  const key = r.brand + "|" + r.model;
  counts[key] = (counts[key] || 0) + 1;
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log("\n=== Top 30 unmatched brand+model combinations ===");
for (const [key, count] of sorted) {
  const parts = key.split("|");
  const brand = parts[0];
  const model = parts[1];
  console.log("  " + String(count).padStart(3) + "x " + brand + " " + model);
}
