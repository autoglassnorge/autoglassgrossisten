#!/usr/bin/env node
/**
 * SUPERHACKER SCRIPT: Systematic Norwegian regnr generation + SVV lookup
 * Generates regnr from known series, queries SVV API, stores matches
 * 
 * Norwegian regnr formats:
 *   - Older: XX 1234 (2 letters + 4 digits, 1900s-2012)
 *   - Current: XX 12345 (2 letters + 5 digits, 2012+)
 *   - Newest: XXX 12345 (3 letters + 5 digits, 2023+)
 * 
 * SVV API: 50,000 calls/day limit
 * Strategy: Focus on newer series (more cars on road), 5-digit format
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";

// ─── Config ───
const SVV_API_KEY = process.env.SVV_API_KEY;
if (!SVV_API_KEY) {
  console.error("Error: SVV_API_KEY env var required");
  console.error("Set: export SVV_API_KEY=<your-key>");
  process.exit(1);
}
const SVV_URL = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";
const BATCH_SIZE = 100;       // API calls before saving checkpoint
const RATE_LIMIT_MS = 200;    // 5 req/sec = well under limits
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN || "5000", 10);     // Max calls per script run

const CHECKPOINT_FILE = "data/finn-no-regnr/regnr-bruteforce-checkpoint.json";
const OUTPUT_FILE = "data/finn-no-regnr/regnr-bruteforce-results.ndjson";

// Popular Norwegian series (2012+ format, 2 letters + 5 digits)
// These series have high vehicle density
const POPULAR_SERIES = [
  // High-density recent series
  "BS","BT","BU","BV","BW","BX","BY","BZ",
  "CV","CW","CX","CY","CZ",
  "DK","DL","DM","DN","DP","DR","DS","DT","DU","DV","DW","DX","DY","DZ",
  "EK","EL","EM","EN","EP","ER","ES","ET","EU","EV","EW","EX","EY","EZ",
  "FS","FT","FU","FV","FW","FX","FY","FZ",
  "HB","HC","HD","HE","HF","HG","HH","HJ","HK","HL","HM","HN","HP","HR","HS","HT","HU","HV","HW","HX","HY","HZ",
  "JF","JG","JH","JJ","JK","JL","JM","JN","JP","JR","JS","JT","JU","JV","JW","JX","JY","JZ",
  "KA","KB","KC","KD","KE","KF","KG","KH","KJ","KK","KL","KM","KN","KP","KR","KS","KT","KU","KV","KW","KX","KY","KZ",
  "LH","LJ","LK","LL","LM","LN","LP","LR","LS","LT","LU","LV","LW","LX","LY","LZ",
  "NA","NB","NC","ND","NE","NF","NG","NH","NJ","NK","NL","NM","NN","NP","NR","NS","NT","NU","NV","NW","NX","NY","NZ",
  "PA","PB","PC","PD","PE","PF","PH","PJ","PK","PL","PM","PN","PP","PR","PS","PT","PU","PV","PW","PX","PY","PZ",
  "RB","RC","RD","RE","RF","RG","RH","RJ","RK","RL","RM","RN","RP","RR","RS","RT","RU","RV","RW","RX","RY","RZ",
  "SD","SE","SF","SH","SJ","SK","SL","SM","SN","SP","SR","SS","ST","SU","SV","SW","SX","SY","SZ",
  "TA","TB","TC","TD","TE","TF","TH","TJ","TK","TL","TM","TN","TP","TR","TS","TT","TU","TV","TW","TX","TY","TZ",
  "UA","UB","UC","UD","UE","UF","UH","UJ","UK","UL","UM","UN","UP","UR","US","UT","UU","UV","UW","UX","UY","UZ",
  "VS","VT","VU","VV","VW","VX","VY","VZ",
  "XA","XB","XC","XD","XE","XF","XH","XJ","XK","XL","XM","XN","XP","XR","XS","XT","XU","XV","XW","XX","XY","XZ",
];

// ─── Load checkpoint ───
function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_FILE)) return { seriesIndex: 0, number: 10000, totalCalls: 0, hits: 0 };
  return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8"));
}

function saveCheckpoint(cp) {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ─── SVV API call ───
async function querySVV(regnr) {
  const cleanRegnr = regnr.replace(/\s/g, "");
  try {
    const res = await fetch(`${SVV_URL}?kjennemerke=${encodeURIComponent(cleanRegnr)}`, {
      headers: {
        "Accept": "application/json",
        "SVV-Authorization": `Apikey ${SVV_API_KEY}`,
        "User-Agent": "AutoglassAS-B2B/1.0",
      },
    });
    
    if (res.status === 404) return null; // Not found
    if (res.status === 429) { // Rate limited
      console.log(`   ⏳ Rate limited, pausing...`);
      await new Promise(r => setTimeout(r, 5000));
      return querySVV(regnr); // Retry
    }
    if (!res.ok) {
      console.log(`   ⚠️ SVV error ${res.status} for ${regnr}`);
      return null;
    }
    
    const data = await res.json();
    const vehicle = data.kjoretoydataListe?.[0];
    if (!vehicle) return null;
    
    // Extract key data
    const kjoretoyId = vehicle.kjoretoyId || {};
    const regnummer = kjoretoyId.kjennemerke;
    const vin = kjoretoyId.understellsnummer;
    
    const godkjenning = vehicle.godkjenning?.tekniskGodkjenning;
    const klassifisering = godkjenning?.kjoretoyklassifisering;
    
    const tekniskeData = godkjenning?.tekniskeData;
    const generelt = tekniskeData?.generelt;
    const merke = generelt?.merke?.[0]?.merke;
    const handelsbetegnelse = generelt?.handelsbetegnelse?.[0];
    
    const karosseri = tekniskeData?.karosseriOgLasteplan?.karosseritype?.kodeBeskrivelse;
    
    const forstegangsreg = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato;
    const year = forstegangsreg ? parseInt(forstegangsreg.slice(0, 4)) : null;
    
    return {
      regnr: regnummer,
      vin,
      make: merke,
      model: handelsbetegnelse,
      year,
      body_type: karosseri,
      raw: vehicle,
    };
  } catch (e) {
    console.log(`   ❌ Error for ${regnr}: ${e.message}`);
    return null;
  }
}

// ─── Append to NDJSON ───
function appendResult(result) {
  const line = JSON.stringify(result) + "\n";
  writeFileSync(OUTPUT_FILE, line, { flag: "a" });
}

// ─── Main loop ───
async function main() {
  const cp = loadCheckpoint();
  console.log(`🚀 Norwegian regnr bruteforce starting`);
  console.log(`   Checkpoint: series=${POPULAR_SERIES[cp.seriesIndex] || 'DONE'} number=${cp.number}`);
  console.log(`   Total calls so far: ${cp.totalCalls}, hits: ${cp.hits}`);
  console.log(`   Max per run: ${MAX_PER_RUN}`);
  
  let callsThisRun = 0;
  
  while (cp.seriesIndex < POPULAR_SERIES.length && callsThisRun < MAX_PER_RUN) {
    const series = POPULAR_SERIES[cp.seriesIndex];
    const regnr = `${series}${cp.number}`;
    
    const result = await querySVV(regnr);
    cp.totalCalls++;
    callsThisRun++;
    
    if (result) {
      cp.hits++;
      appendResult(result);
      console.log(`   ✅ HIT: ${regnr} → ${result.make} ${result.model} ${result.year}`);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    
    // Advance number
    cp.number++;
    if (cp.number > 99999) {
      cp.number = 10000;
      cp.seriesIndex++;
      console.log(`\n📋 Moving to series: ${POPULAR_SERIES[cp.seriesIndex] || 'DONE'}`);
    }
    
    // Save checkpoint every BATCH_SIZE
    if (callsThisRun % BATCH_SIZE === 0) {
      saveCheckpoint(cp);
      const hitRate = ((cp.hits / cp.totalCalls) * 100).toFixed(2);
      console.log(`   💾 Checkpoint saved. Calls: ${cp.totalCalls}, Hits: ${cp.hits} (${hitRate}%)`);
    }
  }
  
  saveCheckpoint(cp);
  console.log(`\n✅ Run complete!`);
  console.log(`   Calls this run: ${callsThisRun}`);
  console.log(`   Total calls: ${cp.totalCalls}`);
  console.log(`   Total hits: ${cp.hits}`);
  console.log(`   Hit rate: ${((cp.hits / cp.totalCalls) * 100).toFixed(2)}%`);
  console.log(`   Next: series=${POPULAR_SERIES[cp.seriesIndex] || 'DONE'} number=${cp.number}`);
}

main().catch(console.error);
