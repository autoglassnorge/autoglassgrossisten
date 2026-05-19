#!/usr/bin/env node
/**
 * Test-script for Bovsoft REGNUM API
 * Run after registration to verify data quality
 *
 * Usage:
 *   CLIENT_ID=xxx SECCODE=yyy node scripts/test-bovsoft.mjs SU18018
 */

const BASE_URL = "http://webservice.bovsoft.com:150/bovsoft.regnum.clientapi";

const CLIENT_ID = process.env.CLIENT_ID;
const SECCODE = process.env.SECCODE;
const REGNR = process.argv[2] || "SU18018";

if (!CLIENT_ID || !SECCODE) {
  console.error("❌ Set CLIENT_ID and SECCODE environment variables");
  console.error("   Register at: http://54.38.179.43:150/bovsoft.regnum.login");
  process.exit(1);
}

console.log(`🔍 Testing Bovsoft REGNUM for: ${REGNR}\n`);

async function testBovsoft(regnr) {
  const url = `${BASE_URL}?client=${encodeURIComponent(CLIENT_ID)}&seccode=${encodeURIComponent(SECCODE)}&regnum=${encodeURIComponent(regnr)}&country=NO`;

  console.log(`→ ${url.replace(SECCODE, "***")}\n`);

  try {
    const res = await fetch(url, { method: "GET" });
    console.log(`Status: ${res.status}`);

    const text = await res.text();
    console.log(`\n📄 Raw response (${text.length} bytes):`);
    console.log(text.slice(0, 2000));
    console.log(text.length > 2000 ? "\n...[truncated]" : "");

    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      console.log("\n✅ Valid JSON response");
      console.log("\n🔍 Key fields found:");
      console.log(JSON.stringify(data, null, 2).slice(0, 3000));
    } catch {
      console.log("\n⚠️ Response is not JSON (might be XML or HTML)");
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

await testBovsoft(REGNR);

console.log("\n\n📋 Next steps:");
console.log("1. Check if response contains equipment data (rain sensor, heated, acoustic, ADAS)");
console.log("2. Check if response contains OE/part numbers");
console.log("3. Compare with actual vehicle equipment");
console.log("4. If data is good → proceed with Worker integration");
