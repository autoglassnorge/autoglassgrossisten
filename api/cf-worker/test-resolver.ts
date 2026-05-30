import { resolveTecDocKType } from "./src/lib/tecdoc-resolver";

const TESTS = [
  { make: "VOLKSWAGEN", model: "GOLF VII", year: 2015 },
  { make: "BMW", model: "3 SERIES", year: 2012 },
  { make: "FORD", model: "MUSTANG", year: 2020 },
  { make: "MERCEDES-BENZ", model: "C CLASS", year: 2015 },
  { make: "AUDI", model: "A4", year: 2010 },
  { make: "VW", model: "GOLF 5G1", year: 2017 },
  { make: "TOYOTA", model: "LAND CRUISER", year: 2010 },
  { make: "HONDA", model: "CR-V", year: 2018 },
  { make: "OPEL", model: "ASTRA", year: 2005 },
];

for (const t of TESTS) {
  const r = resolveTecDocKType(t.make, t.model, t.year);
  console.log(`\n🔍 ${t.make} ${t.model} ${t.year ?? ""}`);
  console.log(`   Status: ${r.status} | Candidates: ${r.candidates.length}`);
  for (const c of r.candidates.slice(0, 3)) {
    const yearStr = `${c.yearFrom || "?"}-${c.yearTo || "?"}`;
    console.log(`   → kType=${c.ktype} | score=${c.score.toFixed(2)} | ${c.brand} ${c.model} (${yearStr}) | ${c.reasons.join(", ")}`);
  }
}
