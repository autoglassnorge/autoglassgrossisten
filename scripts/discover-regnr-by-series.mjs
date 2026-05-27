#!/usr/bin/env node
/**
 * Discover valid Norwegian regnr by testing series patterns against Bovsoft.
 * 
 * Norwegian plates are issued in series (e.g., BS, CV, EB, etc.).
 * By testing numbers within known series, we can find valid regnr efficiently.
 * 
 * Strategy:
 * 1. Define popular series and number ranges
 * 2. Test each candidate against Bovsoft
 * 3. Save successful results with ktype + vehicle info
 * 4. Stop when we have enough new ktypes or run out of requests
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const BOVSOFT_URL = 'http://54.38.179.43:150/bovsoft.regnum.run';
const CLIENT_ID = '461';
const SEccode = '726443558cec51db0e2d5ae5286d32df';
const NAMESERVICE = 'getktypefornumplatenorway';

// Known Norwegian plate series (recent years, high traffic areas)
// Format: [prefix, startNum, endNum, step]
// Focus on series that have proven high success rates
const SERIES = [
  // Oslo area (highest volume, ~100% success)
  ['BS', 12000, 99999, 5000],
  ['CV', 12000, 99999, 5000],
  // Østfold (high volume, ~70% success)
  ['EB', 30000, 99999, 6000],
  ['ED', 30000, 99999, 6000],
  ['EK', 20000, 99999, 6000],
  // Trondheim (sporadic but good)
  ['LJ', 40000, 99999, 8000],
  // Stavanger (sporadic but good)
  ['RJ', 20000, 99999, 8000],
  ['RK', 20000, 99999, 8000],
  // Bergen newer series
  ['VH', 10000, 99999, 8000],
  ['VJ', 10000, 99999, 8000],
  ['VF', 10000, 99999, 8000],
  // Older high-volume
  ['BS', 1000, 9999, 2000],
  ['CV', 1000, 9999, 2000],
];

const OUTPUT_FILE = 'data/bovsoft-discovered-regnr.json';
const MAX_REQUESTS = 250; // Leave some buffer
const DELAY_MS = 1500;

async function lookupBovsoft(regnr) {
  const url = `${BOVSOFT_URL}?id=${CLIENT_ID}&seccode=${SEccode}&nameservice=${NAMESERVICE}&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    
    if (data.status !== 200 || !data.data?.datacar?.[0]) {
      return { ok: false, status: data.status, error: data.statusText || 'no data' };
    }
    
    const car = data.data.datacar[0];
    return {
      ok: true,
      ktype: car.ktype,
      brand: car.manufCar,
      model: car.modelCar,
      yearFrom: car.typeFromYearCar ? parseInt(car.typeFromYearCar.toString().slice(0, 4), 10) : null,
      yearTo: car.typeToYearCar ? parseInt(car.typeToYearCar.toString().slice(0, 4), 10) : null,
      body: car.bodyCar,
      engine: car.typeCar,
      fuel: car.fuelSystem,
      vin: car.vin,
      freeRequestsRemaining: data.countFREERequests,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function loadExisting() {
  if (!existsSync(OUTPUT_FILE)) return { meta: { generatedAt: null, total: 0, byKtype: {} }, results: [] };
  return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const targetKtypes = parseInt(process.argv.find(a => a.startsWith('--target='))?.split('=')[1] || '50');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Discover regnr by series via Bovsoft');
  console.log('  Mode:', dryRun ? 'DRY-RUN' : 'LIVE');
  console.log('  Target new ktypes:', targetKtypes);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const existing = loadExisting();
  const knownKtypes = new Set(existing.results.map(r => r.ktype));
  const knownRegnrs = new Set(existing.results.map(r => r.regnr));
  
  console.log(`📂 Existing discoveries: ${existing.results.length} regnr, ${knownKtypes.size} ktypes`);
  
  if (dryRun) {
    console.log('🚫 DRY-RUN: Simulating without API calls\n');
    let simulated = 0;
    for (const [prefix, start, end, step] of SERIES) {
      for (let num = start; num <= end; num += step) {
        const regnr = `${prefix}${num}`;
        if (!knownRegnrs.has(regnr)) {
          simulated++;
        }
      }
    }
    console.log(`Would test ${simulated} regnr across ${SERIES.length} series`);
    return;
  }
  
  const results = [...existing.results];
  let requestsUsed = 0;
  let newKtypes = 0;
  let found = 0;
  let failed = 0;
  let freeRequests = 'unknown';
  
  for (const [prefix, start, end, step] of SERIES) {
    if (requestsUsed >= MAX_REQUESTS) break;
    if (newKtypes >= targetKtypes) {
      console.log(`\n🎯 Reached target of ${targetKtypes} new ktypes. Stopping.`);
      break;
    }
    
    console.log(`\n📍 Series ${prefix} (${start}-${end}, step ${step})`);
    
    for (let num = start; num <= end; num += step) {
      if (requestsUsed >= MAX_REQUESTS) break;
      
      const regnr = `${prefix}${num}`;
      if (knownRegnrs.has(regnr)) continue;
      
      process.stdout.write(`  [${requestsUsed + 1}/${MAX_REQUESTS}] ${regnr} ... `);
      
      const lookup = await lookupBovsoft(regnr);
      requestsUsed++;
      
      if (!lookup.ok) {
        failed++;
        console.log(`failed (${lookup.error || lookup.status})`);
        continue;
      }
      
      freeRequests = lookup.freeRequestsRemaining;
      found++;
      
      const isNewKtype = !knownKtypes.has(lookup.ktype);
      if (isNewKtype) {
        newKtypes++;
        knownKtypes.add(lookup.ktype);
        console.log(`✅ NEW ktype=${lookup.ktype} ${lookup.brand} ${lookup.model} (${lookup.yearFrom}) [newKtypes=${newKtypes}]`);
      } else {
        console.log(`ktype=${lookup.ktype} ${lookup.brand} ${lookup.model} (${lookup.yearFrom}) [known]`);
      }
      
      results.push({
        regnr,
        ktype: lookup.ktype,
        brand: lookup.brand,
        model: lookup.model,
        yearFrom: lookup.yearFrom,
        yearTo: lookup.yearTo,
        body: lookup.body,
        engine: lookup.engine,
        fuel: lookup.fuel,
        vin: lookup.vin,
        isNewKtype,
        discoveredAt: new Date().toISOString(),
      });
      
      knownRegnrs.add(regnr);
      
      // Save after each successful find
      writeFileSync(OUTPUT_FILE, JSON.stringify({
        meta: {
          generatedAt: new Date().toISOString(),
          total: results.length,
          uniqueKtypes: knownKtypes.size,
          requestsUsed,
          freeRequestsRemaining: freeRequests,
        },
        results,
      }, null, 2));
      
      if (requestsUsed < MAX_REQUESTS) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Requests used: ${requestsUsed}/${MAX_REQUESTS}`);
  console.log(`   Valid regnr found: ${found}`);
  console.log(`   New ktypes discovered: ${newKtypes}`);
  console.log(`   Failed/invalid: ${failed}`);
  console.log(`   Bovsoft free requests remaining: ${freeRequests}`);
  console.log(`   Total unique ktypes: ${knownKtypes.size}`);
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
