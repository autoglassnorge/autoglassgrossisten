#!/usr/bin/env node
/**
 * Bootstrap kType mapping fra Bovsoft REGNUM
 * Bruker 333 betalte søk strategisk for å bygge kType→eurocode-mapping
 *
 * Strategi:
 * 1. Les populære regnr fra logg/eksisterende data
 * 2. Slå opp hver unike regnr på Bovsoft (ett søk per unik regnr)
 * 3. Lagre kType→brand→model→year mapping
 * 4. Kryss-referanser mot glass_catalog for å finne eurocode
 * 5. Lagre i ktype_matches for statistisk læring
 *
 * Usage:
 *   node scripts/bootstrap-ktype.mjs <regnr-liste.txt>
 */

const BOVSOFT_URL = "http://54.38.179.43:150/bovsoft.regnum.run";
const CLIENT_ID = "461";
const SECCODE = "726443558cec51db0e2d5ae5286d32df";
const NAMESERVICE = "getktypefornumplatenorway";

async function lookupBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SECCODE}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const res = await fetch(url, { method: "GET" });
    const text = await res.text();
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    return { status: -1, error: e.message };
  }
}

async function main() {
  const regnrFile = process.argv[2];
  if (!regnrFile) {
    console.error("Usage: node scripts/bootstrap-ktype.mjs <regnr-liste.txt>");
    console.error("\nEksempel på regnr-liste.txt (ett regnr per linje):");
    console.error("DT10555");
    console.error("AB12345");
    console.error("UX71699");
    process.exit(1);
  }

  const fs = await import("fs");
  const regnrs = fs.readFileSync(regnrFile, "utf-8")
    .split("\n")
    .map((r) => r.trim().toUpperCase())
    .filter((r) => r.length >= 4);

  console.log(`🔍 Starter kType-bootstrap med ${regnrs.length} regnr`);
  console.log(`💳 Tilgjengelige søk: 333 (ett per unikt regnr)\n`);

  const results = [];
  const errors = [];

  for (let i = 0; i < regnrs.length; i++) {
    const regnr = regnrs[i];
    console.log(`[${i + 1}/${regnrs.length}] ${regnr} ...`);

    const data = await lookupBovsoft(regnr);

    if (data.status === 200 && data.data?.datacar?.[0]) {
      const car = data.data.datacar[0];
      results.push({
        regnr,
        ktype: car.ktype,
        brand: car.manufCar,
        model: car.modelCar,
        yearFrom: car.typeFromYearCar,
        yearTo: car.typeToYearCar,
        body: car.bodyCar,
        vin: car.vin,
        shortName: car.shortNameCar,
      });
      console.log(`  ✅ kType=${car.ktype}, ${car.manufCar} ${car.modelCar} (${car.typeFromYearCar}-${car.typeToYearCar})`);
    } else if (data.status === 403) {
      console.log(`  ⛔ Konto ikke bekreftet ennå (status 403)`);
      errors.push({ regnr, error: "account_not_confirmed" });
    } else if (data.status === 404) {
      console.log(`  ⚠️  Regnr ikke funnet`);
      errors.push({ regnr, error: "not_found", status: data.status });
    } else {
      console.log(`  ❌ Feil: ${data.status} ${data.statusText || data.error}`);
      errors.push({ regnr, error: data.statusText || data.error, status: data.status });
    }

    // Vent 2 sekunder mellom hvert kall for å ikke overbelaste
    if (i < regnrs.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n📊 Resultat:`);
  console.log(`  ✅ Vellykkede: ${results.length}`);
  console.log(`  ❌ Feil: ${errors.length}`);
  console.log(`  💳 Gjenstående søk: ~${333 - results.length - errors.length}`);

  // Lagre resultater
  const outputFile = `data/ktype-bootstrap-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(outputFile, JSON.stringify({ results, errors, total: regnrs.length }, null, 2));
  console.log(`\n💾 Lagret til: ${outputFile}`);

  // Vis unike kType
  const uniqueKtypes = [...new Set(results.map((r) => r.ktype))];
  console.log(`\n🔢 Unike kType funnet: ${uniqueKtypes.length}`);
  console.log(uniqueKtypes.slice(0, 20).join(", "));
}

main().catch(console.error);
