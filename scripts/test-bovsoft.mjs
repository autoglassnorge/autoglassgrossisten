#!/usr/bin/env node
/**
 * Test-script for Bovsoft REGNUM API v2 (kType lookup)
 * Run after registration to verify data quality
 *
 * Usage:
 *   CLIENT_ID=461 SECCODE=xxx node scripts/test-bovsoft.mjs UX71699
 */

const BASE_URL = "http://54.38.179.43:150/bovsoft.regnum.run";

const CLIENT_ID = process.env.CLIENT_ID || process.env.BOVSOFT_CLIENT_ID;
const SECCODE = process.env.SECCODE || process.env.BOVSOFT_SECCODE;
const REGNR = process.argv[2] || "UX71699";

if (!CLIENT_ID || !SECCODE) {
  console.error("❌ Set CLIENT_ID and SECCODE environment variables");
  console.error("   Register at: http://54.38.179.43:150/bovsoft.regnum.login");
  process.exit(1);
}

console.log(`🔍 Testing Bovsoft REGNUM kType lookup for: ${REGNR}\n`);

async function testBovsoft(regnr) {
  const url = `${BASE_URL}?id=${encodeURIComponent(CLIENT_ID)}&seccode=${encodeURIComponent(SECCODE)}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;

  console.log(`→ ${url.replace(SECCODE, "***")}\n`);

  try {
    const res = await fetch(url, { method: "GET" });
    console.log(`Status: ${res.status} ${res.statusText}`);

    const text = await res.text();
    console.log(`\n📄 Raw response (${text.length} bytes):`);
    console.log(text.slice(0, 3000));
    console.log(text.length > 3000 ? "\n...[truncated]" : "");

    try {
      const data = JSON.parse(text);
      console.log("\n✅ Valid JSON response");

      if (data.status === 200 && data.data?.datacar?.[0]) {
        const car = data.data.datacar[0];
        console.log("\n🔍 Extracted fields:");
        console.log(`  ktype:         ${car.ktype}`);
        console.log(`  brand:         ${car.manufCar}`);
        console.log(`  model:         ${car.modelCar}`);
        console.log(`  type:          ${car.typeCar}`);
        console.log(`  yearFrom:      ${car.typeFromYearCar}`);
        console.log(`  yearTo:        ${car.typeToYearCar}`);
        console.log(`  body:          ${car.bodyCar}`);
        console.log(`  vin:           ${car.vin}`);
        console.log(`  engine:        ${car.ccmCar}cc ${car.kwCar}kW ${car.hpCar}hp`);
        console.log("\n💡 This ktype can be used for exact glass matching!");
      } else {
        console.log("\n⚠️ No vehicle data found in response");
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.log("\n⚠️ Response is not JSON (might be XML or HTML)");
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

await testBovsoft(REGNR);

console.log("\n\n📋 Next steps:");
console.log("1. Check if ktype matches expected vehicle");
console.log("2. Verify VIN and year range are correct");
console.log("3. When account is confirmed → Worker will auto-use kType for matching");
console.log("4. Each search saves ktype→eurocode mapping for statistical learning");
